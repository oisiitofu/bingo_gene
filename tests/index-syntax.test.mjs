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

test("monster evolution has eight childhood entries, rank six fusions, passives, artwork, and online sync", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const monsterSource = readFileSync(new URL("../monster-system.js", import.meta.url), "utf8");
  const browserGlobal = {};
  new Function("window", monsterSource)(browserGlobal);
  const result = browserGlobal.TeamBingoMonsterSystem;

  assert.equal(result.STAGES.length, 7, "Egg plus six evolution stages are required");
  assert.equal(result.LINEAGES.length, 32, "Expected thirty-two mature lineages");
  assert.equal(result.LEGENDARY_IDS.length, 4, "Expected four legendary monsters");
  assert.equal(result.LEGENDARY_CHANCE, .01, "Legendary evolution must remain a one-percent event");
  assert.equal(Object.keys(result.NODES).length, 285, "Expected thirty-two rank-six fusion monsters");
  assert.deepEqual(
    result.STAGES.map((_, stage) => Object.values(result.NODES).filter((node) => node.stage === stage).length),
    [1, 8, 16, 32, 64, 132, 32]
  );
  Object.values(result.NODES).filter((node) => node.stage === 2).forEach((node) => {
    assert.match(node.sprite.size, /^400% (?:100|200)%$/, `${node.id} must use a four-column growth sheet`);
    assert.ok(node.sprite.aspect > 0, `${node.id} must preserve its source cell aspect ratio`);
  });
  Object.values(result.NODES).forEach((node) => {
    const expectedBranches = node.stage === 0 ? 8 : (node.stage < 5 ? 2 : (node.stage === 5 && !node.legendary ? 1 : 0));
    assert.equal(node.next.length, expectedBranches, `${node.id} has an invalid branch count`);
    node.next.forEach((nextId) => assert.ok(result.NODES[nextId], `${node.id} points to missing ${nextId}`));
    const stats = result.combatStats(node.id);
    ["hp", "attack", "defense", "magic", "magicDefense", "speed"].forEach((key) => {
      assert.ok(stats[key] > 0, `${node.id} has an invalid ${key}`);
    });
    assert.match(stats.attackType, /^(physical|magic)$/);
    assert.match(stats.element, /^(fire|water|lightning|ice|earth|wind|light|dark)$/);
    assert.match(stats.role, /^(guardian|striker|mystic|speedster|support)$/);
    assert.ok(stats.special.length > 0, `${node.id} is missing a special move`);
    const passive = result.passiveSkill(node.id);
    assert.ok(passive.name.length > 0, `${node.id} is missing a passive skill`);
    assert.ok(passive.description.length > 0, `${node.id} is missing a passive description`);
    assert.doesNotMatch(node.name, /[A-Za-z]/, `${node.id} must use a Japanese display name`);
    assert.doesNotMatch(stats.special, /[A-Za-z]/, `${node.id} must use a Japanese special move`);
  });

  const party = result.syncPlayerMonsters([], ["PLAYER A", "PLAYER B"], "red");
  const firstEvolution = result.evolvePlayerMonster(party[0], "red:3", () => 0);
  const duplicateOpen = result.evolvePlayerMonster(firstEvolution.monster, "red:3", () => 0);
  assert.equal(firstEvolution.monster.stage, 1, "A personal OPEN must evolve that player's egg");
  assert.equal(duplicateOpen.monster.stage, 1, "The same player and cell must not evolve twice");
  assert.equal(party[1].stage, 0, "A teammate's monster must remain independent");

  const doubleParty = result.syncPlayerMonsters([], ["PLAYER A", "PLAYER B"], "red", 2);
  assert.equal(doubleParty.length, 4, "Double Monster Mode must create two eggs for every player");
  assert.deepEqual(doubleParty.map((monster) => monster.slot), [0, 1, 0, 1]);
  assert.equal(new Set(doubleParty.map((monster) => result.monsterKey(monster.playerName, monster.slot))).size, 4);

  let balancedParty = result.syncPlayerMonsters([], ["A", "B", "C", "D", "E", "F", "G", "H"], "red");
  balancedParty.forEach((monster, index) => {
    balancedParty[index] = result.evolvePlayerMonster(
      monster,
      `red:${index}`,
      result.distributedEvolutionRandom(monster, balancedParty, () => .12)
    ).monster;
  });
  assert.deepEqual(
    Object.values(Object.groupBy(balancedParty, (monster) => monster.nodeId)).map((group) => group.length).sort(),
    [1, 1, 1, 1, 1, 1, 1, 1],
    "The first branch should distribute eight players across all childhood entries"
  );
  balancedParty.forEach((monster, index) => {
    balancedParty[index] = result.evolvePlayerMonster(
      monster,
      `red:${index + 10}`,
      result.distributedEvolutionRandom(monster, balancedParty, () => .12)
    ).monster;
  });
  assert.equal(new Set(balancedParty.map((monster) => monster.nodeId)).size, 8, "Eight players should retain distinct growth branches");

  const perfect = result.createPlayerMonster("LEGEND TEST", "red");
  perfect.nodeId = "inferno-perfect-a";
  perfect.stage = 4;
  const values = [0, 0, 0];
  const legendary = result.evolvePlayerMonster(perfect, "red:legend", () => values.shift() ?? 0);
  assert.equal(legendary.monster.nodeId, "legend-sun", "A successful legendary roll must replace the ordinary ultimate branch");
  assert.equal(result.specialChanceForHype(0), .06);
  assert.equal(result.specialChanceForHype(100), .48);
  assert.ok(result.specialChanceForHype(80) > result.specialChanceForHype(20));
  assert.equal(result.elementMultiplier("fire", "ice"), 1.1);
  assert.equal(result.elementMultiplier("fire", "water"), 1 / 1.1);
  assert.equal(result.elementMultiplier("fire", "fire"), 1);
  assert.equal(result.combatElement("inferno-mature").name, "炎");
  assert.equal(result.combatRole("mecha-mature").id, "guardian");
  assert.equal(result.statusForElement("lightning").id, "shock");
  assert.match(result.linkTechnique("inferno-mature", "sky-mature").name, /爆嵐/);
  assert.equal(result.masteryLevel(0), 1);
  assert.ok(result.masteryLevel(600) > result.masteryLevel(100));
  const masteryStats = result.applyMasteryStats({ hp: 100, attack: 20, defense: 18, magic: 22, magicDefense: 19, speed: 17 }, 0);
  assert.equal(masteryStats.masteryLevel, 1);
  assert.deepEqual(
    [masteryStats.hp, masteryStats.attack, masteryStats.defense, masteryStats.magic, masteryStats.magicDefense, masteryStats.speed],
    [101, 21, 19, 23, 20, 18],
    "Every bond level must add one point to every combat stat"
  );
  const inheritedMastery = result.masteryExperienceDistribution(
    ["egg", "child-brave", "growth-flare", "inferno-mature"],
    "inferno-perfect-a",
    100
  );
  assert.equal(inheritedMastery.at(-1).experience, 100);
  assert.ok(inheritedMastery[0].experience > 0 && inheritedMastery[0].experience < inheritedMastery[1].experience);
  assert.equal(result.NODES["child-scroll"].sprite.facing, "left");
  assert.equal(result.NODES["growth-gear"].sprite.facing, "left");
  assert.equal(result.NODES["samurai-mature"].sprite.facing, "left");
  assert.equal(result.NODES["inferno-mature"].sprite.facing, "left");
  assert.equal(result.NODES["abyss-rank6"].sprite.facing, "right");
  assert.equal(result.NODES["fossil-rank6"].sprite.facing, "left");
  assert.equal(result.NODES["inferno-rank6"].sprite.facing, "left");

  const ultimate = result.createPlayerMonster("RANK6 TEST", "red");
  ultimate.nodeId = "inferno-ultimate-0";
  ultimate.stage = 5;
  const lockedRank6 = result.evolvePlayerMonster(ultimate, "red:rank6-locked", () => 0, { "inferno-ultimate-0": 1 });
  assert.equal(lockedRank6.evolved, false, "Rank six must remain locked until all four required monsters are registered");
  assert.equal(lockedRank6.rank6Locked, true);
  const rank6Dex = Object.fromEntries([0, 1, 2, 3].map((index) => [`inferno-ultimate-${index}`, 1]));
  const unlockedRank6 = result.evolvePlayerMonster(ultimate, "red:rank6-open", () => 0, rank6Dex);
  assert.equal(unlockedRank6.monster.nodeId, "inferno-rank6");
  assert.equal(unlockedRank6.monster.stage, 6);
  assert.equal(result.rank6Requirements("inferno-ultimate-0").length, 4);

  const monsterAssets = [
    "egg.png", "childhood.png", "growth.png", "lineage-inferno.png", "lineage-thunder.png",
    "lineage-mecha.png", "lineage-beetle.png", "lineage-grove.png", "lineage-spore.png",
    "lineage-abyss.png", "lineage-cosmic.png", "childhood-extra.png", "growth-extra.png",
    "lineage-glacier.png", "lineage-crystal.png", "lineage-sky.png", "lineage-tempest.png",
    "lineage-shadow.png", "lineage-spirit.png", "lineage-candy.png", "lineage-junk.png",
    "childhood-new.png", "growth-new-a.png", "growth-new-b.png", "growth-v2.png", "growth-extra-v2.png",
    "lineage-coral.png", "lineage-corsair.png", "lineage-dune.png", "lineage-fossil.png",
    "lineage-samurai.png", "lineage-dojo.png", "lineage-sonic.png", "lineage-festival.png",
    "lineage-bloom.png", "lineage-dream.png", "lineage-slime.png", "lineage-gourmet.png",
    "lineage-ink.png", "lineage-ninja.png", "lineage-rail.png", "lineage-ryu.png",
    "legendary.png", "legendary-new.png", "rank6-a.png", "rank6-b.png", "rank6-a-v2.png", "rank6-b-v2.png"
  ];
  monsterAssets.forEach((file) => {
    assert.ok(existsSync(new URL(`../images/monsters/${file}`, import.meta.url)), `Missing monster artwork: ${file}`);
  });
  assert.match(html, /monsters: cloneOnlineValue\(MONSTER_SYSTEM\.syncPlayerMonsters/);
  assert.match(html, /monsterBattleMode: state\.monsterBattleMode/);
  assert.match(html, /doubleMonsterMode: state\.doubleMonsterMode/);
  assert.match(html, /id="doubleMonsterModeButton"/);
  assert.doesNotMatch(html, /Object\.groupBy\(/, "Online double evolutions must work in older Chromium builds");
  assert.match(html, /type === "monster-battle-start"/);
  assert.match(html, /effects\.has\("monster-battle-start"\)/);
  assert.match(html, /kind: "monster-speech"/);
  assert.ok(existsSync(new URL("../images/monster-battle/arena.png", import.meta.url)));
  assert.ok(existsSync(new URL("../monster-battle.css", import.meta.url)));
  assert.match(html, /audio\/monster-battle\/boss-bgm\/bgm\.wav/);
  assert.match(html, /audio\/monster-battle\/boss-bgm\/bgm\.mp3/);
  assert.match(html, /BOSS_BATTLE_BGM_CANDIDATES = \[\s*"audio\/monster-battle\/boss-bgm\/bgm\.mp3"/);
  assert.match(html, /grid-auto-rows: 142px/);
  assert.match(html, /contain: layout paint/);
  assert.match(html, /\.monster-dex-art \.monster-sprite[\s\S]*aspect-ratio: var\(--monster-aspect, 1\)/);
  assert.match(html, /id="monsterBattleEntrance"/);
  assert.match(html, /function showMonsterBattleEntrances\(/);
  assert.match(html, /remotePresentation: true/);
  assert.match(html, /state\.monsterBattle\?\.status/);
  assert.match(html, /id="statsMonsterDexGrid"/);
  assert.match(html, /id="monsterDexModal"/);
  assert.match(html, /id="statsMonsterDexTree"/);
  assert.match(html, /id="statsMonsterMasteryPage"/);
  assert.match(html, /id="dexMasteryViewButton"/);
  assert.match(html, /function renderMonsterMasteryPage\(/);
  assert.match(html, /function renderMonsterDexTree\(/);
  assert.match(html, /id="dexOverviewButton"[\s\S]*>全体表示<\/button>/);
  assert.match(html, /id="dexTreeViewButton">進化経路<\/button>/);
  assert.match(html, /function fitMonsterDexTreeOverview\(/);
  assert.match(html, /\.monster-dex-grid\.overview[\s\S]*repeat\(23/);
  assert.match(html, /\.monster-dex-grid\.overview[\s\S]*grid-auto-rows: 43px/);
  assert.match(html, /\.monster-dex-tree\.overview \.monster-tree-forest[\s\S]*repeat\(3, max-content\)/);
  assert.match(html, /\.monster-dex-grid\[hidden\][\s\S]*display: none !important/);
  assert.match(html, /data-monster-facing=/);
  assert.match(readFileSync(new URL("../monster-battle.css", import.meta.url), "utf8"), /data-monster-facing="right"/);
  assert.match(html, /function spriteSheetSizeWithBleedGuard\(/);
  assert.match(html, /value \* 1\.001/);
  assert.match(html, /const renderMarkupCache =/);
  assert.match(html, /function onCellImageError\(/);
  assert.match(html, /TOFU_CELL_THUMBNAIL_SIZE = 224/);
  assert.match(html, /function prepareTofuCellThumbnail\(/);
  assert.match(html, /CUSTOM_OPEN_SOUND_BUFFER_LIMIT = 24/);
  assert.doesNotMatch(html, /function unlockAudio\(\) \{\s*Object\.keys\(AUDIO\)/);
  assert.doesNotMatch(html, /function unlockOpenSoundAudio\(\) \{[\s\S]{0,260}primeCustomOpenSoundBuffers\(\)/);
  assert.match(html, /customOpenSoundBufferCache\.size > CUSTOM_OPEN_SOUND_BUFFER_LIMIT/);
  assert.match(html, /function releaseInactiveTofuCellThumbnails\(/);
  assert.doesNotMatch(html, /<img src="\$\{activeCellImage\}"[^>]+onerror=/);
  assert.match(html, /function renderMonsterDex\(/);
  assert.match(html, /monsterRankLabel\(node\)/);
  assert.match(html, /function waitForTimedPresentation\(/);
  assert.match(html, /kind: "monster-speech-deferred"/);
  assert.match(html, /id="teamSelectModal"/);
  assert.match(html, /class="btn simple-ui-btn team-select-shuffle" id="teamSelectShuffleButton"/);
  assert.match(html, /class="btn simple-ui-btn" id="teamSelectCancelButton"/);
  assert.match(html, /\.monster-tree-branch li[\s\S]*align-items: center/);
  assert.doesNotMatch(html, /id="setupShuffleButton"/);
  assert.doesNotMatch(html, /id="playShuffleButton"/);
  assert.match(html, /specialChanceForHype\(attacker\.hype\)/);
  assert.match(html, /function showMonsterSpecialCutin\(/);
  assert.match(html, /function createMonsterImpactEffect\(/);
  assert.match(html, /function tryApplyMonsterStatus\(/);
  assert.match(html, /function showMonsterLinkCutin\(/);
  assert.match(html, /function animateMonsterRevival\(/);
  assert.match(html, /function showMonsterFinishPrelude\(/);
  assert.match(html, /function recordMonsterBattleOutcome\(/);
  assert.match(html, /id="monsterBattleTimeline"/);
  assert.match(html, /id="monsterBattleMatchup"/);
  assert.match(html, /monsterMastery/);
  assert.match(html, /固有スキル/);
  assert.match(html, /getPlayerStat\(playerName\)\.monsterDex/);
  assert.match(html, /node\.id\.endsWith\("-ultimate-0"\)/);
  assert.match(html, /monster-dex-card[^`]+node\.rank6/);
  const battleCss = readFileSync(new URL("../monster-battle.css", import.meta.url), "utf8");
  assert.match(battleCss, /effects\/elemental-v2\.png/);
  assert.match(battleCss, /effects\/physical-v2\.png/);
  assert.match(battleCss, /effects\/special-cutin\.png/);
  assert.match(battleCss, /\.monster-link-cutin/);
  assert.match(battleCss, /\.monster-revive-burst/);
  assert.match(battleCss, /\.monster-battle-finish/);
  assert.match(html, /id="adminMonsterBattleModal"/);
  assert.match(html, /function showAdminMonsterDex\(/);
  assert.match(html, /function openAdminMonsterBattleLab\(/);
  assert.match(html, /function createAdminMonsterBattleFighters\(/);
  assert.match(html, /runMonsterBattle\(seed, \{ adminBattle: true/);
  assert.match(html, /openAdminMonsterDex: showAdminMonsterDex/);
  const onlineRoomSource = readFileSync(new URL("../online/online-room.js", import.meta.url), "utf8");
  assert.match(onlineRoomSource, /id="onlineAdminMonsterDex"/);
  assert.match(onlineRoomSource, /id="onlineAdminMonsterBattle"/);
  ["elemental.png", "physical.png", "elemental-v2.png", "physical-v2.png", "special-cutin.png"].forEach((file) => {
    assert.ok(existsSync(new URL(`../images/monster-battle/effects/${file}`, import.meta.url)), `Missing battle effect artwork: ${file}`);
  });
});

test("monster battle audio is dedicated stereo material", () => {
  const bossCandidates = ["boss-bgm/bgm.mp3", "boss-bgm/bgm.wav"];
  const bossFile = bossCandidates.find((file) => existsSync(new URL(`../audio/monster-battle/${file}`, import.meta.url)));
  assert.ok(bossFile, "A replaceable boss battle BGM is required");
  const bossAudio = readFileSync(new URL(`../audio/monster-battle/${bossFile}`, import.meta.url));
  assert.ok(bossAudio.length > 500_000, "Boss battle BGM is unexpectedly small");
  assert.ok(
    bossAudio.toString("ascii", 0, 3) === "ID3" || bossAudio.toString("ascii", 0, 4) === "RIFF" || (bossAudio[0] === 0xff && (bossAudio[1] & 0xe0) === 0xe0),
    "Boss battle BGM must be MP3 or WAV"
  );
  const files = ["physical-hit.wav", "magic-hit.wav", "special-hit.wav"];
  files.forEach((file) => {
    const wave = readFileSync(new URL(`../audio/monster-battle/${file}`, import.meta.url));
    assert.equal(wave.toString("ascii", 0, 4), "RIFF");
    assert.equal(wave.toString("ascii", 8, 12), "WAVE");
    assert.equal(wave.readUInt16LE(22), 2, `${file} must be stereo`);
    assert.equal(wave.readUInt32LE(24), 48000, `${file} must be 48 kHz`);
    assert.ok(wave.length > 150_000, `${file} is unexpectedly small`);
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
