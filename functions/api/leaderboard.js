// Cloudflare Pages Function: GET /api/leaderboard?mode=... and POST /api/leaderboard
// Requires a D1 binding named DB in the Cloudflare Pages project.
// This is a public, nickname-based leaderboard; browser scores are not tamper-proof.
const HEADERS = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const allowedMode = mode => typeof mode === "string" && (
  /^classic:(easy|normal|hard|impossible)$/.test(mode) ||
  /^season:[1-6]$/.test(mode) ||
  /^challenge:(four|timeline|progressive|survival|one110)$/.test(mode) ||
  /^custom:(10|[1-9]):[1-6](?:-[1-6]){0,5}(?::[01]{6})?$/.test(mode) ||
  /^(daily|communityle):\d{4}-\d{2}-\d{2}$/.test(mode)
);
const minimumScore = mode => mode === "classic:easy" ? 15 :
  /^classic:/.test(mode) ? 10 : 1;
const reply = (value,status=200) => new Response(JSON.stringify(value),{status,headers:HEADERS});
async function getBoard(db,mode) {
  const rows = await db.prepare("SELECT id, name, score FROM leaderboard WHERE mode = ? ORDER BY score DESC, created_at ASC, id ASC LIMIT 3").bind(mode).all();
  return rows.results || [];
}
async function setup(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS leaderboard (id INTEGER PRIMARY KEY AUTOINCREMENT, mode TEXT NOT NULL, name TEXT NOT NULL, score INTEGER NOT NULL, created_at INTEGER NOT NULL)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS leaderboard_mode_scores ON leaderboard(mode,score DESC,created_at ASC,id ASC)").run();
}
export async function onRequest({request,env}) {
  if (!env.DB) return reply({error:"Leaderboard database not configured"},503);
  if (!["GET","POST"].includes(request.method)) return reply({error:"Method not allowed"},405);
  try {
    await setup(env.DB);
    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      if (params.get("catalog") === "1") {
        // Each game configuration stores at most three entries. Return all
        // recorded modes so custom configurations are discoverable as well.
        const rows = await env.DB.prepare(
          "SELECT mode,name,score FROM leaderboard ORDER BY mode ASC,score DESC,created_at ASC,id ASC LIMIT 1500"
        ).all();
        const grouped = new Map();
        for (const entry of (rows.results || [])) {
          if (!allowedMode(entry.mode)) continue;
          if (!grouped.has(entry.mode)) grouped.set(entry.mode,[]);
          if (grouped.get(entry.mode).length < 3)
            grouped.get(entry.mode).push({name:entry.name,score:entry.score});
        }
        return reply({boards:Array.from(grouped,([mode,entries])=>({mode,entries}))});
      }
      const mode = params.get("mode");
      if (!allowedMode(mode)) return reply({error:"Invalid game mode"},400);
      const entries = await getBoard(env.DB,mode);
      return reply({entries: entries.map(({name,score})=>({name,score})), minimum:minimumScore(mode)});
    }
    if ((Number(request.headers.get("content-length")) || 0) > 2048) return reply({error:"Request too large"},413);
    let data;
    try { data = await request.json(); } catch (_) { return reply({error:"Invalid JSON"},400); }
    if (!data || !allowedMode(data.mode)) return reply({error:"Invalid game mode"},400);
    const mode = data.mode;
    const name = typeof data.name === "string" ? data.name.trim().replace(/\s+/g," ") : "";
    if (!/^[\p{L}\p{N} _.-]{2,20}$/u.test(name)) return reply({error:"Name must be 2–20 characters (letters, numbers, space, . _ -)"},400);
    const score = data.score;
    if (!Number.isInteger(score) || score < minimumScore(mode) || score > 100000 ||
        (/^daily:/.test(mode) && score > 5) ||
        (/^communityle:/.test(mode) && score > 6) ||
        (/^challenge:one110$/.test(mode) && score > 110)) {
      return reply({error:"Score is below the minimum or invalid"},400);
    }
    const before = await getBoard(env.DB,mode);
    if (before.length === 3 && score <= before[2].score) {
      return reply({error:"This score is not in the website Top 3.",accepted:false,entries:before.map(({name,score})=>({name,score}))},409);
    }
    const inserted = await env.DB.prepare("INSERT INTO leaderboard(mode,name,score,created_at) VALUES (?,?,?,?)").bind(mode,name,score,Date.now()).run();
    const newId = inserted.meta?.last_row_id;
    await env.DB.prepare("DELETE FROM leaderboard WHERE mode=? AND id NOT IN (SELECT id FROM leaderboard WHERE mode=? ORDER BY score DESC,created_at ASC,id ASC LIMIT 3)").bind(mode,mode).run();
    const after = await getBoard(env.DB,mode);
    if (!after.some(x=>x.id === newId)) {
      return reply({error:"Another player entered the Top 3 first.",accepted:false,entries:after.map(({name,score})=>({name,score}))},409);
    }
    return reply({accepted:true,entries:after.map(({name,score})=>({name,score}))},201);
  } catch (error) {
    return reply({error:"Leaderboard temporarily unavailable"},503);
  }
}
