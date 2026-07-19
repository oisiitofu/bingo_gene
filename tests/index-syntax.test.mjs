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

test("every random event has dedicated artwork and valid stereo audio", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const eventIds = ["gold-rush", "second-wind", "spotlight", "pressure-drop"];

  eventIds.forEach((eventId) => {
    const imagePath = `images/random-events/${eventId}.png`;
    const audioPath = `audio/random-events/${eventId}.wav`;
    const imageUrl = new URL(`../${imagePath}`, import.meta.url);
    const audioUrl = new URL(`../${audioPath}`, import.meta.url);
    const wave = readFileSync(audioUrl);

    assert.match(html, new RegExp(imagePath.replaceAll("/", "\\/")));
    assert.match(html, new RegExp(audioPath.replaceAll("/", "\\/")));
    assert.ok(existsSync(imageUrl), `Missing random-event artwork: ${imagePath}`);
    assert.ok(wave.length > 500000, `Random-event audio is unexpectedly small: ${audioPath}`);
    assert.equal(wave.toString("ascii", 0, 4), "RIFF");
    assert.equal(wave.toString("ascii", 8, 12), "WAVE");
    assert.equal(wave.readUInt16LE(22), 2, `${audioPath} must be stereo`);
    assert.equal(wave.readUInt32LE(24), 48000, `${audioPath} must be 48 kHz`);
  });

  assert.match(html, /playAudioUrl\(asset\.audio, "eventSe"/);
  assert.match(html, /effects\.has\("random-event"\)[\s\S]*showRandomEvent\(payload\.randomEvent\)/);
});

test("monster evolution has a complete binary tree, artwork, and online sync", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const monsterSource = readFileSync(new URL("../monster-system.js", import.meta.url), "utf8");
  const browserGlobal = {};
  new Function("window", monsterSource)(browserGlobal);
  const result = browserGlobal.TeamBingoMonsterSystem;

  assert.equal(result.STAGES.length, 6, "Egg plus five evolution stages are required");
  assert.equal(result.LINEAGES.length, 8, "Expected eight mature lineages");
  assert.equal(Object.keys(result.NODES).length, 63, "Expected a complete 1 + 2 + 4 + 8 + 16 + 32 tree");
  assert.deepEqual(
    result.STAGES.map((_, stage) => Object.values(result.NODES).filter((node) => node.stage === stage).length),
    [1, 2, 4, 8, 16, 32]
  );
  Object.values(result.NODES).forEach((node) => {
    assert.equal(node.next.length, node.stage < 5 ? 2 : 0, `${node.id} has an invalid branch count`);
    node.next.forEach((nextId) => assert.ok(result.NODES[nextId], `${node.id} points to missing ${nextId}`));
    const stats = result.combatStats(node.id);
    ["hp", "attack", "defense", "magic", "magicDefense", "speed"].forEach((key) => {
      assert.ok(stats[key] > 0, `${node.id} has an invalid ${key}`);
    });
    assert.match(stats.attackType, /^(physical|magic)$/);
    assert.ok(stats.special.length > 0, `${node.id} is missing a special move`);
    assert.doesNotMatch(node.name, /[A-Za-z]/, `${node.id} must use a Japanese display name`);
    assert.doesNotMatch(stats.special, /[A-Za-z]/, `${node.id} must use a Japanese special move`);
  });

  const party = result.syncPlayerMonsters([], ["PLAYER A", "PLAYER B"], "red");
  const firstEvolution = result.evolvePlayerMonster(party[0], "red:3", () => 0);
  const duplicateOpen = result.evolvePlayerMonster(firstEvolution.monster, "red:3", () => 0);
  assert.equal(firstEvolution.monster.stage, 1, "A personal OPEN must evolve that player's egg");
  assert.equal(duplicateOpen.monster.stage, 1, "The same player and cell must not evolve twice");
  assert.equal(party[1].stage, 0, "A teammate's monster must remain independent");

  let balancedParty = result.syncPlayerMonsters([], ["A", "B", "C", "D"], "red");
  balancedParty.forEach((monster, index) => {
    balancedParty[index] = result.evolvePlayerMonster(
      monster,
      `red:${index}`,
      result.distributedEvolutionRandom(monster, balancedParty, () => .12)
    ).monster;
  });
  assert.deepEqual(
    Object.values(Object.groupBy(balancedParty, (monster) => monster.nodeId)).map((group) => group.length).sort(),
    [2, 2],
    "The first branch should distribute four players evenly"
  );
  balancedParty.forEach((monster, index) => {
    balancedParty[index] = result.evolvePlayerMonster(
      monster,
      `red:${index + 10}`,
      result.distributedEvolutionRandom(monster, balancedParty, () => .12)
    ).monster;
  });
  assert.equal(new Set(balancedParty.map((monster) => monster.nodeId)).size, 4, "Four players should reach distinct growth branches");

  const monsterAssets = [
    "egg.png", "childhood.png", "growth.png", "lineage-inferno.png", "lineage-thunder.png",
    "lineage-mecha.png", "lineage-beetle.png", "lineage-grove.png", "lineage-spore.png",
    "lineage-abyss.png", "lineage-cosmic.png"
  ];
  monsterAssets.forEach((file) => {
    assert.ok(existsSync(new URL(`../images/monsters/${file}`, import.meta.url)), `Missing monster artwork: ${file}`);
  });
  assert.match(html, /monsters: cloneOnlineValue\(MONSTER_SYSTEM\.syncPlayerMonsters/);
  assert.match(html, /monsterBattleMode: state\.monsterBattleMode/);
  assert.match(html, /type === "monster-battle-start"/);
  assert.match(html, /effects\.has\("monster-battle-start"\)/);
  assert.match(html, /kind: "monster-speech"/);
  assert.ok(existsSync(new URL("../images/monster-battle/arena.png", import.meta.url)));
  assert.ok(existsSync(new URL("../monster-battle.css", import.meta.url)));
  assert.match(html, /audio\/monster-battle\/battle-bgm\.wav/);
  assert.match(html, /state\.monsterBattle\?\.status/);
});

test("monster battle audio is dedicated stereo material", () => {
  const files = ["battle-bgm.wav", "physical-hit.wav", "magic-hit.wav", "special-hit.wav"];
  files.forEach((file) => {
    const wave = readFileSync(new URL(`../audio/monster-battle/${file}`, import.meta.url));
    assert.equal(wave.toString("ascii", 0, 4), "RIFF");
    assert.equal(wave.toString("ascii", 8, 12), "WAVE");
    assert.equal(wave.readUInt16LE(22), 2, `${file} must be stereo`);
    assert.equal(wave.readUInt32LE(24), 48000, `${file} must be 48 kHz`);
    assert.ok(wave.length > (file === "battle-bgm.wav" ? 5_000_000 : 150_000), `${file} is unexpectedly small`);
  });
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
