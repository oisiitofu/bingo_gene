import test from "node:test";
import assert from "node:assert/strict";

await import("../monster-system.js");
await import("../territory-equipment.js");
await import("../tower-system.js");

const Tower = globalThis.TeamBingoMonsterTowerSystem;
const Monsters = globalThis.TeamBingoMonsterSystem;

function richStats(masteryXp = 250000) {
  const dex = Object.fromEntries(Object.keys(Monsters.NODES).filter((id) => id !== "egg").map((id) => [id, 1]));
  const mastery = Object.fromEntries(Object.keys(dex).map((id) => [id, masteryXp]));
  return {
    players: Object.fromEntries(Tower.PLAYERS.map((player) => [Tower.playerKey(player.name), {
      name: player.name,
      monsterDex: dex,
      monsterMastery: mastery,
      territoryEquipmentInventory: {}
    }]))
  };
}

test("tower creates six independent five-monster parties", () => {
  const state = Tower.createInitialState(richStats(), 1000);
  assert.equal(Object.keys(state.players).length, 6);
  for (const player of Object.values(state.players)) {
    assert.equal(player.party.length, 5);
    assert.equal(new Set(player.party.map((member) => member.nodeId)).size, 5);
  }
});

test("every floor has its own boss asset and rising power", () => {
  const bosses = Array.from({ length: 100 }, (_, index) => Tower.bossForFloor(index + 1));
  assert.equal(new Set(bosses.map((boss) => boss.id)).size, 100);
  assert.equal(new Set(bosses.map((boss) => boss.sprite)).size, 100);
  assert.match(bosses[99].sprite, /boss-100\.svg$/);
  assert.ok(Tower.enemyPower(30, 10) > Tower.enemyPower(1, 10));
  assert.ok(Tower.enemyPower(100, 10) > Tower.enemyPower(30, 10) * 2);
});

test("one realtime minute advances at most one phase", () => {
  const now = 10_000;
  const stats = richStats();
  const initial = Tower.createInitialState(stats, now);
  const before = initial.players.tofu.phase;
  const result = Tower.advanceState(initial, stats, now + Tower.PHASE_MS, { maxTicks: 10 });
  assert.equal(result.processed, 1);
  assert.ok(result.state.players.tofu.phase === before || result.state.players.tofu.phase === before + 1);
});

test("a defeated party rests for one hour and another party takes over", () => {
  const now = 50_000;
  const stats = richStats(0);
  const state = Tower.createInitialState(stats, now);
  const player = state.players.tofu;
  const defeated = player.party.map((member) => member.nodeId);
  player.floor = 100;
  player.phase = 10;
  player.checkpointFloor = 91;
  player.party.forEach((member) => { member.hp = 1; });
  const result = Tower.advanceState(state, stats, now + Tower.PHASE_MS);
  const next = result.state.players.tofu;
  assert.equal(next.floor, 91);
  assert.equal(next.phase, 1);
  assert.equal(next.losses, 1);
  defeated.forEach((nodeId) => assert.equal(next.resting[nodeId], now + Tower.PHASE_MS + Tower.RECOVERY_MS));
  assert.ok(next.party.some((member) => !defeated.includes(member.nodeId)));
});

test("mastery rewards are queued only for monsters that fought", () => {
  const now = 90_000;
  const stats = richStats();
  const state = Tower.createInitialState(stats, now);
  const result = Tower.advanceState(state, stats, now + Tower.PHASE_MS);
  const rewards = Object.values(result.state.rewardQueue);
  assert.ok(rewards.length > 0);
  for (const reward of rewards) {
    assert.ok(Object.keys(reward.mastery).length <= 5);
    assert.ok(Object.values(reward.mastery).every((value) => value > 0));
  }
});

test("late player stats replace an egg-only placeholder party", () => {
  const now = 120_000;
  const state = Tower.createInitialState({ players: {} }, now);
  assert.ok(state.players.jan.party.every((member) => member.nodeId === "egg"));
  const normalized = Tower.normalizeState(state, richStats(), now + 1);
  assert.ok(normalized.players.jan.party.some((member) => member.nodeId !== "egg"));
});
