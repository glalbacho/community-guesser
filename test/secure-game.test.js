import test from "node:test";
import assert from "node:assert/strict";
import {start, action, setup, EPISODES} from "../src/server/engine.js";
import {onRequest as leaderboard} from "../functions/api/leaderboard.js";
import {COMMUNITY_FRAME_NUMBERS} from "../src/server/frames.js";

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

test("Daily Challenge does not end after an incorrect guess before round five",async()=>{
  const db=createDb();await setup(db);
  const round=await start(db,{challenge:"daily"});
  const secret=privateGame(db,round.session).current.episode;
  const wrong=EPISODES.find(id=>id!==secret);
  const result=await call(db,{action:"guess",session:round.session,guess:wrong});
  assert.equal(result.finished,false);
  assert.equal(result.awaitingNext,true);
  assert.equal(result.answer,secret);
  const next=await call(db,{action:"next",session:round.session});
  assert.equal(next.answered,1);
  assert.equal(next.revealedEpisode,undefined);
});


test("A zero-point game cannot qualify; only the best three positive scores remain",async()=>{
  const db=createDb();await setup(db);
  const mode="classic:normal";
  const submit=async(session,name)=>leaderboard({
    request:new Request("https://example.test/api/leaderboard",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({mode,name,score:999999,session})
    }),env:{DB:db}
  });
  const finish=async(points)=>{
    const game=await start(db,{challenge:"classic",mode:"normal"});
    for(let i=0;i<points;i++){
      const correct=privateGame(db,game.session).current.episode;
      assert.equal((await call(db,{action:"guess",session:game.session,guess:correct})).correct,true);
      await call(db,{action:"next",session:game.session});
    }
    const correct=privateGame(db,game.session).current.episode;
    const wrong=EPISODES.find(x=>x!==correct);
    assert.equal((await call(db,{action:"guess",session:game.session,guess:wrong})).finished,true);
    return game.session;
  };
  const zero=await finish(0);
  assert.equal((await submit(zero,"Zero")).status,400);
  assert.equal(db.scores.length,0);
  const first=await finish(1);
  assert.equal((await submit(first,"One")).status,201);
  const second=await finish(1);
  assert.equal((await submit(second,"Two")).status,201);
  const third=await finish(1);
  assert.equal((await submit(third,"Three")).status,201);
  assert.equal(db.scores.length,3);
  const fourth=await finish(1);
  assert.equal((await submit(fourth,"Tie")).status,409,
    "A tied score never displaces the earlier third place");
  assert.equal(db.scores.length,3);
  const fifth=await finish(2);
  assert.equal((await submit(fifth,"Winner")).status,201);
  assert.equal(db.scores.length,3);
  assert.deepEqual(db.scores.map(x=>x.score).sort((a,b)=>b-a),[2,1,1]);
  const request=new Request("https://example.test/api/leaderboard?mode=classic%3Anormal");
  const response=await (await leaderboard({request,env:{DB:db}})).json();
  assert.equal(response.entries.length,3);
});

test("Leaderboard nicknames allow 1 to 20 characters and reject more",async()=>{
  const db=createDb();await setup(db);
  const finishWrong=async()=>{
    const game=await start(db,{challenge:"classic",mode:"hard"});
    const answer=privateGame(db,game.session).current.episode;
    assert.equal((await call(db,{action:"guess",session:game.session,guess:answer})).correct,true);
    await call(db,{action:"next",session:game.session});
    const secondAnswer=privateGame(db,game.session).current.episode;
    const wrong=EPISODES.find(id=>id!==secondAnswer);
    assert.equal((await call(db,{action:"guess",session:game.session,guess:wrong})).finished,true);
    return game.session;
  };
  const submit=async(name,session)=>leaderboard({
    request:new Request("https://example.test/api/leaderboard",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({mode:"classic:hard",name,session})
    }),env:{DB:db}
  });
  const session=await finishWrong();
  assert.equal((await submit("X".repeat(21),session)).status,400);
  assert.equal((await submit("X".repeat(20),session)).status,201);
  const second=await finishWrong();
  assert.equal((await submit("Y",second)).status,201);
  assert.equal(db.scores.length,2);
});


