import {load} from "../../../../src/server/engine.js";
import {rateLimit,rateLimitSession} from "../../../../src/server/rate-limit.js";
import {deliverFrame} from "../../../../src/server/image-delivery.js";

export async function onRequestGet({params,env,request}) {
  if(!env.DB)return new Response("Unavailable",{status:503});
  const session=params.session,token=params.token;
  if(typeof session!=="string"||!/^[a-f0-9-]{36}$/i.test(session)||
     typeof token!=="string"||!/^[a-f0-9-]{36}$/i.test(token))
    return new Response("Not found",{status:404});
  try{
    // IP and game-session limits operate independently, preventing repeated
    // replay/downloads of authorized frames from bypassing the game API limits.
    const ipLimit=await rateLimit(env.DB,request,"frame-ip",180,300);
    if(ipLimit)return ipLimit;
    const row=await load(env.DB,session);
    if(!row)return new Response("Not found",{status:404});
    const sessionLimit=await rateLimitSession(env.DB,"frame-session",session,150,300);
    if(sessionLimit)return sessionLimit;
    const state=row.state;
    const entries=[...(state.current?.images||[]),
      ...(state.history||[]).flatMap(h=>h.images||[])];
    const image=entries.find(x=>x.token===token);
    if(!image)return new Response("Not found",{status:404});
    return await deliverFrame(env,image.episode,image.frame);
  }catch(error){
    console.error("Frame proxy failed",error);
    return new Response("Image temporarily unavailable",{status:503});
  }
}
