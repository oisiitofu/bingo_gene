import test from "node:test";
import assert from "node:assert/strict";

await import("../city-system.js");
const City = globalThis.TeamBingoCitySystem;

test("creates six persistent player cities with starter infrastructure", () => {
  const state = City.createInitialState(1_000_000);
  assert.equal(state.version, 1);
  assert.equal(City.GRID_SIZE, 160);
  assert.ok(City.GRID_SIZE * City.GRID_SIZE >= 16 * 16 * 100);
  assert.ok(Object.keys(City.BUILDINGS).length >= 90);
  assert.equal(Object.keys(state.players).length, 6);
  Object.values(state.players).forEach((city) => {
    assert.equal(city.resources.money, City.AUTO_BUILD_THRESHOLD);
    assert.deepEqual(Object.keys(city.resources), ["money"]);
    assert.ok(city.tiles[City.tileId(City.CITY_CENTER - 1, City.CITY_CENTER - 1)]);
    assert.equal(city.mapSchema, City.MAP_SCHEMA);
    assert.ok(city.metrics.population > 0);
    assert.ok(city.metrics.capacity >= 360);
    assert.ok(city.metrics.powerSupply >= city.metrics.powerDemand);
    assert.equal(Object.hasOwn(city.resources, "hype"), false);
  });
});

