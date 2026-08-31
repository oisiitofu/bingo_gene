import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

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

  assert.match(html, /online-room\.js\?v=20260831-bingo-city-buildings-137/);
  assert.match(html, /retry=\$\{Date\.now\(\)\}/);
  assert.match(serviceWorker, /20260831-bingo-city-buildings-137/);
});

test("one-bingo audio, Likecy skill timing, and reach badge rules stay aligned", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /lickey:\s*65000/);
  assert.match(html, /playAudioFor\("firstBingoBgm", 35000\)/);
  assert.match(html, /const reachLabel = isVictoryReach\s*\? "WIN"\s*:\s*\(!isFinalReach && pairEntries\.length \? "PAIR" : ""\)/);
  assert.match(html, /const reachLabelMarkup = reachLabel[\s\S]*?<div class="reach-label">\$\{reachLabel\}<\/div>/);
  assert.doesNotMatch(html, /side\.winnerReachCells\.has\(index\) \? "WIN" : "REACH"/);
});

test("consecutive skills cancel stale audio and setup snapshots clear persistent effects", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /let pendingSkillBgmStartTimer = 0/);
  assert.match(html, /let skillAudioGeneration = 0/);
  assert.match(html, /function cancelPendingSkillAudioStart\(\)/);
  assert.match(html, /if \(audioGeneration !== skillAudioGeneration\) return/);
  assert.match(html, /const MAX_TRANSIENT_AUDIO = 12/);
  assert.match(html, /let activeSkillSeAudio = null/);
  assert.match(html, /function stopActiveSkillSeAudio\(\)/);
  assert.match(html, /cancelPendingSkillAudioStart\(\);\s*stopActiveSkillSeAudio\(\)/);
  assert.match(html, /releaseTransientAudio\(audio, \{ unload: true \}\)/);
  assert.match(html, /const hasActiveMatch = state\.gameStarted && !state\.winner/);
  assert.match(html, /state\.skillEffects = hasActiveMatch[\s\S]*?createSkillEffects\(\)/);
  assert.match(html, /if \(!state\.gameStarted\) \{[\s\S]*?stopAllTransientAudio\(\{ keepSetupTheme: true \}\)/);
  assert.match(html, /function startKentoLiveChat\(team\) \{[\s\S]*?if \(!state\.gameStarted \|\| state\.winner\) return/);
  assert.doesNotMatch(html, /\.cell:not\(\.free\):not\(\.open\)[\s\S]{0,800}url\("skill-assets\/Kento\/aura\.png"\)/);
});

