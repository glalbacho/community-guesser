import {imagePath,load} from "../../../_shared/engine.js";

export async function onRequestGet({params,env}) {
  if(!env.DB)return new Response("Unavailable",{status:503});
  const session=params.session,token=params.token;
  if(typeof token!=="string"||!/^[a-f0-9-]{36}$/i.test(token))
    return new Response("Not found",{status:404});
  try{
    const row=await load(env.DB,session);
    if(!row)return new Response("Not found",{status:404});
    const state=row.state;
    const entries=[...(state.current?.images||[]),
      ...state.history.flatMap(h=>h.images||[])];
    const image=entries.find(x=>x.token===token);
    if(!image)return new Response("Not found",{status:404});
    const original=await fetch(imagePath(image.episode,image.frame),{
      redirect:"follow",cf:{cacheEverything:true,cacheTtl:86400}
    });
    if(!original.ok||!(original.headers.get("content-type")||"").startsWith("image/"))
      return new Response("Image temporarily unavailable",{status:502});
    return new Response(original.body,{status:200,headers:{
      "content-type":"image/webp",
      "cache-control":"private, max-age=1800",
      "x-content-type-options":"nosniff"
    }});
  }catch(error){
    console.error("Frame proxy failed",error);
    return new Response("Image temporarily unavailable",{status:503});
  }
}
