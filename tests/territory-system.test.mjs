import assert from "node:assert/strict";
import test from "node:test";

await import("../monster-system.js");
await import("../territory-equipment.js");
await import("../territory-system.js");

const Territory = globalThis.TeamBingoTerritorySystem;
const Monster = globalThis.TeamBingoMonsterSystem;
const Equipment = globalThis.TeamBingoTerritoryEquipment;
const MONDAY_JST = Date.UTC(2026, 6, 19, 15);

function createStats() {
  const monsterDex = Object.fromEntries(
    Object.values(Monster.NODES)
      .filter((node) => node.id !== "egg" && !node.legendary)
      .slice(0, 24)
      .map((node) => [node.id, 1])
  );
  const players = Object.fromEntries(
    Territory.PLAYERS.map((player) => [
      Territory.playerKey(player.name),
      {
        name: player.name,
        monsterDex,
        monsterMastery: {}
      }
    ])
  );
  return { players };
}

function createStatsWithIds(nodeIds) {
  const monsterDex = Object.fromEntries(nodeIds.map((nodeId) => [nodeId, 1]));
  return {
    players: Object.fromEntries(Territory.PLAYERS.map((player) => [
      Territory.playerKey(player.name),
      { name: player.name, monsterDex, monsterMastery: {} }
    ]))
  };
}

function territoryLineupForPlayer(state, playerId) {
  return Object.values(state.tiles)
    .filter((tile) => tile.ownerId === playerId)
    .flatMap((tile) => tile.garrison?.lineup || []);
}

function assertUniqueTerritoryMonsters(state) {
  for (const player of Territory.PLAYERS) {
    const nodeIds = territoryLineupForPlayer(state, player.id)
      .map((member) => member.nodeId)
      .filter((nodeId) => nodeId !== "egg");
    assert.equal(
      nodeIds.length,
      new Set(nodeIds).size,
      `${player.id} has a duplicate non-egg territory monster`
    );
  }
}

test("六王領土戦は固定6人と61領地で初期化される", () => {
  const state = Territory.createInitialState(createStats(), MONDAY_JST);
  assert.deepEqual(
    Territory.PLAYERS.map((player) => player.name),
    ["おいしいとうふ", "えだ", "ジャン", "リーマ", "Kento", "Lickey"]
  );
  assert.equal(Object.keys(state.tiles).length, 61);
  assert.equal(Object.keys(state.players).length, 6);
  assert.equal(Object.values(state.tiles).filter((tile) => tile.baseFor).length, 6);
  assert.equal(Object.values(state.tiles).filter((tile) => tile.ownerId).length, 12);
  const terrainCounts = Object.values(state.tiles).reduce((counts, tile) => {
    counts[tile.terrain] = (counts[tile.terrain] || 0) + 1;
    return counts;
  }, {});
  assert.ok(terrainCounts.earth >= 28, "岩地がマップの中心的な地形になっている");
  assert.ok(Territory.TERRAINS.filter((terrain) => terrain.id !== "earth").every((terrain) => terrainCounts[terrain.id] >= 3));
  assert.ok(Object.values(state.tiles).every((tile) => Territory.TILE_EVENT_BY_ID[tile.eventId]));
  assert.ok(Object.values(state.tiles).filter((tile) => tile.ownerId).every((tile) => (
    tile.garrison?.ownerId === tile.ownerId &&
    tile.garrison?.lineup?.length === Territory.PARTY_SIZE &&
    tile.garrison?.hype === Territory.DEFAULT_HYPE
  )));
});

test("領土戦モンスターはスターター装備から日次自動装備される", () => {
  const state = Territory.createInitialState(createStats(), MONDAY_JST);
  for (const player of Territory.PLAYERS) {
    const playerState = state.players[player.id];
    assert.equal(playerState.lastEquipmentDay, "2026-07-20");
    assert.ok(Object.keys(playerState.equipmentAssignments).length > 0);
    territoryLineupForPlayer(state, player.id)
      .filter((member) => member.nodeId !== "egg")
      .forEach((member) => {
        assert.ok(Object.keys(member.equipment || {}).length > 0);
        assert.ok(Equipment.loadoutItems(member.equipment).every((item) => Equipment.ITEM_BY_ID[item.id]));
      });
  }
});