test("Resume and leaderboard query know a previously submitted session",async()=>{
  const db=createDb();await setup(db);
  const game=await start(db,{challenge:"classic",mode:"normal"});
  assert.equal(game.submitted,false);
  const correct=privateGame(db,game.session).current.episode;
  await call(db,{action:"guess",session:game.session,guess:correct});
  await call(db,{action:"next",session:game.session});
  const answer=privateGame(db,game.session).current.episode;
  await call(db,{action:"guess",session:game.session,guess:EPISODES.find(x=>x!==answer)});
  const response=await leaderboard({
    request:new Request("https://example.test/api/leaderboard",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({mode:"classic:normal",name:"Player",session:game.session})
    }),env:{DB:db}
  });
  assert.equal(response.status,201);
  const resumed=await start(db,{challenge:"classic",mode:"normal"},game.session);
  // A prior completed run must NOT pop up as an unplayed Top 3 offer on reload.
  assert.notEqual(resumed.session,game.session);
  assert.equal(resumed.score,0);
  assert.equal(resumed.answered,0);
  assert.equal(resumed.finished,false);
  assert.equal(resumed.submitted,false);
  const query=new Request("https://example.test/api/leaderboard?mode=classic%3Anormal&session="+game.session);
  assert.equal((await (await leaderboard({request:query,env:{DB:db}})).json()).submitted,true);
});

test("AutoNext selects the next secret frame atomically without leaking its episode",async()=>{
  const db=createDb();await setup(db);
  const game=await start(db,{challenge:"classic",mode:"normal"});
  const previous=privateGame(db,game.session).current.episode;
  const result=await call(db,{action:"guess",session:game.session,guess:previous,autoNext:true});
  assert.equal(result.correct,true);
  assert.equal(result.answer,previous);
  assert.equal(result.autoAdvanced,true);
  assert.equal(result.awaitingNext,false);
  assert.equal(result.revealedEpisode,undefined);
  assert.match(result.round.images[0],/^\/api\/frame\//);
  assert.equal((await action(db,{action:"next",session:game.session})).status,409);
});

test("Daily Challenge and Community-le have no website ranking, even via direct API calls",async()=>{
  const db=createDb();await setup(db);
  // Pre-existing records (if any) should not appear in the public catalog.
  db.scores.push(
    {id:200,mode:"daily:2026-11-13",name:"Old Daily",score:5,created_at:1},
    {id:201,mode:"communityle:2026-11-13",name:"Old Wordle",score:6,created_at:1},
    {id:202,mode:"classic:normal",name:"Existing",score:10,created_at:1}
  );
  for(const mode of ["daily:2026-11-13","communityle:2026-11-13"]){
    const get=new Request("https://example.test/api/leaderboard?mode="+encodeURIComponent(mode));
    assert.equal((await leaderboard({request:get,env:{DB:db}})).status,400);
    const post=new Request("https://example.test/api/leaderboard",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({mode,name:"Attempt",session:"fake"})
    });
    assert.equal((await leaderboard({request:post,env:{DB:db}})).status,400);
  }
  const catalog=new Request("https://example.test/api/leaderboard?catalog=1");
  const data=await (await leaderboard({request:catalog,env:{DB:db}})).json();
  assert.ok(data.boards.some(b=>b.mode==="classic:normal"));
  assert.equal(data.boards.some(b=>/^(daily|communityle):/.test(b.mode)),false);
});

test("Episode Timeline uses three widely separated moments from exactly one episode",async()=>{
  const db=createDb();await setup(db);
  for(let roundNumber=0;roundNumber<12;roundNumber++){
    const round=await start(db,{challenge:"episodeTimeline"});
    assert.equal(round.mode,"challenge:episodeTimeline");
    assert.equal(round.round.timeline.length,3);
    assert.equal(round.revealedEpisode,undefined);
    assert.equal(round.timelineSolution,undefined);
    for(const item of round.round.timeline){
      assert.deepEqual(Object.keys(item).sort(),["token","url"]);
      assert.match(item.url,/^\/api\/frame\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/);
    }
    const secret=privateGame(db,round.session).current;
    assert.equal(new Set(secret.timeline.map(x=>x.episode)).size,1);
    assert.equal(new Set(secret.timeline.map(x=>x.frame)).size,3);
    const frames=COMMUNITY_FRAME_NUMBERS[secret.episode];
    const sorted=secret.timeline.slice().sort((a,b)=>a.frame-b.frame);
    const positions=sorted.map(x=>frames.indexOf(x.frame)/frames.length);
    assert.ok(positions[0]>=0.04&&positions[0]<=0.29,"start within first third");
    assert.ok(positions[1]>=0.38&&positions[1]<=0.62,"middle in central third");
    assert.ok(positions[2]>=0.71&&positions[2]<=0.96,"end within final third");
    const state=await call(db,{action:"state",session:round.session});
    assert.equal(state.timelineSolution,undefined);
    assert.equal(state.revealedEpisode,undefined);
  }
});

