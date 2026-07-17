const DEFAULT_CONFIG = {
  enabled: false,
  firebase: {},
  databaseRoot: "teamBingoV1",
  roomInactiveMinutes: 10,
  seatHoldSeconds: 60,
  masterHandoverSeconds: 30,
  actionLockSeconds: 45,
  firebaseSdkVersion: "12.15.0"
};

const PHASE_LABELS = {
  setup: "準備中",
  intro: "チーム紹介",
  ready: "READY",
  playing: "試合中",
  victory: "試合終了"
};

const ROOT_KEY = "teamBingo.online.mock.v1";
const MOCK_CHANNEL = "team-bingo-online-mock-v1";
const MAX_EVENT_REPLAY = 12;
const ADMIN_PIN = "9071";
const ADMIN_PIN_HASH = "6440e6a91202aeddb45b070a80533f65a689c37d0cf1842ab2bd962e33377880";

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix = "id") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 32);
}

function normalizeRoomTitle(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 40);
}

function playerKey(value) {
  return normalizeName(value).toLocaleLowerCase("ja-JP").replace(/[.#$\[\]/]/g, "_");
}

export function createOnlineSeatRecord({
  uid = "",
  deviceId = "",
  name = "",
  team = "",
  now = Date.now(),
  joinedAt = 0,
  reclaimToken = ""
} = {}) {
  return {
    uid,
    deviceId,
    name,
    team,
    online: true,
    joinedAt: Number(joinedAt) || Number(now),
    lastSeenAt: Number(now),
    ...(reclaimToken ? { reclaimToken } : {})
  };
}

function getAtPath(source, path) {
  const parts = String(path || "").split("/").filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (!current || typeof current !== "object") return null;
    current = current[part];
  }
  return current === undefined ? null : current;
}

function setAtPath(source, path, value) {
  const parts = String(path || "").split("/").filter(Boolean);
  if (!parts.length) return value;
  let current = source;
  parts.slice(0, -1).forEach((part) => {
    if (!current[part] || typeof current[part] !== "object") current[part] = {};
    current = current[part];
  });
  const last = parts[parts.length - 1];
  if (value === null || value === undefined) delete current[last];
  else current[last] = value;
  return source;
}

function roomStatusFromGame(game) {
  if (!game?.gameStarted) return "setup";
  if (game.winner) return "victory";
  if (game.inputLocked && !game.readyShown) return "intro";
  if (game.inputLocked) return "ready";
  return "playing";
}

function trimObjectByNumericKey(source, keep = 60) {
  const entries = Object.entries(source || {})
    .sort(([a], [b]) => Number(b) - Number(a))
    .slice(0, keep);
  return Object.fromEntries(entries);
}

function mergeNumberMap(target = {}, incoming = {}) {
  const result = { ...target };
  Object.entries(incoming || {}).forEach(([key, value]) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return;
    const next = Math.max(0, (Number(result[key]) || 0) + amount);
    if (next > 0) result[key] = next;
    else delete result[key];
  });
  return result;
}

function mergePlayerRecord(target = {}, incoming = {}) {
  const result = { ...target };
  const numberFields = [
    "games", "wins", "losses", "opens", "closes", "skills", "specials", "mvps",
    "straightWins", "comebackWins", "comebackMoves", "bingoLines"
  ];
  numberFields.forEach((field) => {
    result[field] = Math.max(0, Number(target[field]) || 0) + Math.max(0, Number(incoming[field]) || 0);
  });
  ["openedCharacters", "winCharacters", "specialCharacters", "skillUsage"].forEach((field) => {
    result[field] = mergeNumberMap(target[field], incoming[field]);
  });
  result.name = normalizeName(incoming.name || target.name);
  result.lastTeam = incoming.lastTeam || target.lastTeam || "";
  result.lastPlayedAt = [target.lastPlayedAt, incoming.lastPlayedAt].filter(Boolean).sort().pop() || "";
  return result;
}

function mergePlayerStats(target = {}, incoming = {}) {
  const result = {
    players: { ...(target.players || {}) },
    rivalries: { ...(target.rivalries || {}) },
    recentMatches: [...(target.recentMatches || [])]
  };
  Object.entries(incoming.players || {}).forEach(([key, record]) => {
    result.players[key] = mergePlayerRecord(result.players[key], record);
  });
  Object.entries(incoming.rivalries || {}).forEach(([key, record]) => {
    const current = result.rivalries[key] || {};
    result.rivalries[key] = {
      ...current,
      ...record,
      players: { ...(current.players || {}), ...(record.players || {}) },
      wins: mergeNumberMap(current.wins, record.wins),
      games: (Number(current.games) || 0) + (Number(record.games) || 0),
      lastPlayedAt: [current.lastPlayedAt, record.lastPlayedAt].filter(Boolean).sort().pop() || "",
      lastWinner: record.lastWinner || current.lastWinner || ""
    };
  });
  const matches = new Map();
  [...result.recentMatches, ...(incoming.recentMatches || [])].forEach((match) => {
    if (!match?.id) return;
    matches.set(match.id, match);
  });
  result.recentMatches = Array.from(matches.values())
    .sort((a, b) => String(b.endedAt || b.startedAt || "").localeCompare(String(a.endedAt || a.startedAt || "")))
    .slice(0, 100);
  return result;
}

export function mergeLegacyStats(globalStats = {}, legacy = {}) {
  return {
    ...globalStats,
    ranking: mergeNumberMap(globalStats.ranking, legacy.ranking),
    playerStats: mergePlayerStats(globalStats.playerStats, legacy.playerStats),
    processedActions: globalStats.processedActions || {}
  };
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertSafeBackupKeys(value, path = "data", depth = 0) {
  if (depth > 20) throw new Error("データの階層が深すぎます");
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeBackupKeys(item, `${path}[${index}]`, depth + 1));
    return;
  }
  Object.entries(value).forEach(([key, item]) => {
    if (/[.#$\[\]/\u0000-\u001F\u007F]/.test(key) || ["__proto__", "prototype", "constructor"].includes(key)) {
      throw new Error(`${path} に使用できないキーがあります`);
    }
    assertSafeBackupKeys(item, `${path}.${key}`, depth + 1);
  });
}

export function normalizeCountBackup(payload) {
  if (!isPlainObject(payload)) throw new Error("JSONの内容が正しくありません");
  const source = isPlainObject(payload.data)
    ? payload.data
    : (isPlainObject(payload.globalStats) ? payload.globalStats : payload);
  const rankingSource = isPlainObject(source.cellRanking) ? source.cellRanking : source.ranking;
  if (!isPlainObject(rankingSource) && !isPlainObject(source.playerStats)) {
    throw new Error("ランキングまたはプレイヤー戦績が見つかりません");
  }
  assertSafeBackupKeys(source);
  return {
    ranking: mergeNumberMap({}, isPlainObject(rankingSource) ? rankingSource : {}),
    playerStats: mergePlayerStats({}, isPlainObject(source.playerStats) ? source.playerStats : {})
  };
}

export function selectCountExportRanking(current = {}, visible = {}, legacy = {}) {
  if (isPlainObject(current?.ranking)) return clone(current.ranking);
  if (Number(current?.rankingUpdatedAt) > 0) return {};
  if (isPlainObject(visible?.ranking)) return clone(visible.ranking);
  if (isPlainObject(legacy?.ranking)) return clone(legacy.ranking);
  return {};
}

export function createCountBackupPayload(current = {}, visible = {}, legacy = {}, exportedAt = nowIso()) {
  const data = normalizeCountBackup({
    cellRanking: selectCountExportRanking(current, visible, legacy),
    playerStats: current.playerStats || { players: {}, rivalries: {}, recentMatches: [] }
  });
  const rankingEntries = Object.keys(data.ranking).length;
  const rankingTotal = Object.values(data.ranking).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const playerCount = Object.keys(data.playerStats.players || {}).length;
  return {
    format: "team-bingo-count-data",
    version: 2,
    exportedAt,
    summary: {
      cellRankingEntries: rankingEntries,
      totalCellOpens: rankingTotal,
      players: playerCount
    },
    cellRanking: data.ranking,
    playerStats: data.playerStats
  };
}

export function selectCurrentOnlineCommentary(room = {}, now = Date.now()) {
  const events = Object.entries(room?.events || {})
    .map(([key, event]) => ({ ...event, seq: Number(key) || 0 }))
    .sort((a, b) => b.seq - a.seq);
  for (const event of events) {
    const timeline = Array.isArray(event?.presentation?.timeline) ? event.presentation.timeline : [];
    const commentary = [...timeline].reverse().find((item) => item?.kind === "commentary");
    if (!commentary) continue;
    const duration = Math.max(0, Number(commentary.duration) || 0);
    const createdAt = Number(event.createdAt) || 0;
    const remainingMs = duration > 0 ? Math.max(0, createdAt + duration - Number(now || Date.now())) : 0;
    if (duration > 0 && remainingMs <= 0) return null;
    return {
      main: String(commentary.main || ""),
      sub: String(commentary.sub || ""),
      faceIndex: Number.isFinite(Number(commentary.faceIndex)) ? Number(commentary.faceIndex) : -1,
      remainingMs
    };
  }
  return null;
}

export function shouldResetOnlineMatchPresentation(snapshot = {}, currentState = {}) {
  if (!snapshot?.gameStarted) return Boolean(currentState?.gameStarted);
  const incomingMatchId = String(snapshot.matchTracker?.id || "");
  const currentMatchId = String(currentState.matchTracker?.id || "");
  const hasPriorMatchState = Boolean(currentMatchId || currentState.winner || currentState.readyShown);
  const matchChanged = Boolean(incomingMatchId && incomingMatchId !== currentMatchId && hasPriorMatchState);
  return matchChanged || Boolean(!snapshot.readyShown && (currentState.winner || currentState.readyShown));
}

export function shouldAnnounceOnlineMatchStart(snapshot = {}, currentState = {}) {
  const incomingMatchId = String(snapshot?.matchTracker?.id || "");
  const currentMatchId = String(currentState?.matchTracker?.id || "");
  if (incomingMatchId && currentMatchId && incomingMatchId !== currentMatchId) return false;
  return Boolean(
    currentState?.gameStarted &&
    currentState?.inputLocked &&
    !currentState?.readyShown &&
    snapshot?.gameStarted &&
    !snapshot?.inputLocked &&
    snapshot?.readyShown
  );
}

function diffNumberMap(before = {}, after = {}) {
  const result = {};
  new Set([...Object.keys(before || {}), ...Object.keys(after || {})]).forEach((key) => {
    const delta = (Number(after[key]) || 0) - (Number(before[key]) || 0);
    if (delta) result[key] = delta;
  });
  return result;
}

export function createStatsDelta(before = {}, after = {}) {
  const delta = {
    ranking: diffNumberMap(before.ranking, after.ranking),
    players: {},
    rivalries: {},
    recentMatches: []
  };
  const beforePlayers = before.playerStats?.players || {};
  const afterPlayers = after.playerStats?.players || {};
  Object.entries(afterPlayers).forEach(([key, record]) => {
    const previous = beforePlayers[key] || {};
    const numeric = {};
    [
      "games", "wins", "losses", "opens", "closes", "skills", "specials", "mvps",
      "straightWins", "comebackWins", "comebackMoves", "bingoLines"
    ].forEach((field) => {
      const amount = (Number(record[field]) || 0) - (Number(previous[field]) || 0);
      if (amount) numeric[field] = amount;
    });
    const maps = {};
    ["openedCharacters", "winCharacters", "specialCharacters", "skillUsage"].forEach((field) => {
      const value = diffNumberMap(previous[field], record[field]);
      if (Object.keys(value).length) maps[field] = value;
    });
    if (Object.keys(numeric).length || Object.keys(maps).length) {
      delta.players[key] = {
        name: record.name || previous.name || key,
        lastTeam: record.lastTeam || previous.lastTeam || "",
        lastPlayedAt: record.lastPlayedAt || previous.lastPlayedAt || "",
        numeric,
        maps
      };
    }
  });
  const beforeRivalries = before.playerStats?.rivalries || {};
  const afterRivalries = after.playerStats?.rivalries || {};
  Object.entries(afterRivalries).forEach(([key, record]) => {
    const previous = beforeRivalries[key] || {};
    const games = (Number(record.games) || 0) - (Number(previous.games) || 0);
    const wins = diffNumberMap(previous.wins, record.wins);
    if (games || Object.keys(wins).length) {
      delta.rivalries[key] = {
        games,
        wins,
        players: record.players || previous.players || {},
        lastWinner: record.lastWinner || previous.lastWinner || "",
        lastPlayedAt: record.lastPlayedAt || previous.lastPlayedAt || ""
      };
    }
  });
  const beforeMatchIds = new Set((before.playerStats?.recentMatches || []).map((match) => match?.id).filter(Boolean));
  delta.recentMatches = (after.playerStats?.recentMatches || []).filter((match) => match?.id && !beforeMatchIds.has(match.id));
  return delta;
}

