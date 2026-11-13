import test from "node:test";
import assert from "node:assert/strict";
import {start, action, setup, EPISODES} from "../src/server/engine.js";
import {onRequest as leaderboard} from "../functions/api/leaderboard.js";

function createDb() {
  const sessions=new Map(), daily=new Map(), scores=[];
  let nextRank=0;
  const db={sessions,daily,scores,async batch(q){return Promise.all(q.map(x=>x.run()));},
    prepare(sql){
      const query={values:[],bind(...args){this.values=args;return this;},
        async first(){
          if(sql.includes("FROM cg_sessions WHERE id="))return sessions.get(this.values[0])||null;
          if(sql.includes("FROM cg_daily WHERE key="))return daily.get(this.values[0])||null;
          throw new Error("Unhandled first: "+sql);
        },
        async all(){
          if(sql.includes("FROM cg_leaderboard")){
            const rows=scores.filter(x=>sql.includes("WHERE mode=?")?x.mode===this.values[0]:true)
              .sort((a,b)=>a.mode.localeCompare(b.mode)||b.score-a.score||a.created_at-b.created_at||a.id-b.id);
            return {results:sql.includes("WHERE mode=?")?rows.slice(0,3):rows.slice(0,1500)};
          }
          throw new Error("Unhandled all: "+sql);
        },
        async run(){
          if(sql.startsWith("CREATE"))return {meta:{changes:0}};
          if(sql.startsWith("INSERT INTO cg_sessions")){
            const [id,mode,state,updated_at]=this.values;
            sessions.set(id,{id,mode,state,updated_at,submitted:0,version:0});
            return {meta:{changes:1}};
          }
          if(sql.startsWith("UPDATE cg_sessions SET state=")){
            const [state,updated_at,id,version]=this.values,row=sessions.get(id);
            if(!row||row.version!==version)return {meta:{changes:0}};
            Object.assign(row,{state,updated_at,version:version+1});return {meta:{changes:1}};
          }
          if(sql.startsWith("UPDATE cg_sessions SET submitted=")){
            const [id,version]=this.values,row=sessions.get(id);
            if(!row||row.version!==version||row.submitted)return {meta:{changes:0}};
            row.submitted=1;return {meta:{changes:1}};
          }
          if(sql.startsWith("INSERT OR IGNORE INTO cg_daily")){
            const [key,episode,frame]=this.values;if(!daily.has(key))daily.set(key,{episode,frame});
            return {meta:{changes:1}};
          }
          if(sql.startsWith("INSERT INTO cg_leaderboard")){
            const [mode,name,score,created_at]=this.values;
            const id=++nextRank;scores.push({id,mode,name,score,created_at});
            return {meta:{changes:1,last_row_id:id}};
          }
          if(sql.startsWith("DELETE FROM cg_leaderboard")){
            const mode=this.values[0];
            const keep=scores.filter(x=>x.mode===mode).sort((a,b)=>b.score-a.score||a.created_at-b.created_at||a.id-b.id).slice(0,3);
            for(let i=scores.length-1;i>=0;i--)if(scores[i].mode===mode&&!keep.includes(scores[i]))scores.splice(i,1);
            return {meta:{changes:1}};
          }
          if(sql.startsWith("DELETE FROM cg_sessions WHERE id IN"))return {meta:{changes:0}};
          throw new Error("Unhandled run: "+sql);
        }};
      return query;
    }};
  return db;
}
const privateGame=(db,id)=>JSON.parse(db.sessions.get(id).state);
const call=async (db,payload)=> (await action(db,payload)).json();

test("No answer or original episode path is shipped before a guess",async()=>{
  const db=createDb();await setup(db);
  const round=await start(db,{challenge:"classic",mode:"easy"});
  assert.equal(round.round.images.length,3);
  assert.equal(round.revealedEpisode,undefined);
  for(const url of round.round.images){
    assert.match(url,/^\/api\/frame\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/);
    assert.doesNotMatch(url,/S\d\dE\d\d/);
  }
  const state=await call(db,{action:"state",session:round.session});
  assert.equal(state.revealedEpisode,undefined);
});

test("Server checks the answer, persists the score, rejects a repeated guess",async()=>{
  const db=createDb();await setup(db);
  const round=await start(db,{challenge:"classic",mode:"normal"});
  const correct=privateGame(db,round.session).current.episode;
  const result=await call(db,{action:"guess",session:round.session,guess:correct});
  assert.equal(result.correct,true);
  assert.equal(result.score,1);
  const repeat=await action(db,{action:"guess",session:round.session,guess:correct});
  assert.equal(repeat.status,409);
  const next=await call(db,{action:"next",session:round.session});
  assert.equal(next.revealedEpisode,undefined);
});

test("Custom lives and progressive scoring are enforced server-side",async()=>{
  const db=createDb();await setup(db);
  const round=await start(db,{challenge:"custom",lives:3,features:{reveal:true,three:true}});
  assert.equal(round.round.images.length,3);
  const reveal=await call(db,{action:"reveal",session:round.session});
  assert.equal(reveal.stage,2);
  const answer=privateGame(db,round.session).current.episode;
  const result=await call(db,{action:"guess",session:round.session,guess:answer});
  assert.equal(result.score,4);
  assert.equal(result.lives,3);
});

test("Daily puzzles agree across sessions; Community-le hints do not reveal the answer",async()=>{
  const db=createDb();await setup(db);
  const a=await start(db,{challenge:"daily"}),b=await start(db,{challenge:"daily"});
  assert.equal(privateGame(db,a.session).current.episode,privateGame(db,b.session).current.episode);
  const c=await start(db,{challenge:"communityle"});
  const secret=privateGame(db,c.session).current.episode;
  const wrong=EPISODES.find(id=>id!==secret);
  const result=await call(db,{action:"guess",session:c.session,guess:wrong});
  assert.equal(result.finished,false);
  assert.equal(result.revealedEpisode,undefined);
  assert.equal(result.answer,undefined);
  assert.equal(result.hints.length,2);
});

test("Leaderboard accepts only a completed session and ignores any client-reported score",async()=>{
  const db=createDb();await setup(db);
  const round=await start(db,{challenge:"classic",mode:"normal"});
  const unfinished=new Request("https://example.test/api/leaderboard",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode:"classic:normal",name:"Player",score:99999,session:round.session})});
  assert.equal((await leaderboard({request:unfinished,env:{DB:db}})).status,403);
  // Complete a ten-point streak.
  for(let i=0;i<10;i++){
    const answer=privateGame(db,round.session).current.episode;
    const r=await call(db,{action:"guess",session:round.session,guess:answer});
    assert.equal(r.correct,true);
    await call(db,{action:"next",session:round.session});
  }
  const answer=privateGame(db,round.session).current.episode;
  const wrong=EPISODES.find(id=>id!==answer);
  assert.equal((await call(db,{action:"guess",session:round.session,guess:wrong})).finished,true);
  const submit=()=>new Request("https://example.test/api/leaderboard",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode:"classic:normal",name:"Player",score:99999,session:round.session})});
  assert.equal((await leaderboard({request:submit(),env:{DB:db}})).status,201);
  assert.equal(db.scores[0].score,10);
  assert.equal((await leaderboard({request:submit(),env:{DB:db}})).status,409);
});
