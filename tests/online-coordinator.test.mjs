import test from "node:test";
import assert from "node:assert/strict";

import { FirebaseBackend, OnlineCoordinator } from "../online/online-room.js";

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function getAtPath(source, path) {
  return String(path || "").split("/").filter(Boolean).reduce((value, key) => value?.[key], source);
}

function setAtPath(source, path, value) {
  const keys = String(path || "").split("/").filter(Boolean);
  if (!keys.length) return clone(value);
  let parent = source;
  keys.slice(0, -1).forEach((key) => {
    parent[key] ||= {};
    parent = parent[key];
  });
  if (value === null || value === undefined) delete parent[keys.at(-1)];
  else parent[keys.at(-1)] = clone(value);
  return source;
}

class MemoryBackend {
  constructor(store, uid) {
    this.store = store;
    this.uid = uid;
    this.connectionCallback = null;
    this.presenceArms = [];
    this.presenceClearCount = 0;
  }

  serverNow() {
    return Date.now();
  }

  async get(path) {
    return clone(getAtPath(this.store.value, path));
  }

  async set(path, value) {
    this.store.value = setAtPath(this.store.value, path, value);
    return true;
  }

  async update(updates) {
    Object.entries(updates || {}).forEach(([path, value]) => {
      this.store.value = setAtPath(this.store.value, path, value);
    });
    return true;
  }

  subscribe(path, callback) {
    callback(clone(getAtPath(this.store.value, path)));
    return () => {};
  }

  subscribeConnection(callback) {
    this.connectionCallback = callback;
    return () => {
      if (this.connectionCallback === callback) this.connectionCallback = null;
    };
  }

  async setPresenceDisconnect(participantPath, seatPath = "") {
    this.presenceArms.push({ participantPath, seatPath });
  }

  async clearPresenceDisconnect() {
    this.presenceClearCount += 1;
    return true;
  }

  async transaction(path, updater) {
    const current = clone(getAtPath(this.store.value, path));
    const next = updater(current);
    if (next === undefined) return { committed: false, value: current };
    this.store.value = setAtPath(this.store.value, path, next);
    return { committed: true, value: clone(next) };
  }
}

function emptyStats() {
  return {
    ranking: {},
    playerStats: { players: {}, rivalries: {}, recentMatches: [] },
    processedActions: {}
  };
}

function createRoom() {
  return {
    meta: {
      id: "ROOM",
      masterUid: "master",
      revision: 0,
      eventSeq: 0,
      active: true,
      phase: "playing",
      updatedAt: Date.now()
    },
    setup: {
      redMembers: ["Master"],
      blueMembers: ["Guest"]
    },
    participants: {
      master: { uid: "master", role: "master", team: "red", memberName: "Master", online: true },
      guest: { uid: "guest", role: "player", team: "blue", memberName: "Guest", online: true }
    },
    game: {
      gameStarted: true,
      inputLocked: false,
      winner: null,
      red: { marked: [false, false] },
      blue: { marked: [false, false] }
    },
    events: {},
    processedActions: {}
  };
}

function createCoordinator(store, uid, role, team) {
  const coordinator = Object.create(OnlineCoordinator.prototype);
  const backend = new MemoryBackend(store, uid);
  const local = {
    game: clone(store.value.teamBingoV1.rooms.ROOM.game),
    stats: emptyStats()
  };
  coordinator.enabled = true;
  coordinator.backend = backend;
  coordinator.config = { databaseRoot: "teamBingoV1", actionLockSeconds: 1 };
  coordinator.root = "teamBingoV1";
  coordinator.roomId = "ROOM";
  coordinator.room = clone(store.value.teamBingoV1.rooms.ROOM);
  coordinator.role = role;
  coordinator.team = team;
  coordinator.memberName = uid;
  coordinator.applyingRemote = false;
  coordinator.busy = false;
  coordinator.pendingRoom = null;
  coordinator.localActionIds = new Set();
  coordinator.globalStatsSnapshot = emptyStats();
  coordinator.setBusy = (busy) => { coordinator.busy = Boolean(busy); };
  coordinator.showError = (title, error) => { coordinator.lastError = `${title}: ${error?.message || error}`; };
  coordinator.applyRoom = (room) => { coordinator.room = clone(room); };
  coordinator.createLobbySummary = (room) => ({
    active: room.meta.active,
    phase: room.meta.phase,
    updatedAt: room.meta.updatedAt
  });
  coordinator.bridge = {
    applyOnlineSetupSnapshot() {},
    applyOnlineGameSnapshot(snapshot) { local.game = clone(snapshot); },
    applyOnlineStatsSnapshot(snapshot) { local.stats = clone(snapshot); },
    getOnlineGameSnapshot() { return clone(local.game); },
    getOnlineStatsSnapshot() { return clone(local.stats); },
    createOnlineEvent(action) { return { type: action.type, payload: clone(action.payload || {}), effects: [] }; }
  };
  coordinator.testState = local;
  return coordinator;
}

function createStore() {
  return {
    value: {
      teamBingoV1: {
        rooms: { ROOM: createRoom() },
        lobby: {},
        globalStats: emptyStats()
      }
    }
  };
}

function prepareJoinCoordinator(store, uid, deviceId) {
  const coordinator = createCoordinator(store, uid, "", "");
  coordinator.deviceId = deviceId;
  coordinator.config.seatHoldSeconds = 60;
  coordinator.ui = { seatDialog: { close() {} } };
  coordinator.hideLobby = () => {};
  coordinator.openSeatDialog = () => {};
  coordinator.setStatus = () => {};
  coordinator.saveSession = () => {};
  coordinator.enterRoom = async (roomId, room) => {
    coordinator.roomId = roomId;
    coordinator.room = clone(room);
  };
  return coordinator;
}

function prepareAdminCoordinator(store, uid = "master") {
  const coordinator = createCoordinator(store, uid, "master", "red");
  coordinator.adminMode = true;
  coordinator.adminExpiresAt = Date.now() + 10 * 60 * 1000;
  coordinator.adminExpiryTimer = 0;
  coordinator.ui = {
    adminMode: { textContent: "ADMIN ON" },
    adminResult: { textContent: "" },
    adminExportCounts: { disabled: false },
    adminImportCounts: { disabled: false },
    adminImportFile: { value: "" }
  };
  coordinator.hideAdminPage = () => {};
  coordinator.showLobby = () => {};
  coordinator.renderRooms = () => {};
  coordinator.bridge.onAdminModeChanged = () => {};
  coordinator.bridge.showOnlineMessage = (title, message) => {
    coordinator.lastAdminMessage = `${title}: ${message}`;
  };
  store.value.teamBingoV1.adminSessions ||= {};
  store.value.teamBingoV1.adminSessions[uid] = {
    pinHash: "6440e6a91202aeddb45b070a80533f65a689c37d0cf1842ab2bd962e33377880",
    expiresAt: coordinator.adminExpiresAt
  };
  return coordinator;
}

