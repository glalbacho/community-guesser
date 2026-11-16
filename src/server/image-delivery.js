// Centralized image source and optional Cloudflare Images re-encoding.
// Pages: FRAME_BUCKET (private R2) + FRAME_ENCODER (Worker service binding).
// Standalone Worker: an IMAGES binding can also be used directly.
// Do not silently fall back to public GitHub when private R2 is configured.
import {imageKey,imagePath,secureRandomInt} from "./engine.js";

function failure(message,status=503) {
  return new Response(message,{status,headers:{"cache-control":"no-store"}});
}
export async function deliverFrame(env,episode,frame) {
  const privateSource=!!env.FRAME_BUCKET;
  if(env.FRAME_SOURCE==="r2"&&!privateSource)
    return failure("Private frame bucket not configured.");
  if(env.FRAME_SECURITY_REQUIRED==="true"&&(!privateSource||(!env.FRAME_ENCODER&&!env.IMAGES)))
    return failure("Secure frame delivery requires FRAME_BUCKET and IMAGES.");
  let stream;
  if(privateSource) {
    // Private R2 object keys use S01E01/S01E01_0004.webp, etc.
    const object=await env.FRAME_BUCKET.get(imageKey(episode,frame));
    if(!object?.body)return failure("Frame is missing from the private bucket.",502);
    if(!env.FRAME_ENCODER&&!env.IMAGES)
      return failure("Private frames require the FRAME_ENCODER service binding.");
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
  if(env.FRAME_ENCODER) {
    // Pages Functions support Service bindings, not Images bindings.
    // The called Worker is private (workers_dev=false) and handles the decode.
    const result=await env.FRAME_ENCODER.fetch("https://encoder.internal/encode",{
      method:"POST",headers:{"content-type":"image/webp"},body:stream
    });
    if(!result.ok||!result.body||
        !(result.headers.get("content-type")||"").startsWith("image/"))
      return failure("Secure frame transformation failed.",502);
    return new Response(result.body,{status:200,headers:{
      "content-type":"image/webp","cache-control":"private, no-store, max-age=0",
      "x-content-type-options":"nosniff"
    }});
  }
  if(!env.IMAGES) {
    // Legacy compatibility until the private R2 / encoder Worker is active.
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
