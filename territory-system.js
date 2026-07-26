(function bootstrapTerritorySystem(global) {
  "use strict";

  const VERSION = 3;
  const MAP_RADIUS = 4;
  const TICK_MINUTES = 10;
  const TICK_MS = TICK_MINUTES * 60 * 1000;
  const SEASON_DAYS = 7;
  const MAX_BATTLES = 120;
  const MAX_LOGS = 180;
  const PARTY_SIZE = 3;
  const DEFAULT_HYPE = 20;
  const EVENT_REROLL_TICKS = 6;
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
  const TILE_EVENTS = Object.freeze([
    {
      id: "tailwind",
      name: "追い風回廊",
      icon: "疾",
      benefit: "侵攻側の戦力 +12%",
      drawback: "守備側の戦力 -6%",
      attackMultiplier: 1.12,
      defenseMultiplier: .94,
      winnerHype: 8,
      loserHype: -3,
      captureHype: 4,
      pointMultiplier: 1
    },
    {
      id: "iron-mist",
      name: "鉄壁の霧",
      icon: "盾",
      benefit: "守備側の戦力 +14%",
      drawback: "侵攻側の戦力 -8%",
      attackMultiplier: .92,
      defenseMultiplier: 1.14,
      winnerHype: 5,
      loserHype: -4,
      captureHype: 3,
      pointMultiplier: 1
    },
    {
      id: "comeback-altar",
      name: "逆境の祭壇",
      icon: "逆",
      benefit: "領地数が少ない王ほど最大18%強化",
      drawback: "首位の王は戦力 -7%",
      attackMultiplier: 1,
      defenseMultiplier: 1,
      underdogMultiplier: 1.18,
      leaderMultiplier: .93,
      winnerHype: 10,
      loserHype: 5,
      captureHype: 6,
      pointMultiplier: 1
    },
    {
      id: "hype-voltage",
      name: "熱狂ボルテージ",
      icon: "熱",
      benefit: "勝者のHYPE +15",
      drawback: "敗者のHYPE -10",
      attackMultiplier: 1.03,
      defenseMultiplier: 1.03,
      winnerHype: 15,
      loserHype: -10,
      captureHype: 5,
      pointMultiplier: 1
    },
    {
      id: "silent-valley",
      name: "静寂の谷",
      icon: "静",
      benefit: "守備側はHYPEを維持しやすい",
      drawback: "全PTの戦力 -8%・勝者HYPE -2",
      attackMultiplier: .92,
      defenseMultiplier: .98,
      winnerHype: -2,
      loserHype: -8,
      captureHype: 0,
      pointMultiplier: 1
    },
    {
      id: "gold-vein",
      name: "黄金鉱脈",
      icon: "金",
      benefit: "領地ポイント +50%・占領HYPE +8",
      drawback: "守備側の戦力 -5%",
      attackMultiplier: 1,
      defenseMultiplier: .95,
      winnerHype: 5,
      loserHype: -2,
      captureHype: 8,
      pointMultiplier: 1.5
    },
    {
      id: "chaos-field",
      name: "混沌磁場",
      icon: "乱",
      benefit: "劣勢側にも大逆転の一撃",
      drawback: "戦力の振れ幅が大きい",
      attackMultiplier: 1,
      defenseMultiplier: 1,
      noiseMin: .76,
      noiseMax: 1.24,
      winnerHype: 12,
      loserHype: 6,
      captureHype: 4,
      pointMultiplier: 1
    },
    {
      id: "healing-spring",
      name: "再起の泉",
      icon: "泉",
      benefit: "敗者もHYPE +8",
      drawback: "侵攻側の戦力 -3%",
      attackMultiplier: .97,
      defenseMultiplier: 1.06,
      winnerHype: 6,
      loserHype: 8,
      captureHype: 2,
      pointMultiplier: 1
    }
  ]);
  const TILE_EVENT_BY_ID = Object.freeze(Object.fromEntries(TILE_EVENTS.map((event) => [event.id, event])));
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
      partySerial: 0,
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
    return unlocked.map((nodeId) => {
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

  function eggMonster() {
    const system = monsterSystem();
    const node = system?.NODES?.egg;
    const role = system?.combatRole?.("egg");
    const element = system?.combatElement?.("egg");
    return {
      nodeId: "egg",
      name: node?.name || "たまご",
      stage: Number(node?.stage) || 0,
      legendary: false,
      rank6: false,
      masteryXp: 0,
      role: role?.id || "support",
      element: element?.id || "neutral",
      power: combatPower("egg", 0),
      cost: 0,
      score: 0
    };
  }

  function buildSquad(candidates, used, player, squadIndex) {
    const roles = squadIndex === 0 ? ["guardian", "striker", "support"] : ["striker", "mystic", "speedster"];
    const lineup = [];
    for (let slot = 0; slot < PARTY_SIZE; slot += 1) {
      const desiredRole = roles[slot];
      const options = candidates
        .filter((candidate) => !used.has(candidate.nodeId))
        .map((candidate) => ({
          candidate,
          value: candidate.score * (candidate.role === desiredRole ? 1.11 : 1) *
            (player.ai === "arcane" && candidate.role === "mystic" ? 1.08 : 1) *
            (player.ai === "fortress" && candidate.role === "guardian" ? 1.09 : 1) *
            (player.ai === "rush" && ["striker", "speedster"].includes(candidate.role) ? 1.08 : 1)
        }))
        .sort((a, b) => b.value - a.value);
      const selected = options[0]?.candidate;
      if (!selected) {
        lineup.push(eggMonster());
        continue;
      }
      lineup.push(clone(selected));
      used.add(selected.nodeId);
    }
    return {
      id: `${player.id}-${squadIndex + 1}`,
      name: squadIndex === 0 ? "第一部隊" : "第二部隊",
      cost: lineup.reduce((sum, member) => sum + (Number(member.cost) || 0), 0),
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

  function clampHype(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  }

  function eventCycleForTick(tick) {
    return Math.floor(Math.max(0, Number(tick) || 0) / EVENT_REROLL_TICKS);
  }

  function eventForTile(state, tile, cycle = eventCycleForTick(state?.season?.tick)) {
    const index = hashText(`${state?.season?.id || "season"}:${cycle}:${tile.id}:event`) % TILE_EVENTS.length;
    return TILE_EVENTS[index];
  }

  function assignTileEvents(state, cycle = eventCycleForTick(state?.season?.tick), force = false) {
    Object.values(state.tiles || {}).forEach((tile) => {
      if (!force && Number(tile.eventCycle) === cycle && TILE_EVENT_BY_ID[tile.eventId]) return;
      const event = eventForTile(state, tile, cycle);
      tile.eventId = event.id;
      tile.eventCycle = cycle;
    });
    state.eventCycle = cycle;
    return state;
  }

  function assignedMonsterIds(state, playerId) {
    const assigned = new Set();
    Object.values(state?.tiles || {}).forEach((tile) => {
      const party = tile?.garrison;
      if (!party || party.ownerId !== playerId) return;
      (party.lineup || []).forEach((member) => {
        if (member?.nodeId && member.nodeId !== "egg") assigned.add(member.nodeId);
      });
    });
    return assigned;
  }

  function buildPartyLineup(record, player, seed, unavailable = new Set()) {
    const candidates = candidateMonsters(record, player, seed)
      .filter((candidate) => !unavailable.has(candidate.nodeId))
      .map((candidate) => ({
        ...candidate,
        partyScore: candidate.score * (.9 + (hashText(`${seed}:${candidate.nodeId}:party`) % 210) / 1000)
      }))
      .sort((a, b) => b.partyScore - a.partyScore || a.nodeId.localeCompare(b.nodeId));
    const lineup = candidates.slice(0, PARTY_SIZE).map((candidate) => {
      const member = clone(candidate);
      delete member.partyScore;
      return member;
    });
    while (lineup.length < PARTY_SIZE) lineup.push(eggMonster());
    return lineup;
  }

  function createGarrison(state, playerStats, playerId, tileId, now = Date.now(), reason = "auto") {
    const player = PLAYER_BY_ID[playerId];
    if (!player) return null;
    const playerState = state.players[playerId] || emptyPlayerState(player);
    const serial = (Number(playerState.partySerial) || 0) + 1;
    playerState.partySerial = serial;
    state.players[playerId] = playerState;
    const record = resolvePlayerRecord(playerStats, player);
    const seed = `${state.season.id}:${state.season.tick}:${playerId}:${tileId}:${serial}`;
    const unavailable = assignedMonsterIds(state, playerId);
    return {
      id: `${playerId}-${state.season.id}-${serial}`,
      ownerId: playerId,
      tileId,
      createdAt: Number(now),
      reason,
      hype: DEFAULT_HYPE,
      fatigue: 0,
      wins: 0,
      losses: 0,
      lineup: buildPartyLineup(record, player, seed, unavailable)
    };
  }

  function normalizeGarrison(state, playerStats, tile, now = Date.now()) {
    if (!tile.ownerId || !PLAYER_BY_ID[tile.ownerId]) {
      tile.garrison = null;
      return null;
    }
    const current = tile.garrison;
    if (!current || current.ownerId !== tile.ownerId || !Array.isArray(current.lineup)) {
      tile.garrison = createGarrison(state, playerStats, tile.ownerId, tile.id, now, "territory-assignment");
      return tile.garrison;
    }
    current.tileId = tile.id;
    current.hype = Number.isFinite(Number(current.hype)) ? clampHype(current.hype) : DEFAULT_HYPE;
    current.fatigue = Math.max(0, Number(current.fatigue) || 0);
    current.wins = Math.max(0, Number(current.wins) || 0);
    current.losses = Math.max(0, Number(current.losses) || 0);
    current.lineup = current.lineup
      .filter((member) => member?.nodeId && monsterSystem()?.NODES?.[member.nodeId])
      .slice(0, PARTY_SIZE)
      .map((member) => clone(member));
    while (current.lineup.length < PARTY_SIZE) current.lineup.push(eggMonster());
    return current;
  }

  function ensureTileGarrisons(state, playerStats, now = Date.now()) {
    Object.values(state.tiles || {})
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((tile) => normalizeGarrison(state, playerStats, tile, now));
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
    refreshAllSquads(state, playerStats, now, true);
    assignTileEvents(state, 0, true);
    ensureTileGarrisons(state, playerStats, now);
    return state;
  }

  function normalizeState(raw, playerStats = {}, now = Date.now()) {
    const expectedSeason = seasonWindow(now);
    const sourceVersion = Number(raw?.version);
    if (!raw || ![1, 2, VERSION].includes(sourceVersion) || raw.season?.id !== expectedSeason.id) {
      return createInitialState(playerStats, now);
    }
    const state = clone(raw);
    state.version = VERSION;
    state.tiles ||= createMap();
    state.players ||= {};
    PLAYERS.forEach((player) => {
      state.players[player.id] = { ...emptyPlayerState(player), ...(state.players[player.id] || {}) };
      state.players[player.id].squads = Array.isArray(state.players[player.id].squads) ? state.players[player.id].squads : [];
    });
    if (sourceVersion !== VERSION) {
      Object.values(state.tiles).forEach((tile) => {
        tile.garrison = null;
      });
      PLAYERS.forEach((player) => {
        state.players[player.id].partySerial = 0;
      });
    }
    state.battles = Array.isArray(state.battles) ? state.battles.slice(-MAX_BATTLES) : [];
    state.logs = Array.isArray(state.logs) ? state.logs.slice(-MAX_LOGS) : [];
    state.season.nextTickAt = Number(state.season.nextTickAt) || (Number(state.season.lastTickAt) || Number(now)) + TICK_MS;
    refreshAllSquads(state, playerStats, now, sourceVersion !== VERSION);
    assignTileEvents(state, eventCycleForTick(state.season.tick));
    ensureTileGarrisons(state, playerStats, now);
    return state;
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

  function partyTerrainPower(party, terrainId, player, event = null, mode = "attack", counts = {}) {
    const lineup = party?.lineup || [];
    if (!lineup.length) return 1;
    const base = lineup.reduce((sum, monster) => sum + (Number(monster.power) || 1), 0);
    const matches = lineup.filter((monster) => monster.element === terrainId).length;
    const roleBonus = new Set(lineup.map((monster) => monster.role)).size >= 3 ? 1.06 : 1;
    const terrainBonus = matches ? 1.1 + Math.max(0, matches - 1) * .025 : 1;
    const fatigue = Math.max(.72, 1 - (Number(party?.fatigue) || 0) * .025);
    const hype = clampHype(Number.isFinite(Number(party?.hype)) ? party.hype : DEFAULT_HYPE);
    const hypeMultiplier = Math.max(.88, Math.min(1.12, 1 + (hype - DEFAULT_HYPE) * .0015));
    const territoryValues = Object.values(counts).filter((value) => Number.isFinite(Number(value)));
    const ownCount = Number(counts[player?.id]) || 0;
    const minimum = territoryValues.length ? Math.min(...territoryValues) : ownCount;
    const maximum = territoryValues.length ? Math.max(...territoryValues) : ownCount;
    const comebackMultiplier = event?.underdogMultiplier && ownCount === minimum
      ? event.underdogMultiplier
      : 1;
    const leaderMultiplier = event?.leaderMultiplier && ownCount === maximum && maximum > minimum
      ? event.leaderMultiplier
      : 1;
    const eventMultiplier = mode === "defense"
      ? Number(event?.defenseMultiplier) || 1
      : Number(event?.attackMultiplier) || 1;
    return base * roleBonus * terrainBonus * fatigue * hypeMultiplier * eventMultiplier *
      comebackMultiplier * leaderMultiplier * (player?.ai === "arcane" && matches ? 1.03 : 1);
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
        const event = TILE_EVENT_BY_ID[target.eventId];
        if (event) {
          score += ((Number(event.attackMultiplier) || 1) - (Number(event.defenseMultiplier) || 1)) * 30;
          if (event.underdogMultiplier && ownCount === Math.min(...Object.values(counts))) score += 18;
          if ((Number(event.pointMultiplier) || 1) > 1) score += 8;
        }
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
      const sourceTile = state.tiles[candidate.fromId];
      const party = sourceTile?.garrison;
      if (!party?.lineup?.length || party.ownerId !== player.id) return;
      const skill = shouldUseSkill(player, playerState, candidate.tile, counts, state.season.tick, random);
      actions.push({
        id: `${state.season.id}-${state.season.tick}-${player.id}`,
        playerId: player.id,
        targetId: candidate.tile.id,
        fromId: candidate.fromId,
        partyId: party.id,
        party: clone(party),
        lineup: party.lineup.map((monster) => monster.nodeId),
        hype: clampHype(party.hype),
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

  function battleSide(state, playerId, target, action, random, defense = false, counts = {}) {
    const player = PLAYER_BY_ID[playerId];
    const sourceParty = action ? state.tiles?.[action.fromId]?.garrison : null;
    const party = action
      ? (sourceParty?.id === action.partyId ? sourceParty : action.party)
      : target.garrison;
    if (!party?.lineup?.length || party.ownerId !== playerId) return null;
    const event = TILE_EVENT_BY_ID[target.eventId] || eventForTile(state, target);
    const basePower = partyTerrainPower(
      party,
      target.terrain,
      player,
      event,
      defense ? "defense" : "attack",
      counts
    );
    const defenseBonus = defense ? player.defense * 1.08 : player.aggression;
    const specialBonus = skillMultiplier(player, { ...action, mode: defense ? "defense" : "attack" });
    const comeback = Math.max(0, 5 - ownedTiles(state, playerId).length) * .018;
    const noiseMin = Number(event.noiseMin) || .9;
    const noiseMax = Number(event.noiseMax) || 1.1;
    const noise = noiseMin + random() * Math.max(0, noiseMax - noiseMin);
    return {
      playerId,
      playerName: player.name,
      partyId: party.id,
      sourceTileId: action?.fromId || target.id,
      party,
      lineup: party.lineup.map((monster) => monster.nodeId),
      hype: clampHype(party.hype),
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

  function adjustPartyHype(party, delta) {
    if (!party) return DEFAULT_HYPE;
    party.hype = clampHype((Number.isFinite(Number(party.hype)) ? Number(party.hype) : DEFAULT_HYPE) + (Number(delta) || 0));
    return party.hype;
  }

  function currentPartyHype(party) {
    return Number.isFinite(Number(party?.hype)) ? clampHype(party.hype) : DEFAULT_HYPE;
  }

  function replenishSourceTile(state, playerStats, sourceTileId, playerId, movedPartyId, at) {
    const source = state.tiles?.[sourceTileId];
    if (!source || source.ownerId !== playerId || source.garrison?.id !== movedPartyId) return null;
    source.garrison = createGarrison(state, playerStats, playerId, source.id, at, "post-invasion-reinforcement");
    return source.garrison;
  }

  function movePartyIntoTile(state, playerStats, tile, side, at) {
    const source = state.tiles?.[side.sourceTileId];
    const party = source?.garrison?.id === side.partyId
      ? source.garrison
      : clone(side.party);
    if (!party) return { movedParty: null, replacementParty: null };
    party.ownerId = side.playerId;
    party.tileId = tile.id;
    party.movedAt = Number(at);
    party.reason = "successful-invasion";
    tile.garrison = party;
    const replacementParty = replenishSourceTile(
      state,
      playerStats,
      side.sourceTileId,
      side.playerId,
      side.partyId,
      at
    );
    return { movedParty: party, replacementParty };
  }

  function applyEventHype(event, winner, sides, captured) {
    const winnerDelta = (Number(event?.winnerHype) || 0) + (captured ? Number(event?.captureHype) || 0 : 0);
    const changes = [{
      playerId: winner.playerId,
      partyId: winner.partyId,
      before: currentPartyHype(winner.party),
      delta: winnerDelta
    }];
    adjustPartyHype(winner.party, winnerDelta);
    sides.filter((side) => side !== winner).forEach((side) => {
      const before = currentPartyHype(side.party);
      const delta = Number(event?.loserHype) || 0;
      adjustPartyHype(side.party, delta);
      changes.push({ playerId: side.playerId, partyId: side.partyId, before, delta });
    });
    changes.forEach((change) => {
      const side = sides.find((item) => item.partyId === change.partyId);
      change.after = clampHype(side?.party?.hype);
    });
    return changes;
  }

  function resolveTarget(state, targetId, actions, playerStats, at, random) {
    const tile = state.tiles[targetId];
    if (!tile || !actions.length) return;
    const previousOwnerId = tile.ownerId;
    const counts = territoryCounts(state);
    const event = TILE_EVENT_BY_ID[tile.eventId] || eventForTile(state, tile);
    if (!previousOwnerId && actions.length === 1) {
      const action = actions[0];
      const side = battleSide(state, action.playerId, tile, action, random, false, counts);
      if (!side) return;
      const captured = applyCapture(state, tile, action.playerId, "", at);
      const hypeChanges = applyEventHype(event, side, [side], captured);
      const movement = movePartyIntoTile(state, playerStats, tile, side, at);
      const player = PLAYER_BY_ID[action.playerId];
      pushLog(state, {
        id: `${action.id}-expand`,
        tick: state.season.tick,
        at,
        type: "capture",
        playerId: action.playerId,
        tileId: targetId,
        eventId: event.id,
        partyId: movement.movedParty?.id || side.partyId,
        replacementPartyId: movement.replacementParty?.id || "",
        hypeChanges,
        text: `${player.name}が${TERRAIN_BY_ID[tile.terrain].name}へ進出 / ${event.name}`
      });
      return;
    }

    const sides = actions
      .map((action) => battleSide(state, action.playerId, tile, action, random, false, counts))
      .filter(Boolean);
    if (previousOwnerId && !actions.some((action) => action.playerId === previousOwnerId)) {
      const defender = battleSide(state, previousOwnerId, tile, null, random, true, counts);
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
    if (winner.party) {
      winner.party.wins = (Number(winner.party.wins) || 0) + 1;
      winner.party.fatigue = Math.min(10, (Number(winner.party.fatigue) || 0) + 1);
    }
    sides.slice(1).forEach((side) => {
      const loserState = state.players[side.playerId];
      loserState.battles += 1;
      loserState.losses += 1;
      loserState.winStreak = 0;
      if (side.playerId === previousOwnerId) loserState.defenses += 1;
      if (side.party) {
        side.party.losses = (Number(side.party.losses) || 0) + 1;
        side.party.fatigue = Math.min(10, (Number(side.party.fatigue) || 0) + 2);
      }
    });
    if (winner.playerId === previousOwnerId) {
      winnerState.defenses += 1;
      winnerState.defenseWins += 1;
    }
    const captured = applyCapture(state, tile, winner.playerId, previousOwnerId, at);
    const hypeChanges = applyEventHype(event, winner, sides, captured);
    const movement = captured && winner.sourceTileId !== tile.id
      ? movePartyIntoTile(state, playerStats, tile, winner, at)
      : { movedParty: tile.garrison, replacementParty: null };
    if (!captured && winner.playerId === previousOwnerId) tile.garrison = winner.party;
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
      event: {
        id: event.id,
        name: event.name,
        benefit: event.benefit,
        drawback: event.drawback
      },
      movedPartyId: movement.movedParty?.id || "",
      sourceReplacementPartyId: movement.replacementParty?.id || "",
      hypeChanges,
      sides: sides.map((side) => ({
        playerId: side.playerId,
        playerName: side.playerName,
        partyId: side.partyId,
        sourceTileId: side.sourceTileId,
        lineup: side.lineup,
        power: side.power,
        hype: side.hype,
        hypeAfter: clampHype(side.party?.hype),
        skill: side.skill
      })),
      replay: {
        red: { playerId: winner.playerId, name: winner.playerName, lineup: winner.lineup, hype: winner.hype },
        blue: { playerId: runnerUp.playerId, name: runnerUp.playerName, lineup: runnerUp.lineup, hype: runnerUp.hype },
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
      eventId: event.id,
      hypeChanges,
      text: captured
        ? `${winner.playerName}が${runnerUp.playerName}を破り領地を占領 / ${event.name}`
        : `${winner.playerName}が${runnerUp.playerName}の侵攻を防衛 / ${event.name}`
    });
  }

  function recoverFatigue(state) {
    Object.values(state.tiles || {}).forEach((tile) => {
      if (tile.garrison) {
        tile.garrison.fatigue = Math.max(0, (Number(tile.garrison.fatigue) || 0) - .35);
      }
    });
  }

  function awardTerritoryPoints(state) {
    PLAYERS.forEach((player) => {
      const gain = ownedTiles(state, player.id).reduce((sum, tile) => {
        const event = TILE_EVENT_BY_ID[tile.eventId];
        return sum + (Number(tile.value) || 0) * (Number(event?.pointMultiplier) || 1);
      }, 0);
      state.players[player.id].points += Math.round(gain);
    });
  }

  function runTick(state, playerStats, at) {
    const seed = hashText(`${state.season.id}:${state.season.tick + 1}`);
    const random = seededRandom(seed);
    state.season.tick += 1;
    refreshAllSquads(state, playerStats, at);
    const previousEventCycle = Number(state.eventCycle);
    const currentEventCycle = eventCycleForTick(state.season.tick);
    assignTileEvents(state, currentEventCycle);
    if (currentEventCycle !== previousEventCycle) {
      pushLog(state, {
        id: `events-${state.season.id}-${currentEventCycle}`,
        tick: state.season.tick,
        at,
        type: "event",
        text: "全領地のランダムイベントが更新された"
      });
    }
    ensureTileGarrisons(state, playerStats, at);
    recoverFatigue(state);
    const actions = createActions(state, random);
    const byTarget = actions.reduce((map, action) => {
      if (!map[action.targetId]) map[action.targetId] = [];
      map[action.targetId].push(action);
      return map;
    }, {});
    Object.keys(byTarget).sort().forEach((targetId) => {
      resolveTarget(state, targetId, byTarget[targetId], playerStats, at, random);
    });
    ensureTileGarrisons(state, playerStats, at);
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
      const parties = ownedTiles(state, player.id).map((tile) => tile.garrison).filter(Boolean);
      const averageHype = parties.length
        ? Math.round(parties.reduce((sum, party) => sum + clampHype(party.hype), 0) / parties.length)
        : DEFAULT_HYPE;
      return {
        ...player,
        ...record,
        territoryCount: counts[player.id] || 0,
        averageHype,
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
    const event = TILE_EVENT_BY_ID[tile.eventId] || null;
    return {
      ...tile,
      terrainName: TERRAIN_BY_ID[tile.terrain]?.name || tile.terrain,
      ownerName: owner?.name || "中立",
      ownerColor: owner?.color || "#657083",
      event
    };
  }

  global.TeamBingoTerritorySystem = Object.freeze({
    VERSION, MAP_RADIUS, TICK_MINUTES, TICK_MS, SEASON_DAYS, PARTY_SIZE, DEFAULT_HYPE, EVENT_REROLL_TICKS,
    PLAYERS, PLAYER_BY_ID, TERRAINS, TERRAIN_BY_ID, TILE_EVENTS, TILE_EVENT_BY_ID,
    tileId, parseTileId, neighbors, axialDistance, seasonWindow, createMap, createInitialState, normalizeState,
    refreshAllSquads, ensureTileGarrisons, advanceState, standings, territoryCounts, tileSummary,
    combatPower, playerKey, hashText
  });
})(typeof window !== "undefined" ? window : globalThis);
