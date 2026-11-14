import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../js/swipe.js",import.meta.url),"utf8");
const sandbox={window:{}};
vm.runInNewContext(source,sandbox);
const attachSwipe=sandbox.window.COMMUNITY_ATTACH_SWIPE;

function harness(){
  const listeners=new Map();
  const element={addEventListener(type,callback,options){
    listeners.set(type,{callback,options});
  }};
  let activeRound={id:"round1"},index=1;
  const movements=[];
  attachSwipe(element,()=>activeRound,direction=>{
    movements.push(direction);
    index=Math.max(0,Math.min(2,index+direction));
  });
  const point=(x,y,id=1)=>({clientX:x,clientY:y,identifier:id});
  const emit=(type,event)=>listeners.get(type).callback(event);
  const start=(x=160,y=160)=>emit("touchstart",{touches:[point(x,y)]});
  const end=(x,y)=>emit("touchend",{
    touches:[],changedTouches:[point(x,y)],
    preventDefault(){throw Error("Swipe must not block scrolling");}
  });
  return {listeners,emit,start,end,point,movements,get index(){return index;},
    setIndex(value){index=value;},disable(){activeRound=null;},
    changeRound(){activeRound={id:"round2"};}
  };
}

test("Left swipe shows next screenshot, right swipe shows previous",()=>{
  const h=harness();
  h.start();h.end(80,160);
  assert.equal(h.index,2);
  h.start();h.end(260,160);
  assert.equal(h.index,1);
  assert.deepEqual(h.movements,[1,-1]);
});

test("Swipe navigation respects the first and last screenshot",()=>{
  const h=harness();
  h.setIndex(0);
  h.start();h.end(260,160);
  assert.equal(h.index,0);
  h.setIndex(2);
  h.start();h.end(60,160);
  assert.equal(h.index,2);
});

test("Taps, small swipes, diagonal gestures and vertical scrolling do not change images",()=>{
  const h=harness();
  h.start();h.end(150,160); // Tap.
  h.start();h.end(120,160); // Under 45px minimum.
  h.start();h.end(85,100); // Diagonal, not horizontal enough.
  h.start();h.end(150,70); // Vertical page scrolling.
  assert.equal(h.index,1);
  assert.deepEqual(h.movements,[]);
  for(const {options} of h.listeners.values())
    assert.equal(options.passive,true,"Touch handlers must not block native scrolling");
});

test("Multi-touch, cancelled touches and wrong identifiers do not navigate",()=>{
  const h=harness();
  h.start();
  h.emit("touchmove",{touches:[h.point(150,160),h.point(180,160,2)]});
  h.end(70,160);
  h.start();
  h.emit("touchcancel",{});
  h.end(70,160);
  h.start();
  h.emit("touchend",{touches:[],changedTouches:[h.point(60,160,20)]});
  assert.equal(h.index,1);
});

test("No swipe in other modes or after a round changes mid-gesture",()=>{
  const h=harness();
  h.start();
  h.changeRound();
  h.end(50,160);
  assert.equal(h.index,1);
  h.disable();
  h.start();h.end(50,160);
  assert.equal(h.index,1);
});

test("Swipe handler stays active for reviewing the same three images after a loss",()=>{
  const h=harness();
  // No gameOver check is needed: when the mode still has the same three
  // screenshot references, navigation remains available even after failure.
  h.start();h.end(80,160);
  h.start();h.end(260,160);
  assert.equal(h.index,1);
});