test("build commands require road access and are idempotent", () => {
  const initial = City.createInitialState(1_000_000);
  const farPlot = (() => {
    for (let z = 20; z < 45; z += 1) {
      for (let x = 20; x < 45; x += 1) {
        if (City.terrainAt("tofu", x, z).buildable) return City.tileId(x, z);
      }
    }
    return "30,30";
  })();
  const rejected = City.applyCommand(initial, {
    id: "far-build", type: "build", playerId: "tofu", tileId: farPlot, buildingId: "residential"
  }, 1_000_100);
  assert.equal(rejected.applied, false);
  assert.match(rejected.error, /道路/);

  const validPlot = City.tileId(City.CITY_CENTER - 1, City.CITY_CENTER - 2);
  const result = City.applyCommand(initial, {
    id: "valid-build", type: "build", playerId: "tofu", tileId: validPlot, buildingId: "residential"
  }, 1_000_100);
  assert.equal(result.applied, true);
  assert.equal(result.state.players.tofu.tiles[validPlot].buildingId, "residential");
  assert.ok(result.state.players.tofu.resources.money < initial.players.tofu.resources.money);

  const duplicate = City.applyCommand(result.state, {
    id: "valid-build", type: "build", playerId: "tofu", tileId: City.tileId(City.CITY_CENTER - 1, City.CITY_CENTER - 3), buildingId: "residential"
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
  assert.equal(first.rewards.tofu.money, 3000);
  assert.equal(Object.hasOwn(first.rewards.tofu, "hype"), false);
  assert.ok(first.state.players.tofu.autoDevelopment.placed > 0);
  assert.deepEqual(Object.keys(first.state.players.tofu.resources), ["money"]);

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

test("all six cities generate distinct broad terrain with land, water, and mountains", () => {
  const signatures = new Set();
  City.PLAYERS.forEach((player) => {
    const counts = { grass: 0, soil: 0, mountain: 0, river: 0, lake: 0, sea: 0 };
    for (let z = 0; z < City.GRID_SIZE; z += 4) {
      for (let x = 0; x < City.GRID_SIZE; x += 4) counts[City.terrainAt(player.id, x, z).type] += 1;
    }
    assert.ok(counts.grass + counts.soil > 300, `${player.id} has too little buildable land`);
    assert.ok(counts.mountain + counts.river + counts.lake + counts.sea > 0, `${player.id} has no natural terrain`);
    signatures.add(JSON.stringify(counts));
  });
  assert.equal(signatures.size, City.PLAYERS.length);
});

test("legacy 16x16 cities migrate into the center without losing buildings or money", () => {
  const current = City.createInitialState(1_000_000);
  const shift = City.CITY_CENTER - 8;
  current.mapSchema = 1;
  Object.values(current.players).forEach((city) => {
    city.mapSchema = 1;
    city.resources.money = 54321;
    city.tiles = Object.fromEntries(Object.values(city.tiles).map((tile) => {
      const point = City.parseTileId(tile.id);
      const id = City.tileId(point.x - shift, point.z - shift);
      return [id, { ...tile, id }];
    }));
  });
  const normalized = City.normalizeState(current, 1_000_100);
  assert.equal(normalized.mapSchema, City.MAP_SCHEMA);
  assert.equal(normalized.players.tofu.resources.money, 54321);
  assert.ok(normalized.players.tofu.tiles[City.tileId(City.CITY_CENTER - 1, City.CITY_CENTER - 1)]);
});

test("current maps keep their tile coordinates while obsolete resources are removed", () => {
  const current = City.createInitialState(1_000_000);
  const marker = City.tileId(City.CITY_CENTER + 4, City.CITY_CENTER);
  current.mapSchema = 2;
  current.players.tofu.mapSchema = 2;
  current.players.tofu.tiles[marker] = { id: marker, kind: "road", buildingId: "road", level: 1 };
  current.players.tofu.resources = { money: 24680, materials: 999, research: 12, blueprints: 3 };
  const normalized = City.normalizeState(current, 1_000_100);
  assert.ok(normalized.players.tofu.tiles[marker]);
  assert.deepEqual(normalized.players.tofu.resources, { money: 24680 });
});

test("every building genre exposes at least ten distinct visual variants", () => {
  ["residential", "commercial", "industrial", "park", "power", "water", "civic", "arena"].forEach((model) => {
    const variants = Object.values(City.BUILDINGS).filter((building) => building.model === model);
    assert.ok(variants.length >= 10, `${model} only has ${variants.length} variants`);
    assert.equal(new Set(variants.map((building) => building.variant)).size, variants.length);
  });
});

test("automatic development spends only surplus money above ten thousand", () => {
  const state = City.createInitialState(1_000_000);
  const city = state.players.tofu;
  city.resources.money = 18000;
  const before = Object.keys(city.tiles).length;
  const placed = City.autoDevelopCity(city, 1_000_100, 12);
  assert.ok(placed > 0);
  assert.equal(Object.keys(city.tiles).length, before + placed);
  assert.ok(city.resources.money >= City.AUTO_BUILD_THRESHOLD);
  assert.ok(city.resources.money < 18000);
});

test("automatic development prioritizes varied districts over road spam", () => {
  const state = City.createInitialState(2_000_000);
  const signatures = new Set();
  City.PLAYERS.forEach((player, index) => {
    const city = state.players[player.id];
    city.resources.money = 250000;
    const before = new Set(Object.keys(city.tiles));
    City.autoDevelopCity(city, 2_000_100 + index * City.TICK_MS, 70);
    const additions = Object.values(city.tiles).filter((tile) => !before.has(tile.id));
    const roadCount = additions.filter((tile) => City.isRoadTile(tile)).length;
    const districtCounts = Object.fromEntries(Object.values(City.BUILDINGS)
      .map((definition) => definition.model)
      .filter((model) => !["road", "avenue", "boulevard"].includes(model))
      .map((model) => [model, additions.filter((tile) => City.BUILDINGS[tile.buildingId]?.model === model).length]));
    assert.ok(additions.length >= 15, `${player.id} did not develop enough plots`);
    assert.ok(roadCount <= Math.ceil(additions.length * .35), `${player.id} built too many roads`);
    assert.ok(Object.values(districtCounts).filter((count) => count > 0).length >= 3, `${player.id} lacks district variety`);
    signatures.add(JSON.stringify(districtCounts));
  });
  assert.ok(signatures.size >= 4);
});
