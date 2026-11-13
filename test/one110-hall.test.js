import test from "node:test";
import assert from "node:assert/strict";
import {start, action, setup, EPISODES} from "../src/server/engine.js";
import {onRequest as one110} from "../functions/api/one110.js";
import {onRequest as leaderboard} from "../functions/api/leaderboard.js";

function createDb(){
  const sessions=new Map(),daily=new Map(),scores=[],finishers=[];
  let nextId=0;
  const db={sessions,daily,scores,finishers,
    async batch(q){return Promise.all(q.map(x=>x.run()));},
    prepare(sql){
      return {values:[],bind(...values){this.values=values;return this;},
        async first(){
          if(sql.includes("FROM cg_sessions WHERE id="))return sessions.get(this.values[0])||null;
          if(sql.includes("FROM cg_daily WHERE key="))return daily.get(this.values[0])||null;
          if(sql.startsWith("SELECT COUNT(*) AS total FROM cg_one110_finishers"))
            return {total:finishers.length};
          throw Error("Unhandled first: "+sql);
        },
        async all(){
          if(sql.startsWith("SELECT id,name,created_at FROM cg_one110_finishers")){
            const [before,,limit]=this.values;
            return {results:finishers.filter(x=>!before||x.id<before)
              .sort((a,b)=>b.id-a.id).slice(0,limit)};
          }
          if(sql.includes("FROM cg_leaderboard")){
            const rows=scores.filter(x=>sql.includes("WHERE mode=?")?x.mode===this.values[0]:true)
              .sort((a,b)=>a.mode.localeCompare(b.mode)||b.score-a.score||a.created_at-b.created_at||a.id-b.id);
            return {results:sql.includes("WHERE mode=?")?rows.slice(0,3):rows.slice(0,1500)};
          }
          throw Error("Unhandled all: "+sql);
        },
        async run(){
          if(sql.startsWith("CREATE"))return {meta:{changes:0}};
          if(sql.startsWith("INSERT INTO cg_sessions")){
            const [id,mode,state,updated_at]=this.values;
            sessions.set(id,{id,mode,state,version:0,submitted:0,updated_at});
            return {meta:{changes:1}};
          }
          if(sql.startsWith("UPDATE cg_sessions SET state=")){
            const [state,updated_at,id,version]=this.values,row=sessions.get(id);
            if(!row||row.version!==version)return {meta:{changes:0}};
            Object.assign(row,{state,updated_at,version:version+1});
            return {meta:{changes:1}};
          }
          if(sql.startsWith("UPDATE cg_sessions SET submitted=")){
            const [id,version]=this.values,row=sessions.get(id);
            if(!row||row.version!==version||row.submitted)return {meta:{changes:0}};
            row.submitted=1;
            return {meta:{changes:1}};
          }
          if(sql.startsWith("INSERT OR IGNORE INTO cg_daily")){
            const [key,episode,frame]=this.values;
            if(!daily.has(key))daily.set(key,{episode,frame});
            return {meta:{changes:1}};
          }
          if(sql.startsWith("INSERT OR IGNORE INTO cg_one110_finishers")){
            for(const r of scores.filter(x=>x.mode==="challenge:one110"&&x.score===110)){
              const session_id="legacy:"+r.id;
              if(finishers.some(x=>x.session_id===session_id))continue;
              finishers.push({id:++nextId,session_id,name:r.name,created_at:r.created_at});
            }
            return {meta:{changes:1}};
          }
          if(sql.startsWith("INSERT INTO cg_one110_finishers")){
            const [session_id,name,created_at]=this.values;
            if(finishers.some(x=>x.session_id===session_id))throw Error("duplicate session");
            finishers.push({id:++nextId,session_id,name,created_at});
            return {meta:{changes:1}};
          }
          if(sql.startsWith("DELETE FROM cg_sessions WHERE id IN"))
            return {meta:{changes:0}};
          throw Error("Unhandled run: "+sql);
        }
      };
    }
  };
  return db;
}
const privateGame=(db,id)=>JSON.parse(db.sessions.get(id).state);
const post=(db,session,name="Winner")=>one110({env:{DB:db},request:new Request("https://example.test/api/one110",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({session,name,score:100000})
})});
const list=(db,query="")=>one110({env:{DB:db},request:new Request("https://example.test/api/one110"+query)});