export function applyStatsDelta(globalStats = {}, delta = {}) {
  const result = {
    ...globalStats,
    ranking: mergeNumberMap(globalStats.ranking, delta.ranking),
    playerStats: mergePlayerStats(globalStats.playerStats, {}),
    processedActions: { ...(globalStats.processedActions || {}) }
  };
  Object.entries(delta.players || {}).forEach(([key, change]) => {
    const current = clone(result.playerStats.players[key] || { name: change.name });
    Object.entries(change.numeric || {}).forEach(([field, amount]) => {
      current[field] = Math.max(0, (Number(current[field]) || 0) + (Number(amount) || 0));
    });
    Object.entries(change.maps || {}).forEach(([field, values]) => {
      current[field] = mergeNumberMap(current[field], values);
    });
    current.name = change.name || current.name || key;
    current.lastTeam = change.lastTeam || current.lastTeam || "";
    current.lastPlayedAt = change.lastPlayedAt || current.lastPlayedAt || "";
    result.playerStats.players[key] = current;
  });
  Object.entries(delta.rivalries || {}).forEach(([key, change]) => {
    const current = result.playerStats.rivalries[key] || {};
    result.playerStats.rivalries[key] = {
      ...current,
      players: { ...(current.players || {}), ...(change.players || {}) },
      games: Math.max(0, (Number(current.games) || 0) + (Number(change.games) || 0)),
      wins: mergeNumberMap(current.wins, change.wins),
      lastWinner: change.lastWinner || current.lastWinner || "",
      lastPlayedAt: change.lastPlayedAt || current.lastPlayedAt || ""
    };
  });
  result.playerStats = mergePlayerStats(result.playerStats, { recentMatches: delta.recentMatches || [] });
  return result;
}

class MockBackend {
  constructor(config) {
    this.config = config;
    const requestedUid = new URLSearchParams(location.search).get("onlineMockUser");
    this.uid = requestedUid ? `mock-user-${requestedUid.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)}` : (sessionStorage.getItem("teamBingo.mockUid") || randomId("mock-user"));
    sessionStorage.setItem("teamBingo.mockUid", this.uid);
    this.channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(MOCK_CHANNEL) : null;
    this.listeners = new Set();
    this.channel?.addEventListener("message", () => this.notify());
    window.addEventListener("storage", (event) => {
      if (event.key === ROOT_KEY) this.notify();
    });
  }

  async init() { return this; }
  serverNow() { return Date.now(); }

  readRoot() {
    try { return JSON.parse(localStorage.getItem(ROOT_KEY) || "{}"); }
    catch { return {}; }
  }

  writeRoot(value) {
    localStorage.setItem(ROOT_KEY, JSON.stringify(value || {}));
    this.channel?.postMessage({ type: "change", at: Date.now() });
    this.notify();
  }

  notify() { this.listeners.forEach((listener) => listener()); }

  async locked(callback) {
    if (navigator.locks?.request) {
      return navigator.locks.request("team-bingo-mock-database", () => callback());
    }
    return callback();
  }

  async get(path) { return clone(getAtPath(this.readRoot(), path)); }

  subscribe(path, callback) {
    const listener = () => callback(clone(getAtPath(this.readRoot(), path)));
    this.listeners.add(listener);
    listener();
    return () => this.listeners.delete(listener);
  }

  async set(path, value) {
    return this.locked(() => {
      const root = this.readRoot();
      this.writeRoot(setAtPath(root, path, clone(value)));
      return true;
    });
  }

  async update(updates) {
    return this.locked(() => {
      let root = this.readRoot();
      Object.entries(updates || {}).forEach(([path, value]) => { root = setAtPath(root, path, clone(value)); });
      this.writeRoot(root);
      return true;
    });
  }

  async transaction(path, updater) {
    return this.locked(() => {
      const root = this.readRoot();
      const current = clone(getAtPath(root, path));
      const next = updater(current);
      if (next === undefined) return { committed: false, value: current };
      this.writeRoot(setAtPath(root, path, clone(next)));
      return { committed: true, value: clone(next) };
    });
  }

  async setPresenceDisconnect() {}
  async clearPresenceDisconnect() { return true; }
  subscribeConnection(callback) {
    callback(true);
    return () => {};
  }
}

export class FirebaseBackend {
  constructor(config) {
    this.config = config;
    this.uid = "";
    this.offset = 0;
    this.api = null;
    this.db = null;
    this.disconnectOperations = new Map();
  }

  async init() {
    const version = this.config.firebaseSdkVersion || "12.15.0";
    const [appApi, authApi, dbApi] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${version}/firebase-database.js`)
    ]);
    const app = appApi.initializeApp(this.config.firebase);
    const auth = authApi.getAuth(app);
    this.db = dbApi.getDatabase(app);
    this.api = dbApi;
    if (this.config.useEmulator) {
      dbApi.connectDatabaseEmulator(this.db, this.config.emulatorHost || "127.0.0.1", Number(this.config.emulatorPort) || 9000);
      authApi.connectAuthEmulator(auth, `http://${this.config.emulatorHost || "127.0.0.1"}:${Number(this.config.authEmulatorPort) || 9099}`, { disableWarnings: true });
    }
    await authApi.setPersistence(auth, authApi.browserSessionPersistence);
    if (!auth.currentUser) await authApi.signInAnonymously(auth);
    this.uid = auth.currentUser.uid;
    dbApi.onValue(dbApi.ref(this.db, ".info/serverTimeOffset"), (snapshot) => {
      this.offset = Number(snapshot.val()) || 0;
    });
    return this;
  }

  serverNow() { return Date.now() + this.offset; }
  makeRef(path) { return this.api.ref(this.db, path); }

  async get(path) {
    const snapshot = await this.api.get(this.makeRef(path));
    return snapshot.exists() ? snapshot.val() : null;
  }

  subscribe(path, callback) {
    return this.api.onValue(this.makeRef(path), (snapshot) => callback(snapshot.exists() ? snapshot.val() : null));
  }

  subscribeConnection(callback) {
    return this.api.onValue(this.makeRef(".info/connected"), (snapshot) => callback(snapshot.val() === true));
  }

  async set(path, value) { await this.api.set(this.makeRef(path), value); return true; }

  async update(updates) {
    await this.api.update(this.api.ref(this.db), updates);
    return true;
  }

  async transaction(path, updater) {
    const reference = this.makeRef(path);
    const initialSnapshot = await this.api.get(reference);
    const initialValue = initialSnapshot.exists() ? initialSnapshot.val() : null;
    let initialAvailable = initialValue !== null;
    const result = await this.api.runTransaction(reference, (current) => {
      const source = initialAvailable && (current === null || current === undefined) ? initialValue : current;
      initialAvailable = false;
      const next = updater(clone(source));
      return next === undefined ? undefined : clone(next);
    }, { applyLocally: false });
    return { committed: result.committed, value: result.snapshot.exists() ? result.snapshot.val() : null };
  }

  async setPresenceDisconnect(roomPath, seatPath = "") {
    const now = this.api.serverTimestamp();
    const participantDisconnect = this.api.onDisconnect(this.makeRef(roomPath));
    await participantDisconnect.update({ online: false, disconnectedAt: now });
    this.disconnectOperations.set(roomPath, participantDisconnect);
    if (seatPath) {
      const seatDisconnect = this.api.onDisconnect(this.makeRef(seatPath));
      await seatDisconnect.update({ online: false, disconnectedAt: now });
      this.disconnectOperations.set(seatPath, seatDisconnect);
    }
  }

  async clearPresenceDisconnect() {
    const entries = [...this.disconnectOperations.entries()];
    const results = await Promise.allSettled(entries.map(([, operation]) => operation.cancel()));
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        const [path, operation] = entries[index];
        if (this.disconnectOperations.get(path) === operation) this.disconnectOperations.delete(path);
      }
    });
    return results.every((result) => result.status === "fulfilled");
  }
}

