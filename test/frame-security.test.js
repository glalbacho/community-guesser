import test from "node:test";
import assert from "node:assert/strict";
import {deliverFrame} from "../src/server/image-delivery.js";
import {secureRandomInt,secureChance,imageKey} from "../src/server/engine.js";

test("CSPRNG draws valid numbers, including non-power-of-two ranges",()=>{
  for(const range of [1,3,7,110,10000,0x100000000]){
    for(let i=0;i<100;i++){
      const value=secureRandomInt(range);
      assert.ok(Number.isInteger(value)&&value>=0&&value<range);
    }
  }
  assert.equal(secureChance(0,2),false);
  assert.equal(secureChance(2,2),true);
  assert.throws(()=>secureRandomInt(0),RangeError);
  assert.throws(()=>secureRandomInt(0x100000001),RangeError);
});

test("Private R2 frame never leaks raw bytes when encoder is unavailable",async()=>{
  const object={body:new Blob(["original webp bytes"]).stream()};
  const env={FRAME_BUCKET:{async get(key){
    assert.equal(key,"S01E01/S01E01_0004.webp");
    return object;
  }},FRAME_SOURCE:"r2"};
  assert.equal(imageKey("S01E01",4),"S01E01/S01E01_0004.webp");
  const response=await deliverFrame(env,"S01E01",4);
  assert.equal(response.status,503);
  assert.match(await response.text(),/FRAME_ENCODER/);
});

test("Private R2 frames go to internal transcoder and return uncacheable results",async()=>{
  const calls=[];
  const env={
    FRAME_BUCKET:{async get(key){
      calls.push(key);
      return {body:new Blob(["private-original"]).stream()};
    }},
    FRAME_ENCODER:{async fetch(url,init){
      assert.equal(url,"https://encoder.internal/encode");
      assert.equal(init.method,"POST");
      assert.equal(init.headers["content-type"],"image/webp");
      calls.push("transcoded");
      return new Response("new-image-bytes",{
        headers:{"content-type":"image/webp"}
      });
    }},
    FRAME_SOURCE:"r2",
    FRAME_SECURITY_REQUIRED:"true"
  };
  const response=await deliverFrame(env,"S02E05",38);
  assert.equal(response.status,200);
  assert.equal(response.headers.get("cache-control"),"private, no-store, max-age=0");
  assert.equal(response.headers.get("content-type"),"image/webp");
  assert.equal(await response.text(),"new-image-bytes");
  assert.deepEqual(calls,["S02E05/S02E05_0038.webp","transcoded"]);
});

test("Strict mode fails closed until both private bucket and encoder exist",async()=>{
  const env={FRAME_SOURCE:"r2",FRAME_SECURITY_REQUIRED:"true"};
  const response=await deliverFrame(env,"S01E01",4);
  assert.equal(response.status,503);
  const strict=await deliverFrame({FRAME_SECURITY_REQUIRED:"true"},"S01E01",4);
  assert.equal(strict.status,503);
});