globalThis.window ||= { setTimeout, clearTimeout };
globalThis.document ||= { body: { classList: { remove() {} } } };

const sessionValues = new Map();
globalThis.sessionStorage = {
  getItem(key) { return sessionValues.has(key) ? sessionValues.get(key) : null; },
  setItem(key, value) { sessionValues.set(key, String(value)); },
  removeItem(key) { sessionValues.delete(key); },
  clear() { sessionValues.clear(); }
};

const localValues = new Map();
globalThis.localStorage = {
  getItem(key) { return localValues.has(key) ? localValues.get(key) : null; },
  setItem(key, value) { localValues.set(key, String(value)); },
  removeItem(key) { localValues.delete(key); },
  clear() { localValues.clear(); }
};

test("Firebase presence operations are queued and canceled for both participant and seat", async () => {
  const backend = new FirebaseBackend({});
  const operations = [];
  backend.db = {};
  backend.api = {
    serverTimestamp: () => 12345,
    ref: (_database, path) => path,
    onDisconnect(path) {
      const operation = {
        path,
        payload: null,
        canceled: false,
        async update(payload) { this.payload = payload; },
        async cancel() { this.canceled = true; }
      };
      operations.push(operation);
      return operation;
    }
  };

  await backend.setPresenceDisconnect("rooms/ROOM/participants/guest", "rooms/ROOM/seats/blue0");

  assert.equal(operations.length, 2);
  assert.deepEqual(operations[0].payload, { online: false, disconnectedAt: 12345 });
  assert.deepEqual(operations[1].payload, { online: false, disconnectedAt: 12345 });
  assert.equal(backend.disconnectOperations.size, 2);

  const cleared = await backend.clearPresenceDisconnect();

  assert.equal(cleared, true);
  assert.equal(operations.every((operation) => operation.canceled), true);
  assert.equal(backend.disconnectOperations.size, 0);
});

test("a failed Firebase presence cancellation remains queued for retry", async () => {
  const backend = new FirebaseBackend({});
  backend.disconnectOperations.set("participant", { cancel: async () => { throw new Error("offline"); } });

  const cleared = await backend.clearPresenceDisconnect();

  assert.equal(cleared, false);
  assert.equal(backend.disconnectOperations.has("participant"), true);
});

test("a delayed lobby summary cannot overwrite a newer room status", async () => {
  const store = createStore();
  const master = createCoordinator(store, "master", "master", "red");
  master.createLobbySummary = OnlineCoordinator.prototype.createLobbySummary.bind(master);
  const newerRoom = createRoom();
  newerRoom.meta.updatedAt = 200;
  newerRoom.meta.revision = 2;
  newerRoom.meta.eventSeq = 2;
  newerRoom.meta.phase = "finished";
  newerRoom.game.winner = "red";
  store.value.teamBingoV1.lobby.ROOM = master.createLobbySummary(newerRoom);
  const staleRoom = createRoom();
  staleRoom.meta.updatedAt = 100;
  staleRoom.meta.revision = 1;
  staleRoom.meta.eventSeq = 1;
  staleRoom.meta.phase = "playing";

  await master.publishLobbySummary(staleRoom, "ROOM");

  assert.equal(store.value.teamBingoV1.lobby.ROOM.phase, "finished");
  assert.equal(store.value.teamBingoV1.lobby.ROOM.updatedAt, 200);
  assert.equal(store.value.teamBingoV1.lobby.ROOM.eventSeq, 2);

  const latestRoom = createRoom();
  latestRoom.meta.updatedAt = 300;
  latestRoom.meta.revision = 3;
  latestRoom.meta.eventSeq = 3;
  latestRoom.participants.guest.online = false;
  await master.publishLobbySummary(latestRoom, "ROOM");

  assert.equal(store.value.teamBingoV1.lobby.ROOM.phase, "playing");
  assert.equal(store.value.teamBingoV1.lobby.ROOM.updatedAt, 300);
  assert.equal(store.value.teamBingoV1.lobby.ROOM.onlineCount, 1);
});

test("ranking mutations persist an authoritative timestamp even when the map becomes empty", async () => {
  const store = createStore();
  const master = createCoordinator(store, "master", "master", "red");

  await master.commitStatsDelta("ranking-open", {
    ranking: { 53: 1 },
    players: {},
    rivalries: {},
    recentMatches: []
  });
  const firstUpdatedAt = store.value.teamBingoV1.globalStats.rankingUpdatedAt;
  assert.equal(store.value.teamBingoV1.globalStats.ranking[53], 1);
  assert.equal(Number(firstUpdatedAt) > 0, true);

  await master.commitStatsDelta("ranking-close", {
    ranking: { 53: -1 },
    players: {},
    rivalries: {},
    recentMatches: []
  });

  assert.deepEqual(store.value.teamBingoV1.globalStats.ranking, {});
  assert.equal(Number(store.value.teamBingoV1.globalStats.rankingUpdatedAt) >= Number(firstUpdatedAt), true);
});

test("admin ranking reset preserves player stats and bounds processed action history", async () => {
  const store = createStore();
  const stats = store.value.teamBingoV1.globalStats;
  stats.ranking = { 53: 7, 69: 4 };
  stats.playerStats.players.jan = { name: "JAN", games: 3, wins: 2 };
  stats.processedActions = Object.fromEntries(
    Array.from({ length: 510 }, (_, index) => [`old-${index}`, index + 1])
  );
  const admin = prepareAdminCoordinator(store);

  const reset = await admin.resetGlobalStats("ranking");

  assert.equal(reset, true);
  assert.deepEqual(store.value.teamBingoV1.globalStats.ranking, {});
  assert.equal(Number(store.value.teamBingoV1.globalStats.rankingUpdatedAt) > 0, true);
  assert.equal(store.value.teamBingoV1.globalStats.playerStats.players.jan.games, 3);
  assert.equal(Object.keys(store.value.teamBingoV1.globalStats.processedActions).length, 500);
});