test("all skill presentations prefer bounded assets and release previous media", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const profiles = ["Kento", "Lickey", "えだ", "おいしいとうふ", "ジャン", "リーマ"];

  profiles.forEach((folder) => {
    const asset = new URL(`../skill-assets/${folder}/logo-mobile.webp`, import.meta.url);
    assert.ok(existsSync(asset), `${folder} mobile logo is missing`);
    assert.ok(statSync(asset).size < 500_000, `${folder} mobile logo exceeds the memory budget`);
  });
  assert.match(html, /mobileLogo: \["logo-mobile\.webp"\]/);
  assert.match(html, /const compactUrls = skillAssetUrls\(id, "mobileLogo"\)/);
  assert.match(html, /const candidates = \[\.\.\.new Set\(\[\.\.\.compactUrls, \.\.\.urls\]\)\]/);
  assert.match(html, /function showSkillActivation\(team, skill\) \{\s*releaseSkillPresentationMedia\(\);\s*stopSkillKaraoke\(false\)/);
  assert.match(html, /function releaseSkillPresentationMedia\(\)[\s\S]*?removeAttribute\("src"\)/);
  assert.match(html, /function stopSkillKaraoke\(restore = true\)[\s\S]*?classList\.remove\("karaoke", "talking"\);\s*if \(!restore/);
  assert.doesNotMatch(html, /\.skill-title-art \{\s*width: 210vw/);
  assert.match(html, /#skillOverlay\.show \{ contain: layout paint style; \}/);
  assert.match(html, /\.board-card\.kento-ally \.board-body::after,[\s\S]*?\.special-cell-art \{\s*animation: none/);
});

test("sound toggle keeps BGM timelines running while muted and resumes them in place", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /audioCache\.forEach\(\(audio, key\) => \{[\s\S]*?audio\.muted = !state\.soundEnabled/);
  assert.match(html, /if \(activeBgmAudio && activeBgmKey\) \{[\s\S]*?activeBgmAudio\.muted = !state\.soundEnabled/);
  assert.match(html, /function applyTrackedAudioVolume\(audio\) \{[\s\S]*?audio\.muted = !state\.soundEnabled/);
  assert.match(html, /activeOpenSoundNodes\.forEach\(\(node\) => \{[\s\S]*?applyTrackedOpenSoundVolume\(node\)/);
  assert.match(html, /if \(!state\.soundEnabled\) pendingAudioRetries\.clear\(\)/);
  assert.match(html, /const managedBgm = isManagedBgmKey\(key\);\s*if \(!state\.soundEnabled && !managedBgm\) return null/);
  assert.match(html, /function playManagedAudioUrl\([\s\S]*?audio\.muted = !state\.soundEnabled;[\s\S]*?const playAttempt = audio\.play\(\)/);
  assert.match(html, /state\.soundEnabled && activeBgmAudio\.paused && !activeBgmAudio\.ended[\s\S]*?activeBgmAudio\.play\(\)/);
  assert.match(html, /function isSetupThemePlaybackAllowed\(\)[\s\S]*?return Boolean\(\s*!state\.gameStarted/);
  assert.match(html, /function promoteSetupThemeAudio\(audio\)[\s\S]*?audio\.muted = !state\.soundEnabled/);
  assert.match(html, /getAudioVolume\(volumeKey\) \* volumeMultiplier \* eased/);
});

test("setup theme cannot resume after a mobile transition into a match", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /function isSetupThemePlaybackAllowed\(\) \{[\s\S]*?!state\.gameStarted[\s\S]*?!els\.playScreen\?\.classList\.contains\("active"\)/);
  assert.match(html, /function syncSetupTheme\(\) \{\s*if \(!isSetupThemePlaybackAllowed\(\)\) \{\s*stopSetupTheme\(\)/);
  assert.match(html, /function promoteSetupThemeAudio\(audio\) \{\s*if \(!isSetupThemePlaybackAllowed\(\)\) return/);
  assert.match(html, /function stopSetupTheme\(\) \{[\s\S]*?audio\.autoplay = false;[\s\S]*?audio\.pause\(\);[\s\S]*?audio\.muted = true/);
  assert.match(html, /if \(isManagedBgmKey\(key\)\) \{\s*stopSetupTheme\(\);\s*stopManagedBgm\(\)/);
});

test("mobile scrolling never counts as an audio activation gesture", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const bindStart = html.indexOf("const onFirstAudioGesture = () =>");
  const bindEnd = html.indexOf('window.addEventListener("focus"', bindStart);
  const audioGestureBindings = html.slice(bindStart, bindEnd);
  const eventLists = Array.from(audioGestureBindings.matchAll(/\[([^\]]+)\]\.forEach\(\(eventName\)/g))
    .map((match) => match[1].replace(/\s+/g, " ").trim());

  assert.deepEqual(eventLists, ['"click", "keydown"', '"click", "keydown"']);
});

test("bingo cells are operated only through player-name buttons", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /class="opener-row"/);
  assert.doesNotMatch(html, /<span class="opener-label">OPENER/);
  assert.doesNotMatch(html, /role="button"[^>]+data-testid="bingo-cell-/);
  assert.match(html, /function canUseOnlinePlayerChoice\(team, memberName\)/);
  assert.match(html, /selected\.length === 1 && selected\[0\] === playerStatsKey\(member\)/);
});

test("Lite Mode keeps two operable boards visible and opens cells after choosing a player", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /class="btn simple-ui-btn" id="compactModeButton"[^>]*>LITE MODE OFF/);
  assert.match(html, /document\.body\.classList\.toggle\("compact-ipad-mode", state\.compactMode\)/);
  assert.match(html, /body\.compact-ipad-mode \.boards \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(html, /body\.compact-ipad-mode \.commentary,[\s\S]*?body\.compact-ipad-mode \.voice-lane/);
  assert.match(html, /body\.compact-ipad-mode \.game-top \{[\s\S]*?display: grid/);
  assert.match(html, /body\.compact-ipad-mode \.board-body,[\s\S]*?container-type: size/);
  assert.match(html, /body\.compact-ipad-mode \.grid \{[\s\S]*?width: min\(100%, 100cqh\)/);
  assert.match(html, /body\.compact-ipad-mode \.board-actions \{[\s\S]*?position: absolute[\s\S]*?top: calc\(100% \+ 8px\)/);
  assert.match(html, /body\.compact-ipad-mode \.board-tools \{ display: none; \}/);
  assert.match(html, /body\.compact-ipad-mode \.team-skill \{[\s\S]*?min-width: 158px;[\s\S]*?min-height: 52px;[\s\S]*?background: var\(--skill-button-image\)/);
  assert.match(html, /body\.compact-ipad-mode \.board-card \{[\s\S]*?contain: layout style;/);
  assert.doesNotMatch(html, /body\.compact-ipad-mode \.board-card \{[\s\S]{0,180}?contain: layout paint style;/);
  assert.match(html, /body\.compact-ipad-mode \.cell,[\s\S]*?animation: none !important/);
  assert.match(html, /body\.compact-ipad-mode \.skill-title-art,[\s\S]*?width: min\(122vw, 1260px\)[\s\S]*?animation: overlayAssetIn \.32s ease-out both !important/);
  assert.match(html, /body\.compact-ipad-mode \.fever-banner,[\s\S]*?animation: liteCenteredBannerIn 2\.8s ease-out both/);
  assert.match(html, /@keyframes liteCenteredBannerIn \{[\s\S]*?translate\(-50%, -50%\)/);
  assert.match(html, /function spawnOpenBurst\([\s\S]*?if \(state\.compactMode\) return/);
  assert.match(html, /function screenShake\(\) \{\s*if \(state\.compactMode\) return/);
  assert.doesNotMatch(html, /body\.compact-ipad-mode #fxLayer,\s*body\.compact-ipad-mode \.copyright/);
  assert.match(html, /showOpenedByPopover\(team, index, cellElement\.getBoundingClientRect\(\), \{ pendingOpen: !side\.marked\[index\] \}\)/);
  assert.match(html, /compactMode: state\.compactMode/);
  assert.match(html, /state\.compactMode = snapshot\.compactMode === true/);
});

test("iPad normal mode bounds full-mode rendering and releases presentation textures", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /const FORCE_IPAD_PERFORMANCE = new URLSearchParams\(window\.location\.search\)\.get\("ipadPerformance"\) === "1"/);
  assert.match(html, /const IS_IPAD_DEVICE = FORCE_IPAD_PERFORMANCE \|\| \/iPad\/i\.test\(navigator\.userAgent \|\| ""\)/);
  assert.match(html, /document\.body\.classList\.toggle\("ipad-performance-mode", IS_IPAD_DEVICE\)/);
  assert.match(html, /body\.ipad-performance-mode:not\(\.compact-ipad-mode\) \.boards \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(html, /body\.ipad-performance-mode:not\(\.compact-ipad-mode\)::after \{[\s\S]*?animation: none;[\s\S]*?mix-blend-mode: normal/);
  assert.match(html, /function releaseIpadPresentationMedia\(overlay\)[\s\S]*?image\.removeAttribute\("src"\)[\s\S]*?els\.monsterHatchGrid\.innerHTML = ""[\s\S]*?els\.monsterEvolutionBefore\.innerHTML = ""[\s\S]*?els\.victoryEvolutionGrid\.innerHTML = ""/);
  assert.match(html, /function restoreIpadPresentationMedia\(overlay\)[\s\S]*?image\.src = src/);
  assert.match(html, /function ipadFxCount\(count, minimum = 1\)[\s\S]*?Math\.ceil\(Number\(count \|\| 0\) \* \.46\)/);
  assert.match(html, /const confettiCount = ipadFxCount\(/);
});

test("7x7 and three-player teams select the opener after the cell while JAN and EDA accept image targets", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /function shouldSelectPlayerAfterCellClick\(\)[\s\S]*?state\.gridSize === 7[\s\S]*?state\.red\.members\.length >= 3[\s\S]*?state\.blue\.members\.length >= 3/);
  assert.match(html, /const playerChoices = cell\.free \|\| shouldSelectPlayerAfterCellClick\(\) \? "" : renderCellPlayerChoices/);
  assert.match(html, /if \(\(skillId === "jan" \|\| skillId === "eda"\) && team !== pending\.team\) return false/);
  assert.match(html, /const disabled = state\.inputLocked \|\| cell\.free \|\| Boolean\(state\.pendingSkill && !canApplySkillToCell/);
  assert.match(html, /function onGridClick\(event\)[\s\S]*?state\.pendingSkill && !side\.marked\[index\][\s\S]*?applyPendingSkillToCell\(team, index, cellElement\)[\s\S]*?if \(!shouldSelectPlayerAfterCellClick\(\)\) return;[\s\S]*?showOpenedByPopover/);
  assert.match(html, /id="skillTargetGuide"/);
  assert.match(html, /スキル発動のマスを選択してください/);
  assert.doesNotMatch(html, /id="skillTargetGuideHint"/);
  assert.doesNotMatch(html, /光っているマスの絵柄をクリック/);
  assert.match(html, /function updateSkillTargetGuide\(\)/);
});

test("world tournament all stats exposes every player's numbered opened cells", () => {
  const source = readFileSync(new URL("../world-tournament.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../world-tournament.css", import.meta.url), "utf8");

  assert.match(source, /OPENED CELLS/);
  assert.match(source, /characterSummary\(stat, \{ showNumber: true \}\)/);
  assert.match(source, /No\.\$\{String\(id\)\.padStart\(2, "0"\)\}/);
  assert.match(css, /\.world-character-chip\.numbered/);
});

test("stats render every opened character instead of only the top entries", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(
    html,
    /renderMiniCharacterChips\(record\.openedCharacters, Number\.POSITIVE_INFINITY\)/
  );
  assert.match(html, /class="character-log opened-character-log"/);
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
  const territoryVersion = Number(territorySystem.match(/const VERSION = (\d+);/)?.[1]);
  assert.ok(Number.isInteger(territoryVersion));
  assert.match(
    rules.rules.teamBingoV1.frontier.current[".validate"],
    new RegExp(`version'\\)\\.val\\(\\) === ${territoryVersion}`)
  );
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
  assert.match(territoryMode, /function focusTerritoryLog\(logId\)/);
  assert.match(territoryMode, /data-territory-log=/);
  assert.match(territoryMode, /map3D\.update\(state, selectedTileId, selectedPlayerId, attackFocus\)/);
  assert.match(territoryMap3D, /attackTargeted \? new THREE\.Color\(0xff385d\) : new THREE\.Color\(0xffd45d\)/);
  assert.match(territorySystem, /sourceTileIds: \[\.\.\.new Set/);
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

test("BINGO CITY is connected to the shared client, worker tick, rules, and offline shell", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const online = readFileSync(new URL("../online/online-room.js", import.meta.url), "utf8");
  const serviceWorker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../worker/territory-worker.mjs", import.meta.url), "utf8");
  const cityMode = readFileSync(new URL("../city-mode.js", import.meta.url), "utf8");
  const citySystem = readFileSync(new URL("../city-system.js", import.meta.url), "utf8");
  const cityMap = readFileSync(new URL("../city-map-3d.js", import.meta.url), "utf8");
  const rules = JSON.parse(readFileSync(new URL("../firebase-database.rules.json", import.meta.url), "utf8"));

  assert.match(html, /id="cityModeButton"/);
  assert.match(html, /id="playCityModeButton"/);
  assert.match(html, /class="btn mode-entry-btn" id="territoryModeButton"/);
  assert.match(html, /class="btn mode-entry-btn" id="cityModeButton"/);
  assert.match(html, /class="btn frame mode-entry-btn" id="playTerritoryModeButton"/);
  assert.match(html, /class="btn frame mode-entry-btn" id="playCityModeButton"/);
  assert.match(html, /\.btn\.mode-entry-btn::before,[\s\S]*?content: none/);
  assert.match(html, /#cityModeButton,[\s\S]*?#playCityModeButton[\s\S]*?font-size: 10px/);
  assert.doesNotMatch(cityMode, /city\.resources\.hype|city-resource hype/);
  assert.doesNotMatch(citySystem, /resources: \{[^}]*hype|return \{[^}]*hype/);
  assert.doesNotMatch(citySystem, /resources\.(?:materials|research|blueprints|hype)|materialsOutput|baseMaterials/);
  assert.match(cityMap, /const styles = \[/);
  assert.match(cityMap, /variant % 10/);
  assert.match(cityMap, /function chooseNextRoad/);
  assert.match(cityMap, /updateTrafficCar\(item, delta\)/);
  assert.match(cityMap, /function createTerrainSurface/);
  assert.match(cityMap, /function createTerrainGrid/);
  assert.match(cityMap, /cornerSurfaceNormal/);
  assert.match(cityMap, /function terrainMixAtCorner/);
  assert.match(cityMap, /terrainMix.*Float32BufferAttribute/);
  assert.match(cityMap, /terrainSoil/);
  assert.doesNotMatch(cityMap, /InstancedMesh\(shared\.terrain|BoxGeometry\(TILE \* \.96/);
  assert.match(html, /src="city-system\.js\?v=20260831-bingo-city-buildings-137"/);
  assert.match(html, /src="city-map-3d\.js\?v=20260831-bingo-city-buildings-137"/);
  assert.match(html, /src="city-mode\.js\?v=20260831-bingo-city-buildings-137"/);
  assert.match(html, /searchParams\.set\("city", "1"\)/);
  assert.match(online, /subscribeCity\(\)/);
  assert.match(online, /applyCityCommand\(command = \{\}\)/);
  assert.match(online, /awardCityMatchRewards\(payload = \{\}\)/);
  assert.match(worker, /advanceCitiesWithToken/);
  assert.match(worker, /context\.waitUntil\(advanceCities\(env\)\)/);
  assert.ok(rules.rules.teamBingoV1.cities.current, "Firebase city rules are missing");
  assert.match(serviceWorker, /\.\/city-system\.js\?v=20260831-bingo-city-buildings-137/);
  assert.doesNotMatch(serviceWorker, /SHELL_FILES = \[[\s\S]*?images\/city\/textures/);
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

  assert.doesNotMatch(html, /id="worldTournamentButton"/);
  assert.match(online, /id="onlineWorldTournament">世界大会</);
  assert.match(online, /this\.bridge\.openWorldTournament\?\.\(\)/);
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
  assert.match(tournament, /data-world-create-player/);
  assert.match(tournament, /data-world-create-member/);
  assert.match(tournament, /data-world-create-add/);
  assert.match(tournament, /奇数参加OK/);
  assert.match(tournament, /!\/\^player\\s\*\\d\+\$\/i\.test\(player\.name\)/);
  assert.match(tournament, /data-world-match-settings/);
  assert.match(tournament, /data-world-result=/);
  assert.match(tournament, /data-world-result-dialog/);
  assert.match(tournament, /root\.querySelector\("\[data-world-result-dialog\]"\)/);
  assert.match(tournament, /boardResult: normalizeBoardResult/);
  assert.match(tournament, /data-world-create-test-mode/);
  assert.match(tournament, /if \(!match\.settings\.testMode\)/);
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

test("setup controls keep utility links by ROOM ID and combine monster count into battle mode", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /class="setup-quick-links">[\s\S]*?id="setupStatsButton"[\s\S]*?id="setupMonsterButton"[\s\S]*?id="territoryModeButton"/);
  assert.match(html, /class="member-selection-row">[\s\S]*?id="fixedMemberList"[\s\S]*?id="customPlayersToggleButton"[\s\S]*?<\/div>\s*<div class="player-grid custom-player-inputs" id="playerInputs" hidden/);
  assert.match(html, /\.member-selection-row \{[\s\S]*?flex-wrap: nowrap;[\s\S]*?overflow-x: auto/);
  assert.match(html, /id="customPlayersToggleButton"[^>]*aria-expanded="false"[^>]*>追加\.\.\.<\/button>/);
  assert.match(html, /function toggleCustomPlayerInputs\(\)[\s\S]*?els\.playerInputs\.hidden = !expanded/);
  assert.match(html, /class="setup-player-controls">[\s\S]*?id="mode5"[\s\S]*?id="deckModeButton"[\s\S]*?class="monster-battle-setup-control"[\s\S]*?id="randomEventButton"[\s\S]*?id="compactModeButton"[\s\S]*?id="testModeCheckbox"/);
  assert.match(html, /id="singleMonsterModeButton"[^>]*>x1<\/button>/);
  assert.match(html, /id="doubleMonsterModeButton"[^>]*>x2<\/button>/);
  assert.match(html, /randomEventsEnabled: false/);
  assert.match(html, /localStorage\.getItem\(STORAGE\.randomEvents\) === "on"/);
});

test("TEST MODE syncs online while keeping every persistent bingo result untouched", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /id="testModeCheckbox"/);
  assert.match(html, /testMode: false/);
  assert.match(html, /testMode: state\.testMode/);
  assert.match(html, /setTestModeState\(snapshot\.testMode === true\)/);
  assert.match(html, /function getPlayerStat\(name\)[\s\S]*?state\.testPlayerStats/);
  assert.match(html, /function recordOpen\(characterId, playerName\)[\s\S]*?!isFixedMemberName\(playerName\)/);
  assert.match(html, /function savePlayerStats\(\) \{\s*if \(state\.testMode\) return/);
  assert.match(html, /function recordMatchFinish\([\s\S]*?if \(state\.testMode\) \{\s*recordWorldTournamentMatch\(winnerTeam, victoryKind, mvpName\);\s*return/);
  assert.match(html, /function awardTerritoryEquipmentForMatch\([\s\S]*?if \(state\.testMode\) return/);
  assert.match(html, /function recordMonsterBattleOutcome\([\s\S]*?if \(state\.testMode\) return false/);
});

test("Admin player open counts use an image grid with visible per-character counts", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const online = readFileSync(new URL("../online/online-room.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../online/online-room.css", import.meta.url), "utf8");

  assert.match(html, /getCharacterImage: imagePath/);
  assert.match(online, /id="onlineAdminCountCharacterGrid"/);
  assert.match(online, /data-admin-count-character="\$\{id\}"/);
  assert.match(online, /const cellCount = Math\.max\(0, \(Number\(record\.openedCharacters\?\.\[id\]\) \|\| 0\) \+ delta\)/);
  assert.match(online, /id="onlineAdminCountConfirm" disabled>CONFIRM/);
  assert.match(online, /async confirmAdminPlayerOpenCounts\(\)/);
  assert.match(css, /\.online-admin-character-grid \{/);
  assert.match(css, /\.online-admin-character\.selected/);
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
  assert.match(html, /function matchedMonsterAttackSheet\(node\)/);
  assert.match(html, /node\.sprite\.poseMatched \|\| baseSheet\.includes\("\/pairs\/"\)/);
  assert.match(monsterSystem, /const aspect = lineage\.aspect \|\| 1/);
  assert.match(styles, /\.battle-fighter\.attacking \.battle-fighter-art\.has-pose-animation \.monster-sprite-attack/);
  assert.match(styles, /@keyframes battleAttackPoseSwap/);
  assert.match(styles, /visibility:hidden/);
});

test("oversized monster sheet entries use isolated artwork and fitted encyclopedia names", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const monsterSystem = readFileSync(new URL("../monster-system.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../monster-battle.css", import.meta.url), "utf8");
  const assets = [
    "chibi-dragon-v2.png", "chibi-dragon-attack-v2.png",
    "electric-owl.png", "electric-owl-attack.png",
    "bone-raptor-v2.png", "bone-raptor-v2-attack.png",
    "fossil-triceratops-v2.png", "fossil-triceratops-v2-attack.png",
    "amber-ptera.png", "amber-ptera-attack.png",
    "jade-gorilla-monk.png", "jade-gorilla-monk-attack.png",
    "pudding-hydra.png", "pudding-hydra-attack.png",
    "candywork-dragon.png", "candywork-dragon-attack.png",
    "permafrost-garm.png", "permafrost-garm-attack.png",
    "spring-kirin.png", "spring-kirin-attack.png",
    "world-flower-dragon.png", "world-flower-dragon-attack.png",
    "rainbow-garden-phoenix.png", "rainbow-garden-phoenix-attack.png",
    "lotus-crane.png", "lotus-crane-attack.png",
    "white-rabbit-kicker.png", "white-rabbit-kicker-attack.png",
    "thunder-string-wolf.png", "thunder-string-wolf-attack.png",
    "bone-king-tyranno.png", "bone-king-tyranno-attack.png",
    "fossil-amber-phoenix.png", "fossil-amber-phoenix-attack.png",
    "mercury-knight-god-v2.png", "mercury-knight-god-v2-attack.png",
    "flame-crown-dragon.png", "flame-crown-dragon-attack.png",
    "fossil-nether-hydra.png", "fossil-nether-hydra-attack.png",
    "hotpot-crab-king.png", "hotpot-crab-king-attack.png",
    "chaos-sweets-god.png", "chaos-sweets-god-attack.png",
    "sushi-phoenix.png", "sushi-phoenix-attack.png",
    "steam-giant.png", "steam-giant-attack.png",
    "battleship-whale-admira.png", "battleship-whale-admira-attack.png",
    "submarine-dragon.png", "submarine-dragon-attack.png",
    "ancient-mammoth-v2.png", "ancient-mammoth-v2-attack.png",
    "silver-ice-dragon.png", "silver-ice-dragon-attack.png",
    "racing-junk-dragon.png", "racing-junk-dragon-attack.png",
    "treasure-island-crab-emperor.png", "treasure-island-crab-emperor-attack.png",
    "dance-god-octopus.png", "dance-god-octopus-attack.png",
    "three-star-oni-chef-v2.png", "three-star-oni-chef-v2-attack.png",
    "slash-mantis-v2.png", "slash-mantis-v2-attack.png"
  ];

  assets.forEach((name) => assert.ok(existsSync(new URL(`../images/monsters/singles/${name}`, import.meta.url)), name));
  assert.match(monsterSystem, /singles\/chibi-dragon-v2\.png/);
  assert.match(monsterSystem, /singles\/electric-owl\.png/);
  assert.match(monsterSystem, /singles\/bone-raptor-v2\.png/);
  assert.match(monsterSystem, /singles\/fossil-triceratops-v2\.png/);
  assert.match(monsterSystem, /singles\/amber-ptera\.png/);
  assert.match(monsterSystem, /singles\/jade-gorilla-monk\.png/);
  assert.match(monsterSystem, /singles\/pudding-hydra\.png/);
  assert.match(monsterSystem, /singles\/candywork-dragon\.png/);
  assert.match(monsterSystem, /singles\/permafrost-garm\.png/);
  assert.match(monsterSystem, /singles\/spring-kirin\.png/);
  assert.match(monsterSystem, /singles\/world-flower-dragon\.png/);
  assert.match(monsterSystem, /singles\/rainbow-garden-phoenix\.png/);
  [
    "lotus-crane", "white-rabbit-kicker", "thunder-string-wolf", "bone-king-tyranno",
    "mercury-knight-god-v2", "flame-crown-dragon", "fossil-amber-phoenix", "fossil-nether-hydra", "hotpot-crab-king",
    "chaos-sweets-god", "sushi-phoenix", "steam-giant", "battleship-whale-admira",
    "submarine-dragon", "ancient-mammoth-v2", "silver-ice-dragon", "racing-junk-dragon",
    "treasure-island-crab-emperor", "dance-god-octopus", "three-star-oni-chef-v2", "slash-mantis-v2"
  ].forEach((slug) => {
    assert.ok(monsterSystem.includes(`singles/${slug}.png`), `${slug} idle override`);
    assert.ok(monsterSystem.includes(`singles/${slug}-attack.png`), `${slug} attack override`);
  });
  assert.match(monsterSystem, /attackSheet: `images\/monsters\/\$\{override\.attackSheet\}`/);
  assert.match(monsterSystem, /lineage\.ultimate\.forEach[\s\S]*?lineageSprite\(`ultimate-\$\{index\}`/);
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
  assert.match(html, /if \(fixedName\) recordOpen\(characterId, fixedName\)/);
  assert.match(html, /if \(fixedName\) recordClose\(characterId, fixedName\)/);
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
  const monsterBattleCss = readFileSync(new URL("../monster-battle.css", import.meta.url), "utf8");
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
  assert.equal(Boolean(result.NODES["growth-blade"].sprite.poseMatched), false, "Repacked monsters rely on their verified manifest slot");
  assert.equal(Boolean(result.NODES["candy-ultimate-1"].sprite.poseMatched), false, "No.128 must never swap from the unicorn to another monster");
  assert.equal(result.NODES["fossil-perfect-a"].sprite.poseMatched, true, "Recently rebuilt pose pairs must be explicitly verified");
  assert.equal(result.NODES["growth-rail"].sprite.attackSheet, "images/monsters/singles/chibi-dragon-attack-v2.png", "No.020 needs a distinct attack illustration");
  assert.equal(result.NODES["growth-rail"].sprite.poseMatched, true);
  assert.equal(result.NODES["fossil-mature"].sprite.sheet, "images/monsters/singles/bone-raptor-v2.png");
  assert.equal(result.NODES["fossil-perfect-a"].sprite.sheet, "images/monsters/singles/fossil-triceratops-v2.png");
  assert.equal(Object.values(result.NODES).filter((node) => node.sprite.poseMatched).length, 68, "Audited singles and every rank-six monster need a second pose");
  const numberedNodes = Object.values(result.NODES).sort((a, b) => (
    Number(Boolean(a.legendary)) - Number(Boolean(b.legendary)) ||
    a.stage - b.stage ||
    a.name.localeCompare(b.name, "ja-JP")
  ));
  [
    [173, "gourmet-ultimate-3", "three-star-oni-chef-v2"],
    [176, "beetle-ultimate-3", "slash-mantis-v2"],
    [188, "slime-ultimate-2", "mercury-knight-god-v2"],
    [202, "fossil-ultimate-2", "ancient-mammoth-v2"]
  ].forEach(([number, id, slug]) => {
    const node = numberedNodes[number - 1];
    assert.equal(node.id, id, `No.${number} identity changed`);
    assert.equal(node.sprite.sheet, `images/monsters/singles/${slug}.png`, `No.${number} must use one isolated monster per file`);
    assert.equal(node.sprite.attackSheet, `images/monsters/singles/${slug}-attack.png`, `No.${number} must use an isolated attack pose`);
    assert.equal(node.sprite.size, "contain", `No.${number} must fit inside its frame`);
    assert.equal(node.sprite.poseMatched, true, `No.${number} pose pair must remain verified`);
  });
  [
    [21, "growth-bloom"], [22, "growth-slime"], [44, "bloom-mature"],
    [75, "cosmic-perfect-b"], [88, "rail-perfect-b"], [89, "rail-perfect-a"],
    [96, "glacier-perfect-b"], [102, "samurai-perfect-b"], [109, "gourmet-perfect-b"],
    [121, "bloom-perfect-a"], [128, "bloom-ultimate-2"], [247, "inferno-ultimate-3"]
  ].forEach(([number, id]) => {
    const node = numberedNodes[number - 1];
    const slug = `audited-${id}`;
    assert.equal(node.id, id, `No.${number} identity changed`);
    assert.equal(node.sprite.sheet, `images/monsters/singles/${slug}.png`);
    assert.equal(node.sprite.attackSheet, `images/monsters/singles/${slug}-attack.png`);
    assert.equal(node.sprite.size, "contain");
    assert.equal(node.sprite.position, "center");
    assert.equal(node.sprite.poseMatched, true);
    const base = readFileSync(new URL(`../${node.sprite.sheet}`, import.meta.url));
    const attack = readFileSync(new URL(`../${node.sprite.attackSheet}`, import.meta.url));
    assert.notEqual(Buffer.compare(base, attack), 0, `No.${number} poses must be separate artwork`);
  });
  [
    "glacier-ultimate-1", "candy-ultimate-2", "fossil-perfect-b",
    "dojo-perfect-a", "sonic-perfect-b", "bloom-ultimate-0",
    "bloom-ultimate-1", "bloom-ultimate-3", "slime-ultimate-1"
  ].forEach((id) => {
    const node = result.NODES[id];
    const attackSheet = node.sprite.attackSheet || node.sprite.sheet.replace(/\.png$/i, "-attack.png");
    const base = readFileSync(new URL(`../${node.sprite.sheet}`, import.meta.url));
    const attack = readFileSync(new URL(`../${attackSheet}`, import.meta.url));
    assert.notEqual(Buffer.compare(base, attack), 0, `${id} pose 2 must differ from pose 1`);
  });
  const isolatedStageTwo = new Set(["growth-rail", "growth-bloom", "growth-slime"]);
  Object.values(result.NODES).filter((node) => node.stage === 2).forEach((node) => {
    if (isolatedStageTwo.has(node.id)) {
      assert.equal(node.sprite.size, "contain", "growth-rail must use isolated artwork without the adjacent sprite");
      assert.match(node.sprite.sheet, /images\/monsters\/singles\//);
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

  const finalEvolution = result.evolvePlayerMonsterToFinal(party[1], "victory:blue:24", () => .2, {});
  assert.equal(finalEvolution.monster.stage, 5, "Victory must evolve every winning egg to its highest currently reachable form");
  assert.ok(finalEvolution.steps.length >= 5, "Victory evolution must retain the complete evolution path for presentation and dex updates");
  assert.equal(finalEvolution.rank6Locked, true, "Rank six must still respect its four-monster dex requirement during victory evolution");
  const finalRank6Dex = Object.fromEntries(result.rank6Requirements(finalEvolution.monster.nodeId).map((nodeId) => [nodeId, 1]));
  const rank6FinalEvolution = result.evolvePlayerMonsterToFinal(finalEvolution.monster, "victory:blue:24:rank6", () => .2, finalRank6Dex);
  assert.equal(rank6FinalEvolution.monster.stage, 6, "Victory must continue to rank six when its dex requirement is already unlocked");

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
  const noveltyRolls = [.69, 0];
  const rank4Priority = result.evolvePlayerMonster(
    rank3Source,
    "red:rank4-priority",
    () => noveltyRolls.shift() ?? 0,
    { [rank4Candidates[0]]: 1 }
  );
  assert.equal(rank4Priority.monster.nodeId, rank4Candidates[1], "Evolution through rank four must favor an undiscovered branch on a seventy-percent roll");

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

  const redesignedRank6 = Object.values(result.NODES).filter((node) => node.rank6 && !node.legendary);
  assert.equal(redesignedRank6.length, 32);
  assert.equal(new Set(redesignedRank6.map((node) => node.sprite.sheet)).size, 32, "Every rank-six monster needs its own image file");
  redesignedRank6.forEach((node) => {
    assert.match(node.sprite.sheet, new RegExp(`images/monsters/rank6-singles/${node.lineage}-rank6\\.png$`));
    assert.equal(node.sprite.size, "contain");
    assert.equal(node.sprite.position, "center");
    assert.match(node.sprite.attackSheet, new RegExp(`images/monsters/rank6-singles/${node.lineage}-rank6-attack\\.png$`));
    assert.notEqual(node.sprite.attackSheet, node.sprite.sheet, "Rank-six monsters need a distinct attack pose");
    assert.equal(node.sprite.poseMatched, true);
    assert.ok(existsSync(new URL(`../${node.sprite.attackSheet}`, import.meta.url)), `Missing rank-six attack artwork: ${node.sprite.attackSheet}`);
  });

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
  Object.values(result.NODES).filter((node) => node.sprite.sheet.includes("/pairs/")).forEach((node) => {
    const layout = pairManifest.nodes[node.id];
    assert.ok(layout, `Missing pair manifest layout for ${node.id}`);
    assert.equal(node.sprite.sheet, layout.sheet, `${node.id} must use its generated pair sheet`);
    assert.equal(node.sprite.attackSheet, layout.attackSheet, `${node.id} must use its matching attack sheet`);
    assert.equal(node.sprite.size, layout.count === 1 ? "contain" : "200% 100%", `${node.id} must crop one monster`);
    assert.equal(node.sprite.position, layout.count === 1 ? "center" : `${layout.slot * 100}% 50%`, `${node.id} must use its generated slot`);
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
  assert.match(html, /state\.monsterHatchPending = state\.monsterHatches\.length > 0/);
  assert.match(html, /const node = state\.monsterHatchPending \? MONSTER_NODES\.egg : actualNode/);
  assert.match(html, /effects\.push\("intro", "monster-hatch", "ready"\)/, "Online hatch presentation must be part of the shared start sequence");
  assert.match(html, /function preloadMonsterNodes\(/, "Visible monster pose assets must be warmed before animation");
  assert.ok(existsSync(new URL("../skill-assets/Lickey/castle-tofu-curse.png", import.meta.url)), "Missing tofu-cursed Likecy castle artwork");
  assert.match(html, /function getLickeyTofuCastleTeam\(effects\)[\s\S]*?effects\?\.poopCenter\?\.\[castleTeam\]/, "The tofu and Likecy combo must only follow the cursed castle team");
  assert.match(html, /function applyTofuPoopSkill\([\s\S]*?syncLickeyTofuCastleState\(\)/, "Tofu activation must upgrade an existing Likecy castle");
  assert.match(html, /function applyLickeyHypeSkill\([\s\S]*?syncLickeyTofuCastleState\(\)/, "Likecy activation must detect an existing tofu curse");
  assert.match(html, /isLickeyTofuCastleCell \? "tofuCastle" : "castle"/, "The tofu and Likecy skill combo must use its dedicated castle");
  const helperSource = html.match(/function getLickeyTofuCastleTeam\(effects\) \{[\s\S]*?^    \}/m)?.[0];
  assert.ok(helperSource, "Missing Likecy/tofu castle resolver");
  const resolveCastleTeam = Function(`${helperSource}; return getLickeyTofuCastleTeam;`)();
  assert.equal(resolveCastleTeam({ lickeyCastleTeam: "red", poopCenter: { red: true, blue: false } }), "red");
  assert.equal(resolveCastleTeam({ lickeyCastleTeam: "red", poopCenter: { red: false, blue: true } }), "");
  assert.equal(resolveCastleTeam({ lickeyCastleTeam: "blue", poopCenter: { red: false, blue: true } }), "blue");
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
  assert.match(html, /id="monsterBattleSpeedButton"/);
  assert.match(html, /function battleDelay\(/);
  assert.match(html, /const readBattleElapsed = \(\) =>/);
  assert.match(html, /state\.monsterBattleSpeed === 2/);
  assert.match(html, /type: "monster-battle-speed", masterOnly: true/);
  assert.match(html, /monsterBattleSpeed: getMonsterBattleSpeed\(\)/);
  assert.match(html, /els\.monsterBattleSpeedButton\.disabled = !canControlSpeed/);
  assert.match(html, /id="victoryEvolutionOverlay"/);
  assert.match(html, /function evolveWinningTeamMonstersToFinal\(/);
  assert.match(html, /finalEvolutions/);
  assert.match(html, /const hasFinalMonster = side\.monsters\.some\(\(monster\) => Number\(MONSTER_NODES\[monster\.nodeId\]\?\.stage\) >= 5\)/);
  assert.match(html, /combinedPresentation: !hasFinalMonster/);
  assert.match(html, /function shouldShowVictoryFinalEvolution\(/);
  assert.match(html, /node\.legendary \|\| node\.rank6[\s\S]*?\? 1/);
  assert.match(html, /"fossil-perfect-b": 1\.02/);
  assert.match(html, /--monster-display-boost:\$\{displayBoost\}/);
  assert.match(html, /territoryBattleReplayActive: false/);
  assert.doesNotMatch(html, /openTerritoryBattleReplay\(battle\)[\s\S]{0,500}TeamBingoTerritoryMode\?\.close/);
  assert.match(html, /state\.territoryBattleReplayActive = true/);
  assert.match(html, /if \(state\.territoryBattleReplayActive\)[\s\S]*?startTerritoryBgm\(\)/);
  assert.match(monsterBattleCss, /body\.territory-mode-open \.monster-battle-overlay \{ z-index: 6300; \}/);
  assert.match(html, /id="monsterZoomPreviousButton"/);
  assert.match(html, /id="monsterZoomNextButton"/);
  assert.match(html, /function navigateMonsterZoom\(/);
  assert.match(html, /record\?\.monsterDex\?\.\[item\.id\]/);
  assert.match(monsterBattleCss, /\.monster-zoom-nav[\s\S]*?transform:translate3d\(0,-50%,0\) !important/);
  assert.match(monsterBattleCss, /\.monster-zoom-art\.has-pose-animation \.monster-sprite \{[\s\S]*?transform-origin:50% 50%/);
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
  assert.match(html, /id="adminMonsterBattleShuffle"/);
  assert.match(html, /function showAdminMonsterDex\(/);
  assert.match(html, /function openAdminMonsterBattleLab\(/);
  assert.match(html, /function shuffleAdminMonsterBattleLineup\(/);
  assert.match(html, /ids\.slice\(0, selects\.length\)/);
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

test("generated pair slots and audited singles switch poses without board walking", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const battleCss = readFileSync(new URL("../monster-battle.css", import.meta.url), "utf8");
  const monsterSystem = readFileSync(new URL("../monster-system.js", import.meta.url), "utf8");

  assert.match(html, /hasMonsterPoseAnimation\(node\)/);
  assert.match(html, /matchedMonsterAttackSheet\(node\)/);
  assert.match(html, /monster-pose-animated/);
  assert.doesNotMatch(html, /motionAnimated \? " monster-pose-animated"/);
  assert.match(html, /data-monster-stage=/);
  assert.match(html, /--monster-action-delay:/);
  assert.match(battleCss, /monsterBasePose 11s/);
  assert.match(battleCss, /monsterAttackPose 11s/);
  assert.match(battleCss, /\.monster-player-card\.monster-pose-animated \.monster-portrait-button::before[\s\S]*?animation: none/);
  assert.doesNotMatch(battleCss, /@keyframes monsterZoomSingleMotion/);
  assert.match(battleCss, /@keyframes monsterBasePose/);
  assert.match(battleCss, /@keyframes monsterAttackPose/);
  assert.doesNotMatch(monsterSystem, /rank6-[ab]-v3\.png/);
  assert.doesNotMatch(html, /rank6-[ab]-v3-attack\.png/);
  assert.doesNotMatch(html, /MONSTER_ATTACK_SHEETS/);
  assert.equal((monsterSystem.match(/poseMatched: true/g) || []).length, 25);
  assert.match(monsterSystem, /rank6Sprite\.poseMatched = true/);
  assert.match(battleCss, /\.monster-zoom-art\.has-pose-animation \.monster-sprite \{[\s\S]*?position:absolute !important;[\s\S]*?width:100% !important;/);
  assert.doesNotMatch(battleCss, /stageOneAttackEffect/);
  assert.doesNotMatch(battleCss, /stage-one-animated/);
  assert.doesNotMatch(battleCss, /effects\/physical-v2\.png/);
  assert.match(battleCss, /prefers-reduced-motion: reduce/);

  const singlesUrl = new URL("../images/monsters/singles/", import.meta.url);
  readdirSync(singlesUrl).filter((name) => name.endsWith("-attack.png")).forEach((attackName) => {
    const baseName = attackName.replace(/-attack\.png$/, ".png");
    if (!existsSync(new URL(baseName, singlesUrl))) return;
    const base = readFileSync(new URL(baseName, singlesUrl));
    const attack = readFileSync(new URL(attackName, singlesUrl));
    assert.notEqual(Buffer.compare(base, attack), 0, `${attackName} must differ from ${baseName}`);
  });
});

test("monster encyclopedia switches static poses only through pose buttons", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const battleCss = readFileSync(new URL("../monster-battle.css", import.meta.url), "utf8");

  assert.match(html, /id="monsterZoomPose1Button"[^>]*>ポーズ1</);
  assert.match(html, /id="monsterZoomPose2Button"[^>]*>ポーズ2</);
  assert.doesNotMatch(html, /monsterZoomAnimationButton/);
  assert.match(html, /matchedMonsterAttackSheet/);
  assert.match(html, /monsterAttackSpriteMarkup\(node\)/);
  assert.match(html, /has-pose-animation/);
  assert.match(html, /function selectMonsterZoomPose\(pose\)/);
  assert.match(html, /classList\.toggle\("show-pose-2"/);
  assert.match(html, /selectMonsterZoomPose\(1\)/);
  assert.match(html, /selectMonsterZoomPose\(2\)/);
  assert.match(html, /document\.addEventListener\("keydown", onMonsterZoomKeydown\)/);
  assert.match(html, /function onMonsterZoomKeydown\(event\)[\s\S]*event\.key === "ArrowLeft"[\s\S]*navigateMonsterZoom\(-1\)[\s\S]*event\.key === "ArrowRight"[\s\S]*navigateMonsterZoom\(1\)/);
  assert.match(html, /id="monsterZoomNumber"/);
  assert.match(html, /els\.monsterZoomNumber\.textContent = `No\.\$\{String\(Math\.max\(0, dexNumber\)\)\.padStart\(3, "0"\)\}`/);
  [
    "growth-bloom", "growth-slime", "bloom-mature", "cosmic-perfect-b",
    "rail-perfect-b", "rail-perfect-a", "glacier-perfect-b", "samurai-perfect-b",
    "gourmet-perfect-b", "bloom-perfect-a", "bloom-ultimate-2", "inferno-ultimate-3"
  ].forEach((id) => {
    assert.match(html, new RegExp(`"${id}": 1`), `${id} must use neutral display scale`);
  });
  [
    ["rail-mature", "base: 1.92, attack: 1.92"],
    ["cosmic-perfect-b", "base: 1.4, attack: 1.4"],
    ["rail-perfect-b", "base: 1.5"],
    ["rail-perfect-a", "base: 1.5"],
    ["festival-perfect-a", "attack: 1.9"],
    ["samurai-perfect-b", "base: 1.5"],
    ["gourmet-perfect-b", "base: 1.5"],
    ["dune-perfect-a", "base: 1.52, attack: 1.52"]
  ].forEach(([id, scale]) => {
    assert.match(html, new RegExp(`"${id}": Object\\.freeze\\(\\{ ${scale.replaceAll(".", "\\.")} \\}\\)`));
  });
  assert.match(html, /function monsterSpriteMarkup\(node, extraClass = "", viewportPadding = 0, pose = 1\)/);
  assert.match(html, /MONSTER_POSE_DISPLAY_BOOST_OVERRIDES\[node\.id\]\?\.\[poseKey\]/);
  assert.match(html, /"monster-sprite-attack", 0, 2/);
  assert.doesNotMatch(battleCss, /@keyframes monsterZoomSingleMotion/);
  assert.match(battleCss, /\.monster-zoom-card[\s\S]*width: min\(1680px, 98vw\)/);
  assert.match(battleCss, /\.monster-zoom-art\.has-pose-animation\.show-pose-2 \.monster-sprite-attack/);
  assert.doesNotMatch(battleCss, /\.monster-zoom-art\.animation-paused/);
  assert.doesNotMatch(battleCss, /\.monster-zoom-art\.has-pose-animation \.monster-sprite-base \{\s*animation:/);
});

test("every monster pose is alpha-fitted to the same framed baseline", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const battleCss = readFileSync(new URL("../monster-battle.css", import.meta.url), "utf8");
  const poseBoundsSource = readFileSync(new URL("../monster-pose-bounds.js", import.meta.url), "utf8");
  const monsterSystemSource = readFileSync(new URL("../monster-system.js", import.meta.url), "utf8");
  const context = {};
  context.window = context;
  context.globalThis = context;
  new Function("window", "globalThis", `${monsterSystemSource}\n${poseBoundsSource}`)(context, context);
  const nodes = Object.values(context.TeamBingoMonsterSystem.NODES);
  const bounds = context.TeamBingoMonsterPoseBounds;

  assert.equal(Object.keys(bounds).length, nodes.length);
  nodes.forEach((node) => {
    assert.equal(bounds[node.id]?.base?.length, 4, `${node.id} base pose must have fitted bounds`);
    if (node.sprite.attackSheet || node.sprite.sheet.includes("/pairs/")) {
      assert.equal(bounds[node.id]?.attack?.length, 4, `${node.id} attack pose must have fitted bounds`);
    }
  });
  assert.match(html, /<script src="monster-pose-bounds\.js"><\/script>/);
  assert.match(html, /function monsterPoseViewBox\(bounds, defaultWidth, extraPadding = 0\)/);
  assert.match(html, /const poseBounds = window\.TeamBingoMonsterPoseBounds\?\.\[node\.id\]\?\.\[poseKey\]/);
  assert.match(battleCss, /\.monster-player-card\.monster-pose-animated \.monster-sprite-attack \{[\s\S]*?inset: 0;/);
  assert.doesNotMatch(battleCss, /\.monster-player-card\.monster-pose-animated \.monster-sprite-attack \{[\s\S]*?inset: -2%/);
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
