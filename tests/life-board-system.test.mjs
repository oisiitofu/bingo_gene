import test from "node:test";
import assert from "node:assert/strict";

await import("../life-board-system.js");
const Life = globalThis.TeamBingoLifeBoardSystem;

test("builds one deterministic 1000-space board with exact category totals", () => {
  assert.equal(Life.BOARD.length, 1000);
  assert.deepEqual(Life.generateBoard(), Life.generateBoard());
  assert.deepEqual(Life.boardCategoryCounts(), Life.CATEGORY_COUNTS);
  assert.equal(Life.REGIONS.length, 10);
  Life.REGIONS.forEach((region, index) => {
    const regionSpaces = Life.BOARD.filter((space) => space.regionId === region.id);
    assert.equal(regionSpaces.length, 100);
    assert.equal(regionSpaces.at(-1).category, "checkpoint");
    assert.equal(regionSpaces.at(-1).number, (index + 1) * 100);
  });
});

test("creates persistent life records only for the fixed six", () => {
  const state = Life.createInitialState(1_000_000);
  assert.equal(state.version, 1);
  assert.equal(Object.keys(state.players).length, 6);
  Object.values(state.players).forEach((player) => {
    assert.equal(player.cash, Life.STARTING_CASH);
    assert.equal(player.position, 0);
    assert.equal(player.rolls, 0);
    assert.equal(player.job.id, "part-time");
  });
  assert.equal(Life.playerForName(" おいしい とうふ ").id, "tofu");
  assert.equal(Life.playerForName("kento").id, "kento");
  assert.equal(Life.playerForName("guest"), null);
});

test("applies a deterministic roll once per attributed bingo open", () => {
  const payload = {
    id: "life-open:match-1:red:12:jan",
    matchId: "match-1",
    playerName: "ジャン",
    characterId: 53,
    cellIndex: 12,
    team: "red"
  };
  const initial = Life.createInitialState(2_000_000);
  const first = Life.applyOpenRoll(initial, payload, 2_000_100);
  const same = Life.applyOpenRoll(Life.createInitialState(2_000_000), payload, 2_000_100);
  assert.equal(first.applied, true);
  assert.ok(first.die >= 1 && first.die <= 6);
  assert.equal(first.die, same.die);
  assert.equal(first.state.players.jan.rolls, 1);
  assert.equal(first.state.players.jan.position, first.die);
  assert.equal(first.state.players.jan.lastRoll.characterId, 53);

  const duplicate = Life.applyOpenRoll(first.state, payload, 2_000_200);
  assert.equal(duplicate.applied, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.state.players.jan.rolls, 1);
});

test("the same cell can roll separately for two credited players", () => {
  const firstPayload = { matchId: "match-2", playerName: "えだ", team: "blue", cellIndex: 4 };
  const secondPayload = { ...firstPayload, playerName: "リーマ" };
  firstPayload.id = Life.buildOpenId(firstPayload);
  secondPayload.id = Life.buildOpenId(secondPayload);
  assert.notEqual(firstPayload.id, secondPayload.id);
  const first = Life.applyOpenRoll(null, firstPayload, 3_000_000);
  const second = Life.applyOpenRoll(first.state, secondPayload, 3_000_100);
  assert.equal(second.state.players.eda.rolls, 1);
  assert.equal(second.state.players.rima.rolls, 1);
});

test("test mode and non-fixed members never change shared state", () => {
  const initial = Life.createInitialState(4_000_000);
  const testMode = Life.applyOpenRoll(initial, {
    id: "test-open", playerName: "Kento", testMode: true
  }, 4_000_100);
  assert.equal(testMode.testMode, true);
  assert.deepEqual(testMode.state, initial);

  const guest = Life.applyOpenRoll(initial, {
    id: "guest-open", playerName: "Player 7"
  }, 4_000_100);
  assert.equal(guest.ignored, true);
  assert.deepEqual(guest.state, initial);
});

test("crossing a 100-space boundary grants one checkpoint draw bundle", () => {
  const initial = Life.createInitialState(5_000_000);
  initial.players.tofu.totalSpaces = 99;
  initial.players.tofu.position = 99;
  const result = Life.applyOpenRoll(initial, {
    id: "checkpoint-roll", playerName: "おいしいとうふ", matchId: "m", team: "red", cellIndex: 1
  }, 5_000_100);
  assert.equal(result.applied, true);
  assert.equal(result.events.filter((event) => event.category === "checkpoint").length, 1);
  assert.equal(result.state.players.tofu.assets.equipmentGacha.length, 1);
  assert.equal(result.state.players.tofu.assets.equipmentGacha[0].count, 2);
});

test("money settlement pays debt first and records new debt when cash runs out", () => {
  const player = Life.createInitialState(6_000_000).players.lickey;
  Life.applyMoney(player, -400000);
  assert.equal(player.cash, 0);
  assert.equal(player.debt, 100000);
  Life.applyMoney(player, 160000);
  assert.equal(player.debt, 0);
  assert.equal(player.cash, 60000);
  assert.equal(player.netWorth, 60000);
});
