import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

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

test("online lobby boot bypasses stale browser modules and retries once", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const serviceWorker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

  assert.match(html, /online-room\.js\?v=20260801-hatch-sync-1/);
  assert.match(html, /retry=\$\{Date\.now\(\)\}/);
  assert.match(serviceWorker, /20260801-hatch-sync-86/);
});

test("consecutive skills cancel stale audio and setup snapshots clear persistent effects", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /let pendingSkillBgmStartTimer = 0/);
  assert.match(html, /let skillAudioGeneration = 0/);
  assert.match(html, /function cancelPendingSkillAudioStart\(\)/);
  assert.match(html, /if \(audioGeneration !== skillAudioGeneration\) return/);
  assert.match(html, /const MAX_TRANSIENT_AUDIO = 12/);
  assert.match(html, /releaseTransientAudio\(audio, \{ unload: true \}\)/);
  assert.match(html, /const hasActiveMatch = state\.gameStarted && !state\.winner/);
  assert.match(html, /state\.skillEffects = hasActiveMatch[\s\S]*?createSkillEffects\(\)/);
  assert.match(html, /if \(!state\.gameStarted\) \{[\s\S]*?stopAllTransientAudio\(\{ keepSetupTheme: true \}\)/);
  assert.match(html, /function startKentoLiveChat\(team\) \{[\s\S]*?if \(!state\.gameStarted \|\| state\.winner\) return/);
  assert.doesNotMatch(html, /\.cell:not\(\.free\):not\(\.open\)[\s\S]{0,800}url\("skill-assets\/Kento\/aura\.png"\)/);
});

test("bingo cells are operated only through player-name buttons", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /class="opener-row"/);
  assert.doesNotMatch(html, /<span class="opener-label">OPENER/);
  assert.doesNotMatch(html, /role="button"[^>]+data-testid="bingo-cell-/);
  assert.match(html, /function canUseOnlinePlayerChoice\(team, memberName\)/);
  assert.match(html, /selected\.length === 1 && selected\[0\] === playerStatsKey\(member\)/);
});

