import test from "node:test";
import assert from "node:assert/strict";

import {
  applyStatsDelta,
  createStatsDelta,
  mergeLegacyStats,
  normalizeCountBackup
} from "../online/online-room.js";

const emptyStats = () => ({
  ranking: {},
  playerStats: { players: {}, rivalries: {}, recentMatches: [] },
  processedActions: {}
});

test("cell opens and closes produce reversible ranking deltas", () => {
  const before = emptyStats();
  const afterOpen = { ...emptyStats(), ranking: { 53: 2, 69: 1 } };
  const opened = applyStatsDelta(before, createStatsDelta(before, afterOpen));
  assert.deepEqual(opened.ranking, { 53: 2, 69: 1 });

  const afterClose = { ...afterOpen, ranking: { 53: 1, 69: 1 } };
  const closed = applyStatsDelta(opened, createStatsDelta(afterOpen, afterClose));
  assert.deepEqual(closed.ranking, { 53: 1, 69: 1 });
});

test("player counters and character maps are included in stats deltas", () => {
  const before = emptyStats();
  const after = emptyStats();
  after.playerStats.players.jan = {
    name: "ジャン",
    games: 1,
    wins: 1,
    losses: 0,
    opens: 3,
    closes: 0,
    skills: 1,
    specials: 1,
    mvps: 1,
    straightWins: 0,
    comebackWins: 0,
    comebackMoves: 0,
    bingoLines: 2,
    openedCharacters: { 53: 2, 69: 1 },
    winCharacters: { 69: 1 },
    specialCharacters: { 53: 1 },
    skillUsage: { jan: 1 },
    lastTeam: "RED",
    lastPlayedAt: "2026-07-17T00:00:00.000Z"
  };

  const result = applyStatsDelta(before, createStatsDelta(before, after));
  assert.equal(result.playerStats.players.jan.opens, 3);
  assert.equal(result.playerStats.players.jan.mvps, 1);
  assert.deepEqual(result.playerStats.players.jan.openedCharacters, { 53: 2, 69: 1 });
});

test("legacy rankings merge into shared online stats", () => {
  const merged = mergeLegacyStats(
    { ...emptyStats(), ranking: { 53: 4 } },
    { ...emptyStats(), ranking: { 53: 2, 69: 3 } }
  );
  assert.deepEqual(merged.ranking, { 53: 6, 69: 3 });
});

test("count backups accept both current and legacy ranking keys", () => {
  const current = normalizeCountBackup({
    version: 2,
    cellRanking: { 53: 7 },
    playerStats: { players: {} }
  });
  const legacy = normalizeCountBackup({
    version: 1,
    data: { ranking: { 69: 5 }, playerStats: { players: {} } }
  });
  assert.deepEqual(current.ranking, { 53: 7 });
  assert.deepEqual(legacy.ranking, { 69: 5 });
});

test("count backups reject Firebase-unsafe keys", () => {
  assert.throws(
    () => normalizeCountBackup({ cellRanking: { "bad/key": 1 } }),
    /使用できないキー/
  );
});