test("Episode Timeline securely validates token permutations and reveals only after a guess",async()=>{
  const db=createDb();await setup(db);
  const round=await start(db,{challenge:"episodeTimeline"});
  const secret=privateGame(db,round.session).current;
  const solution=secret.timeline.slice().sort((a,b)=>a.frame-b.frame).map(x=>x.token);
  const fake=[solution[0],solution[0],solution[2]];
  assert.equal((await action(db,{action:"guess",session:round.session,guess:fake})).status,400);
  assert.equal((await action(db,{action:"guess",session:round.session,guess:solution.map(x=>x.slice(0,-1)+"z")})).status,400);
  assert.equal((await call(db,{action:"state",session:round.session})).score,0);
  const wrong=[solution[1],solution[0],solution[2]];
  const result=await call(db,{action:"guess",session:round.session,guess:wrong});
  assert.equal(result.correct,false);
  assert.equal(result.score,0);
  assert.equal(result.finished,true);
  assert.equal(result.revealedEpisode,secret.episode);
  assert.deepEqual(result.timelineSolution.map(x=>x.token),solution);
  assert.equal((await action(db,{action:"guess",session:round.session,guess:solution})).status,409);
});

test("Episode Timeline scores correct chronological sequences and preserves its own Top 3",async()=>{
  const db=createDb();await setup(db);
  const round=await start(db,{challenge:"episodeTimeline"});
  const secret=privateGame(db,round.session).current;
  const solution=secret.timeline.slice().sort((a,b)=>a.frame-b.frame).map(x=>x.token);
  const result=await call(db,{action:"guess",session:round.session,guess:solution,autoNext:true});
  assert.equal(result.correct,true);
  assert.equal(result.score,1);
  assert.equal(result.awaitingNext,true);
  assert.equal(result.autoAdvanced,false);
  assert.deepEqual(result.timelineSolution.map(x=>x.token),solution);
  const next=await call(db,{action:"next",session:round.session});
  assert.equal(next.score,1);
  assert.equal(next.answered,1);
  assert.equal(next.timelineSolution,undefined);
  const secret2=privateGame(db,round.session).current;
  const nextSolution=secret2.timeline.slice().sort((a,b)=>a.frame-b.frame).map(x=>x.token);
  assert.equal((await call(db,{action:"guess",session:round.session,
    guess:[nextSolution[1],nextSolution[0],nextSolution[2]]})).finished,true);
  const posted=await leaderboard({request:new Request("https://example.test/api/leaderboard",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({mode:"challenge:episodeTimeline",name:"Timeline Winner",session:round.session})
  }),env:{DB:db}});
  assert.equal(posted.status,201);
  assert.equal(db.scores[0].score,1);
  const board=await (await leaderboard({request:new Request(
    "https://example.test/api/leaderboard?mode=challenge%3AepisodeTimeline"),env:{DB:db}})).json();
  assert.equal(board.entries[0].name,"Timeline Winner");
});

test("Original timeline still sorts three different episodes by broadcast order",async()=>{
  const db=createDb();await setup(db);
  const round=await start(db,{challenge:"timeline"});
  const secret=privateGame(db,round.session).current;
  assert.equal(new Set(secret.timeline.map(x=>x.episode)).size,3);
  const ordered=secret.timeline.slice().sort((a,b)=>
    EPISODES.indexOf(a.episode)-EPISODES.indexOf(b.episode)).map(x=>x.token);
  const result=await call(db,{action:"guess",session:round.session,guess:ordered});
  assert.equal(result.correct,true);
  assert.equal(result.score,1);
});


