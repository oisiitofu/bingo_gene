import test from "node:test";
import assert from "node:assert/strict";

await import("../city-system.js");
const City = globalThis.TeamBingoCitySystem;

test("creates six persistent player cities with starter infrastructure", () => {
  const state = City.createInitialState(1_000_000);
  assert.equal(state.version, 1);
  assert.equal(Object.keys(state.players).length, 6);
  Object.values(state.players).forEach((city) => {
    assert.ok(city.tiles["6,6"]);
    assert.ok(city.metrics.population > 0);
    assert.ok(city.metrics.capacity >= 360);
    assert.ok(city.metrics.powerSupply >= city.metrics.powerDemand);
  });
});

test("build commands require road access and are idempotent", () => {
  const initial = City.createInitialState(1_000_000);
  const rejected = City.applyCommand(initial, {
    id: "far-build", type: "build", playerId: "tofu", tileId: "0,0", buildingId: "residential"
  }, 1_000_100);
  assert.equal(rejected.applied, false);
  assert.match(rejected.error, /道路/);

  const result = City.applyCommand(initial, {
    id: "valid-build", type: "build", playerId: "tofu", tileId: "6,9", buildingId: "residential"
  }, 1_000_100);
  assert.equal(result.applied, true);
  assert.equal(result.state.players.tofu.tiles["6,9"].buildingId, "residential");
  assert.ok(result.state.players.tofu.resources.money < initial.players.tofu.resources.money);

  const duplicate = City.applyCommand(result.state, {
    id: "valid-build", type: "build", playerId: "tofu", tileId: "6,10", buildingId: "residential"
  }, 1_000_200);
  assert.equal(duplicate.applied, false);
  assert.equal(duplicate.duplicate, true);
});

test("match rewards only apply once and ignore non-fixed players", () => {
  const initial = City.createInitialState(1_000_000);
  const payload = {
    id: "city-match-1",
    matchId: "match-1",
    players: [
      { name: "おいしいとうふ", opens: 5, bingoLines: 2, won: true, mvp: true, victoryKind: "comeback" },
      { name: "Guest", opens: 99, bingoLines: 2, won: false }
    ]
  };
  const first = City.applyMatchReward(initial, payload, 1_000_100);
  assert.equal(first.applied, true);
  assert.deepEqual(Object.keys(first.rewards), ["tofu"]);
  assert.ok(first.state.players.tofu.resources.money > initial.players.tofu.resources.money);
  assert.equal(first.state.players.tofu.resources.blueprints, 1);

  const second = City.applyMatchReward(first.state, payload, 1_000_200);
  assert.equal(second.applied, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.state.players.tofu.resources.money, first.state.players.tofu.resources.money);
});

test("server ticks advance economy and stop at the requested catch-up limit", () => {
  const initial = City.createInitialState(1_000_000);
  const money = initial.players.tofu.resources.money;
  const result = City.advanceState(initial, 1_000_000 + City.TICK_MS * 4 + 1, { maxTicks: 2 });
  assert.equal(result.processed, 2);
  assert.equal(result.caughtUp, false);
  assert.notEqual(result.state.players.tofu.resources.money, money);
  assert.equal(result.state.revision, 2);
});

test("standings include all six cities", () => {
  const state = City.createInitialState(1_000_000);
  const standings = City.standings(state);
  assert.equal(standings.length, 6);
  assert.ok(standings.every((entry) => entry.cityName && Number.isFinite(entry.cityScore)));
});
