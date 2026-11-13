import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../js/daily-share.js",import.meta.url),"utf8");
const sandbox={window:{}};
vm.runInNewContext(source,sandbox);
const format=sandbox.window.COMMUNITY_DAILY_SHARE;

test("Daily share is a numbered five-round quiz scorecard with no episode spoilers",()=>{
  const content=format("2026-11-13",[true,false,true,true,false],
    "https://community-guesser.pages.dev/#/daily");
  assert.match(content,/2026-11-13 · 3\/5 episodes recognized/);
  for(let i=1;i<=5;i++)assert.match(content,new RegExp("Round "+i+":"));
  assert.match(content,/Round 1: ✅ Correct/);
  assert.match(content,/Round 2: ❌ Missed/);
  assert.match(content,/Round 5: ❌ Missed/);
  assert.match(content,/https:\/\/community-guesser\.pages\.dev\/#\/daily/);
  assert.doesNotMatch(content,/S\d\dE\d\d|episode title|spoiler answer/i);
});

test("Daily share clearly handles zero and five correct guesses",()=>{
  assert.match(format("2026-11-13",[false,false,false,false,false],"https://example.org/#/daily"),
    /0\/5 episodes recognized/);
  assert.match(format("2026-11-13",[true,true,true,true,true],"https://example.org/#/daily"),
    /5\/5 episodes recognized/);
});

test("Daily share rejects unfinished or untrusted result payloads",()=>{
  assert.throws(()=>format("2026-11-13",[true,false],"https://example.org/#/daily"));
  assert.throws(()=>format("2026-11-13",[true,false,true,"S01E01",false],"https://example.org/#/daily"));
  assert.throws(()=>format("invalid",[true,false,true,false,false],"https://example.org/#/daily"));
});
