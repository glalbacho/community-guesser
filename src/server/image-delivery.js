// Centralized image source and optional Cloudflare Images re-encoding.
// Enable FRAME_BUCKET (private R2) and IMAGES bindings together in Pages.
// Do not silently fall back to public GitHub when private R2 is configured.
import {imageKey,imagePath,secureRandomInt} from "./engine.js";

function failure(message,status=503) {
  return new Response(message,{status,headers:{"cache-control":"no-store"}});
}
export async function deliverFrame(env,episode,frame) {
  const privateSource=!!env.FRAME_BUCKET;
  if(env.FRAME_SOURCE==="r2"&&!privateSource)
    return failure("Private frame bucket not configured.");
  if(env.FRAME_SECURITY_REQUIRED==="true"&&(!privateSource||!env.IMAGES))
    return failure("Secure frame delivery requires FRAME_BUCKET and IMAGES.");
  let stream;
  if(privateSource) {
    // Private R2 object keys use S01E01/S01E01_0004.webp, etc.
    const object=await env.FRAME_BUCKET.get(imageKey(episode,frame));
    if(!object?.body)return failure("Frame is missing from the private bucket.",502);
    if(!env.IMAGES)return failure("Images binding is required for private frames.");
    stream=object.body;
  }else{
    const original=await fetch(imagePath(episode,frame),{
      redirect:"follow",cf:{cacheEverything:true,cacheTtl:86400}
    });
    if(!original.ok||!original.body||
      !(original.headers.get("content-type")||"").startsWith("image/"))
      return failure("Frame unavailable.",502);
    stream=original.body;
  }
  if(!env.IMAGES) {
    // Legacy compatibility until the Cloudflare Images binding is activated.
    // Still vulnerable to identical-byte hashing; do NOT mark this secure.
    return new Response(stream,{status:200,headers:{
      "content-type":"image/webp","cache-control":"private, max-age=1800",
      "x-content-type-options":"nosniff"
    }});
  }
  // A subtle crop avoids cutting off visual clues. Each request gets fresh
  // parameters and a real re-encode, not a superficial byte-prefix change.
  const fraction=()=> (3+secureRandomInt(7))/1000;
  const trim={top:fraction(),right:fraction(),bottom:fraction(),left:fraction()};
  const quality=76+secureRandomInt(17);
  const encoded=await env.IMAGES.input(stream)
    .transform({trim})
    .output({format:"image/webp",quality,anim:false});
  const result=encoded.response();
  if(!result.ok)return failure("Image transformation failed.",502);
  return new Response(result.body,{status:200,headers:{
    "content-type":"image/webp",
    "cache-control":"private, no-store, max-age=0",
    "x-content-type-options":"nosniff",
    "x-content-security-policy":"no-referrer"
  }});
}
