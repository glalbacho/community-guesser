import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const game=readFileSync(new URL("../js/game.js",import.meta.url),"utf8");
const engine=readFileSync(new URL("../src/server/engine.js",import.meta.url),"utf8");

test("The retired Season Challenge has no menu item, selector or public mode",()=>{
  assert.doesNotMatch(html,/data-challenge="season"|id="season-select"|Season Challenge/);
  assert.doesNotMatch(game,/seasonSelect|seasonLabel|season:"Season Challenge"/);
  assert.doesNotMatch(engine,/case "season":|challenge==="season"/);
  // Filtering the set of seasons remains a valid, intentional Custom Game option.
  assert.match(html,/id="custom-seasons"|class="custom-seasons"/);
  assert.match(game,/customSeasons/);
});

test("Daily labels do not show Berlin or a reset hour",()=>{
  assert.match(html,/Five shared screenshots · resets daily/);
  assert.doesNotMatch(html,/resets 06:00 Berlin time/);
  assert.doesNotMatch(game,/resets 06:00 Berlin|dailyDate\(\) \+ " \(Berlin\)/);
  assert.match(game,/communityleDate\.textContent = dailyDate\(\);/);
  assert.match(game,/if \(challenge === "daily"\) message = dailyDate\(\);/);
  assert.match(game,/progressDetail\.textContent = dailyDate\(\);/);
  // The change is presentational only: server daily puzzles still align worldwide.
  assert.match(engine,/timeZone:"Europe\/Berlin"/);
});

test("Hall of Fame no longer shows minimum point or mode-count captions",()=>{
  assert.doesNotMatch(game,/Minimum 1 point|rankings with scores/);
  assert.match(game,/caption\.textContent="Website Top 3";/);
});

test("Keyboard replay requests focus once the async game start succeeds",()=>{
  assert.match(game,/resetGame\(focusAfterReplay=false\)/);
  assert.match(game,/if\(focusInputAfterReplay && !gameOver && !textAnswer\.hidden && !input\.disabled\)/);
  assert.match(game,/focusInputAfterReplay=false;\s*input\.focus\(\);/);
  assert.match(game,/event\.preventDefault\(\);\s*resetGame\(true\);\s*\}\);\s*\/\/ First click/);
});
