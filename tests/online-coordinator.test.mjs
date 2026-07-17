import test from "node:test";
import assert from "node:assert/strict";

import { OnlineCoordinator } from "../online/online-room.js";

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

globalThis.window ||= { setTimeout, clearTimeout };
globalThis.document ||= { body: { classList: { remove() {} } } };

const sessionValues = new Map();
globalThis.sessionStorage = {
  getItem(key) { return sessionValues.has(key) ? sessionValues.get(key) : null; },
  setItem(key, value) { sessionValues.set(key, String(value)); },
  removeItem(key) { sessionValues.delete(key); },
  clear() { sessionValues.clear(); }
};

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
      return [sequence, { actionId: `action-${sequence}`, type: "toggle-cell" }];
    })
  );
  const guest = createCoordinator(store, "guest", "player", "blue");
  const played = [];
  guest.applyRoom = OnlineCoordinator.prototype.applyRoom.bind(guest);
  guest.updateSessionUi = () => {};
  guest.scheduleMasterHandover = () => {};
  guest.subscribeGlobalStats = () => {};
  guest.startHeartbeat = () => {};
  guest.importLegacyStats = async () => {};
  guest.bridge.playOnlineEvent = (event) => played.push(event.seq);
  sessionStorage.clear();
  sessionStorage.setItem("teamBingo.lastEvent.ROOM", "1");

  await guest.enterRoom("ROOM", clone(room));

  assert.equal(guest.lastEventSeq, 250);
  assert.deepEqual(played, []);
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
