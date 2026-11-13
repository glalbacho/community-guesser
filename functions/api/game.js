import {rateLimit} from "../../src/server/rate-limit.js";
import {action, json, setup} from "../../src/server/engine.js";

export async function onRequest({request,env}) {
  if(!env.DB)return json({error:"Cloudflare D1 is not configured. Bind DB in Pages settings."},503);
  if(request.method!=="POST")return json({error:"Method not allowed."},405);
  if(Number(request.headers.get("content-length"))>8192)return json({error:"Request too large."},413);
  try {
    const payload=await request.json();
    const limit=await rateLimit(env.DB,request,"game-api",600,300);
    if(limit)return limit;
    if(payload.action==="start"){
      const newGameLimit=await rateLimit(env.DB,request,"game-start",80,300);
      if(newGameLimit)return newGameLimit;
    }
    await setup(env.DB);
    return await action(env.DB,payload);
  } catch(error) {
    if(error instanceof SyntaxError)return json({error:"Invalid JSON."},400);
    console.error("Game API failed",error);
    return json({error:"Game service temporarily unavailable."},503);
  }
}
