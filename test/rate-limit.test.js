import test from "node:test";
import assert from "node:assert/strict";
import {rateLimit} from "../src/server/rate-limit.js";

function mockDb(){
  const buckets=new Map();
  return {buckets,prepare(sql){
    return {args:[],bind(...args){this.args=args;return this;},
      async run(){
        if(sql.startsWith("CREATE"))return {meta:{changes:0}};
        if(sql.startsWith("INSERT INTO cg_rate_buckets")){
          const [key,expiry]=this.args;
          const old=buckets.get(key);
          buckets.set(key,{hits:(old?.hits||0)+1,expiry});
          return {meta:{changes:1}};
        }
        if(sql.startsWith("DELETE FROM cg_rate_buckets"))return {meta:{changes:0}};
        throw new Error("Unexpected SQL: "+sql);
      },
      async first(){
        if(sql.startsWith("SELECT hits FROM cg_rate_buckets"))
          return buckets.get(this.args[0])||null;
        throw new Error("Unexpected SELECT: "+sql);
      }
    };
  }};
}

test("Limits repeated requests by short-lived pseudonymous visitor key",async()=>{
  const db=mockDb();
  const request=new Request("https://community-guesser.pages.dev/api/game",
    {headers:{"CF-Connecting-IP":"203.0.113.10"}});
  assert.equal(await rateLimit(db,request,"test",2,300),null);
  assert.equal(await rateLimit(db,request,"test",2,300),null);
  const blocked=await rateLimit(db,request,"test",2,300);
  assert.equal(blocked.status,429);
  assert.ok(Number(blocked.headers.get("retry-after"))>=1);
  assert.equal(db.buckets.size,1);
  const key=[...db.buckets.keys()][0];
  assert.equal(key.includes("203.0.113.10"),false);
  const other=new Request("https://community-guesser.pages.dev/api/game",
    {headers:{"CF-Connecting-IP":"203.0.113.11"}});
  assert.equal(await rateLimit(db,other,"test",2,300),null);
});

test("Does not block all local visitors when the real Cloudflare IP header is unavailable",async()=>{
  const db=mockDb();
  const request=new Request("http://localhost/api/game");
  assert.equal(await rateLimit(db,request,"test",1,300),null);
  assert.equal(db.buckets.size,0);
});
