(function bootstrapTerritorySystem(global) {
  "use strict";

  const VERSION = 1;
  const MAP_RADIUS = 4;
  const TICK_MINUTES = 10;
  const TICK_MS = TICK_MINUTES * 60 * 1000;
  const SEASON_DAYS = 7;
  const MAX_BATTLES = 120;
  const MAX_LOGS = 180;
  const MAX_SQUAD_COST = 15;
  const JST_OFFSET = 9 * 60 * 60 * 1000;

  const PLAYERS = Object.freeze([
    { id: "tofu", name: "おいしいとうふ", color: "#f4efe1", accent: "#92c36e", home: [4, 0], ai: "trick", skill: "豆腐領域", aggression: .92, center: .96, defense: 1.02 },
    { id: "eda", name: "えだ", color: "#e33c50", accent: "#3b8cff", home: [0, 4], ai: "balance", skill: "三刃布陣", aggression: 1, center: 1, defense: 1 },
    { id: "jan", name: "ジャン", color: "#ffd229", accent: "#fff08a", home: [-4, 4], ai: "chaos", skill: "盤面改変", aggression: 1.07, center: 1.08, defense: .93 },
    { id: "rima", name: "リーマ", color: "#ff6c37", accent: "#a9f24f", home: [-4, 0], ai: "rush", skill: "遠隔制圧", aggression: 1.14, center: .94, defense: .9 },
    { id: "kento", name: "Kento", color: "#9d5cff", accent: "#e6c8ff", home: [0, -4], ai: "arcane", skill: "紫界配信", aggression: .98, center: 1.12, defense: 1.01 },
    { id: "lickey", name: "Lickey", color: "#34b9ff", accent: "#f4c54c", home: [4, -4], ai: "fortress", skill: "王国城塞", aggression: .88, center: 1.03, defense: 1.16 }
  ]);

  const PLAYER_BY_ID = Object.freeze(Object.fromEntries(PLAYERS.map((player) => [player.id, player])));
  const DIRECTIONS = Object.freeze([[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]);
  const TERRAINS = Object.freeze([
    { id: "fire", name: "火山", mark: "炎" },
    { id: "water", name: "水域", mark: "水" },
    { id: "earth", name: "岩地", mark: "地" },
    { id: "wind", name: "風原", mark: "風" },
    { id: "lightning", name: "雷野", mark: "雷" },
    { id: "light", name: "聖域", mark: "光" },
    { id: "dark", name: "闇域", mark: "闇" }
  ]);
  const TERRAIN_BY_ID = Object.freeze(Object.fromEntries(TERRAINS.map((terrain) => [terrain.id, terrain])));
  const STARTER_IDS = Object.freeze([
    "inferno-growth", "thunder-growth", "mecha-growth", "beetle-growth",
    "grove-growth", "spore-growth", "abyss-growth", "cosmic-growth"
  ]);
  const STARTER_NEIGHBORS = Object.freeze({
    tofu: [3, 0],
    eda: [0, 3],
    jan: [-3, 3],
    rima: [-3, 0],
    kento: [0, -3],
    lickey: [3, -3]
  });

  function monsterSystem() {
    return global.TeamBingoMonsterSystem || null;
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function hashText(value) {
    let hash = 2166136261;
    for (const char of String(value || "")) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    const system = monsterSystem();
    if (system?.seededRandom) return system.seededRandom(seed);
    let value = Number(seed) >>> 0 || 1;
    return () => {
      value += 0x6D2B79F5;
      let mixed = value;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  function playerKey(name) {
    const system = monsterSystem();
    return system?.playerKey ? system.playerKey(name) : String(name || "").trim().toLocaleLowerCase("ja-JP");
  }

  function tileId(q, r) {
    return `${Number(q)},${Number(r)}`;
  }

  function parseTileId(id) {
    const [q, r] = String(id || "").split(",").map(Number);
    return { q: Number.isFinite(q) ? q : 0, r: Number.isFinite(r) ? r : 0 };
  }

  function isInsideMap(q, r) {
    return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= MAP_RADIUS;
  }

  function neighbors(id) {
    const { q, r } = parseTileId(id);
    return DIRECTIONS
      .map(([dq, dr]) => tileId(q + dq, r + dr))
      .filter((nextId) => {
        const next = parseTileId(nextId);
        return isInsideMap(next.q, next.r);
      });
  }

  function axialDistance(a, b = { q: 0, r: 0 }) {
    const first = typeof a === "string" ? parseTileId(a) : a;
    const second = typeof b === "string" ? parseTileId(b) : b;
    return Math.max(
      Math.abs(first.q - second.q),
      Math.abs(first.r - second.r),
      Math.abs((first.q + first.r) - (second.q + second.r))
    );
  }

  function seasonWindow(now = Date.now()) {
    const jst = new Date(Number(now) + JST_OFFSET);
    const day = jst.getUTCDay();
    const sinceMonday = (day + 6) % 7;
    const startJst = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - sinceMonday);
    const startsAt = startJst - JST_OFFSET;
    const endsAt = startsAt + SEASON_DAYS * 24 * 60 * 60 * 1000;
    const startDate = new Date(startsAt + JST_OFFSET);
    const id = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, "0")}-${String(startDate.getUTCDate()).padStart(2, "0")}`;
    return { id, startsAt, endsAt };
  }

  function terrainFor(q, r) {
    const index = hashText(`${q}:${r}:six-crown`) % TERRAINS.length;
    return TERRAINS[index];
  }

  function specialTileKind(q, r) {
    if (q === 0 && r === 0) return "throne";
    if (axialDistance({ q, r }) === 2 && ((q === 0) || (r === 0) || (q + r === 0))) return "outpost";
    return "normal";
  }

  function createMap() {
    const tiles = {};
    for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q += 1) {
      for (let r = -MAP_RADIUS; r <= MAP_RADIUS; r += 1) {
        if (!isInsideMap(q, r)) continue;
        const id = tileId(q, r);
        const terrain = terrainFor(q, r);
        const kind = specialTileKind(q, r);
        tiles[id] = {
          id, q, r,
          terrain: terrain.id,
          kind,
          value: kind === "throne" ? 3 : (kind === "outpost" ? 2 : 1),
          ownerId: "",
          control: 0,
          baseFor: ""
        };
      }
    }
    PLAYERS.forEach((player) => {
      const homeId = tileId(player.home[0], player.home[1]);
      const starter = STARTER_NEIGHBORS[player.id];
      const starterId = tileId(starter[0], starter[1]);
      Object.assign(tiles[homeId], { ownerId: player.id, control: 100, baseFor: player.id, kind: "base", value: 0 });
      Object.assign(tiles[starterId], { ownerId: player.id, control: 100 });
    });
    return tiles;
  }

  function emptyPlayerState(player) {
    return {
      id: player.id,
      name: player.name,
      color: player.color,
      points: 0,
      captures: 0,
      battles: 0,
      wins: 0,
      losses: 0,
      defenses: 0,
      defenseWins: 0,
      longestWinStreak: 0,
      winStreak: 0,
      skillUses: 0,
      lastSkillTick: -1,
      lastRosterDay: "",
      squads: [],
      championCount: 0
    };
  }

  function resolvePlayerRecord(playerStats, player) {
    const records = playerStats?.players || {};
    const direct = records[playerKey(player.name)];
    if (direct) return direct;
    return Object.values(records).find((record) => playerKey(record?.name) === playerKey(player.name)) || { name: player.name };
  }

  function nodeCost(node) {
    if (node?.legendary) return 7;
    return Math.max(1, Math.min(6, Number(node?.stage) || 1));
  }

  function combatPower(nodeId, masteryXp = 0) {
    const system = monsterSystem();
    if (!system?.NODES?.[nodeId]) return 1;
    const stats = system.applyMasteryStats(system.combatStats(nodeId), masteryXp);
    return Math.round(
      stats.hp * .18 +
      stats.attack * .82 +
      stats.magic * .82 +
      stats.defense * .58 +
      stats.magicDefense * .58 +
      stats.speed * .66
    );
  }

  function candidateMonsters(record, player, rosterSeed) {
    const system = monsterSystem();
    if (!system?.NODES) return [];
    const unlocked = Object.keys(record?.monsterDex || {}).filter((id) => Number(record.monsterDex[id]) > 0 && system.NODES[id] && id !== "egg");
    const ids = unlocked.length >= 6
      ? unlocked
      : Array.from(new Set([
          ...unlocked,
          ...STARTER_IDS.filter((id) => system.NODES[id]),
          ...Object.values(system.NODES).filter((node) => node.stage === 2 && !node.legendary).map((node) => node.id)
        ]));
    return ids.map((nodeId) => {
      const node = system.NODES[nodeId];
      const masteryXp = Number(record?.monsterMastery?.[nodeId]) || 0;
      const role = system.combatRole(nodeId);
      const element = system.combatElement(nodeId);
      const basePower = combatPower(nodeId, masteryXp);
      const jitter = (hashText(`${rosterSeed}:${player.id}:${nodeId}`) % 1000) / 1000;
      return {
        nodeId,
        name: node.name,
        stage: node.stage,
        legendary: Boolean(node.legendary),
        rank6: Boolean(node.rank6),
        masteryXp,
        role: role.id,
        element: element.id,
        power: basePower,
        cost: nodeCost(node),
        score: basePower + masteryXp * .06 + jitter * Math.max(5, basePower * .025)
      };
    }).sort((a, b) => b.score - a.score || a.nodeId.localeCompare(b.nodeId));
  }

  function buildSquad(candidates, used, player, squadIndex) {
    const roles = squadIndex === 0 ? ["guardian", "striker", "support"] : ["striker", "mystic", "speedster"];
    const lineup = [];
    let cost = 0;
    for (let slot = 0; slot < 3; slot += 1) {
      const desiredRole = roles[slot];
      const options = candidates
        .filter((candidate) => !used.has(candidate.nodeId))
        .filter((candidate) => cost + candidate.cost <= MAX_SQUAD_COST)
        .filter((candidate) => !candidate.legendary || !lineup.some((item) => item.legendary))
        .filter((candidate) => !candidate.rank6 || !lineup.some((item) => item.rank6))
        .map((candidate) => ({
          candidate,
          value: candidate.score * (candidate.role === desiredRole ? 1.11 : 1) *
            (player.ai === "arcane" && candidate.role === "mystic" ? 1.08 : 1) *
            (player.ai === "fortress" && candidate.role === "guardian" ? 1.09 : 1) *
            (player.ai === "rush" && ["striker", "speedster"].includes(candidate.role) ? 1.08 : 1)
        }))
        .sort((a, b) => b.value - a.value);
      const selected = options[0]?.candidate;
      if (!selected) break;
      lineup.push(clone(selected));
      used.add(selected.nodeId);
      cost += selected.cost;
    }
    return {
      id: `${player.id}-${squadIndex + 1}`,
      name: squadIndex === 0 ? "第一部隊" : "第二部隊",
      cost,
      fatigue: 0,
      wins: 0,
      losses: 0,
      lineup
    };
  }

  function rosterDay(now) {
    return new Date(Number(now) + JST_OFFSET).toISOString().slice(0, 10);
  }

  function refreshPlayerSquads(state, playerStats, player, now, force = false) {
    const playerState = state.players[player.id] || emptyPlayerState(player);
    const day = rosterDay(now);
    if (!force && playerState.lastRosterDay === day && playerState.squads?.length === 2) return playerState;
    const record = resolvePlayerRecord(playerStats, player);
    const candidates = candidateMonsters(record, player, `${state.season.id}:${day}`);
    const used = new Set();
    playerState.squads = [
      buildSquad(candidates, used, player, 0),
      buildSquad(candidates, used, player, 1)
    ];
    playerState.lastRosterDay = day;
    state.players[player.id] = playerState;
    return playerState;
  }

  function refreshAllSquads(state, playerStats, now, force = false) {
    PLAYERS.forEach((player) => refreshPlayerSquads(state, playerStats, player, now, force));
    return state;
  }

  function createInitialState(playerStats = {}, now = Date.now()) {
    const season = seasonWindow(now);
    const tickStart = Math.floor(Number(now) / TICK_MS) * TICK_MS;
    const state = {
      version: VERSION,
      revision: 0,
      season: {
        ...season,
        status: "active",
        tick: 0,
        lastTickAt: tickStart,
        nextTickAt: tickStart + TICK_MS,
        championId: ""
      },
      tiles: createMap(),
      players: Object.fromEntries(PLAYERS.map((player) => [player.id, emptyPlayerState(player)])),
      battles: [],
      logs: [{
        id: `season-${season.id}`,
        tick: 0,
        at: Number(now),
        type: "season",
        text: `六王領土戦 ${season.id} 開幕`
      }],
      updatedAt: Number(now)
    };
    return refreshAllSquads(state, playerStats, now, true);
  }

  function normalizeState(raw, playerStats = {}, now = Date.now()) {
    const expectedSeason = seasonWindow(now);
    if (!raw || Number(raw.version) !== VERSION || raw.season?.id !== expectedSeason.id) {
      return createInitialState(playerStats, now);
    }
    const state = clone(raw);
    state.tiles ||= createMap();
    state.players ||= {};
    PLAYERS.forEach((player) => {
      state.players[player.id] = { ...emptyPlayerState(player), ...(state.players[player.id] || {}) };
      state.players[player.id].squads = Array.isArray(state.players[player.id].squads) ? state.players[player.id].squads : [];
    });
    state.battles = Array.isArray(state.battles) ? state.battles.slice(-MAX_BATTLES) : [];
    state.logs = Array.isArray(state.logs) ? state.logs.slice(-MAX_LOGS) : [];
    state.season.nextTickAt = Number(state.season.nextTickAt) || (Number(state.season.lastTickAt) || Number(now)) + TICK_MS;
    return refreshAllSquads(state, playerStats, now);
  }

  function ownedTiles(state, playerId) {
    return Object.values(state.tiles || {}).filter((tile) => tile.ownerId === playerId);
  }

  function territoryCounts(state) {
    const counts = Object.fromEntries(PLAYERS.map((player) => [player.id, 0]));
    Object.values(state.tiles || {}).forEach((tile) => {
      if (counts[tile.ownerId] !== undefined) counts[tile.ownerId] += 1;
    });
    return counts;
  }

  function squadTerrainPower(squad, terrainId, player) {
    const lineup = squad?.lineup || [];
    if (!lineup.length) return 1;
    const base = lineup.reduce((sum, monster) => sum + (Number(monster.power) || 1), 0);
    const matches = lineup.filter((monster) => monster.element === terrainId).length;
    const roleBonus = new Set(lineup.map((monster) => monster.role)).size >= 3 ? 1.06 : 1;
    const terrainBonus = matches ? 1.1 + Math.max(0, matches - 1) * .025 : 1;
    const fatigue = Math.max(.72, 1 - (Number(squad.fatigue) || 0) * .025);
    return base * roleBonus * terrainBonus * fatigue * (player?.ai === "arcane" && matches ? 1.03 : 1);
  }

  function chooseSquad(playerState, terrainId, player) {
    return [...(playerState?.squads || [])]
      .map((squad) => ({ squad, power: squadTerrainPower(squad, terrainId, player) }))
      .sort((a, b) => b.power - a.power)[0]?.squad || null;
  }

  function targetCandidates(state, player, counts, random) {
    const targets = new Map();
    ownedTiles(state, player.id).forEach((tile) => {
      neighbors(tile.id).forEach((targetId) => {
        const target = state.tiles[targetId];
        if (!target || target.ownerId === player.id || target.baseFor) return;
        const currentOwnerCount = target.ownerId ? counts[target.ownerId] || 0 : 0;
        const ownCount = counts[player.id] || 0;
        let score = target.ownerId ? 22 : 31;
        score += target.value * 12;
        if (target.kind === "throne") score += 38 * player.center;
        if (target.kind === "outpost") score += 14;
        if (target.ownerId && currentOwnerCount > ownCount) score += 7;
        if (player.ai === "rush" && target.ownerId) score += 13;
        if (player.ai === "fortress" && axialDistance(target, { q: player.home[0], r: player.home[1] }) > 3) score -= 9;
        if (player.ai === "chaos") score += random() * 20;
        else score += random() * 8;
        const previous = targets.get(targetId);
        if (!previous || score > previous.score) targets.set(targetId, { tile: target, score, fromId: tile.id });
      });
    });
    return [...targets.values()].sort((a, b) => b.score - a.score);
  }

  function skillAvailable(playerState, tick) {
    return Number(tick) - (Number(playerState.lastSkillTick) || -1000) >= Math.round(24 * 60 / TICK_MINUTES);
  }

  function shouldUseSkill(player, playerState, target, counts, tick, random) {
    if (!skillAvailable(playerState, tick)) return false;
    const ownCount = counts[player.id] || 0;
    const leaderCount = Math.max(...Object.values(counts));
    const urgent = target.kind === "throne" || (target.ownerId && leaderCount - ownCount >= 6);
    return urgent || random() < .025;
  }

  function skillMultiplier(player, attack) {
    if (!attack.skill) return 1;
    return {
      tofu: 1.09,
      eda: 1.12,
      jan: 1.14,
      rima: 1.13,
      kento: 1.12,
      lickey: attack.mode === "defense" ? 1.17 : 1.08
    }[player.id] || 1.1;
  }

  function createActions(state, random) {
    const counts = territoryCounts(state);
    const actions = [];
    PLAYERS.forEach((player) => {
      const playerState = state.players[player.id];
      const candidate = targetCandidates(state, player, counts, random)[0];
      if (!candidate) return;
      const squad = chooseSquad(playerState, candidate.tile.terrain, player);
      if (!squad?.lineup?.length) return;
      const skill = shouldUseSkill(player, playerState, candidate.tile, counts, state.season.tick, random);
      actions.push({
        id: `${state.season.id}-${state.season.tick}-${player.id}`,
        playerId: player.id,
        targetId: candidate.tile.id,
        fromId: candidate.fromId,
        squadId: squad.id,
        lineup: squad.lineup.map((monster) => monster.nodeId),
        skill,
        mode: "attack"
      });
      if (skill) {
        playerState.lastSkillTick = state.season.tick;
        playerState.skillUses += 1;
      }
    });
    return actions;
  }

  function battleSide(state, playerId, target, action, random, defense = false) {
    const player = PLAYER_BY_ID[playerId];
    const playerState = state.players[playerId];
    const squad = action
      ? playerState.squads.find((item) => item.id === action.squadId)
      : chooseSquad(playerState, target.terrain, player);
    if (!squad) return null;
    const basePower = squadTerrainPower(squad, target.terrain, player);
    const defenseBonus = defense ? player.defense * 1.08 : player.aggression;
    const specialBonus = skillMultiplier(player, { ...action, mode: defense ? "defense" : "attack" });
    const comeback = Math.max(0, 5 - ownedTiles(state, playerId).length) * .018;
    const noise = .9 + random() * .2;
    return {
      playerId,
      playerName: player.name,
      squadId: squad.id,
      lineup: squad.lineup.map((monster) => monster.nodeId),
      skill: Boolean(action?.skill),
      power: Math.round(basePower * defenseBonus * specialBonus * (1 + comeback) * noise),
      rawPower: Math.round(basePower)
    };
  }

  function pushLog(state, entry) {
    state.logs.push(entry);
    state.logs = state.logs.slice(-MAX_LOGS);
  }

  function pushBattle(state, battle) {
    state.battles.push(battle);
    state.battles = state.battles.slice(-MAX_BATTLES);
  }

  function applyCapture(state, tile, winnerId, previousOwnerId, at) {
    if (!winnerId || tile.baseFor) return false;
    const changed = tile.ownerId !== winnerId;
    tile.ownerId = winnerId;
    tile.control = changed ? 60 : Math.min(100, (Number(tile.control) || 60) + 10);
    tile.capturedAt = at;
    if (changed) state.players[winnerId].captures += 1;
    if (previousOwnerId && previousOwnerId !== winnerId) tile.previousOwnerId = previousOwnerId;
    return changed;
  }

  function resolveTarget(state, targetId, actions, at, random) {
    const tile = state.tiles[targetId];
    if (!tile || !actions.length) return;
    const previousOwnerId = tile.ownerId;
    if (!previousOwnerId && actions.length === 1) {
      const action = actions[0];
      applyCapture(state, tile, action.playerId, "", at);
      const player = PLAYER_BY_ID[action.playerId];
      pushLog(state, {
        id: `${action.id}-expand`,
        tick: state.season.tick,
        at,
        type: "capture",
        playerId: action.playerId,
        tileId: targetId,
        text: `${player.name}が${TERRAIN_BY_ID[tile.terrain].name}へ進出`
      });
      return;
    }

    const sides = actions
      .map((action) => battleSide(state, action.playerId, tile, action, random, false))
      .filter(Boolean);
    if (previousOwnerId && !actions.some((action) => action.playerId === previousOwnerId)) {
      const defender = battleSide(state, previousOwnerId, tile, null, random, true);
      if (defender) sides.push(defender);
    }
    if (sides.length < 2) return;
    sides.sort((a, b) => b.power - a.power || a.playerId.localeCompare(b.playerId));
    const winner = sides[0];
    const runnerUp = sides[1];
    const winnerState = state.players[winner.playerId];
    winnerState.battles += 1;
    winnerState.wins += 1;
    winnerState.winStreak += 1;
    winnerState.longestWinStreak = Math.max(winnerState.longestWinStreak, winnerState.winStreak);
    const winnerSquad = winnerState.squads.find((squad) => squad.id === winner.squadId);
    if (winnerSquad) {
      winnerSquad.wins += 1;
      winnerSquad.fatigue = Math.min(10, (Number(winnerSquad.fatigue) || 0) + 1);
    }
    sides.slice(1).forEach((side) => {
      const loserState = state.players[side.playerId];
      loserState.battles += 1;
      loserState.losses += 1;
      loserState.winStreak = 0;
      if (side.playerId === previousOwnerId) loserState.defenses += 1;
      const squad = loserState.squads.find((item) => item.id === side.squadId);
      if (squad) {
        squad.losses += 1;
        squad.fatigue = Math.min(10, (Number(squad.fatigue) || 0) + 2);
      }
    });
    if (winner.playerId === previousOwnerId) {
      winnerState.defenses += 1;
      winnerState.defenseWins += 1;
    }
    const captured = applyCapture(state, tile, winner.playerId, previousOwnerId, at);
    const seed = hashText(`${state.season.id}:${state.season.tick}:${targetId}:${sides.map((side) => side.playerId).join(":")}`);
    const battle = {
      id: `frontier-${state.season.id}-${state.season.tick}-${targetId.replace(",", "_")}`,
      tick: state.season.tick,
      at,
      tileId: targetId,
      terrain: tile.terrain,
      kind: tile.kind,
      seed,
      winnerId: winner.playerId,
      captured,
      sides: sides.map((side) => ({
        playerId: side.playerId,
        playerName: side.playerName,
        lineup: side.lineup,
        power: side.power,
        skill: side.skill
      })),
      replay: {
        red: { playerId: winner.playerId, name: winner.playerName, lineup: winner.lineup },
        blue: { playerId: runnerUp.playerId, name: runnerUp.playerName, lineup: runnerUp.lineup },
        winner: "red"
      }
    };
    pushBattle(state, battle);
    pushLog(state, {
      id: battle.id,
      tick: state.season.tick,
      at,
      type: captured ? "capture" : "defense",
      playerId: winner.playerId,
      opponentId: runnerUp.playerId,
      tileId: targetId,
      battleId: battle.id,
      text: captured
        ? `${winner.playerName}が${runnerUp.playerName}を破り領地を占領`
        : `${winner.playerName}が${runnerUp.playerName}の侵攻を防衛`
    });
  }

  function recoverFatigue(state) {
    PLAYERS.forEach((player) => {
      state.players[player.id].squads.forEach((squad) => {
        squad.fatigue = Math.max(0, (Number(squad.fatigue) || 0) - .35);
      });
    });
  }

  function awardTerritoryPoints(state) {
    PLAYERS.forEach((player) => {
      const gain = ownedTiles(state, player.id).reduce((sum, tile) => sum + (Number(tile.value) || 0), 0);
      state.players[player.id].points += gain;
    });
  }

  function runTick(state, playerStats, at) {
    const seed = hashText(`${state.season.id}:${state.season.tick + 1}`);
    const random = seededRandom(seed);
    state.season.tick += 1;
    refreshAllSquads(state, playerStats, at);
    recoverFatigue(state);
    const actions = createActions(state, random);
    const byTarget = actions.reduce((map, action) => {
      if (!map[action.targetId]) map[action.targetId] = [];
      map[action.targetId].push(action);
      return map;
    }, {});
    Object.keys(byTarget).sort().forEach((targetId) => resolveTarget(state, targetId, byTarget[targetId], at, random));
    awardTerritoryPoints(state);
    state.season.lastTickAt = at;
    state.season.nextTickAt = at + TICK_MS;
    state.updatedAt = at;
    state.revision = (Number(state.revision) || 0) + 1;
    return state;
  }

  function standings(state) {
    const counts = territoryCounts(state);
    return PLAYERS.map((player) => {
      const record = state.players?.[player.id] || emptyPlayerState(player);
      return {
        ...player,
        ...record,
        territoryCount: counts[player.id] || 0,
        score: (Number(record.points) || 0) + (Number(record.wins) || 0) * 2 + (Number(record.defenseWins) || 0)
      };
    }).sort((a, b) => b.score - a.score || b.territoryCount - a.territoryCount || b.wins - a.wins || a.name.localeCompare(b.name, "ja-JP"));
  }

  function finalizeSeason(state, at) {
    if (state.season.status === "complete") return state;
    const winner = standings(state)[0];
    state.season.status = "complete";
    state.season.championId = winner?.id || "";
    state.season.completedAt = at;
    if (winner && state.players[winner.id]) state.players[winner.id].championCount += 1;
    pushLog(state, {
      id: `champion-${state.season.id}`,
      tick: state.season.tick,
      at,
      type: "champion",
      playerId: winner?.id || "",
      text: `${winner?.name || "六王"}が六王領土戦を制覇`
    });
    return state;
  }

  function advanceState(raw, playerStats = {}, now = Date.now(), options = {}) {
    const state = normalizeState(raw, playerStats, now);
    const maxTicks = Math.max(1, Math.min(1000, Number(options.maxTicks) || 144));
    let processed = 0;
    while (state.season.status === "active" && state.season.nextTickAt <= Number(now) && processed < maxTicks) {
      runTick(state, playerStats, state.season.nextTickAt);
      processed += 1;
      if (state.season.lastTickAt >= state.season.endsAt) finalizeSeason(state, state.season.lastTickAt);
    }
    if (Number(now) >= state.season.endsAt) finalizeSeason(state, Number(now));
    return { state, processed, caughtUp: state.season.nextTickAt > Number(now) || state.season.status === "complete" };
  }

  function tileSummary(state, id) {
    const tile = state?.tiles?.[id];
    if (!tile) return null;
    const owner = PLAYER_BY_ID[tile.ownerId] || null;
    return {
      ...tile,
      terrainName: TERRAIN_BY_ID[tile.terrain]?.name || tile.terrain,
      ownerName: owner?.name || "中立",
      ownerColor: owner?.color || "#657083"
    };
  }

  global.TeamBingoTerritorySystem = Object.freeze({
    VERSION, MAP_RADIUS, TICK_MINUTES, TICK_MS, SEASON_DAYS, PLAYERS, PLAYER_BY_ID, TERRAINS, TERRAIN_BY_ID,
    tileId, parseTileId, neighbors, axialDistance, seasonWindow, createMap, createInitialState, normalizeState,
    refreshAllSquads, advanceState, standings, territoryCounts, tileSummary, combatPower, playerKey, hashText
  });
})(typeof window !== "undefined" ? window : globalThis);
