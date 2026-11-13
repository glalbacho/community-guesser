// Lightweight abuse guard for the existing free Cloudflare D1 database.
// No account, cookie or additional Cloudflare binding is required.
// Only short-lived pseudonymous hashes are stored, never raw IP addresses.
export async function rateLimit(db,request,category,maxRequests,windowSeconds=300) {
  const ip=request.headers.get("CF-Connecting-IP");
  // Cloudflare provides the real visitor address. Do not create one global
  // "unknown" bucket that could block all visitors during local development.
  if(!ip)return null;
  const started=Math.floor(Date.now()/(windowSeconds*1000));
  const input=new TextEncoder().encode(category+"|"+ip+"|"+started);
  const digest=await crypto.subtle.digest("SHA-256",input);
  const fingerprint=Array.from(new Uint8Array(digest).slice(0,20))
    .map(byte=>byte.toString(16).padStart(2,"0")).join("");
  const key=category+":"+fingerprint;
  await db.prepare("CREATE TABLE IF NOT EXISTS cg_rate_buckets (bucket_key TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires_at INTEGER NOT NULL)").run();
  const row=await db.prepare(
    "INSERT INTO cg_rate_buckets (bucket_key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(bucket_key) DO UPDATE SET hits=hits+1 RETURNING hits"
  ).bind(key,(started+1)*windowSeconds).first();
  if(Math.random()<0.015){
    // Opportunistic cleanup, bounded to avoid large delete transactions.
    await db.prepare("DELETE FROM cg_rate_buckets WHERE bucket_key IN (SELECT bucket_key FROM cg_rate_buckets WHERE expires_at<? LIMIT 100)")
      .bind(Math.floor(Date.now()/1000)-windowSeconds).run();
  }
  if(Number(row?.hits)<=maxRequests)return null;
  const wait=Math.max(1,(started+1)*windowSeconds-Math.floor(Date.now()/1000));
  return new Response(JSON.stringify({error:"Too many requests. Please try again shortly."}),{
    status:429,headers:{"content-type":"application/json; charset=utf-8",
      "cache-control":"no-store","retry-after":String(wait)}
  });
}
