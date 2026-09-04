import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const mode = readFileSync(new URL("../life-mode.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../life-mode.css", import.meta.url), "utf8");
const online = readFileSync(new URL("../online/online-room.js", import.meta.url), "utf8");
const workerCache = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const rules = readFileSync(new URL("../firebase-database.rules.json", import.meta.url), "utf8");

test("六王人生すごろく is reachable from setup and match screens in a standalone tab", () => {
  assert.match(html, /id="lifeModeButton"[^>]+target="_blank"/);
  assert.match(html, /id="playLifeModeButton"[^>]+target="_blank"/);
  assert.match(html, /searchParams\.set\("life", "1"\)/);
  assert.match(html, /classList\.add\("life-standalone"\)/);
  assert.match(html, /src="life-board-system\.js\?v=\d+-life-board-\d+"/);
  assert.match(html, /src="life-mode\.js\?v=\d+-life-board-\d+"/);
  assert.match(html, /href="life-mode\.css\?v=\d+-life-board-\d+"/);
});

test("the life board renders 1000 spaces with one instanced mesh and bounded animation", () => {
  assert.match(mode, /new THREE\.InstancedMesh\(geometry, material, System\.BOARD_SIZE\)/);
  assert.match(mode, /if \(!root\?\.classList\.contains\("open"\) \|\| !renderer\)/);
  assert.match(mode, /cancelAnimationFrame\(frame\)/);
  assert.match(mode, /OVERVIEW/);
  assert.match(mode, /rollAnimations/);
  assert.match(mode, /new THREE\.BoxGeometry\(1\.05, 1\.05, 1\.05\)/);
  assert.match(css, /\.life-mode\.open/);
});

test("all six life avatars are independent transparent-ready files", () => {
  for (const player of ["tofu", "eda", "jan", "rima", "kento", "lickey"]) {
    const url = new URL(`../images/life/avatars/${player}.png`, import.meta.url);
    assert.equal(existsSync(url), true, `${player} avatar missing`);
    assert.ok(statSync(url).size > 500000, `${player} avatar is unexpectedly small`);
    assert.equal(readFileSync(url)[25], 6, `${player} avatar must use RGBA transparency`);
  }
});

test("life history and data controls are available without exposing resets to regular players", () => {
  assert.match(mode, /data-life-history/);
  assert.match(mode, /data-life-admin hidden/);
  assert.match(mode, /team-bingo-life-board/);
  assert.match(online, /adminResetLifeBoard\(target/);
  assert.match(online, /adminImportLifeBoard\(value/);
  assert.match(html, /isAdmin: Boolean\(onlineCoordinator\?\.isAdminMode/);
});

test("life state is subscribed online, permitted by rules, and available offline", () => {
  assert.match(online, /subscribeLifeBoard\(\)/);
  assert.match(online, /awardLifeBoardOpen\(payload/);
  assert.match(rules, /"life"\s*:\s*\{/);
  assert.match(workerCache, /life-board-system\.js/);
  assert.match(workerCache, /life-mode\.js/);
  assert.match(workerCache, /life-mode\.css/);
});
