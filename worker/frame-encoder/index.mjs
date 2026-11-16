// Internal Worker: only callable through a Cloudflare Service binding.
// Set workers_dev=false and configure IMAGES in wrangler.toml.
const randomInt=max=>{
  const range=0x100000000;
  const limit=Math.floor(range/max)*max;
  const values=new Uint32Array(1);
  do{crypto.getRandomValues(values);}while(values[0]>=limit);
  return values[0]%max;
};
export default {
  async fetch(request,env){
    if(request.method!=="POST"||new URL(request.url).pathname!=="/encode")
      return new Response("Not found",{status:404});
    if(!env.IMAGES)return new Response("Images binding unavailable",{status:503});
    if(!request.body||(request.headers.get("content-type")||"")!=="image/webp")
      return new Response("Image required",{status:415});
    const size=Number(request.headers.get("content-length")||"0");
    if(size>10*1024*1024)return new Response("Image too large",{status:413});
    const fraction=()=> (3+randomInt(7))/1000;
    try {
      const transformed=await env.IMAGES.input(request.body)
        .transform({trim:{
          top:fraction(),right:fraction(),bottom:fraction(),left:fraction()
        }})
        .output({format:"image/webp",quality:76+randomInt(17),anim:false});
      const response=transformed.response();
      if(!response.ok)return new Response("Transform failed",{status:502});
      return new Response(response.body,{status:200,headers:{
        "content-type":"image/webp",
        "cache-control":"private, no-store, max-age=0",
        "x-content-type-options":"nosniff"
      }});
    }catch(error){
      console.error("Encoder unavailable",error);
      return new Response("Transform unavailable",{status:503});
    }
  }
};
