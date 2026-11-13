// Verified website-wide high scores. The client never supplies an authoritative score.
import { load, setup as setupGame, json } from "../../src/server/engine.js";

const allowedMode=mode=>typeof mode==="string"&&(
  /^classic:(easy|normal|hard|impossible)$/.test(mode)||
  /^season:[1-6]$/.test(mode)||
  /^challenge:(four|timeline|progressive|one110)$/.test(mode)||
  /^custom:(10|[1-9]):[1-6](?:-[1-6]){0,5}:[01]{6}$/.test(mode)||
  /^(daily|communityle):\d{4}-\d{2}-\d{2}$/.test(mode)
);
async function setup(db){
  await db.prepare("CREATE TABLE IF NOT EXISTS cg_leaderboard (id INTEGER PRIMARY KEY AUTOINCREMENT, mode TEXT NOT NULL, name TEXT NOT NULL, score INTEGER NOT NULL, created_at INTEGER NOT NULL)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS cg_leaderboard_rank ON cg_leaderboard(mode,score DESC,created_at ASC,id ASC)").run();
}
async function getBoard(db,mode){
  const rows=await db.prepare("SELECT id,name,score FROM cg_leaderboard WHERE mode=? ORDER BY score DESC,created_at ASC,id ASC LIMIT 3").bind(mode).all();
  return rows.results||[];
}
const publicRows=rows=>rows.map(({name,score})=>({name,score}));
export async function onRequest({request,env}){
  if(!env.DB)return json({error:"Cloudflare D1 not configured. Bind a D1 database as DB."},503);
  if(!["GET","POST"].includes(request.method))return json({error:"Method not allowed."},405);
  try{
    await setup(env.DB);
    if(request.method==="GET"){
      const q=new URL(request.url).searchParams;
      if(q.get("catalog")==="1"){
        const rows=await env.DB.prepare(
          "SELECT mode,name,score FROM cg_leaderboard ORDER BY mode ASC,score DESC,created_at ASC,id ASC LIMIT 1500"
        ).all();
        const grouped=new Map();
        for(const e of rows.results||[]){
          if(!allowedMode(e.mode))continue;
          if(!grouped.has(e.mode))grouped.set(e.mode,[]);
          if(grouped.get(e.mode).length<3)grouped.get(e.mode).push({name:e.name,score:e.score});
        }
        return json({boards:Array.from(grouped,([mode,entries])=>({mode,entries}))});
      }
      const mode=q.get("mode");
      if(!allowedMode(mode))return json({error:"Invalid mode."},400);
      return json({entries:publicRows(await getBoard(env.DB,mode))});
    }
    if(Number(request.headers.get("content-length"))>2048)return json({error:"Request too large."},413);
    let input;
    try{input=await request.json();}catch(_){return json({error:"Invalid JSON."},400);}
    if(!input||!allowedMode(input.mode))return json({error:"Invalid mode."},400);
    const name=typeof input.name==="string"?input.name.trim().replace(/\s+/g," "):"";
    if(!/^[\p{L}\p{N} _.-]{1,20}$/u.test(name))
      return json({error:"Use a nickname of 1–20 letters, numbers, spaces, . _ or -."},400);
    await setupGame(env.DB);
    const session=await load(env.DB,input.session);
    if(!session||session.mode!==input.mode||!session.state.finished)
      return json({error:"A completed, server-verified game is required."},403);
    if(session.submitted)return json({error:"This result has already been submitted."},409);
    const score=session.state.score;
    if(!Number.isInteger(score)||score<0||score>100000||
      /^daily:/.test(input.mode)&&score>5||
      /^communityle:/.test(input.mode)&&score>6||
      input.mode==="challenge:one110"&&score>110)
      return json({error:"Invalid verified score."},400);
    const before=await getBoard(env.DB,input.mode);
    if(before.length===3&&score<=before[2].score)
      return json({error:"This result is not in the website Top 3.",accepted:false,entries:publicRows(before)},409);
    // Claim the session before inserting a leaderboard score. Two concurrent
    // submissions with one session can never create two entries.
    const claimed=await env.DB.prepare(
      "UPDATE cg_sessions SET submitted=1 WHERE id=? AND version=? AND submitted=0"
    ).bind(session.id,session.version).run();
    if(claimed.meta?.changes!==1)return json({error:"This result was already submitted."},409);
    const inserted=await env.DB.prepare(
      "INSERT INTO cg_leaderboard (mode,name,score,created_at) VALUES (?,?,?,?)"
    ).bind(input.mode,name,score,Date.now()).run();
    const rowId=inserted.meta?.last_row_id;
    await env.DB.prepare(
      "DELETE FROM cg_leaderboard WHERE mode=? AND id NOT IN (SELECT id FROM cg_leaderboard WHERE mode=? ORDER BY score DESC,created_at ASC,id ASC LIMIT 3)"
    ).bind(input.mode,input.mode).run();
    const after=await getBoard(env.DB,input.mode);
    if(!after.some(x=>x.id===rowId))
      return json({error:"Another score entered the Top 3 first.",accepted:false,entries:publicRows(after)},409);
    return json({accepted:true,score,entries:publicRows(after)},201);
  }catch(error){
    console.error("Leaderboard error",error);
    return json({error:"Website leaderboard temporarily unavailable."},503);
  }
}
