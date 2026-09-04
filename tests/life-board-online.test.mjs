import test from "node:test";
import assert from "node:assert/strict";

globalThis.location ||= { search: "" };
await import("../life-board-system.js");
const { OnlineCoordinator, resetLifeBoardState } = await import(`../online/online-room.js?life-board-test=${Date.now()}`);

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function getAtPath(source, path) {
  return String(path || "").split("/").filter(Boolean).reduce((value, key) => value?.[key], source);
}

function setAtPath(source, path, value) {
  const parts = String(path || "").split("/").filter(Boolean);
  let parent = source;
  parts.slice(0, -1).forEach((part) => {
    parent[part] ||= {};
    parent = parent[part];
  });
  if (value === undefined || value === null) delete parent[parts.at(-1)];
  else parent[parts.at(-1)] = clone(value);
}

class MemoryBackend {
  constructor(store) {
    this.store = store;
    this.uid = "life-test";
  }

  serverNow() { return 9_000_000; }

  async transaction(path, update) {
    const current = clone(getAtPath(this.store, path));
    const next = update(current);
    if (next === undefined) return { committed: false, value: current };
    setAtPath(this.store, path, next);
    return { committed: true, value: clone(next) };
  }
}

function coordinator(store) {
  const instance = Object.create(OnlineCoordinator.prototype);
  instance.bridge = {};
  instance.root = "teamBingoV1";
  instance.backend = new MemoryBackend(store);
  instance.lifeBoardState = null;
  return instance;
}

test("online life rolls share one Firebase state and deduplicate the same OPEN", async () => {
  const store = {};
  const first = coordinator(store);
  const second = coordinator(store);
  const payload = {
    matchId: "online-match-1", playerName: "Kento", team: "red", cellIndex: 8, characterId: 53
  };
  payload.id = globalThis.TeamBingoLifeBoardSystem.buildOpenId(payload);

  const results = await Promise.all([
    first.awardLifeBoardOpen(payload),
    second.awardLifeBoardOpen(payload)
  ]);

  assert.equal(results.filter((result) => result.ok).length, 2);
  assert.equal(store.teamBingoV1.life.current.players.kento.rolls, 1);
  assert.equal(Object.keys(store.teamBingoV1.life.current.processedOpens).length, 1);
});

test("online life rolls ignore test matches and non-fixed participants", async () => {
  const store = {};
  const client = coordinator(store);
  const testResult = await client.awardLifeBoardOpen({
    id: "test-open", matchId: "m", playerName: "ジャン", team: "blue", cellIndex: 2, testMode: true
  });
  const guestResult = await client.awardLifeBoardOpen({
    id: "guest-open", matchId: "m", playerName: "Guest", team: "blue", cellIndex: 3
  });
  assert.equal(testResult.testMode, true);
  assert.equal(guestResult.ignored, true);
  assert.equal(getAtPath(store, "teamBingoV1/life/current"), undefined);
});

test("admin player reset removes only that player's life history and pending rewards", () => {
  const Life = globalThis.TeamBingoLifeBoardSystem;
  let state = Life.createInitialState(1000);
  state = Life.applyOpenRoll(state, { id: "jan-open", playerName: "ジャン", matchId: "m", team: "red", cellIndex: 1 }, 2000).state;
  state = Life.applyOpenRoll(state, { id: "eda-open", playerName: "えだ", matchId: "m", team: "blue", cellIndex: 2 }, 3000).state;
  const reset = resetLifeBoardState(state, "jan", 4000);

  assert.equal(reset.players.jan.rolls, 0);
  assert.equal(reset.players.eda.rolls, 1);
  assert.ok(Object.values(reset.processedOpens).every((entry) => entry.playerId !== "jan"));
  assert.ok(Object.values(reset.globalHistory).every((entry) => entry.playerId !== "jan"));
});