test("六王領土戦のクライアント、Worker、Firebaseルールが公開構成へ接続されている", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const serviceWorker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const territorySystem = readFileSync(new URL("../territory-system.js", import.meta.url), "utf8");
  const territoryEquipment = readFileSync(new URL("../territory-equipment.js", import.meta.url), "utf8");
  const territoryMap3D = readFileSync(new URL("../territory-map-3d.js", import.meta.url), "utf8");
  const territoryMode = readFileSync(new URL("../territory-mode.js", import.meta.url), "utf8");
  const rules = JSON.parse(readFileSync(new URL("../firebase-database.rules.json", import.meta.url), "utf8"));
  const worker = readFileSync(new URL("../worker/territory-worker.mjs", import.meta.url), "utf8");

  assert.match(html, /id="territoryModeButton">六王領土戦</);
  assert.match(html, /id="setupMonsterButton">MONSTER</);
  assert.match(html, /id="playTerritoryModeButton">/);
  assert.match(html, /function openTerritoryWindow\(\)/);
  assert.match(html, /searchParams\.set\("territory", "1"\)/);
  assert.match(html, /src="territory-system\.js"/);
  assert.match(html, /src="territory-equipment\.js"/);
  assert.match(html, /src="vendor\/three\/three\.min\.js"/);
  assert.match(html, /src="territory-map-3d\.js"/);
  assert.match(html, /src="territory-mode\.js"/);
  assert.match(html, /href="territory-mode\.css"/);
  assert.match(html, /href="monster-page\.css"/);
  assert.match(serviceWorker, /\.\/territory-system\.js/);
  assert.match(serviceWorker, /\.\/territory-equipment\.js/);
  assert.match(serviceWorker, /\.\/monster-page\.css/);
  assert.match(serviceWorker, /\.\/territory-map-3d\.js/);
  assert.match(serviceWorker, /\.\/vendor\/three\/three\.min\.js/);
  assert.match(serviceWorker, /\.\/territory-mode\.js/);
  assert.equal(
    rules.rules.teamBingoV1.frontier.current[".write"].includes("adminSessions"),
    true
  );
  assert.match(rules.rules.teamBingoV1.frontier.current[".validate"], /version'\)\.val\(\) === 4/);
  assert.match(territorySystem, /const DEFAULT_HYPE = 20/);
  assert.match(territorySystem, /const PARTY_SIZE = 3/);
  assert.match(territorySystem, /TILE_EVENTS/);
  assert.match(territorySystem, /equipmentAssignments/);
  assert.match(territoryMode, /TERRITORY PARTY/);
  assert.match(territoryMode, /MONSTER \/ ITEMS/);
  assert.match(territoryMode, /SEASON HISTORY/);
  assert.match(territoryMode, /FINAL STANDINGS/);
  assert.match(territoryMode, /SEASON EQUIPMENT REWARDS/);
  assert.match(territoryMode, /rewardCountForSeason/);
  assert.match(worker, /seasonEquipmentRewards/);
  assert.match(territoryMode, /BATTLE ARCHIVE/);
  assert.match(html, /applyTerritoryPreviousSnapshot/);
  assert.match(territoryMode, /SEASON \$\{formatDate\(season\.startsAt\)\}/);
  assert.doesNotMatch(territoryMode, /SEASON \$\{season\.id\} \//);
  assert.match(territoryEquipment, /const RARITIES/);
  assert.match(territoryEquipment, /chance: \.001/);
  assert.match(territoryEquipment, /const ITEMS_PER_RARITY = 200/);
  assert.match(territoryEquipment, /function setManualItem/);
  assert.match(territoryEquipment, /function autoAssign/);
  assert.match(territoryMode, /TeamBingoTerritoryMap3D/);
  assert.match(territoryMap3D, /new THREE\.WebGLRenderer/);
  assert.match(territoryMap3D, /addFortress/);
  assert.match(territoryMap3D, /addTerrainObjects/);
  assert.match(territoryMap3D, /addPlainLandDetails/);
  assert.match(territoryMap3D, /addFortressOutskirts/);
  assert.match(territoryMap3D, /new THREE\.InstancedMesh/);
  assert.match(territoryMap3D, /createTerritoryBoundary/);
  assert.match(territoryMap3D, /createSelectionAura/);
  assert.match(territoryMap3D, /selectionAura/);
  assert.match(territoryMap3D, /toneMappingExposure = 1\.62/);
  assert.match(territoryMap3D, /shadow\.mapSize\.set\(2048, 2048\)/);
  assert.match(territoryMap3D, /addVillage3D/);
  assert.match(territoryMap3D, /addForest3D/);
  assert.match(territoryMap3D, /addMountainRange3D/);
  assert.match(territoryMap3D, /addVolcano3D/);
  assert.match(territoryMap3D, /addStormSpire3D/);
  assert.match(territoryMap3D, /addLightSanctuary3D/);
  assert.match(territoryMap3D, /NEUTRAL_SURFACE_COLOR = 0x080a0e/);
  assert.doesNotMatch(territoryMap3D, /"landmark-presence"/);
  assert.match(territoryMap3D, /tile\.terrain === "earth"\) \{\s*addPlainLandDetails/);
  assert.doesNotMatch(territoryMap3D, /LANDMARK_ASSETS|THREE\.Sprite/);
  assert.doesNotMatch(territoryMap3D, /addEventBeacon/);
  assert.ok(existsSync(new URL("../vendor/three/three.min.js", import.meta.url)));
  assert.ok(existsSync(new URL("../images/territory/strategy-map-backdrop-v2.png", import.meta.url)));
  assert.doesNotMatch(serviceWorker, /images\/territory\/realistic/);
  [
    "stone-wall.png",
    "roof-tiles.png",
    "aged-wood.png",
    "terrain-ground-v2.png",
    "volcanic-basalt-v2.png",
    "molten-lava-v2.png",
    "evergreen-foliage-v2.png",
    "ancient-stone-v2.png"
  ].forEach((asset) => {
    assert.ok(existsSync(new URL(`../images/territory/textures/${asset}`, import.meta.url)));
    assert.match(serviceWorker, new RegExp(`textures\\/${asset.replace(".", "\\.")}`));
  });
  assert.match(territoryMode, /territory-hype-track/);
  assert.match(territoryMode, /data-territory-monster/);
  assert.match(territoryMode, /showMonsterDetail/);
  assert.match(html, /showMonsterDetail: showMonsterNodeZoom/);
  assert.match(html, /熟練度 \/ 絆 Lv\./);
  assert.match(worker, /crons|advanceFrontier|If-Match|if-match/i);
});

test("勝利画面の装備報酬は獲得アイテムと効果を開ける", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /id="victoryEquipmentRewardModal"/);
  assert.match(html, /data-victory-equipment-reward=/);
  assert.match(html, /function showVictoryEquipmentRewards\(playerKey\)/);
  assert.match(html, /equipmentItemMarkup\(item, count\)/);
  assert.match(html, /装備効果は六王領土戦で反映されます/);
});