test("invalid reset kinds and expired server admin sessions cannot mutate shared data", async () => {
  const store = createStore();
  store.value.teamBingoV1.globalStats.ranking = { 53: 5 };
  const admin = prepareAdminCoordinator(store);

  assert.equal(await admin.resetGlobalStats("everything"), false);
  assert.deepEqual(store.value.teamBingoV1.globalStats.ranking, { 53: 5 });

  store.value.teamBingoV1.adminSessions.master.expiresAt = Date.now() - 1;
  const deleted = await admin.adminDeleteRoom("ROOM");

  assert.equal(deleted, false);
  assert.ok(store.value.teamBingoV1.rooms.ROOM);
  assert.equal(admin.adminMode, false);
  assert.match(admin.lastAdminMessage, /^ADMIN EXPIRED:/);
});

test("an expired server admin session cannot export shared count data", async () => {
  const store = createStore();
  const admin = prepareAdminCoordinator(store);
  store.value.teamBingoV1.adminSessions.master.expiresAt = Date.now() - 1;

  const exported = await admin.exportCountData();

  assert.equal(exported, false);
  assert.equal(admin.adminMode, false);
  assert.match(admin.lastAdminMessage, /^ADMIN EXPIRED:/);
});

test("admin count import atomically replaces ranking and player stats", async () => {
  const store = createStore();
  store.value.teamBingoV1.globalStats.ranking = { 1: 99 };
  store.value.teamBingoV1.globalStats.playerStats.players.old = { name: "OLD", games: 8 };
  const admin = prepareAdminCoordinator(store);
  const previousConfirm = window.confirm;
  window.confirm = () => true;
  const file = {
    size: 1024,
    async text() {
      return JSON.stringify({
        version: 2,
        cellRanking: { 53: 7, 69: 4 },
        playerStats: {
          players: {
            jan: { name: "JAN", games: 5, wins: 3, losses: 2, mvps: 1 }
          },
          rivalries: {},
          recentMatches: [{ id: "match-imported", winner: "red" }]
        }
      });
    }
  };

  try {
    const imported = await admin.importCountData(file);

    assert.equal(imported, true);
    const stats = store.value.teamBingoV1.globalStats;
    assert.deepEqual(stats.ranking, { 53: 7, 69: 4 });
    assert.equal(stats.playerStats.players.old, undefined);
    assert.equal(stats.playerStats.players.jan.games, 5);
    assert.equal(stats.playerStats.players.jan.mvps, 1);
    assert.equal(stats.playerStats.recentMatches[0].id, "match-imported");
    assert.equal(Object.keys(stats.processedActions).length, 1);
    assert.equal(admin.ui.adminExportCounts.disabled, false);
    assert.equal(admin.ui.adminImportCounts.disabled, false);
    assert.equal(admin.ui.adminImportFile.value, "");
  } finally {
    window.confirm = previousConfirm;
  }
});

test("simultaneous actions on both teams preserve both room and ranking updates", async () => {
  const store = createStore();
  const master = createCoordinator(store, "master", "master", "red");
  const guest = createCoordinator(store, "guest", "player", "blue");

  const open = (coordinator, team, index, characterId) => coordinator.requestAction(
    { type: "toggle-cell", payload: { team, index, expectedMarked: false } },
    () => {
      coordinator.testState.game[team].marked[index] = true;
      coordinator.testState.stats.ranking[characterId] = 1;
    }
  );

  const [masterResult, guestResult] = await Promise.all([
    open(master, "red", 0, 53),
    open(guest, "blue", 1, 69)
  ]);

  assert.equal(masterResult, true);
  assert.equal(guestResult, true);
  const room = store.value.teamBingoV1.rooms.ROOM;
  assert.equal(room.meta.revision, 2);
  assert.equal(room.game.red.marked[0], true);
  assert.equal(room.game.blue.marked[1], true);
  assert.deepEqual(store.value.teamBingoV1.globalStats.ranking, { 53: 1, 69: 1 });
});

test("simultaneous teammates can open different cells without losing either update", async () => {
  const store = createStore();
  store.value.teamBingoV1.rooms.ROOM.participants.guest.team = "red";
  const first = createCoordinator(store, "master", "master", "red");
  const second = createCoordinator(store, "guest", "player", "red");

  const open = (coordinator, index, characterId) => coordinator.requestAction(
    { type: "toggle-cell", payload: { team: "red", index, expectedMarked: false } },
    () => {
      coordinator.testState.game.red.marked[index] = true;
      coordinator.testState.stats.ranking[characterId] = 1;
    }
  );

  const results = await Promise.all([
    open(first, 0, 53),
    open(second, 1, 69)
  ]);

  assert.deepEqual(results, [true, true]);
  const room = store.value.teamBingoV1.rooms.ROOM;
  assert.equal(room.meta.revision, 2);
  assert.deepEqual(room.game.red.marked, [true, true]);
  assert.deepEqual(store.value.teamBingoV1.globalStats.ranking, { 53: 1, 69: 1 });
});

test("same-cell races reject the stale second action without double counting", async () => {
  const store = createStore();
  store.value.teamBingoV1.rooms.ROOM.participants.guest.team = "red";
  const first = createCoordinator(store, "master", "master", "red");
  const second = createCoordinator(store, "guest", "player", "red");
  const originalError = console.error;
  console.error = () => {};

  try {
    const open = (coordinator) => coordinator.requestAction(
      { type: "toggle-cell", payload: { team: "red", index: 0, expectedMarked: false } },
      () => {
        coordinator.testState.game.red.marked[0] = true;
        coordinator.testState.stats.ranking[53] = 1;
      }
    );
    const [firstResult, secondResult] = await Promise.all([open(first), open(second)]);
    assert.equal(firstResult, true);
    assert.equal(secondResult, false);
    assert.equal(store.value.teamBingoV1.rooms.ROOM.game.red.marked[0], true);
    assert.deepEqual(store.value.teamBingoV1.globalStats.ranking, { 53: 1 });
    assert.match(second.lastError, /^SYNC RETRY:/);
  } finally {
    console.error = originalError;
  }
});

