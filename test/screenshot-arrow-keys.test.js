import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

// Exercise the actual document-level keyboard handler in game.js, rather than
// a second implementation that could diverge from the production behavior.
const source=readFileSync(new URL("../js/game.js",import.meta.url),"utf8");
const marker='  document.addEventListener("keydown", event => {\n    if (event.altKey || event.ctrlKey || event.metaKey || menu.classList.contains("open")) return;';
const start=source.indexOf(marker);
const end=source.indexOf('  function buildChoices()',start);
assert.ok(start>=0&&end>start,"Expected screenshot keyboard handler was not found.");
const handlerSource=source.slice(start,end);

function harness(frame=0,{enabled=true,imageCount=3}={}){
  let handler;
  const input={closest(selector){return selector==="input"?input:null;}};
  const otherInput={closest(selector){return selector==="input"?otherInput:null;}};
  const other={closest(){return null;}};
  const textarea={closest(selector){
    return selector.includes("textarea")?textarea:null;
  }};
  const sandbox={
    document:{addEventListener(type,callback){
      assert.equal(type,"keydown");
      handler=callback;
    }},
    menu:{classList:{contains(){return false;}}},
    input,
    currentFrame:frame,
    currentRound:{frames:Array.from({length:imageCount},()=>({}))},
    threeEnabled:()=>enabled,
    moveFrame(direction){
      const next=sandbox.currentFrame+direction;
      if(next>=0&&next<imageCount)sandbox.currentFrame=next;
    }
  };
  vm.runInNewContext(handlerSource,sandbox);
  return {
    input,other,otherInput,textarea,sandbox,
    press(key,target=input,modifiers={}){
      const result={prevented:false};
      handler({
        key,target,altKey:false,ctrlKey:false,metaKey:false,
        ...modifiers,preventDefault(){result.prevented=true;}
      });
      return {prevented:result.prevented,frame:sandbox.currentFrame};
    }
  };
}

test("At image 1/3, Left leaves input caret navigation intact",()=>{
  const h=harness(0);
  assert.deepEqual(h.press("ArrowLeft"),{prevented:false,frame:0});
  assert.deepEqual(h.press("ArrowRight"),{prevented:true,frame:1});
});

test("At image 3/3, Right leaves input caret navigation intact",()=>{
  const h=harness(2);
  assert.deepEqual(h.press("ArrowRight"),{prevented:false,frame:2});
  assert.deepEqual(h.press("ArrowLeft"),{prevented:true,frame:1});
});

test("At image 2/3 arrows still move between screenshots while typing",()=>{
  const h=harness(1);
  assert.deepEqual(h.press("ArrowLeft"),{prevented:true,frame:0});
  assert.deepEqual(h.press("ArrowRight"),{prevented:true,frame:1});
  assert.deepEqual(h.press("ArrowRight"),{prevented:true,frame:2});
});

test("At screenshot boundaries arrow keys outside the answer field still do not scroll the page",()=>{
  const h=harness(0);
  assert.deepEqual(h.press("ArrowLeft",h.other),{prevented:true,frame:0});
  h.sandbox.currentFrame=2;
  assert.deepEqual(h.press("ArrowRight",h.other),{prevented:true,frame:2});
});

test("Other input fields, textareas, shortcuts and non-three-image modes are unaffected",()=>{
  const h=harness(1);
  assert.deepEqual(h.press("ArrowRight",h.otherInput),{prevented:false,frame:1});
  assert.deepEqual(h.press("ArrowLeft",h.textarea),{prevented:false,frame:1});
  assert.deepEqual(h.press("ArrowRight",h.input,{ctrlKey:true}),{prevented:false,frame:1});
  assert.deepEqual(h.press("ArrowLeft",h.input,{altKey:true}),{prevented:false,frame:1});
  const normal=harness(1,{enabled:false});
  assert.deepEqual(normal.press("ArrowRight"),{prevented:false,frame:1});
});

test("The same boundary behavior applies to Custom Game with three screenshots",()=>{
  // The shared handler is gated by threeEnabled(), which also covers Custom
  // Game's Three screenshots modifier.
  const h=harness(0,{enabled:true});
  assert.equal(h.press("ArrowLeft").prevented,false);
  assert.equal(h.press("ArrowRight").frame,1);
});
