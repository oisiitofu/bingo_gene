import assert from "node:assert/strict";
import test from "node:test";

await import("../monster-system.js");
await import("../territory-system.js");

const Territory = globalThis.TeamBingoTerritorySystem;
const Monster = globalThis.TeamBingoMonsterSystem;
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
  assert.ok(Object.values(state.tiles).every((tile) => Territory.TILE_EVENT_BY_ID[tile.eventId]));
  assert.ok(Object.values(state.tiles).filter((tile) => tile.ownerId).every((tile) => (
    tile.garrison?.ownerId === tile.ownerId &&
    tile.garrison?.lineup?.length === Territory.PARTY_SIZE &&
    tile.garrison?.hype === Territory.DEFAULT_HYPE
  )));
});

test("図鑑登録が3体未満なら領地PTの不足枠をたまごで補う", () => {
  const ids = Object.values(Monster.NODES).filter((node) => node.id !== "egg").slice(0, 2).map((node) => node.id);
  const state = Territory.createInitialState(createStatsWithIds(ids), MONDAY_JST);
  for (const tile of Object.values(state.tiles).filter((entry) => entry.ownerId)) {
    assert.equal(tile.garrison.lineup.length, 3);
    assert.deepEqual(
      new Set(tile.garrison.lineup.filter((member) => member.nodeId !== "egg").map((member) => member.nodeId)),
      new Set(ids)
    );
    assert.equal(tile.garrison.lineup.filter((member) => member.nodeId === "egg").length, 1);
  }
});

test("領地PTはコスト・伝説・星6の制限なしで3体を編成する", () => {
  const ids = Object.values(Monster.NODES)
    .filter((node) => node.id !== "egg")
    .sort((a, b) => Number(Boolean(b.legendary || b.rank6)) - Number(Boolean(a.legendary || a.rank6)) || b.stage - a.stage)
    .slice(0, 3)
    .map((node) => node.id);
  const state = Territory.createInitialState(createStatsWithIds(ids), MONDAY_JST);
  for (const tile of Object.values(state.tiles).filter((entry) => entry.ownerId)) {
    assert.deepEqual(new Set(tile.garrison.lineup.map((member) => member.nodeId)), new Set(ids));
  }
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

test("バージョン1のシーズン状態を所有権を保ったまま領地PT形式へ移行する", () => {
  const stats = createStats();
  const original = Territory.createInitialState(stats, MONDAY_JST);
  const legacy = structuredClone(original);
  legacy.version = 1;
  Object.values(legacy.tiles).forEach((tile) => {
    delete tile.garrison;
    delete tile.eventId;
    delete tile.eventCycle;
  });
  const beforeOwners = Object.fromEntries(Object.entries(legacy.tiles).map(([id, tile]) => [id, tile.ownerId]));
  const migrated = Territory.normalizeState(legacy, stats, MONDAY_JST + Territory.TICK_MS);
  assert.equal(migrated.version, 2);
  assert.deepEqual(
    Object.fromEntries(Object.entries(migrated.tiles).map(([id, tile]) => [id, tile.ownerId])),
    beforeOwners
  );
  assert.ok(Object.values(migrated.tiles).filter((tile) => tile.ownerId).every((tile) => tile.garrison?.lineup?.length === 3));
});