test("a participant reload restores its seat and online presence", async () => {
  const store = createStore();
  const room = store.value.teamBingoV1.rooms.ROOM;
  room.seats = {
    blue0: {
      uid: "guest",
      deviceId: "device-guest",
      online: false,
      disconnectedAt: Date.now() - 1000
    }
  };
  room.participants.guest.online = false;
  room.participants.guest.disconnectedAt = Date.now() - 1000;
  const guest = createCoordinator(store, "guest", "player", "blue");
  guest.deviceId = "device-guest";
  guest.updateSessionUi = () => {};
  guest.hideLobby = () => {};
  guest.enterRoom = async (roomId, restoredRoom) => {
    guest.enteredRoomId = roomId;
    guest.room = clone(restoredRoom);
  };
  sessionStorage.clear();
  sessionStorage.setItem("teamBingo.onlineSession.v1", JSON.stringify({
    roomId: "ROOM",
    role: "player",
    team: "blue",
    memberName: "Guest",
    seatKey: "blue0"
  }));

  const restored = await guest.restoreSession();
  assert.equal(restored, true);
  assert.equal(guest.enteredRoomId, "ROOM");
  assert.equal(guest.role, "player");
  assert.equal(guest.team, "blue");
  assert.equal(guest.memberName, "Guest");
  assert.equal(store.value.teamBingoV1.rooms.ROOM.participants.guest.online, true);
  assert.equal(store.value.teamBingoV1.rooms.ROOM.seats.blue0.online, true);
  assert.equal(store.value.teamBingoV1.rooms.ROOM.seats.blue0.deviceId, "device-guest");
});

test("a reconnect re-arms disconnect tracking before restoring participant and seat presence", async () => {
  const store = createStore();
  const room = store.value.teamBingoV1.rooms.ROOM;
  room.seats = {
    blue0: {
      uid: "guest",
      deviceId: "device-guest",
      team: "blue",
      online: false,
      disconnectedAt: Date.now() - 1000
    }
  };
  room.participants.guest.online = false;
  room.participants.guest.disconnectedAt = Date.now() - 1000;
  const guest = createCoordinator(store, "guest", "player", "blue");
  guest.deviceId = "device-guest";
  guest.seatKey = "blue0";
  guest.connectionUnsubscribe = null;
  guest.presenceRefreshPromise = null;
  const order = [];
  const armPresence = guest.backend.setPresenceDisconnect.bind(guest.backend);
  guest.backend.setPresenceDisconnect = async (...args) => {
    order.push("arm");
    return armPresence(...args);
  };
  const transact = guest.backend.transaction.bind(guest.backend);
  guest.backend.transaction = async (...args) => {
    order.push("online");
    return transact(...args);
  };

  guest.startConnectionMonitor();
  guest.backend.connectionCallback(true);
  await guest.presenceRefreshPromise;

  assert.deepEqual(order.slice(0, 2), ["arm", "online"]);
  assert.equal(guest.backend.presenceArms.length, 1);
  assert.match(guest.backend.presenceArms[0].participantPath, /participants\/guest$/);
  assert.match(guest.backend.presenceArms[0].seatPath, /seats\/blue0$/);
  assert.equal(store.value.teamBingoV1.rooms.ROOM.participants.guest.online, true);
  assert.equal(store.value.teamBingoV1.rooms.ROOM.participants.guest.disconnectedAt, null);
  assert.equal(store.value.teamBingoV1.rooms.ROOM.seats.blue0.online, true);
  assert.equal(store.value.teamBingoV1.rooms.ROOM.seats.blue0.disconnectedAt, null);

  store.value.teamBingoV1.rooms.ROOM.participants.guest.online = false;
  store.value.teamBingoV1.rooms.ROOM.seats.blue0.online = false;
  guest.backend.connectionCallback(false);
  guest.backend.connectionCallback(true);
  await guest.presenceRefreshPromise;

  assert.equal(guest.backend.presenceArms.length, 2);
  assert.equal(store.value.teamBingoV1.rooms.ROOM.participants.guest.online, true);
  assert.equal(store.value.teamBingoV1.rooms.ROOM.seats.blue0.online, true);
});

test("explicit leave cancels disconnect tracking before removing the participant", async () => {
  const store = createStore();
  const room = store.value.teamBingoV1.rooms.ROOM;
  room.seats = { blue0: { uid: "guest", online: true } };
  const guest = createCoordinator(store, "guest", "player", "blue");
  guest.seatKey = "blue0";
  guest.connectionUnsubscribe = () => {};
  guest.presenceRefreshPromise = null;
  guest.roomUnsubscribe = () => {};
  guest.stopHeartbeat = () => { order.push("stop-heartbeat"); };
  guest.updateSessionUi = () => {};
  guest.showLobby = () => {};
  guest.bridge.onRoomLeft = () => {};
  const order = [];
  const clearPresence = guest.backend.clearPresenceDisconnect.bind(guest.backend);
  guest.backend.clearPresenceDisconnect = async () => {
    order.push("clear");
    return clearPresence();
  };
  const transact = guest.backend.transaction.bind(guest.backend);
  guest.backend.transaction = async (...args) => {
    order.push("transaction");
    return transact(...args);
  };

  const left = await guest.leaveRoom();

  assert.equal(left, true);
  assert.ok(order.indexOf("stop-heartbeat") < order.indexOf("transaction"));
  assert.ok(order.indexOf("clear") < order.indexOf("transaction"));
  assert.equal(guest.backend.presenceClearCount, 1);
  assert.equal(store.value.teamBingoV1.rooms.ROOM.participants.guest, undefined);
  assert.equal(store.value.teamBingoV1.rooms.ROOM.seats.blue0, undefined);
});

test("a failed leave keeps the session and re-enables reconnect tracking", async () => {
  const store = createStore();
  const guest = createCoordinator(store, "guest", "player", "blue");
  guest.connectionUnsubscribe = () => {};
  guest.presenceRefreshPromise = null;
  let heartbeatRestarted = false;
  guest.stopHeartbeat = () => {};
  guest.startHeartbeat = () => { heartbeatRestarted = true; };
  guest.backend.transaction = async () => { throw new Error("network unavailable"); };

  const left = await guest.leaveRoom();

  assert.equal(left, false);
  assert.equal(guest.roomId, "ROOM");
  assert.equal(typeof guest.backend.connectionCallback, "function");
  assert.equal(heartbeatRestarted, true);
  assert.match(guest.lastError, /^LEAVE ERROR: network unavailable$/);
  assert.equal(store.value.teamBingoV1.rooms.ROOM.participants.guest.online, true);
});