test("装備報酬は5レアリティ1000種でレジェンダリー率0.1%を維持する", () => {
  assert.deepEqual(Equipment.RARITIES.map((rarity) => rarity.id), ["common", "rare", "epic", "mythic", "legendary"]);
  assert.equal(Equipment.RARITY_BY_ID.mythic.chance, .03);
  assert.equal(Equipment.RARITY_BY_ID.legendary.chance, .001);
  assert.equal(Equipment.ITEMS.length, 1000);
  assert.equal(new Set(Equipment.ITEMS.map((item) => item.id)).size, 1000);
  assert.equal(new Set(Equipment.ITEMS.map((item) => item.name)).size, 1000);
  assert.equal(Equipment.ITEM_BY_ID["common-weapon-blade"].name, "旅人の闘志の剣");
  const record = { name: "ジャン" };
  Equipment.ensureStarterRecord(record);
  assert.ok(Object.keys(record.territoryEquipment).length >= 9);
  const rewards = Equipment.generateRewards("deterministic-reward", 12);
  Equipment.applyRewards(record, rewards);
  assert.equal(
    Object.values(record.territoryRewardRarity).reduce((sum, count) => sum + count, 0),
    12
  );
});

test("手動装備した枠だけ日次自動装備から保護される", () => {
  const record = { name: "ジャン" };
  Equipment.ensureStarterRecord(record);
  const nodeIds = Object.values(Monster.NODES)
    .filter((node) => node.id !== "egg")
    .slice(0, 2)
    .map((node) => node.id);
  const monsters = nodeIds.map((nodeId, index) => ({
    nodeId,
    role: Monster.combatRole(nodeId).id,
    element: Monster.combatElement(nodeId).id,
    attackType: Monster.combatStats(nodeId).attackType,
    score: 100 - index
  }));
  assert.equal(Equipment.setManualItem(record, nodeIds[0], "weapon", "common-weapon-blade"), true);
  const first = Equipment.autoAssign(monsters, record);
  assert.equal(first[nodeIds[0]].weapon, "common-weapon-blade");
  assert.equal(Equipment.manualLoadouts(record)[nodeIds[0]].weapon, "common-weapon-blade");
  Equipment.clearManualAssignment(record, nodeIds[0], "weapon");
  assert.equal(Equipment.manualLoadouts(record)[nodeIds[0]]?.weapon, undefined);
  assert.ok(Equipment.autoAssign(monsters, record)[nodeIds[0]].weapon);
});

test("図鑑登録が3体未満なら領地PTの不足枠をたまごで補う", () => {
  const ids = Object.values(Monster.NODES).filter((node) => node.id !== "egg").slice(0, 2).map((node) => node.id);
  const state = Territory.createInitialState(createStatsWithIds(ids), MONDAY_JST);
  for (const player of Territory.PLAYERS) {
    const lineup = territoryLineupForPlayer(state, player.id);
    assert.equal(lineup.length, 6);
    assert.deepEqual(
      new Set(lineup.filter((member) => member.nodeId !== "egg").map((member) => member.nodeId)),
      new Set(ids)
    );
    assert.equal(lineup.filter((member) => member.nodeId === "egg").length, 4);
  }
  assertUniqueTerritoryMonsters(state);
});

test("newly unlocked monsters replace existing territory eggs without resetting the season", () => {
  const initialIds = Object.values(Monster.NODES)
    .filter((node) => node.id !== "egg")
    .slice(0, 2)
    .map((node) => node.id);
  const expandedIds = Object.values(Monster.NODES)
    .filter((node) => node.id !== "egg")
    .slice(0, 6)
    .map((node) => node.id);
  const state = Territory.createInitialState(createStatsWithIds(initialIds), MONDAY_JST);
  const normalized = Territory.normalizeState(
    state,
    createStatsWithIds(expandedIds),
    MONDAY_JST + Territory.TICK_MS
  );

  for (const player of Territory.PLAYERS) {
    const lineup = territoryLineupForPlayer(normalized, player.id);
    assert.deepEqual(
      new Set(lineup.filter((member) => member.nodeId !== "egg").map((member) => member.nodeId)),
      new Set(expandedIds)
    );
    assert.equal(lineup.some((member) => member.nodeId === "egg"), false);
  }
  assertUniqueTerritoryMonsters(normalized);
});

test("領地PTはコスト・伝説・星6の制限なしで3体を編成する", () => {
  const ids = Object.values(Monster.NODES)
    .filter((node) => node.id !== "egg")
    .sort((a, b) => Number(Boolean(b.legendary || b.rank6)) - Number(Boolean(a.legendary || a.rank6)) || b.stage - a.stage)
    .slice(0, 3)
    .map((node) => node.id);
  const state = Territory.createInitialState(createStatsWithIds(ids), MONDAY_JST);
  for (const player of Territory.PLAYERS) {
    const lineup = territoryLineupForPlayer(state, player.id);
    assert.deepEqual(
      new Set(lineup.filter((member) => member.nodeId !== "egg").map((member) => member.nodeId)),
      new Set(ids)
    );
    assert.equal(lineup.filter((member) => member.nodeId === "egg").length, 3);
  }
  assertUniqueTerritoryMonsters(state);
});

