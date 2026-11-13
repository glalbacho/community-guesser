// Everyone who completes all 110 episodes can join this hall.
// This is an unranked, unlimited list, not a Top 3 leaderboard.
import {load, EPISODES, json} from "../../src/server/engine.js";
import {rateLimit} from "../../src/server/rate-limit.js";

const MODE="challenge:one110";
const PAGE_SIZE=50;

async function setup(db){
  await db.prepare("CREATE TABLE IF NOT EXISTS cg_one110_finishers (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created_at INTEGER NOT NULL)").run();
  // Preserve any verified 110/110 winners recorded under the old Top 3 system.
  // The legacy source can be absent on installations that never used leaderboards.
  try{
    await db.prepare("INSERT OR IGNORE INTO cg_one110_finishers (session_id,name,created_at) SELECT 'legacy:' || id,name,created_at FROM cg_leaderboard WHERE mode='challenge:one110' AND score=110").run();
  }catch(_){/* No legacy leaderboard table; nothing to migrate. */}
}

function isWinner(row){
  if(!row||row.mode!==MODE||row.state?.config?.challenge!=="one110")return false;
  const s=row.state;
  return s.finished===true&&s.score===EPISODES.length&&s.answered===EPISODES.length&&
    Array.isArray(s.seen)&&new Set(s.seen).size===EPISODES.length&&
    Array.isArray(s.history)&&s.history.length===EPISODES.length&&
    s.history.every(h=>h.correct===true);
}

export async function onRequest({request,env}){
  if(!env.DB)return json({error:"Cloudflare D1 is not configured."},503);
  if(request.method!=="GET"&&request.method!=="POST")return json({error:"Method not allowed."},405);
  try{
    const limit=await rateLimit(env.DB,request,request.method==="POST"?"one110-post":"one110-read",
      request.method==="POST"?12:240,300);
    if(limit)return limit;
    await setup(env.DB);
    if(request.method==="GET"){
      const q=new URL(request.url).searchParams;
      const raw=q.get("before");
      if(raw!==null&&(!/^[1-9]\d{0,14}$/.test(raw)||!Number.isSafeInteger(Number(raw))))
        return json({error:"Invalid page cursor."},400);
      const before=raw===null?0:Number(raw);
      const rows=await env.DB.prepare("SELECT id,name,created_at FROM cg_one110_finishers WHERE (?=0 OR id<?) ORDER BY id DESC LIMIT ?")
        .bind(before,before,PAGE_SIZE+1).all();
      const list=rows.results||[];
      const page=list.slice(0,PAGE_SIZE);
      const total=await env.DB.prepare("SELECT COUNT(*) AS total FROM cg_one110_finishers").first();
      const sessionId=q.get("session");
      const session=sessionId?await load(env.DB,sessionId):null;
      return json({entries:page.map(({name,created_at})=>({name,created_at})),
        nextCursor:list.length>PAGE_SIZE?page.at(-1).id:null,
        total:total?.total||0,
        eligible:isWinner(session),submitted:isWinner(session)&&session.submitted===1});
    }
    if(Number(request.headers.get("content-length"))>2048)return json({error:"Request too large."},413);
    let input;
    try{input=await request.json();}catch(_){return json({error:"Invalid JSON."},400);}
    const name=typeof input?.name==="string"?input.name.trim().replace(/\s+/g," "):"";
    if(!/^[\p{L}\p{N} _.-]{1,20}$/u.test(name))
      return json({error:"Choose a nickname with 1–20 letters, numbers, spaces, dots, underscores or hyphens."},400);
    const session=await load(env.DB,input.session);
    if(!isWinner(session))
      return json({error:"Only players who correctly identified all 110 episodes in one life can join."},403);
    if(session.submitted)return json({error:"This completed run was already registered.",submitted:true},409);
    // One completed session is registered once, regardless of simultaneous requests.
    const claimed=await env.DB.prepare("UPDATE cg_sessions SET submitted=1 WHERE id=? AND version=? AND submitted=0")
      .bind(session.id,session.version).run();
    if(claimed.meta?.changes!==1)return json({error:"This completed run is already registered.",submitted:true},409);
    await env.DB.prepare("INSERT INTO cg_one110_finishers (session_id,name,created_at) VALUES (?,?,?)")
      .bind(session.id,name,Date.now()).run();
    const total=await env.DB.prepare("SELECT COUNT(*) AS total FROM cg_one110_finishers").first();
    return json({accepted:true,submitted:true,name,total:total?.total||0},201);
  }catch(error){
    console.error("One Life, 110 finishers API error",error);
    return json({error:"Completion hall temporarily unavailable."},503);
  }
}