test("Completed, unsubmitted ranked streaks do not reappear on a fresh visit",async()=>{
  const db=createDb();await setup(db);
  const game=await start(db,{challenge:"classic",mode:"easy"});
  const answer=privateGame(db,game.session).current.episode;
  const correct=await call(db,{action:"guess",session:game.session,guess:answer});
  assert.equal(correct.score,1);
  await call(db,{action:"next",session:game.session});
  const wrong=EPISODES.find(id=>id!==privateGame(db,game.session).current.episode);
  assert.equal((await call(db,{action:"guess",session:game.session,guess:wrong})).finished,true);
  assert.equal(db.sessions.get(game.session).submitted,0);
  const newVisit=await start(db,{challenge:"classic",mode:"easy"},game.session);
  assert.notEqual(newVisit.session,game.session);
  assert.equal(newVisit.score,0);
  assert.equal(newVisit.finished,false);
  assert.equal(newVisit.submitted,false);
});

test("Unfinished games still resume; Daily Challenge retains finished results",async()=>{
  const db=createDb();await setup(db);
  const classic=await start(db,{challenge:"classic",mode:"normal"});
  const resumed=await start(db,{challenge:"classic",mode:"normal"},classic.session);
  assert.equal(resumed.session,classic.session);
  const daily=await start(db,{challenge:"daily"});
  for(let n=0;n<5;n++){
    const answer=privateGame(db,daily.session).current.episode;
    const guess=EPISODES.find(x=>x!==answer);
    const result=await call(db,{action:"guess",session:daily.session,guess});
    if(n===4)assert.equal(result.finished,true);
    else await call(db,{action:"next",session:daily.session});
  }
  const afterRefresh=await start(db,{challenge:"daily"},daily.session);
  assert.equal(afterRefresh.session,daily.session);
  assert.equal(afterRefresh.finished,true);
});

test("Season Challenge is retired in the engine and not available on the leaderboard API",async()=>{
  const db=createDb();await setup(db);
  const oldMode="season:3";
  const startRetired=await start(db,{challenge:"season",season:3});
  assert.equal(startRetired.challenge,"classic");
  assert.equal(startRetired.mode,"classic:normal");
  db.scores.push({id:400,mode:oldMode,name:"Legacy Season Winner",score:12,created_at:1});
  assert.equal((await leaderboard({request:new Request(
    "https://example.test/api/leaderboard?mode=season%3A3"),env:{DB:db}})).status,400);
  assert.equal((await leaderboard({request:new Request("https://example.test/api/leaderboard",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({mode:oldMode,name:"Fake Winner",session:startRetired.session})
  }),env:{DB:db}})).status,400);
  const catalog=await (await leaderboard({request:new Request(
    "https://example.test/api/leaderboard?catalog=1"),env:{DB:db}})).json();
  assert.equal(catalog.boards.some(board=>board.mode.startsWith("season:")),false);
  const custom=await start(db,{challenge:"custom",seasons:[3],lives:2});
  assert.equal(custom.challenge,"custom");
  assert.equal(custom.mode.startsWith("custom:2:3:"),true);
});


test("Custom Game has no public leaderboard, even through direct API calls",async()=>{
  const db=createDb();await setup(db);
  const mode="custom:3:1-3:001000";
  // Preserve old verified records in storage, but no longer expose them.
  db.scores.push({id:501,mode,name:"Old Custom Winner",score:42,created_at:1});
  const get=new Request("https://example.test/api/leaderboard?mode="+encodeURIComponent(mode));
  assert.equal((await leaderboard({request:get,env:{DB:db}})).status,400);
  const custom=await start(db,{
    challenge:"custom",lives:3,seasons:[1,3],features:{three:true}
  });
  assert.equal(custom.challenge,"custom");
  assert.equal(custom.round.images.length,3);
  assert.ok(custom.mode.startsWith("custom:3:1-3:"));
  const post=new Request("https://example.test/api/leaderboard",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({mode:custom.mode,name:"New Winner",session:custom.session})
  });
  assert.equal((await leaderboard({request:post,env:{DB:db}})).status,400);
  const catalog=await (await leaderboard({
    request:new Request("https://example.test/api/leaderboard?catalog=1"),
    env:{DB:db}
  })).json();
  assert.equal(catalog.boards.some(x=>x.mode.startsWith("custom:")),false);
  assert.equal(db.scores.length,1,"Legacy Custom scores must not be deleted");
});


