// Standalone meme images. These tokens never reveal the originating episode
// and are deliberately independent of the game session and leaderboard.
import { COMMUNITY_FRAME_NUMBERS } from "../../src/server/frames.js";
import { EPISODES, imagePath, json, secureRandomInt, secureChance } from "../../src/server/engine.js";
import { rateLimit } from "../../src/server/rate-limit.js";

const TTL = 6 * 60 * 60 * 1000;
const notFound = () => new Response("Image not found", {status:404});
async function setup(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS cg_meme_images (token TEXT PRIMARY KEY, episode TEXT NOT NULL, frame INTEGER NOT NULL, expires INTEGER NOT NULL)").run();
}
export async function onRequest({request,env}) {
  if (!env.DB) return json({error:"Meme service is unavailable (D1 missing)."},503);
  const url = new URL(request.url);
  if (request.method === "POST") {
    if (Number(request.headers.get("content-length")) > 1024)
      return json({error:"Request too large."},413);
    const limited = await rateLimit(env.DB,request,"meme-generator",40,300);
    if (limited) return limited;
    let input;
    try { input = await request.json(); } catch (_) {
      return json({error:"Invalid JSON."},400);
    }
    if (input?.count !== 1 && input?.count !== 4)
      return json({error:"Choose one or four frames."},400);
    try {
      await setup(env.DB);
      const pool = EPISODES.slice();
      const images = [];
      for (let i=0;i<input.count;i++) {
        const idx = i + secureRandomInt(pool.length - i);
        [pool[i],pool[idx]] = [pool[idx],pool[i]];
        const episode = pool[i];
        const available = COMMUNITY_FRAME_NUMBERS[episode];
        const frame = available[secureRandomInt(available.length)];
        const token = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO cg_meme_images (token,episode,frame,expires) VALUES (?,?,?,?)")
          .bind(token,episode,frame,Date.now()+TTL).run();
        images.push("/api/meme?token="+encodeURIComponent(token));
      }
      if (secureChance(1,20))
        await env.DB.prepare("DELETE FROM cg_meme_images WHERE expires < ?").bind(Date.now()).run();
      return json({images});
    } catch (error) {
      console.error("Meme selection failed",error);
      return json({error:"Could not generate frames."},503);
    }
  }
  if (request.method === "GET") {
    const token=url.searchParams.get("token");
    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return notFound();
    try {
      await setup(env.DB);
      const image=await env.DB.prepare("SELECT episode,frame,expires FROM cg_meme_images WHERE token=?")
        .bind(token).first();
      if (!image || image.expires<Date.now()) return notFound();
      const result=await fetch(imagePath(image.episode,image.frame),{
        redirect:"follow",cf:{cacheEverything:true,cacheTtl:86400}
      });
      if (!result.ok || !(result.headers.get("content-type")||"").startsWith("image/"))
        return new Response("Image unavailable",{status:502});
      return new Response(result.body,{status:200,headers:{
        "content-type":"image/webp",
        "cache-control":"private, max-age=1800",
        "x-content-type-options":"nosniff"
      }});
    } catch (error) {
      console.error("Meme frame failed",error);
      return new Response("Image unavailable",{status:503});
    }
  }
  return json({error:"Method not allowed."},405);
}