test("同じ状態と時刻なら自動進行結果は決定論的になる", () => {
  const stats = createStats();
  const initial = Territory.createInitialState(stats, MONDAY_JST);
  const now = initial.season.nextTickAt + Territory.TICK_MS * 11;
  const first = Territory.advanceState(initial, stats, now);
  const second = Territory.advanceState(initial, stats, now);
  assert.equal(first.processed, 12);
  assert.deepEqual(first, second);
  assert.ok(first.state.logs.length > 1);
  assert.ok(Territory.standings(first.state).every((player) => player.territoryCount >= 1));
});

test("自動侵攻を続けても六王の本拠地は奪われない", () => {
  const stats = createStats();
  const initial = Territory.createInitialState(stats, MONDAY_JST);
  const result = Territory.advanceState(
    initial,
    stats,
    initial.season.nextTickAt + Territory.TICK_MS * 80,
    { maxTicks: 100 }
  );
  for (const player of Territory.PLAYERS) {
    const home = result.state.tiles[Territory.tileId(player.home[0], player.home[1])];
    assert.equal(home.baseFor, player.id);
    assert.equal(home.ownerId, player.id);
  }
});

test("シーズンはJST月曜0時から7日間になる", () => {
  const middleOfWeek = Date.UTC(2026, 6, 23, 3, 30);
  const season = Territory.seasonWindow(middleOfWeek);
  assert.equal(season.id, "2026-07-20");
  assert.equal(season.startsAt, MONDAY_JST);
  assert.equal(season.endsAt - season.startsAt, 7 * 24 * 60 * 60 * 1000);
});

test("戦闘履歴は既存バトル画面で再生できる編成を保持する", () => {
  const stats = createStats();
  const initial = Territory.createInitialState(stats, MONDAY_JST);
  const result = Territory.advanceState(
    initial,
    stats,
    initial.season.nextTickAt + Territory.TICK_MS * 100,
    { maxTicks: 120 }
  );
  assert.ok(result.state.battles.length > 0);
  for (const battle of result.state.battles) {
    assert.ok(Number.isInteger(battle.seed));
    assert.equal(battle.replay.winner, "red");
    assert.ok(battle.replay.red.lineup.every((nodeId) => Monster.NODES[nodeId]));
    assert.ok(battle.replay.blue.lineup.every((nodeId) => Monster.NODES[nodeId]));
    assert.ok(battle.event?.benefit);
    assert.ok(battle.event?.drawback);
    assert.ok(Number.isFinite(battle.replay.red.hype));
    assert.ok(Number.isFinite(battle.replay.blue.hype));
  }
  const battleLogs = result.state.logs.filter((log) => log.battleId);
  assert.ok(battleLogs.length > 0);
  assert.ok(battleLogs.every((log) => log.tileId && Array.isArray(log.sourceTileIds)));
  assert.ok(battleLogs.some((log) => log.sourceTileIds.some((tileId) => tileId !== log.tileId)));
});

test("占領したPTは領地へ移動し出発地へ新しいPTが自動配置される", () => {
  const stats = createStats();
  let state = Territory.createInitialState(stats, MONDAY_JST);
  let capturedBattle = null;
  for (let index = 0; index < 80 && !capturedBattle; index += 1) {
    const beforeCount = state.battles.length;
    state = Territory.advanceState(state, stats, state.season.nextTickAt, { maxTicks: 1 }).state;
    capturedBattle = state.battles.slice(beforeCount).find((battle) => (
      battle.captured && battle.movedPartyId && battle.sourceReplacementPartyId
    )) || null;
  }
  assert.ok(capturedBattle);
  assert.notEqual(capturedBattle.movedPartyId, capturedBattle.sourceReplacementPartyId);
  assert.equal(state.tiles[capturedBattle.tileId].garrison.id, capturedBattle.movedPartyId);
  assert.equal(state.tiles[capturedBattle.tileId].garrison.ownerId, capturedBattle.winnerId);
  assertUniqueTerritoryMonsters(state);
});

test("領地イベントがPTのHYPEを初期20から増減させる", () => {
  const stats = createStats();
  const initial = Territory.createInitialState(stats, MONDAY_JST);
  assert.ok(Object.values(initial.tiles).filter((tile) => tile.garrison).every((tile) => tile.garrison.hype === 20));
  const state = Territory.advanceState(
    initial,
    stats,
    initial.season.nextTickAt + Territory.TICK_MS * 18,
    { maxTicks: 24 }
  ).state;
  assert.ok(state.battles.some((battle) => battle.hypeChanges.some((change) => change.delta !== 0)));
  assert.ok(Object.values(state.tiles).filter((tile) => tile.garrison).some((tile) => tile.garrison.hype !== 20));
});