test("a leave is aborted when disconnect reservations cannot be canceled", async () => {
  const store = createStore();
  const guest = createCoordinator(store, "guest", "player", "blue");
  guest.connectionUnsubscribe = () => {};
  guest.presenceRefreshPromise = null;
  let heartbeatRestarted = false;
  let transactionCalled = false;
  guest.stopHeartbeat = () => {};
  guest.startHeartbeat = () => { heartbeatRestarted = true; };
  guest.backend.clearPresenceDisconnect = async () => false;
  guest.backend.transaction = async () => {
    transactionCalled = true;
    return { committed: true, value: null };
  };

  const left = await guest.leaveRoom();

  assert.equal(left, false);
  assert.equal(transactionCalled, false);
  assert.equal(heartbeatRestarted, true);
  assert.equal(guest.roomId, "ROOM");
  assert.match(guest.lastError, /^LEAVE ERROR: 接続状態の解除に失敗しました/);
});

test("a failed room close keeps the master attached and reconnectable", async () => {
  const store = createStore();
  const master = createCoordinator(store, "master", "master", "red");
  master.connectionUnsubscribe = () => {};
  master.presenceRefreshPromise = null;
  let heartbeatRestarted = false;
  master.stopHeartbeat = () => {};
  master.startHeartbeat = () => { heartbeatRestarted = true; };
  master.backend.update = async () => { throw new Error("close denied"); };

  const closed = await master.closeRoom();

  assert.equal(closed, false);
  assert.equal(master.roomId, "ROOM");
  assert.equal(typeof master.backend.connectionCallback, "function");
  assert.equal(heartbeatRestarted, true);
  assert.match(master.lastError, /^ROOM CLOSE ERROR: close denied$/);
  assert.ok(store.value.teamBingoV1.rooms.ROOM);
});

test("a former master restores as a player when handover wins the reload race", async () => {
  const store = createStore();
  const room = store.value.teamBingoV1.rooms.ROOM;
  room.seats = { red0: { uid: "master", deviceId: "device-master", team: "red", online: false } };
  room.participants.master.online = false;
  const formerMaster = createCoordinator(store, "master", "master", "red");
  formerMaster.deviceId = "device-master";
  formerMaster.updateSessionUi = () => {};
  formerMaster.hideLobby = () => {};
  formerMaster.enterRoom = async (roomId, restoredRoom) => {
    formerMaster.roomId = roomId;
    formerMaster.room = clone(restoredRoom);
  };
  const transact = formerMaster.backend.transaction.bind(formerMaster.backend);
  let handoverApplied = false;
  formerMaster.backend.transaction = async (path, updater) => {
    if (!handoverApplied && path.endsWith("/rooms/ROOM")) {
      handoverApplied = true;
      store.value.teamBingoV1.rooms.ROOM.meta.masterUid = "guest";
      store.value.teamBingoV1.rooms.ROOM.participants.guest.role = "master";
    }
    return transact(path, updater);
  };
  sessionStorage.clear();
  sessionStorage.setItem("teamBingo.onlineSession.v1", JSON.stringify({
    roomId: "ROOM",
    role: "master",
    team: "red",
    memberName: "Master",
    seatKey: "red0"
  }));

  const restored = await formerMaster.restoreSession();

  assert.equal(restored, true);
  assert.equal(formerMaster.role, "player");
  assert.equal(store.value.teamBingoV1.rooms.ROOM.meta.masterUid, "guest");
  assert.equal(store.value.teamBingoV1.rooms.ROOM.participants.master.role, "player");
});

test("an online participant takes over after the master disconnect grace period", async () => {
  const store = createStore();
  const room = store.value.teamBingoV1.rooms.ROOM;
  room.participants.master.online = false;
  room.participants.master.disconnectedAt = Date.now() - 31_000;
  room.participants.guest.joinedAt = Date.now() - 20_000;
  const guest = createCoordinator(store, "guest", "player", "blue");
  guest.config.masterHandoverSeconds = 30;

  await guest.tryMasterHandover();

  assert.equal(store.value.teamBingoV1.rooms.ROOM.meta.masterUid, "guest");
  assert.equal(store.value.teamBingoV1.rooms.ROOM.participants.master.role, "player");
  assert.equal(store.value.teamBingoV1.rooms.ROOM.participants.guest.role, "master");
  assert.equal(store.value.teamBingoV1.lobby.ROOM.phase, "playing");
});

test("remote presentation events play once in sequence and skip the local echo", () => {
  const store = createStore();
  const guest = createCoordinator(store, "guest", "player", "blue");
  const played = [];
  guest.lastEventSeq = 0;
  guest.localActionIds.add("local-action");
  guest.applyRoom = OnlineCoordinator.prototype.applyRoom.bind(guest);
  guest.updateSessionUi = () => {};
  guest.scheduleMasterHandover = () => {};
  guest.bridge.applyOnlineSetupSnapshot = () => {};
  guest.bridge.applyOnlineGameSnapshot = () => {};
  guest.bridge.playOnlineEvent = (event) => played.push(`${event.seq}:${event.type}`);
  const room = createRoom();
  room.meta.eventSeq = 3;
  room.events = {
    3: { actionId: "remote-3", type: "victory" },
    1: { actionId: "local-action", type: "toggle-cell" },
    2: { actionId: "remote-2", type: "reach" }
  };
  sessionStorage.clear();

  guest.applyRoom(room);

  assert.deepEqual(played, ["2:reach", "3:victory"]);
  assert.equal(guest.localActionIds.has("local-action"), false);
  assert.equal(guest.lastEventSeq, 3);
  assert.equal(sessionStorage.getItem("teamBingo.lastEvent.ROOM"), "3");
});

test("room updates received during an action keep the newest pending snapshot", () => {
  const store = createStore();
  const guest = createCoordinator(store, "guest", "player", "blue");
  guest.busy = true;
  const first = createRoom();
  const second = createRoom();
  first.meta.revision = 1;
  second.meta.revision = 2;

  guest.onRoomValue(first);
  guest.onRoomValue(second);

  assert.equal(guest.pendingRoom.meta.revision, 2);
  assert.equal(guest.room.meta.revision, 0);
});