test("Hide correct answers is only enabled in Custom Game with Every episode once",async()=>{
  const {configFrom,keyFor}=await import("../src/server/engine.js");
  const normal=configFrom({challenge:"custom",features:{hideSolved:true}});
  assert.equal(normal.features.hideSolved,false);
  const classic=configFrom({challenge:"classic",features:{once:true,hideSolved:true}});
  assert.equal(classic.features.hideSolved,false);
  const without=configFrom({challenge:"custom",lives:3,features:{once:true}});
  const withHide=configFrom({challenge:"custom",lives:3,features:{once:true,hideSolved:true}});
  assert.equal(withHide.features.hideSolved,true);
  assert.equal(keyFor(without).endsWith("000001"),true);
  assert.equal(keyFor(withHide),keyFor(without)+"h");
});

test("Only correctly identified episodes disappear in Custom Game, even after resume",async()=>{
  const db=createDb();await setup(db);
  const settings={challenge:"custom",lives:3,features:{once:true,hideSolved:true}};
  const game=await start(db,settings);
  assert.equal(game.solvedEpisodes.length,0);
  assert.equal(game.revealedEpisode,undefined);
  const first=privateGame(db,game.session).current.episode;
  const solved=await call(db,{action:"guess",session:game.session,guess:first,autoNext:true});
  assert.equal(solved.correct,true);
  assert.equal(solved.score,1);
  assert.deepEqual(solved.solvedEpisodes,[first]);
  assert.equal(solved.revealedEpisode,undefined);
  assert.equal(solved.round.images[0].startsWith("/api/frame/"),true);

  const resumed=await start(db,settings,game.session);
  assert.equal(resumed.session,game.session);
  assert.deepEqual(resumed.solvedEpisodes,[first]);
  const second=privateGame(db,game.session).current.episode;
  assert.notEqual(second,first);
  const rejected=await action(db,{action:"guess",session:game.session,guess:first});
  assert.equal(rejected.status,400,"An already solved episode must not be accepted again");
  assert.equal((await call(db,{action:"state",session:game.session})).answered,1);

  // A wrong answer does NOT disappear from the list. Nor does a scene
  // that was shown but not correctly identified.
  const wrong=EPISODES.find(id=>id!==first&&id!==second);
  const missed=await call(db,{action:"guess",session:game.session,guess:wrong});
  assert.equal(missed.correct,false);
  assert.equal(missed.lives,2);
  assert.deepEqual(missed.solvedEpisodes,[first]);
  assert.equal(missed.awaitingNext,true);
  const advanced=await call(db,{action:"next",session:game.session});
  assert.deepEqual(advanced.solvedEpisodes,[first]);
  assert.equal(advanced.revealedEpisode,undefined);
  assert.equal(advanced.answered,2);
  assert.equal(advanced.finished,false);
});

test("Custom Four Choices excludes previously solved episodes when hide rule is on",async()=>{
  const db=createDb();await setup(db);
  const settings={challenge:"custom",lives:3,features:{once:true,hideSolved:true,four:true}};
  const game=await start(db,settings);
  const first=privateGame(db,game.session).current.episode;
  const after=await call(db,{action:"guess",session:game.session,guess:first,autoNext:true});
  assert.equal(after.correct,true);
  assert.equal(after.autoAdvanced,true);
  assert.deepEqual(after.solvedEpisodes,[first]);
  assert.equal(after.round.choices.includes(first),false);
  assert.equal(after.round.choices.length,4);
  assert.equal((await action(db,{action:"guess",session:game.session,guess:first})).status,400);
});

test("Custom one-time hide mode still finishes after every one of the 110 episodes",async()=>{
  const db=createDb();await setup(db);
  const game=await start(db,{challenge:"custom",lives:1,features:{once:true,hideSolved:true}});
  assert.equal(EPISODES.length,110);
  for(let i=0;i<EPISODES.length;i++){
    const answer=privateGame(db,game.session).current.episode;
    const result=await call(db,{action:"guess",session:game.session,guess:answer,autoNext:true});
    assert.equal(result.correct,true);
    assert.equal(result.answered,i+1);
    assert.equal(result.solvedEpisodes.length,i+1);
    assert.equal(result.finished,i===EPISODES.length-1);
    if(i<EPISODES.length-1)assert.equal(result.revealedEpisode,undefined);
  }
  assert.equal(new Set(privateGame(db,game.session).history.map(x=>x.episode)).size,110);
  const post=await leaderboard({request:new Request("https://example.test/api/leaderboard",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({mode:game.mode,session:game.session,name:"No Public Scores"})
  }),env:{DB:db}});
  assert.equal(post.status,400,"Custom games cannot submit a public high score");
});