export class OnlineCoordinator {
  constructor(bridge, config) {
    this.bridge = bridge;
    this.config = { ...DEFAULT_CONFIG, ...(config || {}), firebase: { ...(config?.firebase || {}) } };
    this.root = this.config.databaseRoot || DEFAULT_CONFIG.databaseRoot;
    this.mock = new URLSearchParams(location.search).get("onlineMock") === "1";
    this.enabled = Boolean(this.mock || this.config.enabled);
    this.backend = null;
    this.rooms = {};
    this.roomId = "";
    this.room = null;
    this.role = "";
    this.team = "";
    this.memberName = "";
    this.seatKey = "";
    this.roomUnsubscribe = null;
    this.lobbyUnsubscribe = null;
    this.statsUnsubscribe = null;
    this.localActionIds = new Set();
    this.lastEventSeq = 0;
    this.busy = false;
    this.applyingRemote = false;
    this.pendingRoom = null;
    this.globalStatsSnapshot = null;
    this.masterHandoverTimer = 0;
    this.heartbeatTimer = 0;
    this.connectionUnsubscribe = null;
    this.presenceRefreshPromise = null;
    this.membershipLossTimer = 0;
    this.leavingRoom = false;
    this.localMode = false;
    this.roomDraft = false;
    this.pendingDraftRoom = null;
    this.adminMode = false;
    this.adminExpiresAt = 0;
    this.adminExpiryTimer = 0;
    this.cleanupInFlight = false;
    this.ghostCleanupTimer = 0;
    this.legacyStats = clone(bridge.getLegacyStats?.() || {});
    const requestedMockDevice = this.mock
      ? new URLSearchParams(location.search).get("onlineMockDevice")?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)
      : "";
    this.deviceId = requestedMockDevice
      ? `mock-device-${requestedMockDevice}`
      : (sessionStorage.getItem("teamBingo.onlineDeviceId") || randomId("device"));
    if (!requestedMockDevice) sessionStorage.setItem("teamBingo.onlineDeviceId", this.deviceId);
    this.createUi();
  }

  path(part = "") { return [this.root, part].filter(Boolean).join("/"); }
  roomPath(roomId = this.roomId, part = "") { return this.path(["rooms", roomId, part].filter(Boolean).join("/")); }
  lobbyPath(roomId = this.roomId) { return this.path(["lobby", roomId].filter(Boolean).join("/")); }

  seatReclaimStorageKey(roomId, seatKey) {
    return `teamBingo.seatReclaim.v1.${encodeURIComponent(roomId)}.${encodeURIComponent(seatKey)}`;
  }

  readSeatReclaimToken(roomId, seatKey) {
    if (!roomId || !seatKey) return "";
    try { return localStorage.getItem(this.seatReclaimStorageKey(roomId, seatKey)) || ""; }
    catch { return ""; }
  }

  storeSeatReclaimToken(roomId, seatKey, token) {
    if (!roomId || !seatKey || !token) return;
    try { localStorage.setItem(this.seatReclaimStorageKey(roomId, seatKey), token); }
    catch {}
  }

  clearSeatReclaimToken(roomId, seatKey) {
    if (!roomId || !seatKey) return;
    try { localStorage.removeItem(this.seatReclaimStorageKey(roomId, seatKey)); }
    catch {}
  }

  hasAuthoritativeMembership(room, seatKey = this.seatKey) {
    const uid = this.backend?.uid;
    if (!uid || !room?.participants?.[uid]) return false;
    if (seatKey && room.seats?.[seatKey]?.uid !== uid) return false;
    return true;
  }

  canPerformAuthoritativeAction(room, action = {}) {
    if (!this.hasAuthoritativeMembership(room)) return false;
    const uid = this.backend.uid;
    const participant = room.participants[uid];
    const isMaster = room.meta?.masterUid === uid;
    if (!isMaster && participant.role === "spectator") return false;
    if (action.masterOnly && !isMaster) return false;
    const team = action?.payload?.team || "";
    if (team && !isMaster && (participant.role !== "player" || participant.team !== team)) return false;
    return true;
  }

  scheduleMembershipLossCheck(roomId = this.roomId) {
    if (!roomId || this.membershipLossTimer || this.leavingRoom) return;
    this.membershipLossTimer = window.setTimeout(async () => {
      this.membershipLossTimer = 0;
      if (this.roomId !== roomId) return;
      const current = await this.backend.get(this.roomPath(roomId)).catch(() => null);
      if (!current || this.hasAuthoritativeMembership(current)) return;
      this.bridge.showOnlineMessage?.("SESSION MOVED", "この参加枠は別のタブへ引き継がれました。");
      await this.leaveRoom({ remoteClosed: true, preserveReclaimToken: true });
    }, 0);
  }

  async init() {
    if (!this.enabled) {
      this.setStatus("local", "LOCAL MODE");
      this.bridge.onOnlineReady?.(this);
      return this;
    }
    this.setStatus("connecting", this.mock ? "MOCK CONNECT" : "CONNECTING");
    try {
      this.backend = this.mock ? new MockBackend(this.config) : new FirebaseBackend(this.config);
      await this.backend.init();
      this.setStatus("online", this.mock ? "MOCK ONLINE" : "ONLINE");
      this.subscribeLobby();
      this.startGhostCleanupTimer();
      const restored = await this.restoreSession();
      if (!restored) this.showLobby();
      this.bridge.onOnlineReady?.(this);
    } catch (error) {
      console.error("Online initialization failed", error);
      this.enabled = false;
      this.setStatus("error", "ONLINE ERROR");
      this.bridge.onOnlineError?.(error);
      this.bridge.onOnlineReady?.(this);
    } finally {
      document.documentElement.classList.remove("online-booting");
    }
    return this;
  }

  createUi() {
    document.body.insertAdjacentHTML("beforeend", `
      <div class="online-lobby" id="onlineLobby" aria-hidden="true">
        <section class="online-lobby-shell" aria-label="開催中の部屋">
          <header class="online-lobby-head">
            <div>
              <div class="online-lobby-title">ONLINE ROOMS</div>
              <div class="online-lobby-sub">開催中の部屋を選んで参加</div>
            </div>
            <div class="online-lobby-head-actions">
              <span class="online-mode-badge connecting" id="onlineLobbyStatus">CONNECTING</span>
              <button type="button" class="online-simple-button" id="onlineAdminMode">ADMIN</button>
            </div>
          </header>
          <div class="online-lobby-toolbar">
            <div class="online-lobby-mode-actions">
              <button type="button" class="online-simple-button primary" id="onlineCreateRoom">部屋を作る</button>
              <button type="button" class="online-simple-button" id="onlineLocalMode">LOCAL MODE</button>
            </div>
            <div class="online-lobby-audio">
              <button type="button" class="online-simple-button" id="onlineLobbySound">SOUND ON</button>
              <label class="online-lobby-volume">
                <span>VOL</span>
                <input id="onlineLobbyVolume" type="range" min="0" max="100" value="70" aria-label="オンラインルーム音量" />
                <output id="onlineLobbyVolumeValue">70</output>
              </label>
            </div>
          </div>
          <div class="online-error-banner" id="onlineErrorBanner" role="alert" hidden></div>
          <div class="online-lobby-body">
            <div class="online-room-list" id="onlineRoomList"></div>
          </div>
        </section>
      </div>
      <div class="online-admin-page" id="onlineAdminPage" aria-hidden="true">
        <section class="online-admin-shell" aria-label="管理ページ">
          <header class="online-lobby-head">
            <div>
              <div class="online-lobby-title">ADMIN CONTROL</div>
              <div class="online-lobby-sub">共通データの管理</div>
            </div>
            <div class="online-lobby-actions">
              <span class="online-mode-badge online">ADMIN ON</span>
              <button type="button" class="online-simple-button" id="onlineAdminBack">ROOMS</button>
            </div>
          </header>
          <div class="online-admin-page-body">
            <div class="online-admin-operation">
              <div>
                <strong>OPEN RANKING</strong>
                <span>全ルーム共通のマス開封ランキングを削除します。</span>
              </div>
              <button type="button" class="online-simple-button danger" id="onlineAdminResetRanking">RANK RESET</button>
            </div>
            <div class="online-admin-operation">
              <div>
                <strong>PLAYER STATS</strong>
                <span>プレイ回数、勝敗、MVP、スキルなどの共通戦績を削除します。</span>
              </div>
              <button type="button" class="online-simple-button danger" id="onlineAdminResetStats">STATS RESET</button>
            </div>
            <div class="online-admin-operation">
              <div>
                <strong>COUNT DATA</strong>
                <span>ランキングとプレイヤー戦績をJSONで保存・上書き復元します。</span>
              </div>
              <div class="online-admin-operation-actions">
                <button type="button" class="online-simple-button" id="onlineAdminExportCounts">EXPORT</button>
                <button type="button" class="online-simple-button primary" id="onlineAdminImportCounts">IMPORT</button>
                <input id="onlineAdminImportFile" type="file" accept="application/json,.json" hidden aria-label="カウントデータJSON" />
              </div>
            </div>
            <div class="online-admin-operation">
              <div>
                <strong>GHOST ROOMS</strong>
                <span id="onlineAdminGhostSummary">削除対象を確認しています。</span>
              </div>
              <button type="button" class="online-simple-button danger" id="onlineAdminDeleteGhosts">GHOST CLEANUP</button>
            </div>
            <div class="online-admin-result" id="onlineAdminResult" role="status">管理操作を選択してください。</div>
          </div>
        </section>
      </div>
      <dialog class="online-seat-dialog online-admin-dialog" id="onlineAdminDialog">
        <header class="online-seat-head">
          <div>
            <div class="online-seat-title">ADMIN MODE</div>
          </div>
          <button type="button" class="online-simple-button" id="onlineAdminClose">CLOSE</button>
        </header>
        <form class="online-admin-form" id="onlineAdminForm">
          <label class="online-field"><span>PASSWORD</span><input id="onlineAdminPassword" type="password" inputmode="numeric" maxlength="12" autocomplete="off"></label>
          <span class="online-form-error" id="onlineAdminError" role="alert"></span>
          <button type="submit" class="online-simple-button primary">管理者として入る</button>
        </form>
      </dialog>
      <dialog class="online-seat-dialog" id="onlineSeatDialog">
        <header class="online-seat-head">
          <div>
            <div class="online-seat-title" id="onlineSeatTitle">メンバーを選択</div>
            <div class="online-lobby-sub">自分の名前を押して入室</div>
          </div>
          <button type="button" class="online-simple-button" id="onlineSeatClose">CLOSE</button>
        </header>
        <div class="online-dialog-error" id="onlineSeatError" role="alert" hidden></div>
        <div class="online-seat-list" id="onlineSeatList"></div>
      </dialog>
      <dialog class="online-seat-dialog" id="onlineMasterDialog">
        <header class="online-seat-head">
          <div>
            <div class="online-seat-title">部屋主のプレイヤーを選択</div>
            <div class="online-lobby-sub">あなたが操作する名前を選んで部屋を作成</div>
          </div>
          <button type="button" class="online-simple-button" id="onlineMasterClose">CLOSE</button>
        </header>
        <div class="online-seat-list" id="onlineMasterList"></div>
      </dialog>
      <div class="online-session-bar" id="onlineSessionBar">
        <span class="online-mode-badge online" id="onlineSessionStatus">ONLINE</span>
        <span class="online-session-name" id="onlineSessionName"></span>
        <span class="online-session-role" id="onlineSessionRole"></span>
        <span class="online-session-presence" id="onlineSessionPresence"></span>
        <button type="button" class="online-simple-button" id="onlineOpenLobby">ROOMS</button>
        <button type="button" class="online-simple-button danger" id="onlineCloseRoom" hidden>ROOM CLOSE</button>
        <button type="button" class="online-simple-button danger" id="onlineLeaveRoom">LEAVE</button>
      </div>
    `);
    this.ui = {
      lobby: document.getElementById("onlineLobby"),
      lobbyStatus: document.getElementById("onlineLobbyStatus"),
      lobbyVolume: document.getElementById("onlineLobbyVolume"),
      lobbyVolumeValue: document.getElementById("onlineLobbyVolumeValue"),
      lobbySound: document.getElementById("onlineLobbySound"),
      roomList: document.getElementById("onlineRoomList"),
      createRoom: document.getElementById("onlineCreateRoom"),
      localMode: document.getElementById("onlineLocalMode"),
      adminMode: document.getElementById("onlineAdminMode"),
      errorBanner: document.getElementById("onlineErrorBanner"),
      adminPage: document.getElementById("onlineAdminPage"),
      adminBack: document.getElementById("onlineAdminBack"),
      adminResetRanking: document.getElementById("onlineAdminResetRanking"),
      adminResetStats: document.getElementById("onlineAdminResetStats"),
      adminExportCounts: document.getElementById("onlineAdminExportCounts"),
      adminImportCounts: document.getElementById("onlineAdminImportCounts"),
      adminImportFile: document.getElementById("onlineAdminImportFile"),
      adminDeleteGhosts: document.getElementById("onlineAdminDeleteGhosts"),
      adminGhostSummary: document.getElementById("onlineAdminGhostSummary"),
      adminResult: document.getElementById("onlineAdminResult"),
      adminDialog: document.getElementById("onlineAdminDialog"),
      adminForm: document.getElementById("onlineAdminForm"),
      adminClose: document.getElementById("onlineAdminClose"),
      adminPassword: document.getElementById("onlineAdminPassword"),
      adminError: document.getElementById("onlineAdminError"),
      seatDialog: document.getElementById("onlineSeatDialog"),
      seatTitle: document.getElementById("onlineSeatTitle"),
      seatError: document.getElementById("onlineSeatError"),
      seatList: document.getElementById("onlineSeatList"),
      seatClose: document.getElementById("onlineSeatClose"),
      masterDialog: document.getElementById("onlineMasterDialog"),
      masterList: document.getElementById("onlineMasterList"),
      masterClose: document.getElementById("onlineMasterClose"),
      sessionBar: document.getElementById("onlineSessionBar"),
      sessionStatus: document.getElementById("onlineSessionStatus"),
      sessionName: document.getElementById("onlineSessionName"),
      sessionRole: document.getElementById("onlineSessionRole"),
      sessionPresence: document.getElementById("onlineSessionPresence"),
      openLobby: document.getElementById("onlineOpenLobby"),
      closeRoom: document.getElementById("onlineCloseRoom"),
      leaveRoom: document.getElementById("onlineLeaveRoom")
    };
    this.ui.createRoom.addEventListener("click", () => this.beginRoomDraft());
    this.ui.lobbyVolume.addEventListener("input", (event) => {
      this.bridge.unlockAudio?.();
      this.bridge.setOnlineVolume?.(event.target.value);
      this.syncLobbyVolume();
    });
    this.ui.lobbySound.addEventListener("click", () => {
      this.bridge.unlockAudio?.();
      this.bridge.toggleOnlineSound?.();
      this.syncLobbyVolume();
    });
    this.ui.localMode.addEventListener("click", () => this.enterLocalMode());
    this.ui.adminMode.addEventListener("click", () => {
      this.ui.adminPassword.value = "";
      this.ui.adminError.textContent = "";
      if (!this.ui.adminDialog.open) this.ui.adminDialog.showModal();
    });
    this.ui.adminClose.addEventListener("click", () => this.ui.adminDialog.close());
    this.ui.adminForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.enableAdminMode(this.ui.adminPassword.value);
    });
    this.ui.adminBack.addEventListener("click", () => {
      this.hideAdminPage();
      this.showLobby();
    });
    this.ui.adminResetRanking.addEventListener("click", async () => {
      if (!window.confirm("全ルーム共通の開封ランキングを削除しますか？")) return;
      await this.resetGlobalStats("ranking");
    });
    this.ui.adminResetStats.addEventListener("click", async () => {
      if (!window.confirm("全ルーム共通のプレイヤー戦績を削除しますか？")) return;
      await this.resetGlobalStats("playerStats");
    });
    this.ui.adminExportCounts.addEventListener("click", () => this.exportCountData());
    this.ui.adminImportCounts.addEventListener("click", () => {
      this.ui.adminImportFile.value = "";
      this.ui.adminImportFile.click();
    });
    this.ui.adminImportFile.addEventListener("change", () => {
      const file = this.ui.adminImportFile.files?.[0];
      if (file) this.importCountData(file);
    });
    this.ui.adminDeleteGhosts.addEventListener("click", async () => {
      const count = this.getGhostRooms().length;
      if (!count) return;
      if (!window.confirm(`GHOST部屋 ${count}件をまとめて削除しますか？`)) return;
      await this.deleteGhostRooms({ requireAdmin: true });
    });
    this.ui.seatClose.addEventListener("click", () => this.ui.seatDialog.close());
    this.ui.masterClose.addEventListener("click", () => {
      this.pendingDraftRoom = null;
      this.ui.masterDialog.close();
    });
    this.ui.masterList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-master-member]");
      if (!button || !this.pendingDraftRoom) return;
      this.bridge.unlockAudio?.();
      const pending = this.pendingDraftRoom;
      this.pendingDraftRoom = null;
      this.ui.masterDialog.close();
      this.createRoom(pending.setup, pending.title, {
        name: button.dataset.masterMember || "",
        team: button.dataset.masterTeam || ""
      });
    });
    this.ui.openLobby.addEventListener("click", () => {
      if (this.roomDraft) {
        this.cancelRoomDraft();
        return;
      }
      const leavingLocalMode = this.localMode;
      this.localMode = false;
      document.body.classList.remove("online-local-mode");
      if (leavingLocalMode) this.ui.sessionBar.classList.remove("show");
      this.setStatus("online", this.mock ? "MOCK ONLINE" : "ONLINE");
      this.showLobby();
    });
    this.ui.closeRoom.addEventListener("click", () => {
      if (window.confirm("この部屋を終了しますか？")) this.closeRoom();
    });
    this.ui.leaveRoom.addEventListener("click", () => {
      if (this.roomDraft) this.cancelRoomDraft();
      else this.leaveRoom();
    });
    this.ui.roomList.addEventListener("click", (event) => {
      const deleteButton = event.target.closest("[data-online-delete-room]");
      if (deleteButton) {
        this.adminDeleteRoom(deleteButton.dataset.onlineDeleteRoom);
        return;
      }
      const button = event.target.closest("[data-online-room]");
      if (button) this.openSeatDialog(button.dataset.onlineRoom);
    });
    this.ui.seatList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-online-seat]");
      if (!button) return;
      this.bridge.unlockAudio?.();
      this.joinRoom(button.dataset.roomId, {
        name: button.dataset.memberName || "",
        team: button.dataset.team || "",
        spectator: button.dataset.spectator === "1"
      });
    });
  }

  setStatus(type, label) {
    [this.ui?.lobbyStatus, this.ui?.sessionStatus].filter(Boolean).forEach((node) => {
      node.classList.remove("online", "connecting", "error");
      if (type !== "local") node.classList.add(type);
      node.textContent = node === this.ui?.sessionStatus && type === "online" ? "ONLINE" : label;
    });
  }

  showLobby() {
    if (!this.enabled) return;
    this.clearError();
    this.syncLobbyVolume();
    this.hideAdminPage();
    this.ui.lobby.classList.add("show");
    this.ui.lobby.setAttribute("aria-hidden", "false");
  }

  hideLobby() {
    this.ui.lobby.classList.remove("show");
    this.ui.lobby.setAttribute("aria-hidden", "true");
  }

  showAdminPage() {
    if (!this.isAdminMode()) return;
    this.hideLobby();
    this.syncAdminGhostControls();
    this.ui.adminResult.textContent = "管理操作を選択してください。";
    this.ui.adminPage.classList.add("show");
    this.ui.adminPage.setAttribute("aria-hidden", "false");
  }

  hideAdminPage() {
    this.ui?.adminPage?.classList.remove("show");
    this.ui?.adminPage?.setAttribute("aria-hidden", "true");
  }

  syncLobbyVolume() {
    if (!this.ui?.lobbyVolume) return;
    const value = Math.max(0, Math.min(100, Number(this.bridge.getOnlineVolume?.()) || 0));
    this.ui.lobbyVolume.value = String(value);
    this.ui.lobbyVolume.style.setProperty("--volume-fill", `${value}%`);
    this.ui.lobbyVolume.classList.toggle("is-zero", value === 0);
    this.ui.lobbyVolumeValue.textContent = String(value);
    const enabled = Boolean(this.bridge.getOnlineSoundEnabled?.());
    this.ui.lobbySound.textContent = enabled ? "SOUND ON" : "SOUND OFF";
    this.ui.lobbySound.classList.toggle("sound-off", !enabled);
    this.ui.lobbySound.setAttribute("aria-pressed", enabled ? "true" : "false");
  }

  getGhostRooms() {
    const now = this.backend?.serverNow?.() || Date.now();
    const inactiveMs = Math.max(1, Number(this.config.roomInactiveMinutes) || 10) * 60000;
    return Object.entries(this.rooms || {}).filter(([, room]) => (
      room?.active !== false && now - (Number(room?.updatedAt) || 0) > inactiveMs
    ));
  }

  syncAdminGhostControls() {
    if (!this.ui?.adminDeleteGhosts) return;
    const count = this.getGhostRooms().length;
    this.ui.adminDeleteGhosts.disabled = count === 0;
    this.ui.adminGhostSummary.textContent = count
      ? `現在 ${count}件のGHOST部屋があります。まとめて完全削除できます。`
      : "現在、削除対象のGHOST部屋はありません。";
  }

  showError(title, error) {
    const message = String(error?.message || error || "不明なエラー");
    if (this.ui?.errorBanner) {
      this.ui.errorBanner.hidden = false;
      this.ui.errorBanner.textContent = `${title}: ${message}`;
    }
    if (this.ui?.seatError && this.ui.seatDialog?.open) {
      this.ui.seatError.hidden = false;
      this.ui.seatError.textContent = message;
    }
    this.bridge.showOnlineMessage?.(title, message);
  }

  clearError() {
    if (!this.ui?.errorBanner) return;
    this.ui.errorBanner.hidden = true;
    this.ui.errorBanner.textContent = "";
    if (this.ui.seatError) {
      this.ui.seatError.hidden = true;
      this.ui.seatError.textContent = "";
    }
  }

  subscribeLobby() {
    this.lobbyUnsubscribe?.();
    this.lobbyUnsubscribe = this.backend.subscribe(this.path("lobby"), (value) => {
      this.rooms = value || {};
      this.renderRooms();
      this.cleanupStaleRooms();
    });
  }

  renderRooms() {
    const now = this.backend?.serverNow?.() || Date.now();
    const inactiveMs = Math.max(1, Number(this.config.roomInactiveMinutes) || 10) * 60000;
    const rooms = Object.entries(this.rooms || {})
      .filter(([, room]) => room?.active !== false && (this.adminMode || now - (Number(room?.updatedAt) || 0) <= inactiveMs))
      .sort(([, a], [, b]) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
    this.syncAdminGhostControls();
    if (!rooms.length) {
      this.ui.roomList.innerHTML = `<div class="online-room-empty">現在開催中の部屋はありません</div>`;
      return;
    }
    this.ui.roomList.innerHTML = rooms.map(([id, room]) => {
      const red = (room.redMembers || []).filter(Boolean).join(" / ") || "未設定";
      const blue = (room.blueMembers || []).filter(Boolean).join(" / ") || "未設定";
      const stale = now - (Number(room.updatedAt) || 0) > inactiveMs;
      const phase = stale ? "GHOST" : (PHASE_LABELS[room.phase] || PHASE_LABELS.setup);
      return `
        <article class="online-room-card">
          <div class="online-room-card-head">
            <span class="online-room-phase ${stale ? "stale" : ""}">${phase}</span>
          </div>
          <div class="online-room-teams">
            <div class="online-room-team"><b>RED TEAM</b>${this.bridge.escapeHtml?.(red) || red}</div>
            <div class="online-room-team blue"><b>BLUE TEAM</b>${this.bridge.escapeHtml?.(blue) || blue}</div>
          </div>
          <div class="online-room-card-foot">
            <span class="online-room-meta">${Number(room.onlineCount) || 0} ONLINE</span>
            <div class="online-room-actions">
              ${this.adminMode ? `<button type="button" class="online-simple-button danger" data-online-delete-room="${id}">DELETE</button>` : ""}
              <button type="button" class="online-simple-button primary" data-online-room="${id}">ENTER</button>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  beginRoomDraft() {
    if (this.busy || this.roomId) return;
    const setup = clone(this.bridge.getOnlineSetupSnapshot?.() || {});
    this.roomDraft = true;
    this.localMode = false;
    document.body.classList.remove("online-local-mode");
    this.hideLobby();
    this.setStatus("online", this.mock ? "MOCK ONLINE" : "ONLINE");
    this.ui.sessionBar.classList.add("show");
    this.ui.sessionName.textContent = "";
    this.ui.sessionRole.textContent = "";
    this.ui.sessionPresence.textContent = "";
    this.ui.openLobby.textContent = "ROOMS";
    this.ui.closeRoom.hidden = true;
    this.ui.leaveRoom.hidden = false;
    this.ui.leaveRoom.textContent = "CANCEL";
    this.bridge.setRoomDraftMode?.(true);
    document.body.classList.add("online-room-draft");
    this.bridge.setOnlineSession?.({ roomId: "", role: "draft", team: "", memberName: "", master: true });
    window.setTimeout(() => this.placeSessionBar(), 0);
  }

  cancelRoomDraft() {
    if (!this.roomDraft) return;
    this.roomDraft = false;
    document.body.classList.remove("online-room-draft");
    this.ui.leaveRoom.textContent = "LEAVE";
    this.ui.sessionBar.classList.remove("show");
    this.bridge.setRoomDraftMode?.(false);
    this.showLobby();
  }

  isRoomDraft() { return Boolean(this.roomDraft); }

  async createRoomFromDraft() {
    if (!this.roomDraft || this.busy) return false;
    const setup = clone(this.bridge.getOnlineSetupSnapshot?.() || {});
    const names = [...(setup.redMembers || []), ...(setup.blueMembers || [])].map(normalizeName).filter(Boolean);
    const unique = new Set(names.map(playerKey));
    if (!(setup.redMembers || []).length || !(setup.blueMembers || []).length) {
      this.showError("ROOM CREATE ERROR", "TEAM SHUFFLEでRED・BLUEにメンバーを設定してください");
      return false;
    }
    if (unique.size !== names.length) {
      this.showError("ROOM CREATE ERROR", "同じプレイヤー名は使用できません");
      return false;
    }
    const title = "TEAM BINGO MATCH";
    const draftSetup = { ...setup, roomTitle: title };
    this.pendingDraftRoom = { setup: draftSetup, title };
    this.ui.masterList.innerHTML = ["red", "blue"].map((team) => {
      const members = draftSetup[`${team}Members`] || [];
      return `
        <div class="online-seat-team-label ${team === "blue" ? "blue" : ""}">${team.toUpperCase()} TEAM</div>
        <div class="online-seat-buttons">
          ${members.map((name) => `<button type="button" class="online-seat-button" data-master-member="${this.bridge.escapeHtml?.(name) || name}" data-master-team="${team}">${this.bridge.escapeHtml?.(name) || name}<small>このプレイヤーで部屋を作る</small></button>`).join("")}
        </div>
      `;
    }).join("");
    if (!this.ui.masterDialog.open) this.ui.masterDialog.showModal();
    return true;
  }

  async createRoom(setupOverride = null, titleOverride = "", masterSelection = {}) {
    if (!this.enabled || this.busy) return;
    this.setBusy(true);
    let createdRoomId = "";
    try {
      const setup = clone(setupOverride || this.bridge.getOnlineSetupSnapshot?.() || {});
      const roomId = randomId("room");
      const now = this.backend.serverNow();
      const title = normalizeRoomTitle(titleOverride || setup.roomTitle) || (setup.redMembers?.[0]
        ? `${setup.redMembers[0]}たちの部屋`
        : "新しいTEAM BINGO");
      const masterName = normalizeName(masterSelection.name);
      const masterTeam = masterSelection.team === "blue" ? "blue" : "red";
      const masterSeatKey = playerKey(masterName);
      const masterReclaimToken = masterSeatKey ? randomId("seat-reclaim") : "";
      const room = {
        meta: {
          id: roomId,
          active: true,
          title,
          customTitle: Boolean(titleOverride || setup.roomTitle),
          phase: "setup",
          masterUid: this.backend.uid,
          revision: 0,
          eventSeq: 0,
          createdAt: now,
          updatedAt: now
        },
        setup,
        game: null,
        participants: {
          [this.backend.uid]: {
            uid: this.backend.uid,
            deviceId: this.deviceId,
            role: "master",
            team: masterTeam,
            memberName: masterName,
            online: true,
            joinedAt: now,
            lastSeenAt: now
          }
        },
        seats: masterName ? {
          [masterSeatKey]: createOnlineSeatRecord({
            uid: this.backend.uid,
            deviceId: this.deviceId,
            name: masterName,
            team: masterTeam,
            now,
            reclaimToken: masterReclaimToken
          })
        } : {},
        events: {},
        processedActions: {}
      };
      await this.backend.set(this.roomPath(roomId), room);
      try {
        await this.publishLobbySummary(room, roomId);
      } catch (error) {
        await this.backend.set(this.roomPath(roomId), null).catch(() => {});
        throw error;
      }
      this.roomId = roomId;
      this.roomDraft = false;
      document.body.classList.remove("online-room-draft");
      this.localMode = false;
      this.setStatus("online", this.mock ? "MOCK ONLINE" : "ONLINE");
      this.role = "master";
      this.team = masterTeam;
      this.memberName = masterName;
      this.seatKey = masterSeatKey;
      this.storeSeatReclaimToken(roomId, masterSeatKey, masterReclaimToken);
      await this.enterRoom(roomId, room);
      this.saveSession();
      createdRoomId = roomId;
    } catch (error) {
      console.error(error);
      this.showError("ROOM CREATE ERROR", error);
    } finally {
      this.setBusy(false);
      if (createdRoomId) {
        this.ui.leaveRoom.textContent = "LEAVE";
        this.bridge.setRoomDraftMode?.(false);
        this.hideLobby();
        this.bridge.onRoomCreated?.(createdRoomId);
      }
    }
  }

  async enterLocalMode() {
    if (this.roomId && !await this.leaveRoom({ switching: true })) return false;
    this.roomDraft = false;
    document.body.classList.remove("online-room-draft");
    this.localMode = true;
    document.body.classList.add("online-local-mode");
    this.hideLobby();
    this.ui.sessionBar.classList.add("show");
    this.ui.sessionStatus.classList.remove("online", "connecting", "error");
    this.ui.sessionStatus.textContent = "LOCAL";
    this.ui.sessionName.textContent = "";
    this.ui.sessionRole.textContent = "";
    this.ui.sessionPresence.textContent = "";
    this.ui.openLobby.textContent = "ONLINE ROOMS";
    this.ui.closeRoom.hidden = true;
    this.ui.leaveRoom.hidden = true;
    this.ui.leaveRoom.textContent = "LEAVE";
    this.bridge.setRoomDraftMode?.(false);
    document.body.classList.remove("online-active", "online-readonly", "online-spectator", "online-team-red", "online-team-blue");
    this.syncSpectatorControls();
    this.bridge.setOnlineSession?.({ roomId: "", role: "local", team: "", memberName: "LOCAL", master: true });
    window.setTimeout(() => {
      const target = document.querySelector("#setupScreen.active .setup-top-right") || document.body;
      if (this.ui.sessionBar.parentElement !== target) target.appendChild(this.ui.sessionBar);
    }, 0);
  }

  async enableAdminMode(pin) {
    if (pin !== ADMIN_PIN) {
      this.ui.adminError.textContent = "パスワードが違います";
      return;
    }
    try {
      const expiresAt = this.backend.serverNow() + 30 * 60 * 1000;
      await this.backend.set(this.path(`adminSessions/${this.backend.uid}`), {
        pinHash: ADMIN_PIN_HASH,
        expiresAt
      });
      this.adminMode = true;
      this.adminExpiresAt = expiresAt;
      window.clearTimeout(this.adminExpiryTimer);
      this.adminExpiryTimer = window.setTimeout(() => {
        this.backend.set(this.path(`adminSessions/${this.backend.uid}`), null).catch(() => {});
        this.expireAdminMode("");
      }, Math.max(0, expiresAt - this.backend.serverNow()));
      this.ui.adminMode.textContent = "ADMIN ON";
      this.bridge.onAdminModeChanged?.(true);
      this.ui.adminDialog.close();
      this.clearError();
      this.renderRooms();
      this.showAdminPage();
    } catch (error) {
      this.showError("ADMIN ERROR", error);
    }
  }

  async adminDeleteRoom(roomId) {
    if (!roomId || !this.isAdminMode()) return false;
    if (!await this.verifyAdminSession()) return false;
    const title = this.rooms?.[roomId]?.title || "この部屋";
    if (!window.confirm(`${title}を完全に削除しますか？`)) return;
    try {
      await this.backend.update({
        [this.roomPath(roomId)]: null,
        [this.lobbyPath(roomId)]: null
      });
      this.clearError();
      return true;
    } catch (error) {
      this.showError("ROOM DELETE ERROR", error);
      return false;
    }
  }

  createLobbySummary(room = this.room) {
    const setup = room?.setup || {};
    const participants = Object.values(room?.participants || {});
    const onlineCount = participants.filter((participant) => participant?.online).length;
    return {
      active: room?.meta?.active !== false,
      title: room?.meta?.title || "TEAM BINGO ROOM",
      phase: room?.meta?.phase || roomStatusFromGame(room?.game),
      redMembers: setup.redMembers || [],
      blueMembers: setup.blueMembers || [],
      onlineCount,
      roomRevision: Number(room?.meta?.revision) || 0,
      eventSeq: Number(room?.meta?.eventSeq) || 0,
      updatedAt: room?.meta?.updatedAt || this.backend?.serverNow?.() || Date.now()
    };
  }

  async publishLobbySummary(room, roomId = this.roomId) {
    if (!roomId) return false;
    if (!room) {
      await this.backend.set(this.lobbyPath(roomId), null);
      return true;
    }
    const next = this.createLobbySummary(room);
    const result = await this.backend.transaction(this.lobbyPath(roomId), (current) => {
      if (!current) return next;
      const currentUpdatedAt = Number(current.updatedAt) || 0;
      const nextUpdatedAt = Number(next.updatedAt) || 0;
      if (currentUpdatedAt > nextUpdatedAt) return current;
      if (currentUpdatedAt === nextUpdatedAt) {
        const currentEventSeq = Number(current.eventSeq) || 0;
        const nextEventSeq = Number(next.eventSeq) || 0;
        if (currentEventSeq > nextEventSeq) return current;
        if (currentEventSeq === nextEventSeq && (Number(current.roomRevision) || 0) > (Number(next.roomRevision) || 0)) return current;
      }
      return next;
    });
    return Boolean(result?.committed);
  }

  openSeatDialog(roomId) {
    const lobby = this.rooms[roomId];
    if (!lobby) return;
    this.ui.seatTitle.textContent = "メンバーを選択";
    if (this.ui.seatError) {
      this.ui.seatError.hidden = true;
      this.ui.seatError.textContent = "";
    }
    const groups = [
      ["red", lobby.redMembers || []],
      ["blue", lobby.blueMembers || []]
    ];
    this.backend.get(this.roomPath(roomId)).then((room) => {
      const seats = room?.seats || {};
      const now = this.backend.serverNow();
      const holdMs = Math.max(10, Number(this.config.seatHoldSeconds) || 60) * 1000;
      const currentSeatEntry = Object.entries(seats).find(([, seat]) => seat?.uid === this.backend.uid);
      const currentSeatKey = currentSeatEntry?.[0] || "";
      const currentParticipant = room?.participants?.[this.backend.uid];
      const currentIdentityOnline = Boolean(currentParticipant?.online || currentSeatEntry?.[1]?.online);
      this.ui.seatList.innerHTML = groups.map(([team, members]) => `
        <div class="online-seat-team-label ${team === "blue" ? "blue" : ""}">${team.toUpperCase()} TEAM</div>
        <div class="online-seat-buttons">
          ${members.length ? members.map((name) => {
            const key = playerKey(name);
            const seat = seats[key];
            const reclaimToken = this.readSeatReclaimToken(roomId, key);
            const held = Boolean(seat?.online || (seat?.disconnectedAt && now - Number(seat.disconnectedAt) < holdMs));
            const reclaimable = Boolean(!seat?.online && held && reclaimToken && seat?.reclaimToken === reclaimToken);
            const occupiedByOther = Boolean(held && seat?.uid !== this.backend.uid && seat?.deviceId !== this.deviceId && !reclaimable);
            const occupiedByCurrentIdentity = Boolean(currentIdentityOnline && currentSeatKey !== key);
            const occupied = occupiedByOther || occupiedByCurrentIdentity;
            const reconnecting = Boolean(currentIdentityOnline && currentSeatKey === key);
            const hint = occupied ? "参加中" : (reconnecting || reclaimable ? "この名前で再接続" : "この名前で入る");
            return `<button type="button" class="online-seat-button" data-online-seat="1" data-room-id="${roomId}" data-member-name="${this.bridge.escapeHtml?.(name) || name}" data-team="${team}" ${occupied ? "disabled" : ""}>${this.bridge.escapeHtml?.(name) || name}<small>${hint}</small></button>`;
          }).join("") : `<span class="online-room-meta">メンバー未設定</span>`}
        </div>
      `).join("") + `
        <button type="button" class="online-seat-button" data-online-seat="1" data-room-id="${roomId}" data-spectator="1" ${currentIdentityOnline && currentSeatKey ? "disabled" : ""}>観戦として入る<small>${currentIdentityOnline && currentSeatKey ? "プレイヤーとして参加中" : "操作せずリアルタイム表示のみ"}</small></button>
      `;
      if (!this.ui.seatDialog.open) this.ui.seatDialog.showModal();
    }).catch((error) => console.error(error));
  }

  async joinRoom(roomId, selection) {
    if (this.busy) return;
    this.setBusy(true);
    try {
      if (this.roomId && this.roomId !== roomId) {
        this.setBusy(false);
        const left = await this.leaveRoom({ switching: true });
        if (!left) throw new Error("現在の部屋から退出できませんでした。接続を確認して再試行してください。");
        this.setBusy(true);
      }
      const name = normalizeName(selection.name);
      const key = selection.spectator ? "" : playerKey(name);
      const savedReclaimToken = key ? this.readSeatReclaimToken(roomId, key) : "";
      const nextReclaimToken = key ? (savedReclaimToken || randomId("seat-reclaim")) : "";
      const now = this.backend.serverNow();
      const holdMs = Math.max(10, Number(this.config.seatHoldSeconds) || 60) * 1000;
      let abortReason = "";
      const result = await this.backend.transaction(this.roomPath(roomId), (room) => {
        if (!room?.meta) {
          abortReason = "部屋が見つかりません。ロビーを更新してください。";
          return undefined;
        }
        room.meta.active = true;
        room.participants ||= {};
        room.seats ||= {};
        const existingParticipant = room.participants[this.backend.uid];
        const existingSeatEntry = Object.entries(room.seats).find(([, seat]) => seat?.uid === this.backend.uid);
        const existingSeatKey = existingSeatEntry?.[0] || "";
        const currentIdentityOnline = Boolean(existingParticipant?.online || existingSeatEntry?.[1]?.online);
        if ((room.meta.masterUid === this.backend.uid || currentIdentityOnline) && existingSeatKey !== key) {
          abortReason = existingSeatKey
            ? "このブラウザはすでに別のプレイヤーとして参加中です"
            : "このブラウザはすでに観戦中です";
          return undefined;
        }
        Object.entries(room.seats).forEach(([seatKey, seat]) => {
          if (seat?.uid === this.backend.uid && seatKey !== key) delete room.seats[seatKey];
        });
        if (key) {
          const occupied = room.seats[key];
          const held = occupied?.online || (occupied?.disconnectedAt && now - occupied.disconnectedAt < holdMs);
          const sameBrowser = occupied?.deviceId && occupied.deviceId === this.deviceId;
          const reclaimable = Boolean(
            occupied &&
            !occupied.online &&
            savedReclaimToken &&
            occupied.reclaimToken === savedReclaimToken
          );
          if (occupied?.uid !== this.backend.uid && !sameBrowser && !reclaimable && held) {
            abortReason = "その名前は別の参加者が使用中です";
            return undefined;
          }
          const replacedUid = occupied?.uid && occupied.uid !== this.backend.uid ? occupied.uid : "";
          if (replacedUid) {
            delete room.participants[replacedUid];
            if (room.meta.masterUid === replacedUid) room.meta.masterUid = this.backend.uid;
          }
          room.seats[key] = createOnlineSeatRecord({
            uid: this.backend.uid,
            deviceId: this.deviceId,
            name,
            team: selection.team,
            now,
            joinedAt: occupied?.joinedAt || now,
            reclaimToken: reclaimable ? occupied.reclaimToken : nextReclaimToken
          });
        }
        const remainsMaster = room.meta.masterUid === this.backend.uid;
        room.participants[this.backend.uid] = {
          uid: this.backend.uid,
          deviceId: this.deviceId,
          role: remainsMaster ? "master" : (selection.spectator ? "spectator" : "player"),
          team: remainsMaster ? (existingParticipant?.team || selection.team) : (selection.spectator ? "" : selection.team),
          memberName: remainsMaster ? (existingParticipant?.memberName || name) : (selection.spectator ? "" : name),
          online: true,
          joinedAt: existingParticipant?.joinedAt || now,
          lastSeenAt: now
        };
        room.meta.updatedAt = now;
        return room;
      });
      if (!result.committed) throw new Error(abortReason || "入室処理が競合しました。もう一度お試しください。");
      await this.publishLobbySummary(result.value, roomId);
      this.roomId = roomId;
      this.localMode = false;
      this.setStatus("online", this.mock ? "MOCK ONLINE" : "ONLINE");
      const joinedParticipant = result.value?.participants?.[this.backend.uid] || {};
      this.role = joinedParticipant.role || (selection.spectator ? "spectator" : "player");
      this.team = joinedParticipant.team || "";
      this.memberName = this.role === "spectator" ? "観戦" : (joinedParticipant.memberName || name);
      this.seatKey = key;
      if (key) this.storeSeatReclaimToken(roomId, key, result.value?.seats?.[key]?.reclaimToken || nextReclaimToken);
      await this.enterRoom(roomId, result.value);
      this.saveSession();
      this.ui.seatDialog.close();
      this.hideLobby();
    } catch (error) {
      console.error(error);
      if (roomId) this.openSeatDialog(roomId);
      window.setTimeout(() => this.showError("JOIN ERROR", error), 0);
    } finally {
      this.setBusy(false);
    }
  }

  async enterRoom(roomId, initialRoom = null) {
    this.roomId = roomId;
    this.roomUnsubscribe?.();
    this.room = initialRoom || await this.backend.get(this.roomPath(roomId));
    this.lastEventSeq = Number(this.room?.meta?.eventSeq) || 0;
    sessionStorage.setItem(`teamBingo.lastEvent.${roomId}`, String(this.lastEventSeq));
    this.updateSessionUi();
    this.applyRoom(this.room, { initial: true });
    this.roomUnsubscribe = this.backend.subscribe(this.roomPath(roomId), (room) => this.onRoomValue(room));
    this.subscribeGlobalStats();
    this.startHeartbeat();
    this.startConnectionMonitor();
    window.setTimeout(() => {
      if (this.isMaster()) this.importLegacyStats().catch((error) => console.error(error));
    }, 240);
  }

  saveSession() {
    if (!this.roomId) return;
    sessionStorage.setItem("teamBingo.onlineSession.v1", JSON.stringify({
      roomId: this.roomId,
      role: this.role,
      team: this.team,
      memberName: this.memberName,
      seatKey: this.seatKey
    }));
  }

  async restoreSession() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem("teamBingo.onlineSession.v1") || "null"); }
    catch { saved = null; }
    if (!saved?.roomId) return false;
    const room = await this.backend.get(this.roomPath(saved.roomId));
    if (!room?.meta) {
      sessionStorage.removeItem("teamBingo.onlineSession.v1");
      return false;
    }
    const participant = room.participants?.[this.backend.uid];
    const seat = saved.seatKey ? room.seats?.[saved.seatKey] : null;
    const wasMaster = room.meta.masterUid === this.backend.uid;
    if (!wasMaster && !participant && seat?.uid !== this.backend.uid) {
      sessionStorage.removeItem("teamBingo.onlineSession.v1");
      return false;
    }
    const now = this.backend.serverNow();
    const result = await this.backend.transaction(this.roomPath(saved.roomId), (current) => {
      if (!current?.meta) return undefined;
      current.meta.active = true;
      current.participants ||= {};
      const isMaster = current.meta.masterUid === this.backend.uid;
      const restoredRole = isMaster
        ? "master"
        : ((saved.role === "player" || saved.role === "master" || saved.team || saved.seatKey || participant?.team) ? "player" : "spectator");
      current.participants[this.backend.uid] = {
        ...(current.participants[this.backend.uid] || {}),
        uid: this.backend.uid,
        deviceId: this.deviceId,
        role: restoredRole,
        team: saved.team || participant?.team || "",
        memberName: saved.memberName || participant?.memberName || "",
        online: true,
        joinedAt: participant?.joinedAt || now,
        lastSeenAt: now,
        disconnectedAt: null
      };
      if (saved.seatKey && current.seats?.[saved.seatKey]?.uid === this.backend.uid) {
        current.seats[saved.seatKey].deviceId = this.deviceId;
        current.seats[saved.seatKey].online = true;
        current.seats[saved.seatKey].lastSeenAt = now;
        current.seats[saved.seatKey].disconnectedAt = null;
      }
      return current;
    });
    if (!result.committed) return false;
    const isMaster = result.value?.meta?.masterUid === this.backend.uid;
    const restoredRole = isMaster
      ? "master"
      : ((saved.role === "player" || saved.role === "master" || saved.team || saved.seatKey || participant?.team) ? "player" : "spectator");
    this.roomId = saved.roomId;
    this.role = restoredRole;
    this.team = saved.team || "";
    this.memberName = saved.memberName || (this.role === "spectator" ? "観戦" : "");
    this.seatKey = saved.seatKey || "";
    await this.enterRoom(saved.roomId, result.value);
    this.hideLobby();
    return true;
  }

  onRoomValue(room) {
    if (!room || room.meta?.active === false) {
      this.bridge.showOnlineMessage?.("ROOM CLOSED", "部屋が終了しました。");
      this.leaveRoom({ remoteClosed: true });
      return;
    }
    if (this.busy) {
      this.pendingRoom = room;
      return;
    }
    this.applyRoom(room);
  }

  applyRoom(room, options = {}) {
    const previous = this.room;
    this.room = room;
    const participant = room.participants?.[this.backend.uid];
    if (participant) {
      this.role = participant.role || this.role;
      this.team = participant.team || "";
      this.memberName = participant.memberName || (this.role === "spectator" ? "観戦" : this.memberName);
    } else if (this.roomId && !this.leavingRoom) {
      this.scheduleMembershipLossCheck(this.roomId);
    }
    this.updateSessionUi();
    this.scheduleMasterHandover(room);
    this.applyingRemote = true;
    try {
      this.bridge.applyOnlineSetupSnapshot?.(room.setup || {}, { initial: Boolean(options.initial), role: this.role });
      if (room.game) this.bridge.applyOnlineGameSnapshot?.(room.game, { initial: Boolean(options.initial) });
      if (options.initial && room.game && !room.game.winner) {
        this.bridge.restoreOnlineCommentary?.(selectCurrentOnlineCommentary(room, this.backend.serverNow()));
      }
      const sequence = Number(room.meta?.eventSeq) || 0;
      if (!options.initial && sequence > this.lastEventSeq) {
        const events = Object.entries(room.events || {})
          .map(([key, event]) => ({ ...event, seq: Number(key) }))
          .filter((event) => event.seq > this.lastEventSeq)
          .sort((a, b) => a.seq - b.seq);
        const historyGap = !events.length || events[0].seq > this.lastEventSeq + 1;
        const backlogTooLarge = events.length > MAX_EVENT_REPLAY;
        if (historyGap || backlogTooLarge) {
          const latest = events.at(-1);
          this.localActionIds.clear();
          if (room.game?.gameStarted && room.game?.winner) this.bridge.showOnlineVictorySnapshot?.(room.game, room.lastVictory || null);
          else if (latest) this.bridge.playOnlineEvent?.(latest);
        } else {
          events.forEach((event) => {
            if (!this.localActionIds.has(event.actionId)) this.bridge.playOnlineEvent?.(event);
            this.localActionIds.delete(event.actionId);
          });
        }
        this.lastEventSeq = sequence;
        sessionStorage.setItem(`teamBingo.lastEvent.${this.roomId}`, String(sequence));
      }
      if (options.initial && room.game?.gameStarted && room.game?.winner) {
        this.bridge.showOnlineVictorySnapshot?.(room.game, room.lastVictory || null);
      }
    } finally {
      this.applyingRemote = false;
    }
    if (previous?.meta?.masterUid !== room.meta?.masterUid) this.bridge.onMasterChanged?.(room.meta?.masterUid === this.backend.uid);
  }

  updateSessionUi() {
    this.syncSpectatorControls();
    if (!this.roomId) {
      if (!this.roomDraft && !this.localMode) this.ui.sessionBar.classList.remove("show");
      return;
    }
    this.roomDraft = false;
    document.body.classList.remove("online-room-draft");
    document.body.classList.remove("online-local-mode");
    this.ui.leaveRoom.textContent = "LEAVE";
    this.ui.sessionBar.classList.add("show");
    this.ui.openLobby.textContent = "ROOMS";
    this.ui.leaveRoom.hidden = false;
    const master = this.room?.meta?.masterUid === this.backend?.uid;
    if (master) this.role = "master";
    this.ui.sessionName.textContent = "";
    this.ui.sessionRole.textContent = "";
    this.ui.sessionPresence.textContent = "";
    this.ui.closeRoom.hidden = !master;
    document.body.classList.toggle("online-readonly", !master);
    document.body.classList.toggle("online-spectator", this.role === "spectator");
    document.body.classList.toggle("online-team-red", !master && this.role === "player" && this.team === "red");
    document.body.classList.toggle("online-team-blue", !master && this.role === "player" && this.team === "blue");
    this.bridge.setOnlineSession?.({ roomId: this.roomId, role: this.role, team: this.team, memberName: this.memberName, master });
    window.setTimeout(() => this.placeSessionBar(), 0);
  }

  syncSpectatorControls() {
    const hypeButton = document.getElementById("hypeCenterButton");
    if (!hypeButton) return;
    const spectator = Boolean(this.roomId && this.role === "spectator");
    hypeButton.setAttribute("aria-disabled", spectator ? "true" : "false");
    hypeButton.tabIndex = spectator ? -1 : 0;
  }

  placeSessionBar() {
    if ((!this.roomId && !this.roomDraft && !this.localMode) || !this.ui?.sessionBar) return;
    const setupScreen = document.querySelector("#setupScreen.active");
    const target = document.querySelector("#playScreen.active .top-right")
      || setupScreen?.querySelector(this.roomDraft ? ".setup-top-center" : ".setup-top-right")
      || document.body;
    if (this.ui.sessionBar.parentElement !== target) target.appendChild(this.ui.sessionBar);
  }

  async leaveRoom(options = {}) {
    if (!this.roomId) return true;
    if (this.leavingRoom) return false;
    this.leavingRoom = true;
    try {
      return await this.leaveRoomInternal(options);
    } finally {
      this.leavingRoom = false;
    }
  }

  async leaveRoomInternal(options = {}) {
    if (!this.roomId) return true;
    const roomId = this.roomId;
    const key = this.seatKey;
    const wasMaster = this.isMaster();
    this.stopHeartbeat();
    const presenceStopped = await this.stopPresenceTracking();
    if (!presenceStopped && !options.remoteClosed) {
      this.startHeartbeat();
      this.startConnectionMonitor();
      this.showError("LEAVE ERROR", "接続状態の解除に失敗しました。接続を確認して再試行してください。");
      return false;
    }
    if (!options.remoteClosed) {
      let result = null;
      try {
        result = await this.backend.transaction(this.roomPath(roomId), (room) => {
          if (!room) return room;
          if (wasMaster) {
            const replacement = Object.values(room.participants || {})
              .filter((participant) => participant?.uid !== this.backend.uid && participant?.online && participant.role !== "spectator")
              .sort((a, b) => (Number(a.joinedAt) || 0) - (Number(b.joinedAt) || 0))[0];
            if (replacement) {
              delete room.participants[this.backend.uid];
              if (key && room.seats?.[key]?.uid === this.backend.uid) delete room.seats[key];
              room.meta.masterUid = replacement.uid;
              replacement.role = "master";
            } else {
              return null;
            }
          } else {
            if (room.participants) delete room.participants[this.backend.uid];
            if (key && room.seats?.[key]?.uid === this.backend.uid) delete room.seats[key];
          }
          room.meta.updatedAt = this.backend.serverNow();
          return room;
        });
      } catch (error) {
        this.startHeartbeat();
        this.startConnectionMonitor();
        this.showError("LEAVE ERROR", error);
        return false;
      }
      if (!result?.committed) {
        this.startHeartbeat();
        this.startConnectionMonitor();
        this.showError("LEAVE ERROR", "退出処理が競合しました。もう一度お試しください。");
        return false;
      }
      try {
        await this.publishLobbySummary(result.value, roomId);
      } catch (error) {
        if (result.value) {
          console.warn("Lobby summary could not be updated after leave", error);
        }
      }
    }
    this.roomUnsubscribe?.();
    this.roomUnsubscribe = null;
    if (!options.preserveReclaimToken) this.clearSeatReclaimToken(roomId, key);
    this.roomId = "";
    this.room = null;
    this.role = "";
    this.team = "";
    this.memberName = "";
    this.seatKey = "";
    sessionStorage.removeItem("teamBingo.onlineSession.v1");
    this.stopHeartbeat();
    if (this.masterHandoverTimer) window.clearTimeout(this.masterHandoverTimer);
    this.masterHandoverTimer = 0;
    if (this.membershipLossTimer) window.clearTimeout(this.membershipLossTimer);
    this.membershipLossTimer = 0;
    this.updateSessionUi();
    document.body.classList.remove("online-readonly", "online-spectator", "online-team-red", "online-team-blue");
    this.bridge.onRoomLeft?.();
    if (!options.switching) this.showLobby();
    return true;
  }

  async closeRoom() {
    if (!this.isMaster() || !this.roomId) return false;
    const roomId = this.roomId;
    this.stopHeartbeat();
    const presenceStopped = await this.stopPresenceTracking();
    if (!presenceStopped) {
      this.startHeartbeat();
      this.startConnectionMonitor();
      this.showError("ROOM CLOSE ERROR", "接続状態の解除に失敗しました。接続を確認して再試行してください。");
      return false;
    }
    try {
      await this.backend.update({
        [this.roomPath(roomId)]: null,
        [this.lobbyPath(roomId)]: null
      });
    } catch (error) {
      this.startHeartbeat();
      this.startConnectionMonitor();
      this.showError("ROOM CLOSE ERROR", error);
      return false;
    }
    await this.leaveRoom({ remoteClosed: true });
    return true;
  }

  startHeartbeat() {
    this.stopHeartbeat();
    const tick = async () => {
      if (!this.roomId || !this.backend) return;
      const roomId = this.roomId;
      const seatKey = this.seatKey;
      const now = this.backend.serverNow();
      let result = null;
      try {
        result = await this.backend.transaction(this.roomPath(roomId), (room) => {
          if (!this.hasAuthoritativeMembership(room, seatKey)) return undefined;
          const participant = room.participants[this.backend.uid];
          participant.online = true;
          participant.lastSeenAt = now;
          participant.disconnectedAt = null;
          if (seatKey) {
            room.seats[seatKey].online = true;
            room.seats[seatKey].lastSeenAt = now;
            room.seats[seatKey].disconnectedAt = null;
          }
          if (room.meta?.masterUid === this.backend.uid) room.meta.updatedAt = now;
          return room;
        });
      } catch {
        return;
      }
      if (this.roomId !== roomId) return;
      if (!result?.committed) {
        this.scheduleMembershipLossCheck(roomId);
        return;
      }
      if (result.value?.meta?.masterUid === this.backend.uid) {
        await this.publishLobbySummary(result.value, roomId).catch(() => {});
      }
    };
    this.heartbeatTimer = window.setInterval(tick, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = 0;
  }

  startConnectionMonitor() {
    this.stopConnectionMonitor();
    if (!this.backend?.subscribeConnection) {
      this.refreshPresence().catch(() => {});
      return;
    }
    this.connectionUnsubscribe = this.backend.subscribeConnection((connected) => {
      if (connected && this.roomId) this.refreshPresence().catch(() => {});
    });
  }

  stopConnectionMonitor() {
    this.connectionUnsubscribe?.();
    this.connectionUnsubscribe = null;
  }

  async stopPresenceTracking() {
    this.stopConnectionMonitor();
    const pending = this.presenceRefreshPromise;
    if (pending) await pending.catch(() => {});
    const cleared = await this.backend?.clearPresenceDisconnect?.();
    return cleared !== false;
  }

  async refreshPresence() {
    if (!this.roomId || !this.backend) return false;
    if (this.presenceRefreshPromise) return this.presenceRefreshPromise;
    const roomId = this.roomId;
    const seatKey = this.seatKey;
    this.presenceRefreshPromise = (async () => {
      const participantPath = this.roomPath(roomId, `participants/${this.backend.uid}`);
      const seatPath = seatKey ? this.roomPath(roomId, `seats/${seatKey}`) : "";
      await this.backend.setPresenceDisconnect?.(participantPath, seatPath);
      if (this.roomId !== roomId) return false;
      const now = this.backend.serverNow();
      const result = await this.backend.transaction(this.roomPath(roomId), (room) => {
        if (!room?.meta || !this.hasAuthoritativeMembership(room, seatKey)) return undefined;
        const participant = room.participants[this.backend.uid];
        participant.online = true;
        participant.lastSeenAt = now;
        participant.disconnectedAt = null;
        if (seatKey && room.seats?.[seatKey]?.uid === this.backend.uid) {
          room.seats[seatKey].online = true;
          room.seats[seatKey].lastSeenAt = now;
          room.seats[seatKey].disconnectedAt = null;
        }
        if (room.meta.masterUid === this.backend.uid) room.meta.updatedAt = now;
        return room;
      });
      if (!result.committed || this.roomId !== roomId) {
        if (this.roomId === roomId) this.scheduleMembershipLossCheck(roomId);
        return false;
      }
      this.room = result.value;
      if (result.value?.meta?.masterUid === this.backend.uid) {
        await this.publishLobbySummary(result.value, roomId).catch(() => {});
      }
      return true;
    })();
    try {
      return await this.presenceRefreshPromise;
    } finally {
      this.presenceRefreshPromise = null;
    }
  }

  scheduleMasterHandover(room) {
    if (this.masterHandoverTimer) window.clearTimeout(this.masterHandoverTimer);
    this.masterHandoverTimer = 0;
    if (!room || room.meta?.masterUid === this.backend?.uid) return;
    const master = room.participants?.[room.meta?.masterUid];
    if (!master || master.online !== false) return;
    const disconnectedAt = Number(master.disconnectedAt) || this.backend.serverNow();
    const grace = Math.max(5, Number(this.config.masterHandoverSeconds) || 30) * 1000;
    const delay = Math.max(100, disconnectedAt + grace - this.backend.serverNow());
    this.masterHandoverTimer = window.setTimeout(() => this.tryMasterHandover(), delay);
  }

  async tryMasterHandover() {
    this.masterHandoverTimer = 0;
    if (!this.roomId || this.role === "spectator") return;
    const now = this.backend.serverNow();
    const grace = Math.max(5, Number(this.config.masterHandoverSeconds) || 30) * 1000;
    const result = await this.backend.transaction(this.roomPath(), (room) => {
      if (!room?.meta?.masterUid) return room;
      const master = room.participants?.[room.meta.masterUid];
      if (!master || master.online !== false || now - (Number(master.disconnectedAt) || now) < grace) return room;
      const replacement = Object.values(room.participants || {})
        .filter((participant) => participant?.online && participant.role !== "spectator")
        .sort((a, b) => (Number(a.joinedAt) || 0) - (Number(b.joinedAt) || 0))[0];
      if (!replacement) return room;
      if (master.role === "master") master.role = master.team || master.memberName ? "player" : "spectator";
      replacement.role = "master";
      room.meta.masterUid = replacement.uid;
      room.meta.updatedAt = now;
      return room;
    }).catch(() => null);
    if (result?.committed && result.value) await this.publishLobbySummary(result.value).catch(() => {});
  }

  isOnline() { return Boolean(this.enabled && this.backend && this.roomId); }
  isApplyingRemote() { return this.applyingRemote; }
  isMaster() { return Boolean(this.roomId && this.room?.meta?.masterUid === this.backend?.uid); }
  canEditSetup() { return !this.isOnline() || this.isMaster(); }
  canEditTeam(team) { return !this.isOnline() || this.isMaster() || (this.role === "player" && this.team === team); }
  currentMemberName() { return this.memberName; }

  async publishSetup(setup) {
    if (!this.isOnline() || !this.isMaster() || this.busy) return;
    const now = this.backend.serverNow();
    const result = await this.backend.transaction(this.roomPath(), (room) => {
      if (!room || room.meta?.masterUid !== this.backend.uid || room.game?.gameStarted) return undefined;
      room.setup = clone(setup);
      room.meta.updatedAt = now;
      if (!room.meta.customTitle) {
        room.meta.title = setup.redMembers?.[0] ? `${setup.redMembers[0]}たちの部屋` : room.meta.title;
      }
      return room;
    });
    if (result.committed) {
      await this.publishLobbySummary(result.value);
    }
  }

  async requestAction(action, localMutator) {
    if (!this.isOnline() || this.applyingRemote) return localMutator();
    if (this.busy) return false;
    if (this.role === "spectator") {
      this.bridge.showOnlineMessage?.("WATCH ONLY", "観戦者はゲーム操作を送信できません。");
      return false;
    }
    const team = action?.payload?.team || "";
    if (team && !this.canEditTeam(team)) {
      this.bridge.showOnlineMessage?.("READ ONLY", "自分のチームのカードだけ操作できます。");
      return false;
    }
    if (action?.masterOnly && !this.isMaster()) {
      this.bridge.showOnlineMessage?.("MASTER ONLY", "この操作はルームマスターのみ使用できます。");
      return false;
    }
    const actionId = randomId("action");
    this.setBusy(true);
    try {
      const acquired = await this.acquireActionLock(actionId);
      if (!acquired) throw new Error("ほかの操作を同期中です。少し待ってもう一度押してください。");
      const remoteRoom = await this.backend.get(this.roomPath());
      if (!remoteRoom) throw new Error("部屋が見つかりません");
      if (!this.canPerformAuthoritativeAction(remoteRoom, action)) {
        throw new Error("参加権限が更新されました。最新のルーム状態へ戻します。");
      }
      if (
        (action.type === "toggle-cell" || action.type === "toggle-cell-player") &&
        typeof action.payload?.expectedMarked === "boolean"
      ) {
        const remoteMarked = Boolean(remoteRoom.game?.[action.payload.team]?.marked?.[Number(action.payload.index)]);
        if (remoteMarked !== action.payload.expectedMarked) {
          throw new Error("同じマスが先に更新されたため、2件目の操作を取り消しました。");
        }
      }
      this.applyingRemote = true;
      try {
        if (remoteRoom.setup) this.bridge.applyOnlineSetupSnapshot?.(remoteRoom.setup, { silent: true });
        if (remoteRoom.game) this.bridge.applyOnlineGameSnapshot?.(remoteRoom.game, { silent: true });
      } finally {
        this.applyingRemote = false;
      }
      const beforeGame = clone(remoteRoom.game || this.bridge.getOnlineGameSnapshot?.());
      const beforeStats = clone(this.globalStatsSnapshot || this.bridge.getOnlineStatsSnapshot?.() || {});
      this.bridge.beginOnlineEventCapture?.(action);
      let presentation = null;
      try {
        const localResult = localMutator();
        if (localResult && typeof localResult.then === "function") await localResult;
      } finally {
        presentation = this.bridge.endOnlineEventCapture?.() || null;
      }
      if (presentation) action.presentation = presentation;
      const afterGame = clone(this.bridge.getOnlineGameSnapshot?.());
      const afterStats = clone(this.bridge.getOnlineStatsSnapshot?.() || {});
      const event = this.bridge.createOnlineEvent?.(action, beforeGame, afterGame) || { type: action.type, payload: action.payload || {} };
      const committed = await this.commitAction(actionId, action, afterGame, event, remoteRoom.meta?.revision || 0);
      if (!committed) throw new Error("操作が競合したため最新状態に戻しました");
      this.localActionIds.add(actionId);
      const statsDelta = createStatsDelta(beforeStats, afterStats);
      const committedStats = await this.commitStatsDelta(actionId, statsDelta);
      if (committedStats) {
        this.globalStatsSnapshot = committedStats;
        this.bridge.applyOnlineStatsSnapshot?.(committedStats);
      }
      return true;
    } catch (error) {
      console.error(error);
      const current = await this.backend.get(this.roomPath()).catch(() => null);
      if (current) this.applyRoom(current, { initial: true });
      this.showError("SYNC RETRY", error);
      return false;
    } finally {
      await this.releaseActionLock(actionId).catch(() => {});
      this.setBusy(false);
      if (this.pendingRoom) {
        const pending = this.pendingRoom;
        this.pendingRoom = null;
        this.applyRoom(pending);
      }
    }
  }

  async acquireActionLock(actionId) {
    const expiresAt = this.backend.serverNow() + Math.max(10, Number(this.config.actionLockSeconds) || 45) * 1000;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const result = await this.backend.transaction(this.roomPath(this.roomId, "lock"), (lock) => {
        const now = this.backend.serverNow();
        if (lock && lock.expiresAt > now && lock.uid !== this.backend.uid) return undefined;
        return { actionId, uid: this.backend.uid, expiresAt };
      });
      if (result.committed && result.value?.actionId === actionId) return true;
      await new Promise((resolve) => window.setTimeout(resolve, 120 + attempt * 35));
    }
    return false;
  }

  async releaseActionLock(actionId) {
    if (!this.roomId || !actionId) return;
    await this.backend.transaction(this.roomPath(this.roomId, "lock"), (lock) => {
      if (lock?.actionId === actionId && lock?.uid === this.backend.uid) return null;
      return lock;
    });
  }

  async commitAction(actionId, action, game, event, baseRevision) {
    const now = this.backend.serverNow();
    const result = await this.backend.transaction(this.roomPath(), (room) => {
      if (!room || room.meta?.active === false) return undefined;
      if (room.processedActions?.[actionId]) return room;
      if (room.lock?.actionId !== actionId || room.lock?.uid !== this.backend.uid) return undefined;
      if ((Number(room.meta?.revision) || 0) !== (Number(baseRevision) || 0)) return undefined;
      const sequence = (Number(room.meta.eventSeq) || 0) + 1;
      room.game = clone(game);
      room.meta.revision = (Number(room.meta.revision) || 0) + 1;
      room.meta.eventSeq = sequence;
      room.meta.phase = roomStatusFromGame(game);
      room.meta.updatedAt = now;
      room.events ||= {};
      room.events[sequence] = {
        ...clone(event),
        actionId,
        actorUid: this.backend.uid,
        actorName: this.memberName || "MASTER",
        createdAt: now
      };
      room.events = trimObjectByNumericKey(room.events, 200);
      room.processedActions ||= {};
      room.processedActions[actionId] = now;
      const processedEntries = Object.entries(room.processedActions).sort(([, a], [, b]) => Number(b) - Number(a)).slice(0, 300);
      room.processedActions = Object.fromEntries(processedEntries);
      if (game?.winner) room.lastVictory = clone(event?.victory || room.lastVictory || null);
      room.lock = null;
      return room;
    });
    if (result.committed) {
      this.room = result.value;
      await this.publishLobbySummary(result.value);
    }
    return result.committed;
  }

  async syncCurrentState(reason = "state-sync") {
    if (!this.isOnline() || (!this.isMaster() && this.role !== "player") || this.applyingRemote || this.busy) return false;
    const actionId = randomId("sync");
    const expectedRevision = Number(this.room?.meta?.revision) || 0;
    this.setBusy(true);
    try {
      const localGame = clone(this.bridge.getOnlineGameSnapshot?.());
      const localStats = clone(this.bridge.getOnlineStatsSnapshot?.() || {});
      const acquired = await this.acquireActionLock(actionId);
      if (!acquired) return false;
      const remoteRoom = await this.backend.get(this.roomPath());
      if (!remoteRoom) return false;
      if (!this.hasAuthoritativeMembership(remoteRoom)) {
        this.scheduleMembershipLossCheck(this.roomId);
        return false;
      }
      if ((Number(remoteRoom.meta?.revision) || 0) !== expectedRevision) {
        this.applyRoom(remoteRoom);
        return false;
      }
      const event = this.bridge.createOnlineEvent?.(
        { type: reason, payload: {} },
        remoteRoom.game || null,
        localGame
      ) || { type: reason, payload: {} };
      const committed = await this.commitAction(actionId, { type: reason, payload: {} }, localGame, event, remoteRoom.meta?.revision || 0);
      if (!committed) return false;
      this.localActionIds.add(actionId);
      const beforeStats = clone(this.globalStatsSnapshot || {});
      const committedStats = await this.commitStatsDelta(actionId, createStatsDelta(beforeStats, localStats));
      if (committedStats) {
        this.globalStatsSnapshot = committedStats;
        this.bridge.applyOnlineStatsSnapshot?.(committedStats);
      }
      return true;
    } finally {
      await this.releaseActionLock(actionId).catch(() => {});
      this.setBusy(false);
      if (this.pendingRoom) {
        const pending = this.pendingRoom;
        this.pendingRoom = null;
        this.applyRoom(pending);
      }
    }
  }

  subscribeGlobalStats() {
    if (this.statsUnsubscribe) return;
    this.statsUnsubscribe = this.backend.subscribe(this.path("globalStats"), (stats) => {
      const normalized = stats || {};
      this.globalStatsSnapshot = { ranking: clone(normalized.ranking || {}), playerStats: clone(normalized.playerStats || { players: {}, rivalries: {}, recentMatches: [] }) };
      this.bridge.applyOnlineStatsSnapshot?.(this.globalStatsSnapshot);
    });
  }

  async commitStatsDelta(actionId, delta) {
    if (!actionId || !delta) return null;
    const result = await this.backend.transaction(this.path("globalStats"), (stats) => {
      stats ||= { ranking: {}, playerStats: { players: {}, rivalries: {}, recentMatches: [] }, processedActions: {} };
      stats.processedActions ||= {};
      if (stats.processedActions[actionId]) return stats;
      const next = applyStatsDelta(stats, delta);
      const updatedAt = this.backend.serverNow();
      next.processedActions[actionId] = updatedAt;
      if (Object.keys(delta.ranking || {}).length) next.rankingUpdatedAt = updatedAt;
      next.processedActions = Object.fromEntries(Object.entries(next.processedActions).sort(([, a], [, b]) => Number(b) - Number(a)).slice(0, 500));
      return next;
    });
    if (!result.committed || !result.value) return null;
    return {
      ranking: clone(result.value.ranking || {}),
      playerStats: clone(result.value.playerStats || { players: {}, rivalries: {}, recentMatches: [] })
    };
  }

  async importLegacyStats() {
    if (!this.isMaster() || !this.legacyStats) return;
    if (localStorage.getItem("teamBingo.onlineStatsImported.v1") === "1") return;
    const adminResult = await this.backend.transaction(this.path("adminUid"), (current) => {
      if (!current || current === this.backend.uid) return this.backend.uid;
      return undefined;
    });
    const adminUid = adminResult.value || await this.backend.get(this.path("adminUid"));
    if (adminUid !== this.backend.uid) return;
    const importKey = playerKey(this.deviceId);
    const existingImport = await this.backend.get(this.path(`legacyImports/${importKey}`));
    if (existingImport) {
      localStorage.setItem("teamBingo.onlineStatsImported.v1", "1");
      return;
    }
    const statsResult = await this.backend.transaction(this.path("globalStats"), (stats) => {
      stats ||= {};
      stats.legacyImports ||= {};
      if (stats.legacyImports[importKey]) return stats;
      const merged = mergeLegacyStats(stats, this.legacyStats);
      merged.legacyImports = { ...(merged.legacyImports || {}), [importKey]: this.backend.serverNow() };
      return merged;
    });
    if (!statsResult.committed) return;
    await this.backend.set(this.path(`legacyImports/${importKey}`), {
      importedAt: this.backend.serverNow(),
      uid: this.backend.uid
    });
    if (statsResult.value?.legacyImports?.[importKey]) {
      localStorage.setItem("teamBingo.onlineStatsImported.v1", "1");
      this.bridge.showOnlineMessage?.("STATS IMPORTED", "この端末の旧戦績をオンライン戦績へ統合しました。");
    }
  }

  isAdminMode() {
    return Boolean(this.adminMode && Number(this.adminExpiresAt) > this.backend.serverNow());
  }

  expireAdminMode(message = "管理者モードの有効期限が切れました。") {
    this.adminMode = false;
    this.adminExpiresAt = 0;
    window.clearTimeout(this.adminExpiryTimer);
    this.adminExpiryTimer = 0;
    if (this.ui?.adminMode) this.ui.adminMode.textContent = "ADMIN";
    this.bridge.onAdminModeChanged?.(false);
    this.hideAdminPage();
    this.showLobby();
    this.renderRooms();
    if (message) this.bridge.showOnlineMessage?.("ADMIN EXPIRED", message);
  }

  async verifyAdminSession() {
    if (!this.isAdminMode()) {
      this.expireAdminMode();
      return false;
    }
    try {
      const adminSession = await this.backend.get(this.path(`adminSessions/${this.backend.uid}`));
      if (
        adminSession?.pinHash === ADMIN_PIN_HASH &&
        Number(adminSession?.expiresAt) > this.backend.serverNow()
      ) return true;
    } catch (error) {
      this.showError("ADMIN VERIFY ERROR", error);
      return false;
    }
    this.expireAdminMode();
    return false;
  }

  async exportCountData() {
    if (!this.enabled || !this.isAdminMode()) return false;
    if (!await this.verifyAdminSession()) return false;
    try {
      const current = await this.backend.get(this.path("globalStats")) || {};
      const local = clone(this.bridge.getOnlineStatsSnapshot?.() || this.legacyStats || {});
      const payload = createCountBackupPayload(current, local, this.legacyStats);
      const rankingEntries = payload.summary.cellRankingEntries;
      const rankingTotal = payload.summary.totalCellOpens;
      const playerCount = payload.summary.players;
      const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `team-bingo-counts-${nowIso().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.ui.adminResult.textContent = `エクスポート完了: マスランキング ${rankingEntries}種 / 合計 ${rankingTotal} OPEN / プレイヤー ${playerCount}人`;
      return true;
    } catch (error) {
      this.ui.adminResult.textContent = `EXPORT ERROR: ${String(error?.message || error)}`;
      return false;
    }
  }

  async importCountData(file) {
    if (!this.enabled || !this.isAdminMode() || !file) return false;
    this.ui.adminExportCounts.disabled = true;
    this.ui.adminImportCounts.disabled = true;
    try {
      if (Number(file.size) > 5 * 1024 * 1024) throw new Error("ファイルサイズは5MB以下にしてください");
      const imported = normalizeCountBackup(JSON.parse(await file.text()));
      const rankingCount = Object.keys(imported.ranking).length;
      const playerCount = Object.keys(imported.playerStats.players || {}).length;
      if (!window.confirm(`現在のカウントデータを上書きします。\nランキング ${rankingCount}件 / プレイヤー ${playerCount}人\n実行しますか？`)) {
        this.ui.adminResult.textContent = "インポートをキャンセルしました。";
        return false;
      }
      if (!await this.verifyAdminSession()) throw new Error("管理者モードの有効期限が切れました");
      const actionId = randomId("stats-import");
      const result = await this.backend.transaction(this.path("globalStats"), (stats) => {
        const next = isPlainObject(stats) ? stats : {};
        const updatedAt = this.backend.serverNow();
        next.ranking = clone(imported.ranking);
        next.rankingUpdatedAt = updatedAt;
        next.playerStats = clone(imported.playerStats);
        next.processedActions ||= {};
        next.processedActions[actionId] = updatedAt;
        next.processedActions = Object.fromEntries(
          Object.entries(next.processedActions).sort(([, a], [, b]) => Number(b) - Number(a)).slice(0, 500)
        );
        return next;
      });
      if (!result.committed) throw new Error("データベースを更新できませんでした");
      this.globalStatsSnapshot = clone(imported);
      this.bridge.applyOnlineStatsSnapshot?.(this.globalStatsSnapshot);
      this.ui.adminResult.textContent = `インポート完了: ランキング ${rankingCount}件 / プレイヤー ${playerCount}人`;
      this.bridge.showOnlineMessage?.("COUNT DATA IMPORTED", "ランキングとプレイヤー戦績を復元しました。");
      return true;
    } catch (error) {
      this.ui.adminResult.textContent = `IMPORT ERROR: ${String(error?.message || error)}`;
      return false;
    } finally {
      this.ui.adminImportFile.value = "";
      this.ui.adminExportCounts.disabled = false;
      this.ui.adminImportCounts.disabled = false;
    }
  }

  async resetGlobalStats(kind) {
    if (!this.enabled) return false;
    if (!this.isAdminMode()) {
      this.bridge.showOnlineMessage?.("ADMIN ONLY", "ランキングと戦績のリセットは管理者のみ実行できます。");
      return false;
    }
    if (!["ranking", "playerStats"].includes(kind)) return false;
    if (!await this.verifyAdminSession()) return false;
    const actionId = randomId("stats-reset");
    const result = await this.backend.transaction(this.path("globalStats"), (stats) => {
      stats ||= { ranking: {}, playerStats: { players: {}, rivalries: {}, recentMatches: [] }, processedActions: {} };
      const updatedAt = this.backend.serverNow();
      if (kind === "ranking") {
        stats.ranking = {};
        stats.rankingUpdatedAt = updatedAt;
      }
      if (kind === "playerStats") stats.playerStats = { players: {}, rivalries: {}, recentMatches: [] };
      stats.processedActions ||= {};
      stats.processedActions[actionId] = updatedAt;
      stats.processedActions = Object.fromEntries(
        Object.entries(stats.processedActions).sort(([, a], [, b]) => Number(b) - Number(a)).slice(0, 500)
      );
      return stats;
    });
    if (!result.committed) return false;
    this.globalStatsSnapshot = {
      ranking: clone(result.value?.ranking || {}),
      playerStats: clone(result.value?.playerStats || { players: {}, rivalries: {}, recentMatches: [] })
    };
    this.bridge.applyOnlineStatsSnapshot?.(this.globalStatsSnapshot);
    if (this.ui.adminResult) {
      this.ui.adminResult.textContent = kind === "ranking"
        ? "開封ランキングをリセットしました。"
        : "プレイヤー戦績をリセットしました。";
    }
    this.bridge.showOnlineMessage?.("GLOBAL STATS RESET", kind === "ranking" ? "共通ランキングをリセットしました。" : "共通プレイヤー戦績をリセットしました。");
    return true;
  }

  async deleteGhostRooms(options = {}) {
    if (!this.backend || this.cleanupInFlight) return 0;
    if (options.requireAdmin) {
      if (!this.isAdminMode()) {
        this.bridge.showOnlineMessage?.("ADMIN ONLY", "GHOST部屋の一括削除は管理者のみ実行できます。");
        return 0;
      }
      if (!await this.verifyAdminSession()) return 0;
    }
    const ghosts = this.getGhostRooms();
    if (!ghosts.length) {
      this.syncAdminGhostControls();
      return 0;
    }
    const updates = {};
    ghosts.forEach(([id]) => {
      updates[this.lobbyPath(id)] = null;
      updates[this.roomPath(id)] = null;
    });
    this.cleanupInFlight = true;
    try {
      await this.backend.update(updates);
      ghosts.forEach(([id]) => { delete this.rooms[id]; });
      this.renderRooms();
      if (options.requireAdmin && this.ui.adminResult) {
        this.ui.adminResult.textContent = `GHOST部屋 ${ghosts.length}件を削除しました。`;
      }
      return ghosts.length;
    } catch (error) {
      if (options.requireAdmin) this.showError("GHOST CLEANUP ERROR", error);
      return 0;
    } finally {
      this.cleanupInFlight = false;
    }
  }

  async cleanupStaleRooms() {
    if (!this.backend || this.busy || this.cleanupInFlight) return;
    await this.deleteGhostRooms({ requireAdmin: false });
  }

  startGhostCleanupTimer() {
    window.clearInterval(this.ghostCleanupTimer);
    this.ghostCleanupTimer = window.setInterval(() => {
      this.cleanupStaleRooms().catch(() => {});
    }, 60000);
  }

  setBusy(busy) {
    this.busy = Boolean(busy);
    document.body.classList.toggle("online-sync-busy", this.busy);
  }
}

export async function initOnlineRoom(bridge) {
  const config = window.TEAM_BINGO_ONLINE_CONFIG || DEFAULT_CONFIG;
  const coordinator = new OnlineCoordinator(bridge, config);
  window.TeamBingoOnline = coordinator;
  await coordinator.init();
  return coordinator;
}
