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
  const checkpointReward = Object.values(result.state.rewardQueue).find((reward) => reward.checkpoint === 100);
  assert.equal(checkpointReward.type, "equipment");
  assert.equal(checkpointReward.count, 2);
  assert.equal(checkpointReward.status, "pending");
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

function landOnCategory(category, playerName = "おいしいとうふ", configure = () => {}) {
  const space = Life.BOARD.find((candidate) => candidate.category === category && candidate.number > 12 && !candidate.checkpoint);
  assert.ok(space, `missing ${category} space`);
  const player = Life.playerForName(playerName);
  const id = `land-${category}-${player.id}`;
  const die = Life.seededInt(`${id}:${player.id}:die`, 1, 6);
  const state = Life.createInitialState(7_000_000);
  const record = state.players[player.id];
  record.totalSpaces = space.number - die;
  record.position = record.totalSpaces % Life.BOARD_SIZE;
  configure(record, state);
  const result = Life.applyOpenRoll(state, {
    id, matchId: "category-match", playerName, team: "red", cellIndex: space.number, characterId: 1
  }, 7_000_100);
  return { result, record: result.state.players[player.id], space };
}

test("career, property, stocks, and cross-mode rewards persist real state changes", () => {
  const career = landOnCategory("job", "えだ");
  assert.equal(career.result.events.at(-1).category, "job");
  assert.ok(career.record.job.id);

  const property = landOnCategory("property", "Lickey", (record) => { record.cash = 2_000_000; });
  assert.equal(property.result.events.at(-1).category, "property");
  assert.ok(Object.keys(property.record.assets.homes).length >= 1);

  const stock = landOnCategory("stock", "リーマ", (record) => { record.cash = 2_000_000; });
  assert.equal(stock.result.state.market.cycle, 1);
  assert.equal(stock.result.events.at(-1).category, "stock");
  assert.ok(Object.keys(stock.record.assets.stocks).length >= 1);

  for (const category of ["monster", "equipment", "city"]) {
    const linked = landOnCategory(category, "Kento");
    assert.equal(linked.result.events.at(-1).category, category);
    assert.ok(Object.keys(linked.result.state.rewardQueue).length >= 1);
  }
});

test("crossing each 25-space boundary pays the current job salary", () => {
  const state = Life.createInitialState(8_000_000);
  const player = state.players.kento;
  player.totalSpaces = 24;
  player.position = 24;
  player.job = structuredClone(Life.JOBS.find((job) => job.id === "engineer"));
  const before = player.cash;
  const result = Life.applyOpenRoll(state, {
    id: "payday-roll", matchId: "payday-match", playerName: "Kento", team: "blue", cellIndex: 7
  }, 8_000_100);
  assert.equal(result.state.players.kento.paydays, 1);
  assert.ok(result.events.some((event) => event.category === "payday"));
  assert.ok(result.state.players.kento.lifetimeIncome >= 130000);
  assert.notEqual(result.state.players.kento.cash, before);
});

test("interaction and risk spaces use large reversible life-money swings", () => {
  const interaction = landOnCategory("interaction", "ジャン");
  const event = interaction.result.events.at(-1);
  assert.equal(event.category, "interaction");
  assert.ok(Math.abs(event.amount) >= 40000);
  assert.ok(event.targetPlayerId);

  const risk = landOnCategory("risk", "ジャン", (record) => { record.cash = 1_000_000; });
  assert.equal(risk.result.events.at(-1).category, "risk");
  assert.ok(Math.abs(risk.result.events.at(-1).amount) >= 120000);
});