test("rapid follow-up actions never subtract another client ranking entry", async () => {
  const store = createStore();
  store.value.teamBingoV1.globalStats.ranking = { 69: 1 };
  const master = createCoordinator(store, "master", "master", "red");

  const open = (index, characterId) => master.requestAction(
    { type: "toggle-cell", payload: { team: "red", index, expectedMarked: false } },
    () => {
      master.testState.game.red.marked[index] = true;
      master.testState.stats.ranking[characterId] = (master.testState.stats.ranking[characterId] || 0) + 1;
    }
  );

  assert.equal(await open(0, 53), true);
  assert.equal(await open(1, 54), true);
  assert.deepEqual(store.value.teamBingoV1.globalStats.ranking, { 53: 1, 54: 1, 69: 1 });
});

test("a long alternating run keeps room revisions and reversible rankings consistent", async () => {
  const store = createStore();
  store.value.teamBingoV1.rooms.ROOM.game.red.marked = Array(25).fill(false);
  store.value.teamBingoV1.rooms.ROOM.game.blue.marked = Array(25).fill(false);
  const master = createCoordinator(store, "master", "master", "red");
  const guest = createCoordinator(store, "guest", "player", "blue");

  const toggle = (coordinator, team, index, characterId, opened) => coordinator.requestAction(
    { type: "toggle-cell", payload: { team, index, expectedMarked: !opened } },
    () => {
      coordinator.testState.game[team].marked[index] = opened;
      const ranking = coordinator.testState.stats.ranking;
      const next = (ranking[characterId] || 0) + (opened ? 1 : -1);
      if (next > 0) ranking[characterId] = next;
      else delete ranking[characterId];
    }
  );

  for (let index = 0; index < 20; index += 1) {
    const results = await Promise.all([
      toggle(master, "red", index, 100 + index, true),
      toggle(guest, "blue", index, 200 + index, true)
    ]);
    assert.deepEqual(results, [true, true]);
  }
  for (let index = 0; index < 10; index += 1) {
    const results = await Promise.all([
      toggle(master, "red", index, 100 + index, false),
      toggle(guest, "blue", index, 200 + index, false)
    ]);
    assert.deepEqual(results, [true, true]);
  }

  const room = store.value.teamBingoV1.rooms.ROOM;
  assert.equal(room.meta.revision, 60);
  assert.equal(room.meta.eventSeq, 60);
  assert.equal(room.game.red.marked.filter(Boolean).length, 10);
  assert.equal(room.game.blue.marked.filter(Boolean).length, 10);
  assert.equal(Object.keys(store.value.teamBingoV1.globalStats.ranking).length, 20);
  for (let index = 0; index < 10; index += 1) {
    assert.equal(store.value.teamBingoV1.globalStats.ranking[100 + index], undefined);
    assert.equal(store.value.teamBingoV1.globalStats.ranking[200 + index], undefined);
  }
  for (let index = 10; index < 20; index += 1) {
    assert.equal(store.value.teamBingoV1.globalStats.ranking[100 + index], 1);
    assert.equal(store.value.teamBingoV1.globalStats.ranking[200 + index], 1);
  }
});

