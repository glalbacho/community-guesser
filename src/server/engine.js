import { COMMUNITY_FRAME_NUMBERS, ASSET_BASES, ASSET_REPO_BY_SEASON } from "./frames.js";

export const EPISODES = Object.keys(COMMUNITY_FRAME_NUMBERS).sort();
const EPISODE_SET = new Set(EPISODES);
const now = () => Date.now();
const uuid = () => crypto.randomUUID();
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store",
    "x-content-type-options":"nosniff"}
});
export { json };

export function berlinDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",hourCycle:"h23"
  }).formatToParts(new Date()).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
  const day = new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,
    Number(parts.day)-(Number(parts.hour)<6?1:0)));
  return day.toISOString().slice(0,10);
}

export function configFrom(input) {
  const c = typeof input === "object" && input !== null ? input : {};
  const challenge = ["classic","season","custom","daily","communityle","one110","four","timeline","progressive"].includes(c.challenge)
    ? c.challenge : "classic";
  const mode = ["easy","normal","hard","impossible"].includes(c.mode) ? c.mode : "normal";
  const season = Number.isInteger(c.season) && c.season>=1 && c.season<=6 ? c.season : 1;
  const lives = Number.isInteger(c.lives) && c.lives>=1 && c.lives<=10 ? c.lives : 3;
  const seasons = Array.isArray(c.seasons)
    ? [...new Set(c.seasons.filter(n=>Number.isInteger(n)&&n>=1&&n<=6))].sort((a,b)=>a-b)
    : [1,2,3,4,5,6];
  if (!seasons.length) throw new Error("Choose at least one season.");
  const f = c.features && typeof c.features==="object" ? c.features : {};
  const features = Object.fromEntries(["four","numbers","three","reveal","distort","once"].map(k=>[k,f[k]===true]));
  return {challenge,mode,season,lives,seasons,features};
}
export function keyFor(c,date=berlinDate()) {
  switch(c.challenge) {
    case "classic":return "classic:"+c.mode;
    case "season":return "season:"+c.season;
    case "custom":return "custom:"+c.lives+":"+c.seasons.join("-")+":"+
      ["four","numbers","three","reveal","distort","once"].map(k=>c.features[k]?"1":"0").join("");
    case "daily":return "daily:"+date;
    case "communityle":return "communityle:"+date;
    default:return "challenge:"+c.challenge;
  }
}
export function eligible(c) {
  if(c.challenge==="season")return EPISODES.filter(e=>Number(e.slice(1,3))===c.season);
  if(c.challenge==="custom")return EPISODES.filter(e=>c.seasons.includes(Number(e.slice(1,3))));
  return EPISODES;
}
function oneOf(arr) {return arr[Math.floor(Math.random()*arr.length)];}
function shuffled(array) {
  const a=array.slice();
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function chooseFrames(episode,three=false) {
  const frames=COMMUNITY_FRAME_NUMBERS[episode];
  if(!Array.isArray(frames)||!frames.length)throw new Error("Frame catalogue is empty.");
  if(three&&frames.length>=3)return [0,1,2].map(part=>{
    const begin=Math.floor(part*frames.length/3),end=Math.floor((part+1)*frames.length/3);
    return frames[begin+Math.floor(Math.random()*(end-begin))];
  });
  return [oneOf(frames)];
}
function imageEntry(episode,frame) {return {token:uuid(),episode,frame};}
function threeEnabled(c) {return c.challenge==="classic"&&c.mode==="easy" ||
  c.challenge==="custom"&&c.features.three;}
function fourEnabled(c) {return c.challenge==="four"||c.challenge==="custom"&&c.features.four;}
function revealEnabled(c) {return c.challenge==="progressive"||c.challenge==="custom"&&c.features.reveal;}
function imageUrl(s, entry) {return "/api/frame/"+s.id+"/"+entry.token;}
export function imagePath(episode,frame) {
  const base=ASSET_BASES[ASSET_REPO_BY_SEASON[episode.slice(0,3)]];
  return base+episode+"/"+episode+"_"+String(frame).padStart(4,"0")+".webp";
}
function wordleHint(guess,answer) {
  const g=[Number(guess.slice(1,3)),Number(guess.slice(4))];
  const a=[Number(answer.slice(1,3)),Number(answer.slice(4))];
  const r=["absent","absent"];
  for(let i=0;i<2;i++)if(g[i]===a[i]) {r[i]="correct";a[i]=null;}
  for(let i=0;i<2;i++)if(r[i]!=="correct"){
    const j=a.indexOf(g[i]);if(j!==-1){r[i]="present";a[j]=null;}
  }
  return r;
}
export async function setup(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS cg_sessions (id TEXT PRIMARY KEY, mode TEXT NOT NULL, state TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, submitted INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS cg_daily (key TEXT PRIMARY KEY, episode TEXT NOT NULL, frame INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS cg_sessions_updated ON cg_sessions(updated_at)")
  ]);
}
export async function load(db,id) {
  if(typeof id!=="string"||!/^[a-f0-9-]{36}$/i.test(id))return null;
  const row=await db.prepare("SELECT id,mode,state,version,submitted,updated_at FROM cg_sessions WHERE id=?").bind(id).first();
  if(!row)return null;
  return {...row, state:JSON.parse(row.state)};
}
export async function persist(db,row) {
  const changed=await db.prepare("UPDATE cg_sessions SET state=?,version=version+1,updated_at=? WHERE id=? AND version=?")
    .bind(JSON.stringify(row.state),now(),row.id,row.version).run();
  if(changed.meta?.changes!==1)return false;
  row.version++;
  return true;
}
async function dailyEpisode(db,key,excluded=[]) {
  const old=await db.prepare("SELECT episode,frame FROM cg_daily WHERE key=?").bind(key).first();
  if(old)return {episode:old.episode,frame:Number(old.frame)};
  const pool=EPISODES.filter(id=>!excluded.includes(id));
  const episode=oneOf(pool.length?pool:EPISODES);
  const frame=oneOf(COMMUNITY_FRAME_NUMBERS[episode]);
  await db.prepare("INSERT OR IGNORE INTO cg_daily (key,episode,frame) VALUES (?,?,?)").bind(key,episode,frame).run();
  const actual=await db.prepare("SELECT episode,frame FROM cg_daily WHERE key=?").bind(key).first();
  return {episode:actual.episode,frame:Number(actual.frame)};
}
async function makeRound(db,s) {
  const c=s.config;
  if(c.challenge==="communityle"){
    const selected=await dailyEpisode(db,"communityle:"+s.date);
    s.current={episode:selected.episode,images:[imageEntry(selected.episode,selected.frame)]};
    return;
  }
  if(c.challenge==="daily"){
    const earlier=[];
    for(let i=0;i<s.answered;i++){
      const p=await db.prepare("SELECT episode FROM cg_daily WHERE key=?").bind("daily:"+s.date+":"+i).first();
      if(p)earlier.push(p.episode);
    }
    const selected=await dailyEpisode(db,"daily:"+s.date+":"+s.answered,earlier);
    s.current={episode:selected.episode,images:[imageEntry(selected.episode,selected.frame)]};
    return;
  }
  if(c.challenge==="timeline"){
    const picks=shuffled(eligible(c)).slice(0,3);
    const chronological=picks.slice().sort((a,b)=>EPISODES.indexOf(a)-EPISODES.indexOf(b));
    let order;
    if(Math.random()<0.10)order=chronological.slice();
    else {
      order=shuffled(picks);
      if(order.every((id,i)=>id===chronological[i]))
        [order[0],order[1]]=[order[1],order[0]];
    }
    const items=order.map(episode=>imageEntry(episode,chooseFrames(episode)[0]));
    s.current={timeline:items,images:items};
    return;
  }
  const pool=eligible(c);
  const neverRepeat=c.challenge==="one110"||c.challenge==="custom"&&c.features.once;
  const available=pool.filter(id=>!s.seen.includes(id));
  if(!available.length) {
    if(neverRepeat){s.finished=true;s.current=null;return;}
    s.seen=[];
  }
  const remaining=pool.filter(id=>!s.seen.includes(id));
  const options=remaining.length>1?remaining.filter(id=>id!==s.previous):remaining;
  const episode=oneOf(options.length?options:remaining);
  s.previous=episode;
  s.seen.push(episode);
  const frames=chooseFrames(episode,threeEnabled(c)).map(frame=>imageEntry(episode,frame));
  const choices=fourEnabled(c)?shuffled([
    episode,...shuffled(pool.filter(id=>id!==episode)).slice(0,3)
  ]):undefined;
  s.current={episode,images:frames,...(choices?{choices}:{})};
}
export function publicState(s) {
  const current=s.current;
  const result={
    session:s.id,mode:s.mode,challenge:s.config.challenge,score:s.score,lives:s.lives,
    answered:s.answered,finished:s.finished,awaitingNext:s.awaitingNext,
    lastCorrect:s.awaitingNext?s.history.at(-1)?.correct:null,stage:s.stage||1,
    history:s.config.challenge==="daily" ? s.history.map(h=>({
      id:h.episode,guess:h.guess,correct:h.correct,
      url:h.images[0]?imageUrl(s,h.images[0]):null
    })) : undefined,
    guesses:s.config.challenge==="communityle"?s.guesses.map(g=>({id:g.id,hints:g.hints})):undefined
  };
  if(current){
    result.round={
      images:current.images.map(im=>imageUrl(s,im)),
      ...(current.choices?{choices:current.choices}:{}),
      ...(current.timeline?{timeline:current.timeline.map(im=>({token:im.token,url:imageUrl(s,im)}))}:{})
    };
    if(s.finished||s.awaitingNext) {
      if(current.episode)result.revealedEpisode=current.episode;
      if(current.timeline)result.timelineSolution=current.timeline.slice()
        .sort((a,b)=>EPISODES.indexOf(a.episode)-EPISODES.indexOf(b.episode))
        .map(im=>({token:im.token,episode:im.episode}));
    }
  }
  if(s.finished&&s.config.challenge==="communityle")result.revealedEpisode=current?.episode;
  return result;
}
export async function start(db,settings,resumeId) {
  const config=configFrom(settings),date=berlinDate(),mode=keyFor(config,date);
  if(resumeId){
    const existing=await load(db,resumeId);
    if(existing?.mode===mode&&existing.state.config.challenge===config.challenge&&
      existing.state.mode===mode&&now()-existing.updated_at<7*86400e3)
      return publicState(existing.state);
  }
  const s={id:uuid(),config,date,mode,score:0,lives:config.challenge==="custom"?config.lives:1,
    answered:0,seen:[],previous:null,current:null,finished:false,awaitingNext:false,
    history:[],guesses:[],stage:1};
  await makeRound(db,s);
  await db.prepare("INSERT INTO cg_sessions (id,mode,state,updated_at) VALUES (?,?,?,?)")
    .bind(s.id,mode,JSON.stringify(s),now()).run();
  // Small opportunistic batches prevent abandoned anonymous sessions from
  // consuming the free D1 storage quota indefinitely.
  if(Math.random()<0.02){
    try {await db.prepare("DELETE FROM cg_sessions WHERE id IN (SELECT id FROM cg_sessions WHERE updated_at<? ORDER BY updated_at LIMIT 200)")
      .bind(now()-30*86400e3).run();}catch(_){/* cleanup is best effort */}
  }
  return publicState(s);
}
export async function action(db,payload) {
  if(!payload||typeof payload!=="object")return json({error:"Invalid request."},400);
  if(payload.action==="start"){
    let result;
    try{result=await start(db,payload.settings,payload.resume);}catch(e){return json({error:e.message},400);}
    return json(result);
  }
  const row=await load(db,payload.session);
  if(!row)return json({error:"Session not found. Start a new game."},404);
  const s=row.state,c=s.config;
  if((c.challenge==="daily"||c.challenge==="communityle")&&s.date!==berlinDate())
    return json({error:"The daily puzzle has reset. Start today's game."},409);
  if(payload.action==="state")return json(publicState(s));
  if(s.finished)return json({error:"This game is finished.",...publicState(s)},409);
  if(payload.action==="reveal"){
    if(!revealEnabled(c)||s.awaitingNext||s.stage>=5)return json({error:"Cannot reveal now."},409);
    s.stage++;
    if(!await persist(db,row))return json({error:"Please retry."},409);
    return json({stage:s.stage});
  }
  if(payload.action==="next"){
    if(!s.awaitingNext)return json({error:"Complete the current round first."},409);
    s.awaitingNext=false;s.stage=1;
    await makeRound(db,s);
    if(!await persist(db,row))return json({error:"Please retry."},409);
    return json(publicState(s));
  }
  if(payload.action!=="guess")return json({error:"Unsupported action."},400);
  if(s.awaitingNext||!s.current)return json({error:"Complete or advance the current round first."},409);
  if(c.challenge==="communityle"){
    const guess=payload.guess;
    if(typeof guess!=="string"||!EPISODE_SET.has(guess)||s.guesses.some(g=>g.id===guess))
      return json({error:"Invalid or repeated episode."},400);
    const hints=wordleHint(guess,s.current.episode);
    s.guesses.push({id:guess,hints});
    const correct=guess===s.current.episode;
    if(correct||s.guesses.length>=6){
      s.finished=true;
      s.score=correct?7-s.guesses.length:0;
    }
    if(!await persist(db,row))return json({error:"Please retry."},409);
    return json({...publicState(s),correct,hints,
      ...(s.finished?{answer:s.current.episode}:{})});
  }
  let correct=false,guess=payload.guess;
  if(c.challenge==="timeline"){
    const tokens=s.current.timeline.map(x=>x.token);
    if(!Array.isArray(guess)||guess.length!==3||new Set(guess).size!==3||
      !guess.every(token=>tokens.includes(token)))return json({error:"Invalid timeline order."},400);
    const expected=s.current.timeline.slice().sort((a,b)=>
      EPISODES.indexOf(a.episode)-EPISODES.indexOf(b.episode)).map(x=>x.token);
    correct=guess.every((id,i)=>id===expected[i]);
  } else {
    if(typeof guess!=="string"||!EPISODE_SET.has(guess)||
      c.challenge==="season"&&Number(guess.slice(1,3))!==c.season||
      c.challenge==="custom"&&!c.seasons.includes(Number(guess.slice(1,3)))||
      s.current.choices&&!s.current.choices.includes(guess))
      return json({error:"Invalid episode selection."},400);
    correct=guess===s.current.episode;
  }
  s.answered++;
  s.history.push({episode:s.current.episode||null,images:s.current.images,
    guess,correct});
  if(correct) s.score+=c.challenge==="daily"?1:revealEnabled(c)?6-s.stage:1;
  if(c.challenge==="daily") {
    if(s.answered>=5)s.finished=true;
    else s.awaitingNext=true;
  }
  else if(c.challenge==="one110"&&s.answered>=EPISODES.length)s.finished=true;
  else if(c.challenge==="custom"&&c.features.once&&s.answered>=eligible(c).length)s.finished=true;
  else if(!correct){
    if(c.challenge==="custom"&&--s.lives>0)s.awaitingNext=true;
    else s.finished=true;
  } else if(!s.finished)s.awaitingNext=true;
  if(!await persist(db,row))return json({error:"Please retry."},409);
  return json({...publicState(s),correct,answer:s.current.episode,
    ...(s.current.timeline?{timelineSolution:s.current.timeline.slice()
      .sort((a,b)=>EPISODES.indexOf(a.episode)-EPISODES.indexOf(b.episode))
      .map(im=>({token:im.token,episode:im.episode}))}:{})});
}