test("バージョン2の重複PTを所有権を保ったままバージョン4へ再編成する", () => {
  const stats = createStats();
  const original = Territory.createInitialState(stats, MONDAY_JST);
  const legacy = structuredClone(original);
  legacy.version = 2;
  const repeated = Object.values(legacy.tiles).find((tile) => tile.ownerId)?.garrison?.lineup;
  Object.values(legacy.tiles).forEach((tile) => {
    if (tile.ownerId && repeated) tile.garrison.lineup = structuredClone(repeated);
  });
  const beforeOwners = Object.fromEntries(Object.entries(legacy.tiles).map(([id, tile]) => [id, tile.ownerId]));
  const migrated = Territory.normalizeState(legacy, stats, MONDAY_JST + Territory.TICK_MS);
  assert.equal(migrated.version, Territory.VERSION);
  assert.deepEqual(
    Object.fromEntries(Object.entries(migrated.tiles).map(([id, tile]) => [id, tile.ownerId])),
    beforeOwners
  );
  assert.ok(Object.values(migrated.tiles).filter((tile) => tile.ownerId).every((tile) => tile.garrison?.lineup?.length === 3));
  assertUniqueTerritoryMonsters(migrated);
});

test("territory control has a visible score bonus", () => {
  const state = Territory.createInitialState(createStats(), MONDAY_JST);
  const neutral = Object.values(state.tiles).find((tile) => !tile.ownerId && !tile.baseFor);
  neutral.ownerId = "jan";
  const standings = Territory.standings(state);
  const jan = standings.find((player) => player.id === "jan");
  const eda = standings.find((player) => player.id === "eda");

  assert.equal(jan.territoryCount, eda.territoryCount + 1);
  assert.equal(jan.territoryScore - eda.territoryScore, Territory.TERRITORY_SCORE_WEIGHT);
  assert.equal(jan.score - eda.score, Territory.TERRITORY_SCORE_WEIGHT);
});

test("activity catch-up keeps every ruler invading during automatic progression", () => {
  const stats = createStats();
  const initial = Territory.createInitialState(stats, MONDAY_JST);
  const state = Territory.advanceState(
    initial,
    stats,
    initial.season.nextTickAt + Territory.TICK_MS * 11,
    { maxTicks: 12 }
  ).state;
  const battleCounts = Territory.PLAYERS.map((player) => state.players[player.id].battles);

  assert.ok(battleCounts.every((count) => count >= 18));
  assert.ok(Math.max(...battleCounts) - Math.min(...battleCounts) <= 12);
});

test("every ruler receives an invasion action on every automatic turn", () => {
  const stats = createStats();
  let state = Territory.createInitialState(stats, MONDAY_JST);
  for (let turn = 0; turn < 12; turn += 1) {
    state = Territory.advanceState(state, stats, state.season.nextTickAt, { maxTicks: 1 }).state;
    const invaders = new Set((state.lastInvasions || []).map((action) => action.playerId));
    assert.deepEqual([...invaders].sort(), Territory.PLAYERS.map((player) => player.id).sort());
  }
});

test("territory losers are unavailable for 24 hours and winners recover only 50 HP", () => {
  const stats = createStats();
  let state = Territory.createInitialState(stats, MONDAY_JST);
  let battle = null;
  for (let turn = 0; turn < 40 && !battle; turn += 1) {
    const previousCount = state.battles.length;
    state = Territory.advanceState(state, stats, state.season.nextTickAt, { maxTicks: 1 }).state;
    battle = state.battles.slice(previousCount).find((entry) => entry.healthChanges?.length) || null;
  }
  assert.ok(battle, "A battle with persistent health changes should occur");
  const winners = battle.healthChanges.filter((entry) => entry.result === "win");
  const injured = battle.healthChanges.filter((entry) => entry.result === "injured");
  assert.ok(winners.length > 0 && winners.every((entry) => entry.after > 50 && entry.after < 100));
  assert.ok(injured.length > 0);
  injured.forEach((entry) => {
    assert.equal(state.players[entry.playerId].injuredMonsters[entry.nodeId], battle.at + Territory.INJURY_MS);
    assert.ok(!territoryLineupForPlayer(state, entry.playerId).some((member) => member.nodeId === entry.nodeId));
  });
  const recovered = Territory.normalizeState(state, stats, battle.at + Territory.INJURY_MS + 1);
  injured.forEach((entry) => assert.equal(recovered.players[entry.playerId].injuredMonsters[entry.nodeId], undefined));
});

test("saved territory uses the current terrain distribution after normalization", () => {
  const stats = createStats();
  const saved = Territory.createInitialState(stats, MONDAY_JST);
  Object.values(saved.tiles).forEach((tile) => {
    tile.terrain = "fire";
  });
  const normalized = Territory.normalizeState(saved, stats, MONDAY_JST + Territory.TICK_MS);
  const earthCount = Object.values(normalized.tiles).filter((tile) => tile.terrain === "earth").length;
  assert.ok(earthCount >= 28);
  assert.ok(Object.values(normalized.tiles).some((tile) => tile.terrain !== "fire"));
});