test("an occupied seat is held, then becomes joinable after the disconnect timeout", async () => {
  const store = createStore();
  delete store.value.teamBingoV1.rooms.ROOM.participants.guest;
  const first = prepareJoinCoordinator(store, "guest-a", "device-a");
  const second = prepareJoinCoordinator(store, "guest-b", "device-b");
  const originalError = console.error;
  console.error = () => {};

  try {
    await first.joinRoom("ROOM", { name: "Guest", team: "blue", spectator: false });
    assert.equal(store.value.teamBingoV1.rooms.ROOM.seats.guest.uid, "guest-a");

    await second.joinRoom("ROOM", { name: "Guest", team: "blue", spectator: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(store.value.teamBingoV1.rooms.ROOM.seats.guest.uid, "guest-a");
    assert.match(second.lastError, /^JOIN ERROR:/);

    const room = store.value.teamBingoV1.rooms.ROOM;
    room.seats.guest.online = false;
    room.seats.guest.disconnectedAt = Date.now() - 61_000;
    room.participants["guest-a"].online = false;
    room.participants["guest-a"].disconnectedAt = Date.now() - 61_000;
    second.lastError = "";
    await second.joinRoom("ROOM", { name: "Guest", team: "blue", spectator: false });
    assert.equal(store.value.teamBingoV1.rooms.ROOM.seats.guest.uid, "guest-b");
    assert.equal(store.value.teamBingoV1.rooms.ROOM.participants["guest-a"], undefined);
    assert.equal(second.lastError, "");
  } finally {
    console.error = originalError;
  }
});

test("the same browser can reclaim a seat after anonymous auth changes", async () => {
  const store = createStore();
  delete store.value.teamBingoV1.rooms.ROOM.participants.guest;
  const first = prepareJoinCoordinator(store, "guest-a", "shared-device");
  const replacement = prepareJoinCoordinator(store, "guest-b", "shared-device");

  await first.joinRoom("ROOM", { name: "Guest", team: "blue", spectator: false });
  await replacement.joinRoom("ROOM", { name: "Guest", team: "blue", spectator: false });

  const room = store.value.teamBingoV1.rooms.ROOM;
  assert.equal(room.seats.guest.uid, "guest-b");
  assert.equal(room.participants["guest-a"], undefined);
  assert.equal(room.participants["guest-b"].memberName, "Guest");
});

test("a reopened tab can immediately reclaim its offline seat with a seat token", async () => {
  const store = createStore();
  const room = store.value.teamBingoV1.rooms.ROOM;
  delete room.participants.guest;
  room.participants["guest-old"] = {
    uid: "guest-old",
    role: "player",
    team: "blue",
    memberName: "Guest",
    online: false,
    disconnectedAt: Date.now()
  };
  room.seats = {
    guest: {
      uid: "guest-old",
      deviceId: "closed-tab",
      name: "Guest",
      team: "blue",
      online: false,
      disconnectedAt: Date.now(),
      reclaimToken: "seat-token"
    }
  };
  const reopened = prepareJoinCoordinator(store, "guest-new", "new-tab");
  reopened.storeSeatReclaimToken("ROOM", "guest", "seat-token");

  await reopened.joinRoom("ROOM", { name: "Guest", team: "blue", spectator: false });

  const updated = store.value.teamBingoV1.rooms.ROOM;
  assert.equal(updated.seats.guest.uid, "guest-new");
  assert.equal(updated.seats.guest.reclaimToken, "seat-token");
  assert.equal(updated.participants["guest-old"], undefined);
  assert.equal(updated.participants["guest-new"].memberName, "Guest");
  assert.equal(reopened.lastError, undefined);
});

test("a seat token never steals a seat that is still online", async () => {
  const store = createStore();
  const room = store.value.teamBingoV1.rooms.ROOM;
  delete room.participants.guest;
  room.participants["guest-old"] = {
    uid: "guest-old",
    role: "player",
    team: "blue",
    memberName: "Guest",
    online: true
  };
  room.seats = {
    guest: {
      uid: "guest-old",
      deviceId: "active-tab",
      name: "Guest",
      team: "blue",
      online: true,
      reclaimToken: "seat-token"
    }
  };
  const otherTab = prepareJoinCoordinator(store, "guest-new", "new-tab");
  otherTab.storeSeatReclaimToken("ROOM", "guest", "seat-token");
  const originalError = console.error;
  console.error = () => {};

  try {
    await otherTab.joinRoom("ROOM", { name: "Guest", team: "blue", spectator: false });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(store.value.teamBingoV1.rooms.ROOM.seats.guest.uid, "guest-old");
    assert.equal(store.value.teamBingoV1.rooms.ROOM.participants["guest-new"], undefined);
    assert.match(otherTab.lastError, /^JOIN ERROR:/);
  } finally {
    console.error = originalError;
  }
});

test("reclaiming an offline master seat transfers master ownership to the new uid", async () => {
  const store = createStore();
  const room = store.value.teamBingoV1.rooms.ROOM;
  delete room.participants.master;
  room.meta.masterUid = "master-old";
  room.participants["master-old"] = {
    uid: "master-old",
    role: "master",
    team: "red",
    memberName: "Master",
    online: false,
    disconnectedAt: Date.now()
  };
  room.seats = {
    master: {
      uid: "master-old",
      deviceId: "closed-tab",
      name: "Master",
      team: "red",
      online: false,
      disconnectedAt: Date.now(),
      reclaimToken: "master-seat-token"
    }
  };
  const reopened = prepareJoinCoordinator(store, "master-new", "new-tab");
  reopened.storeSeatReclaimToken("ROOM", "master", "master-seat-token");

  await reopened.joinRoom("ROOM", { name: "Master", team: "red", spectator: false });

  const updated = store.value.teamBingoV1.rooms.ROOM;
  assert.equal(updated.meta.masterUid, "master-new");
  assert.equal(updated.participants["master-old"], undefined);
  assert.equal(updated.participants["master-new"].role, "master");
  assert.equal(updated.seats.master.uid, "master-new");
  assert.equal(reopened.role, "master");
});

test("a second tab with the same uid cannot replace the active master seat", async () => {
  const store = createStore();
  const room = store.value.teamBingoV1.rooms.ROOM;
  room.participants.master.deviceId = "shared-device";
  room.seats = {
    master: {
      uid: "master",
      deviceId: "shared-device",
      name: "Master",
      team: "red",
      online: true,
      joinedAt: Date.now(),
      lastSeenAt: Date.now()
    }
  };
  const secondTab = prepareJoinCoordinator(store, "master", "shared-device");
  const originalError = console.error;
  console.error = () => {};

  try {
    await secondTab.joinRoom("ROOM", { name: "Guest", team: "blue", spectator: false });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(room.seats.master.uid, "master");
    assert.equal(room.seats.guest, undefined);
    assert.equal(room.participants.master.role, "master");
    assert.equal(room.participants.master.memberName, "Master");
    assert.match(secondTab.lastError, /^JOIN ERROR:/);
  } finally {
    console.error = originalError;
  }
});

test("the active master can reconnect to the same seat without being demoted", async () => {
  const store = createStore();
  const room = store.value.teamBingoV1.rooms.ROOM;
  room.participants.master.deviceId = "shared-device";
  room.seats = {
    master: {
      uid: "master",
      deviceId: "shared-device",
      name: "Master",
      team: "red",
      online: true,
      joinedAt: Date.now(),
      lastSeenAt: Date.now()
    }
  };
  const secondTab = prepareJoinCoordinator(store, "master", "shared-device");

  await secondTab.joinRoom("ROOM", { name: "Master", team: "red", spectator: false });

  const updatedRoom = store.value.teamBingoV1.rooms.ROOM;
  assert.equal(updatedRoom.participants.master.role, "master");
  assert.equal(secondTab.role, "master");
  assert.equal(secondTab.memberName, "Master");
  assert.equal(updatedRoom.seats.master.uid, "master");
});

test("a delayed state sync never overwrites a newer remote action", async () => {
  const store = createStore();
  const master = createCoordinator(store, "master", "master", "red");
  const played = [];
  master.applyRoom = OnlineCoordinator.prototype.applyRoom.bind(master);
  master.updateSessionUi = () => {};
  master.scheduleMasterHandover = () => {};
  master.bridge.playOnlineEvent = (event) => played.push(event.type);
  master.lastEventSeq = 0;
  const room = store.value.teamBingoV1.rooms.ROOM;
  room.lock = { actionId: "remote-lock", uid: "guest", expiresAt: Date.now() + 5000 };

  setTimeout(() => {
    room.game.blue.marked[1] = true;
    room.meta.revision = 1;
    room.meta.eventSeq = 1;
    room.events[1] = { actionId: "remote-action", type: "toggle-cell" };
    room.lock = null;
  }, 20);

  const synced = await master.syncCurrentState("match-ready");

  assert.equal(synced, false);
  assert.equal(store.value.teamBingoV1.rooms.ROOM.meta.revision, 1);
  assert.equal(store.value.teamBingoV1.rooms.ROOM.game.blue.marked[1], true);
  assert.equal(store.value.teamBingoV1.rooms.ROOM.events[2], undefined);
  assert.deepEqual(played, ["toggle-cell"]);
});

test("rejoining a long-running room does not replay hundreds of old effects", async () => {
  const store = createStore();
  const room = store.value.teamBingoV1.rooms.ROOM;
  room.meta.eventSeq = 250;
  room.events = Object.fromEntries(
    Array.from({ length: 200 }, (_, offset) => {
      const sequence = offset + 51;
      return [sequence, {
        actionId: `action-${sequence}`,
        type: "toggle-cell",
        createdAt: Date.now(),
        presentation: sequence === 250 ? {
          timeline: [{ kind: "commentary", main: "CURRENT LIVE", sub: "RESTORED", duration: 10_000, faceIndex: 1 }]
        } : { timeline: [] }
      }];
    })
  );
  const guest = createCoordinator(store, "guest", "player", "blue");
  const played = [];
  const restoredCommentary = [];
  guest.applyRoom = OnlineCoordinator.prototype.applyRoom.bind(guest);
  guest.updateSessionUi = () => {};
  guest.scheduleMasterHandover = () => {};
  guest.subscribeGlobalStats = () => {};
  guest.startHeartbeat = () => {};
  guest.importLegacyStats = async () => {};
  guest.bridge.playOnlineEvent = (event) => played.push(event.seq);
  guest.bridge.restoreOnlineCommentary = (snapshot) => restoredCommentary.push(snapshot);
  sessionStorage.clear();
  sessionStorage.setItem("teamBingo.lastEvent.ROOM", "1");

  await guest.enterRoom("ROOM", clone(room));

  assert.equal(guest.lastEventSeq, 250);
  assert.deepEqual(played, []);
  assert.equal(restoredCommentary.length, 1);
  assert.equal(restoredCommentary[0].main, "CURRENT LIVE");
  assert.equal(restoredCommentary[0].sub, "RESTORED");
  assert.equal(restoredCommentary[0].remainingMs > 0, true);
  assert.equal(sessionStorage.getItem("teamBingo.lastEvent.ROOM"), "250");
});

test("a resumed tab skips a trimmed event backlog and restores only the current result", () => {
  const store = createStore();
  const guest = createCoordinator(store, "guest", "player", "blue");
  const played = [];
  const victories = [];
  guest.applyRoom = OnlineCoordinator.prototype.applyRoom.bind(guest);
  guest.updateSessionUi = () => {};
  guest.scheduleMasterHandover = () => {};
  guest.bridge.playOnlineEvent = (event) => played.push(event.seq);
  guest.bridge.showOnlineVictorySnapshot = (game, victory) => victories.push({ game, victory });
  guest.lastEventSeq = 1;
  const room = createRoom();
  room.meta.eventSeq = 250;
  room.game.winner = "blue";
  room.lastVictory = { team: "blue", victoryKind: "normal" };
  room.events = Object.fromEntries(
    Array.from({ length: 200 }, (_, offset) => {
      const sequence = offset + 51;
      return [sequence, { actionId: `action-${sequence}`, type: sequence === 250 ? "victory" : "toggle-cell" }];
    })
  );

  guest.applyRoom(room);

  assert.deepEqual(played, []);
  assert.equal(victories.length, 1);
  assert.equal(victories[0].victory.team, "blue");
  assert.equal(guest.lastEventSeq, 250);
});

test("a large contiguous backlog plays only its latest live event", () => {
  const store = createStore();
  const guest = createCoordinator(store, "guest", "player", "blue");
  const played = [];
  guest.applyRoom = OnlineCoordinator.prototype.applyRoom.bind(guest);
  guest.updateSessionUi = () => {};
  guest.scheduleMasterHandover = () => {};
  guest.bridge.playOnlineEvent = (event) => played.push(event.seq);
  guest.lastEventSeq = 50;
  const room = createRoom();
  room.meta.eventSeq = 70;
  room.events = Object.fromEntries(
    Array.from({ length: 20 }, (_, offset) => {
      const sequence = offset + 51;
      return [sequence, { actionId: `action-${sequence}`, type: "toggle-cell" }];
    })
  );

  guest.applyRoom(room);

  assert.deepEqual(played, [70]);
  assert.equal(guest.lastEventSeq, 70);
});

test("room history retains only the newest bounded event and action windows", async () => {
  const store = createStore();
  const master = createCoordinator(store, "master", "master", "red");

  for (let sequence = 1; sequence <= 320; sequence += 1) {
    const actionId = `action-${sequence}`;
    const room = store.value.teamBingoV1.rooms.ROOM;
    room.lock = { actionId, uid: "master", expiresAt: Date.now() + 1000 };
    const committed = await master.commitAction(
      actionId,
      { type: "state-sync", payload: {} },
      room.game,
      { type: "state-sync", payload: { sequence } },
      sequence - 1
    );
    assert.equal(committed, true);
  }

  const room = store.value.teamBingoV1.rooms.ROOM;
  const eventKeys = Object.keys(room.events).map(Number).sort((a, b) => a - b);
  assert.equal(room.meta.eventSeq, 320);
  assert.equal(room.meta.revision, 320);
  assert.equal(eventKeys.length, 200);
  assert.equal(eventKeys[0], 121);
  assert.equal(eventKeys.at(-1), 320);
  assert.equal(Object.keys(room.processedActions).length, 300);
  assert.equal(room.processedActions["action-1"], undefined);
  assert.equal(typeof room.processedActions["action-320"], "number");
});

test("a departing master hands control to a player, never an older spectator", async () => {
  const store = createStore();
  const room = store.value.teamBingoV1.rooms.ROOM;
  room.participants.spectator = {
    uid: "spectator",
    role: "spectator",
    team: "",
    memberName: "",
    online: true,
    joinedAt: 1
  };
  room.participants.guest.joinedAt = 2;
  const master = createCoordinator(store, "master", "master", "red");
  master.roomUnsubscribe = () => {};
  master.stopHeartbeat = () => {};
  master.updateSessionUi = () => {};
  master.showLobby = () => {};
  master.bridge.onRoomLeft = () => {};

  await master.leaveRoom({ switching: true });

  const updated = store.value.teamBingoV1.rooms.ROOM;
  assert.equal(updated.meta.masterUid, "guest");
  assert.equal(updated.participants.guest.role, "master");
  assert.equal(updated.participants.spectator.role, "spectator");
  assert.equal(updated.participants.master, undefined);
});

test("explicit room close removes both room data and lobby summary", async () => {
  const store = createStore();
  store.value.teamBingoV1.lobby.ROOM = { active: true, phase: "playing", updatedAt: Date.now() };
  const master = createCoordinator(store, "master", "master", "red");
  let leaveOptions = null;
  master.leaveRoom = async (options) => { leaveOptions = options; };

  await master.closeRoom();

  assert.equal(store.value.teamBingoV1.rooms.ROOM, undefined);
  assert.equal(store.value.teamBingoV1.lobby.ROOM, undefined);
  assert.deepEqual(leaveOptions, { remoteClosed: true });
});
