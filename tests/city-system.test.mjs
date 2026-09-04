import test from "node:test";
import assert from "node:assert/strict";

await import("../city-system.js");
const City = globalThis.TeamBingoCitySystem;

test("creates six persistent player cities with starter infrastructure", () => {
  const state = City.createInitialState(1_000_000);
  assert.equal(state.version, 1);
  assert.equal(City.MAP_SCHEMA, 4);
  assert.equal(City.TERRAIN_REVISION, 2);
  assert.equal(City.FEATURE_REVISION, 10);
  assert.equal(state.terrainRevision, City.TERRAIN_REVISION);
  assert.equal(state.featureRevision, City.FEATURE_REVISION);
  assert.equal(City.GRID_SIZE, 160);
  assert.ok(City.GRID_SIZE * City.GRID_SIZE >= 16 * 16 * 100);
  assert.ok(Object.keys(City.BUILDINGS).length >= 1004);
  assert.equal(Object.keys(state.players).length, 6);
  Object.values(state.players).forEach((city) => {
    assert.equal(city.resources.money, City.AUTO_BUILD_THRESHOLD);
    assert.deepEqual(Object.keys(city.resources), ["money"]);
    assert.ok(city.tiles[City.tileId(City.CITY_CENTER - 1, City.CITY_CENTER - 1)]);
    assert.equal(city.mapSchema, City.MAP_SCHEMA);
    assert.equal(city.terrainRevision, City.TERRAIN_REVISION);
    assert.equal(city.featureRevision, City.FEATURE_REVISION);
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
  assert.equal(first.rewards.tofu.baseMoney, 3000);
  assert.equal(first.rewards.tofu.money, 3000 + first.rewards.tofu.missionMoney);
  assert.equal(Object.hasOwn(first.rewards.tofu, "hype"), false);
  assert.ok(first.state.players.tofu.autoDevelopment.placed > 0);
  assert.deepEqual(Object.keys(first.state.players.tofu.resources), ["money"]);

  const second = City.applyMatchReward(first.state, payload, 1_000_200);
  assert.equal(second.applied, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.state.players.tofu.resources.money, first.state.players.tofu.resources.money);
});

test("bingo-linked missions are deterministic, persisted, and pay only completed goals", () => {
  const initial = City.createInitialState(2_000_000);
  const firstSet = City.missionsForMatch("mission-match", "jan");
  const secondSet = City.missionsForMatch("mission-match", "jan");
  assert.deepEqual(firstSet, secondSet);
  assert.equal(firstSet.length, 3);
  const special = firstSet.find((mission) => mission.kind === "victoryKind");
  const entry = {
    name: "ジャン", opens: 8, bingoLines: 2, won: true, mvp: true,
    victoryKind: special?.value || "straight"
  };
  const resolved = City.resolveMatchMissions("mission-match", "jan", entry);
  assert.equal(resolved.missions.length, 3);
  assert.equal(resolved.completed, 3);
  assert.equal(resolved.earned, resolved.missions.reduce((sum, mission) => sum + mission.reward, 0));

  const result = City.applyMatchReward(initial, { id: "mission-reward", matchId: "mission-match", players: [entry] }, 2_000_100);
  const status = City.missionStatus(result.state.players.jan);
  assert.equal(result.applied, true);
  assert.equal(status.completed, 3);
  assert.equal(status.total, 3);
  assert.equal(status.recent.id, "mission-reward");
  assert.equal(status.earned, result.rewards.jan.missionMoney);
});

test("test-mode city rewards never alter resources, missions, or deduplication state", () => {
  const initial = City.createInitialState(3_000_000);
  const before = structuredClone(initial);
  const result = City.applyMatchReward(initial, {
    id: "test-mode-city-reward", testMode: true,
    players: [{ name: "Kento", opens: 20, bingoLines: 2, won: true, mvp: true, victoryKind: "comeback" }]
  }, 3_000_100);
  assert.equal(result.applied, false);
  assert.equal(result.testMode, true);
  assert.deepEqual(result.state, before);
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

test("all six cities generate distinct blended biomes with buildable and natural land", () => {
  const signatures = new Set();
  const terrainTypes = new Set();
  City.PLAYERS.forEach((player) => {
    const counts = {};
    let buildable = 0;
    let natural = 0;
    for (let z = 0; z < City.GRID_SIZE; z += 4) {
      for (let x = 0; x < City.GRID_SIZE; x += 4) {
        const terrain = City.terrainAt(player.id, x, z);
        counts[terrain.type] = (counts[terrain.type] || 0) + 1;
        terrainTypes.add(terrain.type);
        if (terrain.buildable) buildable += 1;
        else natural += 1;
      }
    }
    assert.ok(buildable > 300, `${player.id} has too little buildable land`);
    assert.ok(natural > 0, `${player.id} has no natural terrain`);
    assert.ok(Object.keys(counts).length >= 8, `${player.id} has too little biome variety`);
    signatures.add(JSON.stringify(counts));
  });
  assert.equal(signatures.size, City.PLAYERS.length);
  assert.deepEqual(terrainTypes, new Set(["grass", "meadow", "flower", "forest", "scrub", "soil", "sand", "wetland", "badlands", "volcanic", "cliff", "mountain", "snow", "river", "lake", "lagoon", "sea"]));
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

test("districts form from nearby complementary buildings and contribute city effects", () => {
  const state = City.createInitialState(1_000_000);
  const city = state.players.tofu;
  city.tiles = {};
  [
    [70, 70, "residential"], [71, 70, "residential"],
    [70, 71, "park"], [71, 71, "park"]
  ].forEach(([x, z, buildingId]) => {
    const id = City.tileId(x, z);
    city.tiles[id] = { id, kind: "building", buildingId, level: 1 };
  });
  const districts = City.analyzeDistricts(city);
  assert.equal(districts.groups.length, 1);
  assert.equal(districts.groups[0].type, "green-neighborhood");
  assert.equal(districts.groups[0].tileIds.length, 4);
  assert.equal(districts.summary[0].name, "緑住区");
  assert.equal(districts.effects.happiness, City.DISTRICTS["green-neighborhood"].effects.happiness);
  assert.equal(City.calculateMetrics(city).districtCount, 1);
});

test("city stages require both population and city score", () => {
  assert.equal(City.cityLevel(499, 999999), 1);
  assert.equal(City.cityLevel(500, 4999), 1);
  assert.equal(City.cityLevel(500, 5000), 2);
  assert.equal(City.cityLevel(10000, 40000), 4);
  assert.equal(City.cityStage(4).name, "大都市");
  assert.equal(City.cityStage(99).name, "世界都市");
});

test("every city has one exclusive signature landmark with progression requirements", () => {
  assert.equal(Object.keys(City.SIGNATURE_LANDMARKS).length, 6);
  City.PLAYERS.forEach((player) => {
    const definition = City.SIGNATURE_LANDMARKS[player.id];
    assert.ok(definition);
    assert.equal(definition.ownerId, player.id);
    assert.equal(definition.signatureLandmark, true);
    assert.equal(definition.unique, true);
    assert.ok(definition.cost >= 45000);
    assert.equal(City.BUILDINGS[definition.id], definition);
  });
  const city = City.createInitialState(1_000_000).players.tofu;
  const status = City.landmarkStatus(city);
  assert.equal(status.definition.id, "signature-tofu");
  assert.equal(status.built, false);
  assert.equal(status.unlocked, false);
  const wrongCity = City.canBuild(city, City.tileId(City.CITY_CENTER + 3, City.CITY_CENTER + 1), "signature-eda");
  assert.equal(wrongCity.ok, false);
  assert.match(wrongCity.reason, /別の都市専用/);
});

test("the six cities have distinct identities that affect persistent city metrics", () => {
  assert.equal(Object.keys(City.CITY_IDENTITIES).length, 6);
  assert.equal(new Set(Object.values(City.CITY_IDENTITIES).map((identity) => identity.id)).size, 6);
  City.PLAYERS.forEach((player) => {
    const identity = City.CITY_IDENTITIES[player.id];
    const city = City.createInitialState(1_000_000).players[player.id];
    const metrics = City.calculateMetrics(city);
    assert.ok(identity?.title && identity?.focus && identity?.description);
    assert.equal(metrics.identityId, identity.id);
    assert.ok(Object.keys(identity.effects).length >= 3);
  });
});

test("each city keeps a distinct citizen cast and publishes metric-driven city news", () => {
  const state = City.createInitialState(4_000_000);
  const names = new Set();
  City.PLAYERS.forEach((player, index) => {
    const city = state.players[player.id];
    const initial = City.lifeStatus(city);
    assert.equal(initial.residents.length, 5);
    initial.residents.forEach((resident) => names.add(resident.name));
    city.metrics.happiness = index === 0 ? 92 : city.metrics.happiness;
    const news = City.cityPulse(city, 4_000_000 + City.TICK_MS * (6 + index));
    const updated = City.lifeStatus(city);
    assert.ok(news?.title && news?.detail);
    assert.equal(updated.news[0].id, news.id);
    assert.ok(updated.residents.some((resident) => resident.lastSpokeAt > 4_000_000));
  });
  assert.equal(names.size, 30);
});

test("city commands publish visible news without allowing an unbounded feed", () => {
  let state = City.createInitialState(5_000_000);
  const city = state.players.tofu;
  for (let index = 0; index < 42; index += 1) City.cityPulse(city, 5_000_000 + City.TICK_MS * (index + 1));
  assert.ok(City.lifeStatus(city).news.length <= 36);
  const plot = City.tileId(City.CITY_CENTER - 1, City.CITY_CENTER - 2);
  const result = City.applyCommand(state, { id: "news-build", type: "build", playerId: "tofu", tileId: plot, buildingId: "residential" }, 40_000_000);
  assert.equal(result.applied, true);
  assert.match(City.lifeStatus(result.state.players.tofu).news[0].title, /完成/);
});

test("traffic analysis measures connected roads, congestion, and public transit capacity", () => {
  const state = City.createInitialState(7_000_000);
  const city = state.players.kento;
  const baseline = City.analyzeTraffic(city);
  assert.equal(baseline.connectivity, 100);
  assert.ok(baseline.capacity > 0);
  const remoteRoad = City.tileId(12, 12);
  city.tiles[remoteRoad] = { id: remoteRoad, kind: "road", buildingId: "road", level: 1 };
  const disconnected = City.analyzeTraffic(city);
  assert.ok(disconnected.connectivity < baseline.connectivity);
  const stationTile = City.tileId(City.CITY_CENTER + 2, City.CITY_CENTER + 2);
  city.tiles[stationTile] = { id: stationTile, kind: "building", buildingId: "metro-station", level: 1 };
  const transit = City.analyzeTraffic(city);
  assert.ok(transit.capacity > disconnected.capacity);
  assert.equal(transit.publicTransit, City.BUILDINGS["metro-station"].publicTransit);
  const metrics = City.calculateMetrics(city);
  assert.equal(metrics.trafficCapacity, transit.capacity);
  assert.equal(metrics.publicTransit, transit.publicTransit);
  assert.ok(metrics.trafficCongestion >= 0 && metrics.trafficCongestion <= 100);
  assert.ok(metrics.transportEfficiency >= 0 && metrics.transportEfficiency <= 100);
});

test("random city events are deterministic, temporary, bounded, and affect city resources", () => {
  const now = 8_000_000;
  const state = City.createInitialState(now);
  const city = state.players.rima;
  city.events.nextAt = now;
  const money = city.resources.money;
  const event = City.processCityEvents(city, now);
  assert.ok(event && City.CITY_EVENTS.some((definition) => definition.id === event.id.split(`-${now}`)[0] || event.id.startsWith(`${definition.id}-`)));
  assert.notEqual(city.resources.money, money);
  assert.equal(City.eventStatus(city, now).active.length, 1);
  assert.ok(City.lifeStatus(city).news[0].title);
  City.processCityEvents(city, event.expiresAt + 1);
  assert.equal(City.eventStatus(city, event.expiresAt + 1).active.length, 0);
  for (let index = 0; index < 60; index += 1) {
    city.events.nextAt = now + index + 1;
    City.processCityEvents(city, now + index + 1);
  }
  assert.ok(City.eventStatus(city, Number.MAX_SAFE_INTEGER).history.length <= 48);
});

test("mayor policies persist, affect metrics, and are changed idempotently", () => {
  const now = 9_000_000;
  const initial = City.createInitialState(now);
  assert.equal(initial.players.kento.policy.id, "balanced");
  assert.equal(Object.keys(City.CITY_POLICIES).length, 6);
  const baseline = City.calculateMetrics(initial.players.kento);
  const result = City.applyCommand(initial, {
    id: "policy-transit", type: "set-policy", playerId: "kento", policyId: "transit"
  }, now + 100);
  assert.equal(result.applied, true);
  assert.equal(result.state.players.kento.policy.id, "transit");
  assert.equal(result.state.players.kento.policy.changedAt, now + 100);
  assert.ok(result.state.players.kento.metrics.transportEfficiency > baseline.transportEfficiency);
  assert.ok(result.state.players.kento.metrics.trafficCapacity > baseline.trafficCapacity);
  assert.match(City.lifeStatus(result.state.players.kento).news[0].title, /交通改革/);
  const duplicate = City.applyCommand(result.state, {
    id: "policy-transit", type: "set-policy", playerId: "kento", policyId: "green"
  }, now + 200);
  assert.equal(duplicate.applied, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.state.players.kento.policy.id, "transit");
});

test("legacy cities receive the balanced policy without losing existing data", () => {
  const state = City.createInitialState(9_100_000);
  state.featureRevision = 7;
  state.players.tofu.featureRevision = 7;
  delete state.players.tofu.policy;
  state.players.tofu.resources.money = 77777;
  const normalized = City.normalizeState(state, 9_100_100);
  assert.equal(normalized.players.tofu.policy.id, "balanced");
  assert.equal(normalized.players.tofu.resources.money, 77777);
});

test("intercity actions update both cities, relationships, news, and enforce cooldowns", () => {
  const now = 10_000_000_000;
  const initial = City.createInitialState(now);
  const tofuMoney = initial.players.tofu.resources.money;
  const edaMoney = initial.players.eda.resources.money;
  const result = City.applyCommand(initial, {
    id: "city-link-one", type: "interact", playerId: "tofu", targetPlayerId: "eda", interactionId: "trade"
  }, now + 100);
  assert.equal(result.applied, true);
  assert.equal(result.state.players.tofu.resources.money, tofuMoney + City.CITY_INTERACTIONS.trade.sourceMoney);
  assert.equal(result.state.players.eda.resources.money, edaMoney + City.CITY_INTERACTIONS.trade.targetMoney);
  assert.equal(result.state.players.tofu.relations.eda.score, City.CITY_INTERACTIONS.trade.relation);
  assert.equal(result.state.players.eda.relations.tofu.score, City.CITY_INTERACTIONS.trade.relation);
  assert.match(City.lifeStatus(result.state.players.tofu).news[0].title, /都市交易/);
  assert.match(City.lifeStatus(result.state.players.eda).news[0].title, /都市交易/);
  const blocked = City.applyCommand(result.state, {
    id: "city-link-two", type: "interact", playerId: "tofu", targetPlayerId: "eda", interactionId: "culture"
  }, now + 200);
  assert.equal(blocked.applied, false);
  assert.match(blocked.error, /あと/);
  const later = City.applyCommand(result.state, {
    id: "city-link-three", type: "interact", playerId: "tofu", targetPlayerId: "eda", interactionId: "culture"
  }, now + 100 + City.INTERACTION_COOLDOWN_MS);
  assert.equal(later.applied, true);
  assert.equal(later.state.players.tofu.relations.eda.interactions, 2);
});

test("legacy cities gain empty relation maps without losing their policy", () => {
  const state = City.createInitialState(10_100_000);
  state.featureRevision = 8;
  state.players.jan.featureRevision = 8;
  delete state.players.jan.relations;
  state.players.jan.policy = { id: "tourism", changedAt: 10_100_001 };
  const normalized = City.normalizeState(state, 10_100_100);
  assert.deepEqual(normalized.players.jan.relations, {});
  assert.equal(normalized.players.jan.policy.id, "tourism");
});

test("city day phases follow JST and weather stays shared within each three-hour block", () => {
  const jstTimestamp = (hour) => Date.UTC(2026, 8, 4, hour - 9, 30);
  assert.equal(City.cityEnvironment("tofu", jstTimestamp(6)).phase.id, "dawn");
  assert.equal(City.cityEnvironment("tofu", jstTimestamp(12)).phase.id, "day");
  assert.equal(City.cityEnvironment("tofu", jstTimestamp(18)).phase.id, "dusk");
  assert.equal(City.cityEnvironment("tofu", jstTimestamp(22)).phase.id, "night");
  const first = City.cityEnvironment("eda", Date.UTC(2026, 8, 4, 1, 5));
  const second = City.cityEnvironment("eda", Date.UTC(2026, 8, 4, 2, 55));
  assert.equal(first.block, second.block);
  assert.equal(first.weather.id, second.weather.id);
  assert.ok(City.CITY_WEATHER[first.weather.id]);
  assert.ok(first.nextWeatherAt > Date.UTC(2026, 8, 4, 1, 5));
});

test("weather is reflected in persisted city metrics without adding mutable resources", () => {
  const state = City.createInitialState(Date.UTC(2026, 8, 4, 2));
  const city = state.players.lickey;
  const environment = City.cityEnvironment(city, city.updatedAt);
  const metrics = City.calculateMetrics(city);
  assert.equal(metrics.weatherId, environment.weather.id);
  assert.equal(metrics.dayPhase, environment.phase.id);
  assert.deepEqual(Object.keys(city.resources), ["money"]);
});

test("existing cities migrate district features without losing developed plots", () => {
  const current = City.createInitialState(1_000_000);
  const marker = City.tileId(City.CITY_CENTER + 6, City.CITY_CENTER + 3);
  current.featureRevision = 0;
  current.revision = 31;
  delete current.players.tofu.featureRevision;
  current.players.tofu.resources.money = 65432;
  current.players.tofu.tiles[marker] = { id: marker, kind: "building", buildingId: "commercial", level: 3 };

  const result = City.advanceState(current, 1_000_100, { maxTicks: 1 });
  assert.equal(result.migrated, true);
  assert.equal(result.state.featureRevision, City.FEATURE_REVISION);
  assert.equal(result.state.players.tofu.featureRevision, City.FEATURE_REVISION);
  assert.equal(result.state.players.tofu.resources.money, 65432);
  assert.deepEqual(result.state.players.tofu.tiles[marker], current.players.tofu.tiles[marker]);
  assert.equal(result.state.revision, 32);
});

test("existing developed cities migrate to the current terrain without losing city data", () => {
  const current = City.createInitialState(1_000_000);
  const marker = City.tileId(City.CITY_CENTER + 5, City.CITY_CENTER + 2);
  current.mapSchema = 3;
  current.terrainRevision = 1;
  current.revision = 17;
  current.players.tofu.mapSchema = 3;
  current.players.tofu.terrainRevision = 1;
  current.players.tofu.resources.money = 87654;
  current.players.tofu.tiles[marker] = { id: marker, kind: "building", buildingId: "residential", level: 2 };
  current.players.tofu.history = { keep: { id: "keep", message: "既存都市の履歴" } };

  const result = City.advanceState(current, 1_000_100, { maxTicks: 1 });
  assert.equal(result.migrated, true);
  assert.equal(result.processed, 0);
  assert.equal(result.state.mapSchema, City.MAP_SCHEMA);
  assert.equal(result.state.terrainRevision, City.TERRAIN_REVISION);
  assert.equal(result.state.revision, 18);
  assert.equal(result.state.players.tofu.terrainRevision, City.TERRAIN_REVISION);
  assert.equal(result.state.players.tofu.resources.money, 87654);
  assert.deepEqual(result.state.players.tofu.tiles[marker], current.players.tofu.tiles[marker]);
  assert.deepEqual(result.state.players.tofu.history, current.players.tofu.history);

  const currentResult = City.advanceState(result.state, 1_000_200, { maxTicks: 1 });
  assert.equal(currentResult.migrated, false);
  assert.equal(currentResult.state.revision, 18);
});

test("every building genre exposes ten times its original distinct visual assets", () => {
  const expectedCounts = { residential: 150, commercial: 150, industrial: 150, park: 150, power: 100, water: 100, civic: 100, arena: 100 };
  ["residential", "commercial", "industrial", "park", "power", "water", "civic", "arena"].forEach((model) => {
    const variants = Object.values(City.BUILDINGS).filter((building) => building.model === model);
    assert.equal(variants.length, expectedCounts[model], `${model} only has ${variants.length} variants`);
    assert.equal(new Set(variants.map((building) => building.variant)).size, variants.length);
    assert.equal(new Set(variants.map((building) => building.name)).size, variants.length);
    assert.equal(new Set(variants.map((building) => building.visualSignature)).size, variants.length);
    assert.deepEqual(new Set(variants.map((building) => building.visualTheme)), new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
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
