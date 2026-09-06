import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),"utf8");

test("hidden tower snapshots do not render or create a hidden battle",()=>{
  const source=read("tower-mode.js");
  const code=source.slice(source.indexOf("  function applySnapshot("),source.indexOf("  function open("));
  let renders=0;
  const context={Tower:()=>({normalizeState:value=>value}),repository:null,Date,root:null,render:()=>renders++};
  vm.createContext(context);
  vm.runInContext(code+";applySnapshot({revision:1});",context);
  assert.equal(renders,0);
  context.root={classList:{contains:()=>false}};
  vm.runInContext("applySnapshot({revision:2});",context);
  assert.equal(renders,0);
  context.root.classList.contains=()=>true;
  vm.runInContext("applySnapshot({revision:3});",context);
  assert.equal(renders,1);
});

test("mode close paths release rendering resources and late loads cannot restart drawing",()=>{
  const life=read("life-mode.js"),territory=read("territory-map-3d.js"),city=read("city-map-3d.js");
  for(const source of [life,territory,city])assert.match(source,/forceContextLoss\(\)/);
  assert.match(life,/resizeObserver\?\.disconnect\(\)/);
  assert.match(life,/playerSprites\.clear\(\)/);
  assert.match(life,/displayedPositions\.clear\(\)/);
  assert.match(life,/if \(scene !== ownerScene\) \{ texture\.dispose\(\); return; \}/);
  assert.match(territory,/resizeObserver\.disconnect\(\)/);
  assert.match(territory,/function renderOnce\(\) \{\s*if \(destroyed\) return/);
  assert.match(city,/if \(!destroyed\) renderer\.render/);
  assert.match(read("territory-mode.js"),/map3D\?\.destroy\(\)/);
  assert.match(read("territory-mode.js"),/historyMap3D\?\.destroy\(\)/);
});
