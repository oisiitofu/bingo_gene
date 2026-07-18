import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("all inline index scripts compile", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const scripts = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
    .map((match) => match[1])
    .filter((source) => source.trim());
  assert.ok(scripts.length > 0, "No inline scripts found in index.html");
  scripts.forEach((source) => {
    assert.doesNotThrow(() => new Function(source));
  });
});

test("every declared custom OPEN sound asset exists", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const assetPaths = Array.from(html.matchAll(/["'](audio\/open-cells\/[^"']+)["']/g))
    .map((match) => match[1]);
  const missing = assetPaths.filter((assetPath) => !existsSync(new URL(`../${assetPath}`, import.meta.url)));

  assert.ok(assetPaths.length >= 87, "Expected custom OPEN sound declarations for the bingo characters");
  assert.deepEqual(missing, [], `Missing custom OPEN sound assets: ${missing.join(", ")}`);
});

test("online victory stats are finalized before the asynchronous victory presentation", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const winnerBranch = html.match(/if \(becameWinner\) \{([\s\S]*?)enqueueEffect\(\(\) => finishGame/);

  assert.ok(winnerBranch, "Winner branch was not found");
  assert.match(winnerBranch[1], /recordVictory\(team, victoryKind, preparedMvp\.name\)/);
  assert.match(html, /function finishGame[\s\S]*?if \(!state\.matchStatsFinalized\) \{[\s\S]*?recordVictory/);
});

test("match history includes board replay controls and timeline recording", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /id="statsMatchList"/);
  assert.match(html, /id="matchReplayModal"/);
  assert.match(html, /function recordReplayStep\(/);
  assert.match(html, /function renderReplayBoard\(/);
});

test("random events are setup-controlled and included in online game snapshots", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /id="randomEventButton"/);
  assert.match(html, /function maybeTriggerRandomEvent\(/);
  assert.match(html, /randomEventMilestones: cloneOnlineValue\(state\.randomEventMilestones\)/);
  assert.match(html, /event\.effects\.push\("random-event"\)/);
});

test("season standings and automatic backup recovery are wired into stats", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /id="statsSeasonList"/);
  assert.match(html, /id="statsTournamentList"/);
  assert.match(html, /function calculateSeasonStandings\(/);
  assert.match(html, /function createAutoBackup\(/);
  assert.match(html, /function restoreAutoBackup\(/);
});

test("generated asset manifest covers every declared image and audio file", () => {
  const manifest = JSON.parse(readFileSync(new URL("../assets/asset-manifest.json", import.meta.url), "utf8"));
  const missing = manifest.assets.filter((asset) => !existsSync(new URL(`../${asset.path}`, import.meta.url)));

  assert.equal(manifest.totals.all, manifest.assets.length);
  assert.equal(manifest.totals.images + manifest.totals.audio, manifest.totals.all);
  assert.ok(manifest.totals.images > 100);
  assert.ok(manifest.totals.audio > 100);
  assert.deepEqual(missing, []);
});