test("世界大会は独立部屋、全組み合わせ、通常戦績加算へ接続されている", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const tournament = readFileSync(new URL("../world-tournament.js", import.meta.url), "utf8");
  const online = readFileSync(new URL("../online/online-room.js", import.meta.url), "utf8");
  const rules = JSON.parse(readFileSync(new URL("../firebase-database.rules.json", import.meta.url), "utf8"));
  const serviceWorker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

  assert.match(html, /id="worldTournamentButton">世界大会</);
  assert.match(html, /src="world-tournament\.js"/);
  assert.match(html, /href="world-tournament\.css"/);
  assert.match(html, /function recordWorldTournamentMatch\(/);
  assert.match(html, /recordWorldTournamentMatch\(winnerTeam, victoryKind, mvpName\)/);
  assert.match(html, /lockedTeams: true/);
  assert.match(tournament, /teamBingo\.worldTournamentRooms\.v1/);
  assert.match(tournament, /function generateMatchups\(/);
  assert.match(tournament, /function randomizeMatchups\(/);
  assert.match(tournament, /data-world-shuffle/);
  assert.match(tournament, /function canShuffleRoom\(/);
  assert.match(tournament, /function aggregateAllTimeStats\(/);
  assert.match(tournament, /data-world-all-stats/);
  assert.match(tournament, /SHARED \/ PERSISTENT/);
  assert.match(tournament, /function roomCsv\(/);
  assert.match(html, /repository: onlineCoordinator/);
  assert.match(online, /mergeWorldTournamentRooms/);
  assert.match(online, /subscribeWorldTournamentRooms/);
  assert.equal(rules.rules.teamBingoV1.worldTournaments.rooms[".write"], "auth != null");
  assert.match(serviceWorker, /\.\/world-tournament\.js/);
  assert.match(serviceWorker, /\.\/world-tournament\.css/);
});

test("おいしいとうふモードは静的軽量画像だけを使い継続再描画しない", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const sourceDirectory = new URL("../skill-assets/おいしいとうふ/cell-skins/", import.meta.url);
  const numericSkins = readdirSync(sourceDirectory)
    .filter((name) => /^\d+\.png$/.test(name));

  assert.match(html, /function tofuCellThumbnailPath\(/);
  assert.match(html, /TOFU_CELL_THUMBNAIL_FOLDER.*thumbs/);
  assert.match(html, /TOFU_AVAILABLE_CELL_SKIN_IDS/);
  assert.match(html, /\.webp/);
  assert.doesNotMatch(html, /createImageBitmap|toBlob\(|tofuCellThumbnailUrls|copyrightGoldPulse/);
  assert.ok(numericSkins.length > 0);
  numericSkins.forEach((name) => {
    assert.ok(existsSync(new URL(`thumbs/${name.replace(/\.png$/, ".webp")}`, sourceDirectory)));
  });
});

test("モンスターバトル勝者へ一人一個の装備報酬を付与する", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /function recordMonsterBattleOutcome\(/);
  assert.match(html, /if \(won && TERRITORY_EQUIPMENT\)/);
  assert.match(html, /monster-battle:\$\{state\.monsterBattle\?\.seed/);
  assert.match(html, /TERRITORY_EQUIPMENT\.applyRewards\(stat, rewards\)/);
  assert.doesNotMatch(html, /勝利メンバー 装備 \+1/);
});

test("monster battles use pose artwork while attacks are active", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../monster-battle.css", import.meta.url), "utf8");
  const monsterSystem = readFileSync(new URL("../monster-system.js", import.meta.url), "utf8");

  assert.match(html, /class="battle-fighter-art\$\{attackMarkup \? " has-pose-animation"/);
  assert.match(html, /monsterAttackSpriteMarkup\(node\)/);
  assert.match(html, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(html, /class="monster-sprite-surface"/);
  assert.match(html, /MONSTER_ATTACK_ASPECTS/);
  assert.match(monsterSystem, /const aspect = lineage\.aspect \|\| 1/);
  assert.match(styles, /\.battle-fighter\.attacking \.battle-fighter-art\.has-pose-animation \.monster-sprite-attack/);
  assert.match(styles, /@keyframes battleAttackPoseSwap/);
});

test("oversized monster sheet entries use isolated artwork and fitted encyclopedia names", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const monsterSystem = readFileSync(new URL("../monster-system.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../monster-battle.css", import.meta.url), "utf8");
  const assets = [
    "chibi-dragon.png", "chibi-dragon-attack.png",
    "electric-owl.png", "electric-owl-attack.png",
    "bone-raptor.png", "bone-raptor-attack.png",
    "fossil-triceratops.png", "fossil-triceratops-attack.png"
  ];

  assets.forEach((name) => assert.ok(existsSync(new URL(`../images/monsters/singles/${name}`, import.meta.url)), name));
  assert.match(monsterSystem, /singles\/chibi-dragon\.png/);
  assert.match(monsterSystem, /singles\/electric-owl\.png/);
  assert.match(monsterSystem, /singles\/bone-raptor\.png/);
  assert.match(monsterSystem, /singles\/fossil-triceratops\.png/);
  assert.match(html, /function monsterNameFitStyle\(/);
  assert.match(html, /--monster-name-size:/);
  assert.match(html, /function fitSingleLineText\(/);
  assert.match(styles, /white-space:nowrap/);
});

test("persistent player stats are limited to the fixed six members", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /const FIXED_MEMBERS = \["おいしいとうふ", "えだ", "ジャン", "リーマ", "Kento", "Lickey"\]/);
  assert.match(html, /function canonicalFixedMemberName\(name\)/);
  assert.match(html, /if \(!fixedName\) return createPlayerStat\(normalized\)/);
  assert.match(html, /\.filter\(\(record\) => isFixedMemberName\(record\?\.name\)\)/);
  assert.match(html, /!isFixedMemberName\(fighter\.playerName\)/);
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
    if (node.id === "growth-rail") {
      assert.equal(node.sprite.size, "contain", "growth-rail must use isolated artwork without the adjacent sprite");
      assert.match(node.sprite.sheet, /singles\/chibi-dragon\.png$/);
    } else {
      assert.match(node.sprite.sheet, /images\/monsters\/pairs\//, `${node.id} must use repacked artwork`);
      assert.match(node.sprite.size, /^(?:200% 100%|contain)$/, `${node.id} must use no more than a two-column sheet`);
    }
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

  const rank4Source = result.createPlayerMonster("DEX PRIORITY", "red");
  rank4Source.nodeId = "inferno-perfect-a";
  rank4Source.stage = 4;
  const rank5Candidates = result.NODES[rank4Source.nodeId].next;
  const rank5Priority = result.evolvePlayerMonster(
    rank4Source,
    "red:rank5-priority",
    (() => {
      const rolls = [0, .5];
      return () => rolls.shift() ?? .5;
    })(),
    { [rank5Candidates[0]]: 1 }
  );
  assert.equal(rank5Priority.monster.nodeId, rank5Candidates[1], "Rank five evolution must always select an undiscovered branch");

  const rank3Source = result.createPlayerMonster("DEX CHANCE", "red");
  rank3Source.nodeId = "inferno-mature";
  rank3Source.stage = 3;
  const rank4Candidates = result.NODES[rank3Source.nodeId].next;
  const noveltyRolls = [.59, 0];
  const rank4Priority = result.evolvePlayerMonster(
    rank3Source,
    "red:rank4-priority",
    () => noveltyRolls.shift() ?? 0,
    { [rank4Candidates[0]]: 1 }
  );
  assert.equal(rank4Priority.monster.nodeId, rank4Candidates[1], "Evolution through rank four must favor an undiscovered branch on a sixty-percent roll");

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

  const monsterSheets = new Map();
  Object.values(result.NODES).forEach((node) => {
    const members = monsterSheets.get(node.sprite.sheet) || [];
    members.push(node.id);
    monsterSheets.set(node.sprite.sheet, members);
    assert.ok(existsSync(new URL(`../${node.sprite.sheet}`, import.meta.url)), `Missing monster artwork: ${node.sprite.sheet}`);
    const attackSheet = node.sprite.attackSheet || node.sprite.sheet.replace(/\.png$/, "-attack.png");
    assert.ok(existsSync(new URL(`../${attackSheet}`, import.meta.url)), `Missing monster attack artwork: ${attackSheet}`);
  });
  monsterSheets.forEach((members, sheet) => {
    assert.ok(members.length <= 2, `${sheet} contains ${members.length} monsters: ${members.join(", ")}`);
  });
  const pairManifest = JSON.parse(readFileSync(new URL("../assets/monster-pair-manifest.json", import.meta.url), "utf8"));
  assert.equal(Object.keys(pairManifest.nodes).length, 272);
  pairManifest.sheets.forEach((entry) => {
    assert.ok(entry.nodes.length >= 1 && entry.nodes.length <= 2, `${entry.sheet} must contain one or two monsters`);
    assert.ok(existsSync(new URL(`../${entry.sheet}`, import.meta.url)), `Missing repacked sheet: ${entry.sheet}`);
    assert.ok(existsSync(new URL(`../${entry.attackSheet}`, import.meta.url)), `Missing repacked attack sheet: ${entry.attackSheet}`);
  });
  assert.match(html, /monsters: cloneOnlineValue\(MONSTER_SYSTEM\.syncPlayerMonsters/);
  assert.match(html, /monsterBattleMode: state\.monsterBattleMode/);
  assert.match(html, /doubleMonsterMode: state\.doubleMonsterMode/);
  assert.match(html, /id="doubleMonsterModeButton"/);
  assert.doesNotMatch(html, /Object\.groupBy\(/, "Online double evolutions must work in older Chromium builds");
  assert.match(html, /type === "monster-battle-start"/);
  assert.match(html, /effects\.has\("monster-battle-start"\)/);
  assert.match(html, /matchId: String\(state\.matchTracker\?\.id \|\| ""\)/, "Monster battle results must be scoped to one match");
  assert.match(html, /String\(incomingBattle\.matchId \|\| ""\) === incomingMatchId/, "Online rematches must reject stale monster battle results");
  assert.match(html, /state\.monsterHatches = hatchAllPlayerMonsters\(\)/, "Every match must hatch all player eggs together");
  assert.match(html, /effects\.push\("intro", "monster-hatch", "ready"\)/, "Online hatch presentation must be part of the shared start sequence");
  assert.match(html, /function preloadMonsterNodes\(/, "Visible monster pose assets must be warmed before animation");
  assert.ok(existsSync(new URL("../skill-assets/Lickey/castle-tofu-curse.png", import.meta.url)), "Missing tofu-cursed Likecy castle artwork");
  assert.match(html, /lickeyTofuCastleTeam = Object\.values\(state\.skillEffects\.poopCenter/, "The tofu and Likecy combo must follow skill activation order");
  assert.match(html, /isLickeyTofuCastleCell \? "tofuCastle" : "castle"/, "The tofu and Likecy skill combo must use its dedicated castle");
  assert.match(html, /kind: "monster-speech"/);
  assert.ok(existsSync(new URL("../images/monster-battle/arena.png", import.meta.url)));
  assert.ok(existsSync(new URL("../monster-battle.css", import.meta.url)));
  assert.match(html, /audio\/monster-battle\/boss-bgm\/bgm\.wav/);
  assert.match(html, /audio\/monster-battle\/boss-bgm\/bgm\.mp3/);
  assert.match(html, /BOSS_BATTLE_BGM_CANDIDATES = \[\s*"audio\/monster-battle\/boss-bgm\/bgm\.mp3"/);
  assert.match(html, /grid-auto-rows: 142px/);
  assert.match(html, /contain: layout paint/);
  assert.match(html, /\.monster-dex-art \.monster-sprite[\s\S]*position: absolute[\s\S]*inset: 3px[\s\S]*max-width: none[\s\S]*aspect-ratio: auto/);
  assert.match(html, /function monsterDexSpriteMarkup\(node\)[\s\S]*monsterSpriteMarkup\(node, "monster-dex-sprite", 80\)/);
  assert.match(html, /monster-dex-art">\$\{found \? monsterDexSpriteMarkup\(node\)/);
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
  assert.match(html, /TOFU_CELL_THUMBNAIL_FOLDER/);
  assert.match(html, /function tofuCellThumbnailPath\(/);
  assert.match(html, /CUSTOM_OPEN_SOUND_BUFFER_LIMIT = 24/);
  assert.doesNotMatch(html, /function unlockAudio\(\) \{\s*Object\.keys\(AUDIO\)/);
  assert.doesNotMatch(html, /function unlockOpenSoundAudio\(\) \{[\s\S]{0,260}primeCustomOpenSoundBuffers\(\)/);
  assert.match(html, /customOpenSoundBufferCache\.size > CUSTOM_OPEN_SOUND_BUFFER_LIMIT/);
  assert.doesNotMatch(html, /function releaseInactiveTofuCellThumbnails\(/);
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
  ["fire", "ice", "lightning", "wind", "earth", "water", "light", "dark", "claw", "fang", "slash", "impact"].forEach((effect) => {
    assert.match(battleCss, new RegExp(`effects\\/v3\\/${effect}\\.png`));
    assert.ok(existsSync(new URL(`../images/monster-battle/effects/v3/${effect}.png`, import.meta.url)), `Missing high-resolution effect: ${effect}`);
  });
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

test("available monster pose sheets animate toward the opposing bingo card", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const battleCss = readFileSync(new URL("../monster-battle.css", import.meta.url), "utf8");
  const monsterSystem = readFileSync(new URL("../monster-system.js", import.meta.url), "utf8");

  assert.match(html, /hasMonsterPoseAnimation\(node\)/);
  assert.match(html, /monster-pose-animated/);
  assert.match(html, /data-monster-stage=/);
  assert.match(html, /--monster-action-delay:/);
  assert.match(battleCss, /@keyframes monsterBoardActionRed/);
  assert.match(battleCss, /@keyframes monsterBoardActionBlue/);
  assert.match(battleCss, /@keyframes monsterBoardRunDust/);
  assert.match(battleCss, /@keyframes monsterBasePose/);
  assert.match(battleCss, /@keyframes monsterAttackPose/);
  assert.match(html, /childhood-attack\.png/);
  assert.match(html, /childhood-new-attack\.png/);
  assert.match(html, /childhood-extra-attack\.png/);
  assert.match(html, /growth-v2-attack\.png/);
  assert.match(html, /growth-extra-v2-attack\.png/);
  assert.match(html, /growth-new-a-attack\.png/);
  assert.match(html, /growth-new-b-attack\.png/);
  assert.match(html, /lineage-inferno-attack\.png/);
  assert.match(html, /lineage-thunder-attack\.png/);
  assert.match(html, /lineage-mecha-attack\.png/);
  assert.match(html, /lineage-beetle-attack\.png/);
  assert.match(html, /lineage-grove-attack\.png/);
  assert.match(html, /lineage-spore-attack\.png/);
  assert.match(html, /lineage-abyss-attack\.png/);
  assert.match(html, /lineage-cosmic-attack\.png/);
  assert.match(html, /lineage-glacier-attack\.png/);
  assert.match(html, /lineage-crystal-attack\.png/);
  assert.match(html, /lineage-sky-attack\.png/);
  assert.match(html, /lineage-tempest-attack\.png/);
  assert.match(html, /lineage-shadow-attack\.png/);
  assert.match(html, /lineage-spirit-attack\.png/);
  assert.match(html, /lineage-candy-attack\.png/);
  assert.match(html, /lineage-junk-attack\.png/);
  assert.match(html, /lineage-coral-attack\.png/);
  assert.match(html, /lineage-corsair-attack\.png/);
  assert.match(html, /lineage-dune-attack\.png/);
  assert.match(html, /lineage-fossil-attack\.png/);
  assert.match(html, /lineage-samurai-attack\.png/);
  assert.match(html, /lineage-dojo-attack\.png/);
  assert.match(html, /lineage-sonic-attack\.png/);
  assert.match(html, /lineage-festival-attack\.png/);
  assert.match(html, /lineage-bloom-attack\.png/);
  assert.match(html, /lineage-dream-attack\.png/);
  assert.match(html, /lineage-slime-attack\.png/);
  assert.match(html, /lineage-gourmet-attack\.png/);
  assert.match(html, /lineage-ink-attack\.png/);
  assert.match(html, /lineage-ninja-attack\.png/);
  assert.match(html, /lineage-rail-attack\.png/);
  assert.match(html, /lineage-ryu-attack\.png/);
  assert.match(html, /rank6-a-v3-attack\.png/);
  assert.match(html, /rank6-b-v3-attack\.png/);
  assert.match(html, /legendary-attack\.png/);
  assert.match(html, /legendary-new-attack\.png/);
  assert.match(html, /egg-attack\.png/);
  const declaredSheets = new Set([...monsterSystem.matchAll(/"([A-Za-z0-9-]+\.png)"/g)].map((match) => match[1]));
  const animatedSheets = new Set([...html.matchAll(/"images\/monsters\/([A-Za-z0-9-]+\.png)"\s*:\s*"images\/monsters\/[A-Za-z0-9-]+-attack\.png"/g)].map((match) => match[1]));
  assert.equal(declaredSheets.size, 44);
  declaredSheets.forEach((sheet) => assert.ok(animatedSheets.has(sheet), `missing monster pose animation for ${sheet}`));
  assert.doesNotMatch(battleCss, /stageOneAttackEffect/);
  assert.doesNotMatch(battleCss, /stage-one-animated/);
  assert.doesNotMatch(battleCss, /effects\/physical-v2\.png/);
  assert.match(battleCss, /prefers-reduced-motion: reduce/);
});

test("monster encyclopedia zoom previews available pose animations", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const battleCss = readFileSync(new URL("../monster-battle.css", import.meta.url), "utf8");

  assert.match(html, /id="monsterZoomAnimationButton"/);
  assert.match(html, /MONSTER_ATTACK_SHEETS/);
  assert.match(html, /monsterAttackSpriteMarkup\(node\)/);
  assert.match(html, /has-pose-animation/);
  assert.match(html, /ANIMATION PREPARING/);
  assert.doesNotMatch(battleCss, /@keyframes monsterDexAction/);
  assert.match(battleCss, /\.monster-zoom-card[\s\S]*width: min\(1680px, 98vw\)/);
  assert.match(battleCss, /\.monster-zoom-art\.animation-paused/);
});

test("territory mode has replaceable looping audio and a tofu gray selection aura", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const territoryMode = readFileSync(new URL("../territory-mode.js", import.meta.url), "utf8");
  const territoryMap = readFileSync(new URL("../territory-map-3d.js", import.meta.url), "utf8");
  const serviceWorker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const candidates = ["bgm.mp3", "bgm.wav"];
  const bgmFile = candidates.find((file) => existsSync(new URL(`../audio/territory/bgm/${file}`, import.meta.url)));

  assert.ok(bgmFile, "A replaceable territory BGM is required");
  assert.ok(readFileSync(new URL(`../audio/territory/bgm/${bgmFile}`, import.meta.url)).length > 500_000);
  assert.match(html, /TERRITORY_BGM_CANDIDATES = \[\s*"audio\/territory\/bgm\/bgm\.mp3",\s*"audio\/territory\/bgm\/bgm\.wav"/);
  assert.match(html, /playManagedAudioUrlCandidates\(TERRITORY_BGM_CANDIDATES, "territoryBgm", "territoryBgm"\)/);
  assert.match(html, /onOpen: startTerritoryBgm/);
  assert.match(html, /onClose: \(\) => \{[\s\S]*?stopTerritoryBgm\(\)/);
  assert.match(territoryMode, /onOpen\(\)/);
  assert.match(territoryMode, /onClose\(\)/);
  assert.match(territoryMap, /tile\.ownerId === "tofu"\s*\?\s*new THREE\.Color\(0x9aa0a8\)/);
  assert.match(serviceWorker, /\/audio\/territory\/bgm\//);
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
