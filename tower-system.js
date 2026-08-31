(function bootstrapMonsterTowerSystem(global) {
  "use strict";

  const VERSION = 1;
  const MAX_FLOOR = 100;
  const PHASES_PER_FLOOR = 10;
  const PARTY_SIZE = 5;
  const PHASE_MS = 60 * 1000;
  const RECOVERY_MS = 60 * 60 * 1000;
  const CHECKPOINT_INTERVAL = 10;
  const MAX_LOG = 160;
  const MAX_REWARDS = 500;

  const PLAYERS = Object.freeze([
    { id: "tofu", name: "おいしいとうふ", color: "#e8e5dc" },
    { id: "eda", name: "えだ", color: "#e54152" },
    { id: "jan", name: "ジャン", color: "#ffd32a" },
    { id: "rima", name: "リーマ", color: "#ff7139" },
    { id: "kento", name: "Kento", color: "#9f61ff" },
    { id: "lickey", name: "Lickey", color: "#35baff" }
  ]);

  const BOSS_DOMAINS = Object.freeze([
    { id: "bronze", name: "青銅", element: "earth", colors: ["#d9a441", "#5c301e"] },
    { id: "forest", name: "翠森", element: "wind", colors: ["#70d45c", "#174b2b"] },
    { id: "ocean", name: "蒼海", element: "water", colors: ["#41c7e8", "#123d79"] },
    { id: "flame", name: "紅蓮", element: "fire", colors: ["#ff6a2a", "#7d1010"] },
    { id: "thunder", name: "雷天", element: "lightning", colors: ["#ffe14b", "#5140b8"] },
    { id: "glacier", name: "氷晶", element: "ice", colors: ["#bff6ff", "#387fc4"] },
    { id: "nether", name: "幽冥", element: "dark", colors: ["#bd66ff", "#26143d"] },
    { id: "cosmos", name: "星界", element: "light", colors: ["#ffed91", "#4856b7"] },
    { id: "divine", name: "神域", element: "light", colors: ["#fff4c4", "#b58a2b"] },
    { id: "apex", name: "天獄", element: "dark", colors: ["#ff496d", "#190a24"] }
  ]);

  const BOSS_FORMS = Object.freeze([
    { id: "wolf", name: "牙狼", form: "beast" },
    { id: "bird", name: "魔鳥", form: "wing" },
    { id: "crab", name: "巨蟹", form: "armor" },
    { id: "dragon", name: "騎竜", form: "dragon" },
    { id: "fox", name: "霊狐", form: "beast" },
    { id: "ogre", name: "鋼鬼", form: "giant" },
    { id: "serpent", name: "蛇王", form: "serpent" },
    { id: "chimera", name: "幻獣", form: "chimera" },
    { id: "guardian", name: "守護神", form: "guardian" },
    { id: "emperor", name: "覇王", form: "emperor" }
  ]);

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function hashText(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let value = hashText(seed) || 1;
    return () => {
      value += 0x6D2B79F5;
      let mixed = value;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  function playerKey(name) {
    return String(name || "").trim().toLocaleLowerCase("ja-JP").replace(/\s+/g, "");
  }

  function monsterSystem() { return global.TeamBingoMonsterSystem; }
  function equipmentSystem() { return global.TeamBingoTerritoryEquipment; }

  function bossForFloor(floorValue) {
    const floor = Math.max(1, Math.min(MAX_FLOOR, Math.floor(Number(floorValue) || 1)));
    const domain = BOSS_DOMAINS[Math.floor((floor - 1) / 10)];
    const form = BOSS_FORMS[(floor - 1) % 10];
    return {
      id: `tower-boss-${String(floor).padStart(3, "0")}`,
      floor,
      name: `${domain.name}${form.name}・${String(floor).padStart(3, "0")}`,
      domain: domain.id,
      form: form.form,
      element: domain.element,
      colors: domain.colors,
      sprite: `images/tower/bosses/boss-${String(floor).padStart(3, "0")}.svg`
    };
  }

  function enemyPower(floorValue, phaseValue) {
    const floor = Math.max(1, Math.min(MAX_FLOOR, Number(floorValue) || 1));
    const phase = Math.max(1, Math.min(PHASES_PER_FLOOR, Number(phaseValue) || 1));
    const floorPower = 600 + floor * 22 + floor * floor * .06;
    const phaseMultiplier = phase === PHASES_PER_FLOOR ? 1.22 : .79 + phase * .021;
    return Math.round(floorPower * phaseMultiplier);
  }

  function regularEnemy(floorValue, phaseValue) {
    const system = monsterSystem();
    const floor = Math.max(1, Math.min(MAX_FLOOR, Math.floor(Number(floorValue) || 1)));
    const phase = Math.max(1, Math.min(9, Math.floor(Number(phaseValue) || 1)));
    const targetStage = floor < 8 ? 1 : floor < 18 ? 2 : floor < 30 ? 3 : floor < 48 ? 4 : floor < 78 ? 5 : 6;
    let nodes = Object.values(system?.NODES || {}).filter((node) => Number(node.stage) === targetStage && node.id !== "egg");
    if (!nodes.length) nodes = Object.values(system?.NODES || {}).filter((node) => node.id !== "egg");
    nodes.sort((a, b) => a.id.localeCompare(b.id));
    const node = nodes[hashText(`tower:${floor}:${phase}`) % Math.max(1, nodes.length)] || system?.NODES?.egg;
    return {
      id: node?.id || "egg",
      name: node?.name || "塔の番兵",
      nodeId: node?.id || "egg",
      element: system?.combatElement?.(node?.id)?.id || "earth",
      boss: false,
      power: enemyPower(floor, phase)
    };
  }

  function enemyFor(floor, phase) {
    if (Number(phase) === PHASES_PER_FLOOR) return { ...bossForFloor(floor), boss: true, power: enemyPower(floor, phase) };
    return regularEnemy(floor, phase);
  }

  function combatStats(nodeId, masteryXp = 0, equipment = {}) {
    const system = monsterSystem();
    const equipmentApi = equipmentSystem();
    const base = system?.applyMasteryStats?.(system.combatStats(nodeId), masteryXp) || system?.combatStats?.(nodeId) || {};
    return equipmentApi?.applyEquipmentStats?.(base, equipment, nodeId) || base;
  }

  function combatPower(nodeId, masteryXp = 0, equipment = {}) {
    const stats = combatStats(nodeId, masteryXp, equipment);
    return Math.max(1, Math.round(
      (Number(stats.hp) || 0) * .18 +
      Math.max(Number(stats.attack) || 0, Number(stats.magic) || 0) * .9 +
      (Number(stats.defense) || 0) * .52 +
      (Number(stats.magicDefense) || 0) * .52 +
      (Number(stats.speed) || 0) * .62
    ));
  }

  function playerRecord(playerStats, player) {
    return playerStats?.players?.[playerKey(player.name)] || {};
  }

  function rosterFor(record = {}) {
    const system = monsterSystem();
    const unlocked = Object.keys(record.monsterDex || {}).filter((id) => Number(record.monsterDex[id]) > 0 && system?.NODES?.[id] && id !== "egg");
    const candidates = unlocked.map((nodeId) => {
      const masteryXp = Math.max(0, Number(record.monsterMastery?.[nodeId]) || 0);
      return { nodeId, masteryXp, score: combatPower(nodeId, masteryXp), equipment: {} };
    });
    const assignments = equipmentSystem()?.autoAssign?.(candidates, record) || {};
    return candidates.map((candidate) => {
      const equipment = equipmentSystem()?.normalizeLoadout?.(assignments[candidate.nodeId]) || {};
      return { ...candidate, equipment, score: combatPower(candidate.nodeId, candidate.masteryXp, equipment) };
    }).sort((a, b) => b.score - a.score || a.nodeId.localeCompare(b.nodeId));
  }

  function cleanResting(resting = {}, now = Date.now()) {
    return Object.fromEntries(Object.entries(resting || {}).filter(([, until]) => Number(until) > Number(now)));
  }

  function partyMember(candidate, slot) {
    const system = monsterSystem();
    const nodeId = candidate?.nodeId || "egg";
    const masteryXp = Math.max(0, Number(candidate?.masteryXp) || 0);
    const equipment = equipmentSystem()?.normalizeLoadout?.(candidate?.equipment) || {};
    const stats = combatStats(nodeId, masteryXp, equipment);
    return {
      slot,
      nodeId,
      name: system?.NODES?.[nodeId]?.name || "ふしぎタマゴ",
      masteryXp,
      equipment,
      maxHp: Math.max(1, Number(stats.hp) || 1),
      hp: Math.max(1, Number(stats.hp) || 1),
      power: combatPower(nodeId, masteryXp, equipment)
    };
  }

  function selectParty(playerState, record, now = Date.now()) {
    playerState.resting = cleanResting(playerState.resting, now);
    const resting = new Set(Object.keys(playerState.resting));
    const selected = rosterFor(record).filter((candidate) => !resting.has(candidate.nodeId)).slice(0, PARTY_SIZE);
    while (selected.length < PARTY_SIZE) selected.push({ nodeId: "egg", masteryXp: 0, equipment: {}, score: 1 });
    playerState.party = selected.map(partyMember);
    playerState.partySerial = (Number(playerState.partySerial) || 0) + 1;
    playerState.waitingUntil = 0;
    return playerState.party;
  }

  function createPlayerState(player, playerStats, now) {
    const state = {
      id: player.id,
      name: player.name,
      color: player.color,
      floor: 1,
      phase: 1,
      checkpointFloor: 1,
      bestFloor: 1,
      clears: 0,
      losses: 0,
      partySerial: 0,
      party: [],
      resting: {},
      waitingUntil: 0,
      status: "climbing",
      lastEvent: null,
      updatedAt: now
    };
    selectParty(state, playerRecord(playerStats, player), now);
    return state;
  }

  function createInitialState(playerStats = { players: {} }, now = Date.now()) {
    const timestamp = Number(now) || Date.now();
    return {
      version: VERSION,
      revision: 0,
      players: Object.fromEntries(PLAYERS.map((player) => [player.id, createPlayerState(player, playerStats, timestamp)])),
      rewardQueue: {},
      log: {},
      lastTickAt: timestamp,
      nextTickAt: timestamp + PHASE_MS,
      updatedAt: timestamp
    };
  }

  function normalizeState(value, playerStats = { players: {} }, now = Date.now()) {
    if (!value || Number(value.version) !== VERSION) return createInitialState(playerStats, now);
    const state = clone(value);
    state.players ||= {};
    PLAYERS.forEach((player) => {
      let current = state.players[player.id];
      if (!current) {
        state.players[player.id] = createPlayerState(player, playerStats, now);
        return;
      }
      current.id = player.id;
      current.name = player.name;
      current.color = player.color;
      current.floor = Math.max(1, Math.min(MAX_FLOOR, Math.floor(Number(current.floor) || 1)));
      current.phase = Math.max(1, Math.min(PHASES_PER_FLOOR, Math.floor(Number(current.phase) || 1)));
      current.checkpointFloor = Math.max(1, Math.min(MAX_FLOOR, Math.floor(Number(current.checkpointFloor) || 1)));
      current.bestFloor = Math.max(current.floor, Number(current.bestFloor) || 1);
      current.resting = cleanResting(current.resting, now);
      current.party = Array.isArray(current.party) ? current.party.slice(0, PARTY_SIZE) : [];
      const record = playerRecord(playerStats, player);
      const hasUnlockedMonsters = Object.entries(record.monsterDex || {}).some(([nodeId, count]) => nodeId !== "egg" && Number(count) > 0);
      const hasOnlyEggs = current.party.length > 0 && current.party.every((member) => !member?.nodeId || member.nodeId === "egg");
      if (current.party.length !== PARTY_SIZE || (hasOnlyEggs && hasUnlockedMonsters)) selectParty(current, record, now);
      current.party = current.party.map((member, slot) => {
        const normalized = partyMember(member, slot);
        normalized.hp = Math.max(0, Math.min(normalized.maxHp, Number(member?.hp) || 0));
        return normalized;
      });
      current.updatedAt = Number(current.updatedAt) || Number(now);
    });
    state.rewardQueue ||= {};
    state.log ||= {};
    state.lastTickAt = Number(state.lastTickAt) || Number(now);
    state.nextTickAt = Number(state.nextTickAt) || state.lastTickAt + PHASE_MS;
    state.updatedAt = Number(state.updatedAt) || Number(now);
    return state;
  }

  function trimObject(source, limit, timeField = "createdAt") {
    return Object.fromEntries(Object.entries(source || {}).sort(([, a], [, b]) => (Number(b?.[timeField]) || 0) - (Number(a?.[timeField]) || 0)).slice(0, limit));
  }

  function addLog(state, player, type, message, now, extra = {}) {
    const id = `${now}-${player.id}-${state.revision}-${type}`;
    const entry = { id, playerId: player.id, type, message, createdAt: Number(now), ...extra };
    state.log[id] = entry;
    state.log = trimObject(state.log, MAX_LOG);
    player.lastEvent = entry;
  }

  function queueMastery(state, player, amount, now) {
    const nodeIds = [...new Set((player.party || []).map((member) => member.nodeId).filter((id) => id && id !== "egg"))];
    if (!nodeIds.length) return;
    const id = `tower:${player.id}:${now}:${player.floor}:${player.phase}:${player.partySerial}`;
    state.rewardQueue[id] = {
      id,
      playerId: player.id,
      playerName: player.name,
      mastery: Object.fromEntries(nodeIds.map((nodeId) => [nodeId, Math.max(1, Math.round(amount))])),
      createdAt: Number(now)
    };
    state.rewardQueue = trimObject(state.rewardQueue, MAX_REWARDS);
  }

  function partyPower(player) {
    return Math.round((player.party || []).reduce((sum, member) => {
      const healthRatio = member.maxHp ? Math.max(.15, member.hp / member.maxHp) : .15;
      return sum + (Number(member.power) || 1) * (.72 + healthRatio * .28);
    }, 0));
  }

  function damageParty(player, enemy, cleared, random) {
    const strength = Math.max(.25, partyPower(player) / Math.max(1, enemy.power));
    const base = cleared ? .045 + .055 / strength : .18 + .14 / strength;
    player.party.forEach((member, index) => {
      const spread = .82 + random() * .36 + index * .012;
      const damage = Math.round(member.maxHp * Math.min(.62, base * spread));
      member.hp = Math.max(0, member.hp - damage);
    });
  }

  function isDefeated(player) {
    const living = player.party.filter((member) => member.hp > 0);
    const hpRatio = player.party.reduce((sum, member) => sum + member.hp, 0) / Math.max(1, player.party.reduce((sum, member) => sum + member.maxHp, 0));
    return living.length < 2 || hpRatio < .12;
  }

  function loseRun(state, player, record, now) {
    player.losses = (Number(player.losses) || 0) + 1;
    player.party.forEach((member) => { if (member.nodeId !== "egg") player.resting[member.nodeId] = Number(now) + RECOVERY_MS; });
    const defeated = player.party.map((member) => member.nodeId);
    player.floor = player.checkpointFloor;
    player.phase = 1;
    selectParty(player, record, now);
    const nonEgg = player.party.filter((member) => member.nodeId !== "egg");
    if (!nonEgg.length) {
      const until = Math.min(...Object.values(player.resting).map(Number));
      player.waitingUntil = Number.isFinite(until) ? until : Number(now) + PHASE_MS;
      player.status = "resting";
    } else player.status = "climbing";
    addLog(state, player, "defeat", `${player.checkpointFloor}Fから別部隊が再出撃`, now, { defeated });
  }

  function clearPhase(state, player, enemy, now) {
    const experience = 3 + Math.floor(player.floor / 8) + (enemy.boss ? 10 : 0);
    queueMastery(state, player, experience, now);
    if (player.phase < PHASES_PER_FLOOR) {
      player.phase += 1;
      addLog(state, player, "phase", `${player.floor}F PHASE ${player.phase - 1} 突破`, now, { floor: player.floor, phase: player.phase - 1 });
      return;
    }
    player.clears = (Number(player.clears) || 0) + 1;
    player.party.forEach((member) => { member.hp = Math.min(member.maxHp, member.hp + Math.round(member.maxHp * .5)); });
    const clearedFloor = player.floor;
    if (clearedFloor >= MAX_FLOOR) {
      player.status = "complete";
      player.phase = PHASES_PER_FLOOR;
      player.bestFloor = MAX_FLOOR;
      addLog(state, player, "complete", "100F 完全踏破！", now, { floor: MAX_FLOOR });
      return;
    }
    player.floor += 1;
    player.phase = 1;
    player.bestFloor = Math.max(Number(player.bestFloor) || 1, player.floor);
    if (clearedFloor % CHECKPOINT_INTERVAL === 0) player.checkpointFloor = player.floor;
    addLog(state, player, "floor", `${clearedFloor}F 制圧`, now, { floor: clearedFloor, checkpoint: clearedFloor % CHECKPOINT_INTERVAL === 0 });
  }

  function processPlayer(state, player, record, now) {
    if (player.status === "complete") return;
    if (player.status === "resting") {
      if (Number(player.waitingUntil) > Number(now)) return;
      selectParty(player, record, now);
      player.status = "climbing";
    }
    const enemy = enemyFor(player.floor, player.phase);
    const power = partyPower(player);
    const ratio = power / Math.max(1, enemy.power);
    const random = seededRandom(`${player.id}:${now}:${player.floor}:${player.phase}:${player.partySerial}`);
    const clearChance = Math.max(.04, Math.min(.985, .42 + (ratio - .72) * 1.25));
    const cleared = ratio >= 1.08 || random() < clearChance;
    damageParty(player, enemy, cleared, random);
    if (isDefeated(player)) {
      queueMastery(state, player, Math.max(1, Math.floor(player.floor / 12)), now);
      loseRun(state, player, record, now);
      return;
    }
    if (cleared) clearPhase(state, player, enemy, now);
    else addLog(state, player, "hold", `${player.floor}F PHASE ${player.phase} 攻防継続`, now, { floor: player.floor, phase: player.phase });
    player.updatedAt = Number(now);
  }

  function advanceState(value, playerStats = { players: {} }, now = Date.now(), options = {}) {
    const state = normalizeState(value, playerStats, now);
    const maximum = Math.max(1, Math.min(10080, Number(options.maxTicks) || 1440));
    let cursor = Number(state.nextTickAt) || Number(now) + PHASE_MS;
    let processed = 0;
    while (cursor <= Number(now) && processed < maximum) {
      PLAYERS.forEach((player) => processPlayer(state, state.players[player.id], playerRecord(playerStats, player), cursor));
      state.lastTickAt = cursor;
      cursor += PHASE_MS;
      state.revision = (Number(state.revision) || 0) + 1;
      processed += 1;
    }
    state.nextTickAt = cursor;
    state.updatedAt = Number(now);
    return { state, processed, caughtUp: cursor > Number(now) };
  }

  function standings(state) {
    return PLAYERS.map((player) => {
      const current = state?.players?.[player.id] || {};
      return { ...player, floor: Number(current.floor) || 1, phase: Number(current.phase) || 1, bestFloor: Number(current.bestFloor) || 1, status: current.status || "climbing", clears: Number(current.clears) || 0, losses: Number(current.losses) || 0 };
    }).sort((a, b) => b.bestFloor - a.bestFloor || b.floor - a.floor || b.phase - a.phase || a.name.localeCompare(b.name, "ja-JP"));
  }

  global.TeamBingoMonsterTowerSystem = Object.freeze({
    VERSION, MAX_FLOOR, PHASES_PER_FLOOR, PARTY_SIZE, PHASE_MS, RECOVERY_MS, CHECKPOINT_INTERVAL,
    PLAYERS, BOSS_DOMAINS, BOSS_FORMS, clone, hashText, playerKey, bossForFloor, enemyFor, enemyPower,
    combatStats, combatPower, rosterFor, partyPower, createInitialState, normalizeState, advanceState, standings
  });
})(typeof window !== "undefined" ? window : globalThis);
