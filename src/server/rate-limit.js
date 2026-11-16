// Lightweight abuse guard for the existing free Cloudflare D1 database.
// No account, cookie or additional Cloudflare binding is required.
// Only short-lived pseudonymous hashes are stored, never raw IP addresses.
export async function rateLimit(db,request,category,maxRequests,windowSeconds=300) {
  const ip=request.headers.get("CF-Connecting-IP");
  // Never put all local/preview visitors into a shared "unknown" IP bucket.
  if(!ip)return null;
  return rateLimitIdentity(db,category,"ip:"+ip,maxRequests,windowSeconds);
}
export async function rateLimitSession(db,category,session,maxRequests,windowSeconds=300) {
  if(typeof session!=="string"||!/^[0-9a-f-]{36}$/i.test(session))
    return new Response("Invalid session",{status:404});
  return rateLimitIdentity(db,category,"session:"+session,maxRequests,windowSeconds);
}
async function rateLimitIdentity(db,category,identity,maxRequests,windowSeconds) {
  const started=Math.floor(Date.now()/(windowSeconds*1000));
  const input=new TextEncoder().encode(category+"|"+identity+"|"+started);
  const digest=await crypto.subtle.digest("SHA-256",input);
  const fingerprint=Array.from(new Uint8Array(digest).slice(0,20))
    .map(byte=>byte.toString(16).padStart(2,"0")).join("");
  const key=category+":"+fingerprint;
  await db.prepare("CREATE TABLE IF NOT EXISTS cg_rate_buckets (bucket_key TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires_at INTEGER NOT NULL)").run();
  await db.prepare(
    "INSERT INTO cg_rate_buckets (bucket_key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(bucket_key) DO UPDATE SET hits=hits+1"
  ).bind(key,(started+1)*windowSeconds).run();
  const row=await db.prepare("SELECT hits FROM cg_rate_buckets WHERE bucket_key=?")
    .bind(key).first();
  if(crypto.getRandomValues(new Uint32Array(1))[0]%1000<15){
    // Opportunistic cleanup, bounded to avoid large delete transactions.
    try {
      await db.prepare("DELETE FROM cg_rate_buckets WHERE bucket_key IN (SELECT bucket_key FROM cg_rate_buckets WHERE expires_at<? LIMIT 100)")
        .bind(Math.floor(Date.now()/1000)-windowSeconds).run();
    } catch(_){ /* Cleanup is best effort. */ }
  }
  if(Number(row?.hits)<=maxRequests)return null;
  const wait=Math.max(1,(started+1)*windowSeconds-Math.floor(Date.now()/1000));
  return new Response(JSON.stringify({error:"Too many requests. Please try again shortly."}),{
    status:429,headers:{"content-type":"application/json; charset=utf-8",
      "cache-control":"no-store","retry-after":String(wait)}
  });
}