test("Incomplete runs and one-mistake losses cannot register; the old Top 3 endpoint rejects them",async()=>{
  const db=createDb();await setup(db);
  const game=await start(db,{challenge:"one110"});
  assert.equal((await post(db,game.session)).status,403);
  const current=privateGame(db,game.session).current.episode;
  const wrong=EPISODES.find(x=>x!==current);
  assert.equal((await action(db,{action:"guess",session:game.session,guess:wrong})).status,200);
  assert.equal((await post(db,game.session)).status,403);
  assert.equal(db.finishers.length,0);
  assert.equal((await leaderboard({env:{DB:db},
    request:new Request("https://example.test/api/leaderboard?mode=challenge%3Aone110")})).status,400);
  assert.equal((await leaderboard({env:{DB:db},request:new Request("https://example.test/api/leaderboard",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({mode:"challenge:one110",name:"Fake",session:game.session})
  })})).status,400);
});

test("Exactly 110 correct episodes are required; winning registers once, with a 20-character nickname",async()=>{
  const db=createDb();await setup(db);
  const game=await start(db,{challenge:"one110"});
  for(let i=0;i<EPISODES.length;i++){
    const secret=privateGame(db,game.session).current.episode;
    const result=await (await action(db,{action:"guess",session:game.session,guess:secret,autoNext:true})).json();
    assert.equal(result.correct,true);
    assert.equal(result.score,i+1);
    assert.equal(result.finished,i===EPISODES.length-1);
  }
  const hidden=privateGame(db,game.session);
  assert.equal(hidden.answered,110);
  assert.equal(new Set(hidden.seen).size,110);
  assert.equal((await post(db,game.session,"X".repeat(21))).status,400);
  const accepted=await post(db,game.session,"Genuine Winner");
  assert.equal(accepted.status,201);
  const data=await accepted.json();
  assert.equal(data.accepted,true);
  assert.equal(data.total,1);
  assert.equal(db.finishers[0].name,"Genuine Winner");
  assert.equal((await post(db,game.session,"Duplicate")).status,409);
  const visible=await (await list(db,"?session="+game.session)).json();
  assert.equal(visible.eligible,true);
  assert.equal(visible.submitted,true);
  assert.equal(visible.entries.length,1);
  assert.equal(visible.entries[0].name,"Genuine Winner");
});

test("A forged perfect score without 110 correct results cannot register",async()=>{
  const db=createDb();await setup(db);
  const game=await start(db,{challenge:"one110"});
  const row=db.sessions.get(game.session);
  const data=JSON.parse(row.state);
  data.score=110;data.answered=110;data.finished=true;
  row.state=JSON.stringify(data);
  assert.equal((await post(db,game.session)).status,403);
});

test("All finishers remain saved, never Top 3: pagination loads every person",async()=>{
  const db=createDb();await setup(db);
  for(let i=0;i<125;i++)db.finishers.push({
    id:i+1,session_id:"test-"+i,name:"Winner "+i,created_at:1700000000000+i
  });
  const names=[];
  let before=null;
  for(let page=0;page<3;page++){
    const query=before?"?before="+before:"";
    const response=await list(db,query);
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.total,125);
    names.push(...data.entries.map(x=>x.name));
    assert.ok(data.entries.length<=50);
    before=data.nextCursor;
    if(page<2)assert.ok(before!==null);
  }
  assert.equal(before,null);
  assert.equal(new Set(names).size,125);
  assert.equal(names[0],"Winner 124");
  assert.equal(names.at(-1),"Winner 0");
  assert.equal((await list(db,"?before=0")).status,400);
});

test("Previously verified 110/110 leaderboard completions remain visible",async()=>{
  const db=createDb();await setup(db);
  db.scores.push({id:7,mode:"challenge:one110",name:"Old Finisher",score:110,created_at:1000});
  db.scores.push({id:8,mode:"challenge:one110",name:"Not Perfect",score:86,created_at:2000});
  const data=await (await list(db)).json();
  assert.equal(data.total,1);
  assert.deepEqual(data.entries.map(x=>x.name),["Old Finisher"]);
  const again=await (await list(db)).json();
  assert.equal(again.total,1);
});
