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

globalThis.window ||= { setTimeout, clearTimeout };

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
