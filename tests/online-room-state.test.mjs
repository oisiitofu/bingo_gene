import test from "node:test";
import assert from "node:assert/strict";

import {
  applyStatsDelta,
  createCountBackupPayload,
  createStatsDelta,
  mergeLegacyStats,
  normalizeCountBackup,
  selectCurrentOnlineCommentary,
  selectCountExportRanking,
  shouldResetOnlineMatchPresentation
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

test("an intentionally empty online ranking never falls back to stale local data", () => {
  assert.deepEqual(
    selectCountExportRanking(
      { ranking: {} },
      { ranking: { 53: 9 } },
      { ranking: { 69: 7 } }
    ),
    {}
  );
});

test("ranking export falls back only when the online ranking field is absent", () => {
  assert.deepEqual(
    selectCountExportRanking(
      { playerStats: { players: {} } },
      { ranking: { 53: 4 } },
      { ranking: { 69: 2 } }
    ),
    { 53: 4 }
  );
});

test("an authoritative empty ranking marker blocks stale fallback data", () => {
  assert.deepEqual(
    selectCountExportRanking(
      { playerStats: { players: {} }, rankingUpdatedAt: 1784294000000 },
      { ranking: { 53: 11 } },
      { ranking: { 69: 8 } }
    ),
    {}
  );
});

test("count export payload contains the full cell ranking and summary totals", () => {
  const payload = createCountBackupPayload(
    {
      ranking: { 53: 8, 69: 3 },
      playerStats: {
        players: { jan: { name: "JAN", games: 2, opens: 11 } },
        rivalries: {},
        recentMatches: []
      }
    },
    { ranking: { 84: 99 } },
    {},
    "2026-07-17T12:00:00.000Z"
  );

  assert.equal(payload.format, "team-bingo-count-data");
  assert.equal(payload.version, 2);
  assert.equal(payload.exportedAt, "2026-07-17T12:00:00.000Z");
  assert.deepEqual(payload.cellRanking, { 53: 8, 69: 3 });
  assert.deepEqual(payload.summary, { cellRankingEntries: 2, totalCellOpens: 11, players: 1 });
  assert.equal(payload.playerStats.players.jan.opens, 11);
});

test("count export emits an empty ranking after an authoritative reset", () => {
  const payload = createCountBackupPayload(
    { rankingUpdatedAt: 1784294000000, playerStats: { players: {}, rivalries: {}, recentMatches: [] } },
    { ranking: { 53: 12 } },
    { ranking: { 69: 4 } },
    "2026-07-17T12:00:00.000Z"
  );

  assert.deepEqual(payload.cellRanking, {});
  assert.equal(payload.summary.cellRankingEntries, 0);
  assert.equal(payload.summary.totalCellOpens, 0);
});

test("an active online commentary snapshot restores only its remaining duration", () => {
  const commentary = selectCurrentOnlineCommentary({
    events: {
      4: { createdAt: 9_000, presentation: { timeline: [{ kind: "hype-voice" }] } },
      3: {
        createdAt: 8_000,
        presentation: {
          timeline: [{ kind: "commentary", main: "勝負どころだ！", sub: "青チームがマスを開封。", duration: 10_000, faceIndex: 2 }]
        }
      }
    }
  }, 12_500);

  assert.deepEqual(commentary, {
    main: "勝負どころだ！",
    sub: "青チームがマスを開封。",
    faceIndex: 2,
    remainingMs: 5_500
  });
});

test("expired online commentary restores the shared ambient live text", () => {
  assert.equal(selectCurrentOnlineCommentary({
    events: {
      3: {
        createdAt: 8_000,
        presentation: { timeline: [{ kind: "commentary", main: "OLD", duration: 10_000 }] }
      },
      2: {
        createdAt: 7_000,
        presentation: { timeline: [{ kind: "commentary", main: "OLDER", duration: 30_000 }] }
      }
    }
  }, 20_000), null);
});

test("count backup round-trips ranking, player, rivalry, and recent match data", () => {
  const restored = normalizeCountBackup({
    version: 2,
    cellRanking: { 53: 8, 69: 3 },
    playerStats: {
      players: {
        jan: {
          name: "JAN",
          games: 4,
          wins: 3,
          losses: 1,
          opens: 12,
          skills: 2,
          mvps: 1,
          openedCharacters: { 53: 2 },
          specialCharacters: { 69: 1 },
          skillUsage: { jan: 2 },
          lastPlayedAt: "2026-07-17T10:00:00.000Z"
        }
      },
      rivalries: {
        "jan-vs-eda": {
          players: { jan: "JAN", eda: "EDA" },
          games: 3,
          wins: { jan: 2, eda: 1 },
          lastWinner: "jan",
          lastPlayedAt: "2026-07-17T10:00:00.000Z"
        }
      },
      recentMatches: [
        { id: "match-1", winner: "red", endedAt: "2026-07-17T10:00:00.000Z" }
      ]
    }
  });

  assert.deepEqual(restored.ranking, { 53: 8, 69: 3 });
  assert.equal(restored.playerStats.players.jan.games, 4);
  assert.equal(restored.playerStats.players.jan.opens, 12);
  assert.deepEqual(restored.playerStats.players.jan.skillUsage, { jan: 2 });
  assert.equal(restored.playerStats.rivalries["jan-vs-eda"].games, 3);
  assert.deepEqual(restored.playerStats.rivalries["jan-vs-eda"].wins, { jan: 2, eda: 1 });
  assert.equal(restored.playerStats.recentMatches[0].id, "match-1");
});

test("a changed match id resets stale victory presentation even after READY", () => {
  assert.equal(
    shouldResetOnlineMatchPresentation(
      { gameStarted: true, readyShown: true, matchTracker: { id: "match-new" } },
      { winner: "red", readyShown: true, matchTracker: { id: "match-old" } }
    ),
    true
  );
});

test("updates inside the same match do not reset presentation", () => {
  assert.equal(
    shouldResetOnlineMatchPresentation(
      { gameStarted: true, readyShown: true, matchTracker: { id: "match-current" } },
      { winner: null, readyShown: true, matchTracker: { id: "match-current" } }
    ),
    false
  );
});
