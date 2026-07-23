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
});

test("全参加者を収集済みモンスターから2部隊へ自動編成する", () => {
  const state = Territory.createInitialState(createStats(), MONDAY_JST);
  for (const player of Territory.PLAYERS) {
    const squads = state.players[player.id].squads;
    assert.equal(squads.length, 2);
    assert.deepEqual(squads.map((squad) => squad.lineup.length), [3, 3]);
    assert.equal(new Set(squads.flatMap((squad) => squad.lineup.map((member) => member.nodeId))).size, 6);
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
  }
});
