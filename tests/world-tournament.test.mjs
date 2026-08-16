import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../world-tournament.js", import.meta.url), "utf8");

function createApi(initial = []) {
  let stored = JSON.stringify(initial);
  const storage = {
    getItem() { return stored; },
    setItem(_key, value) { stored = value; }
  };
  const browser = { localStorage: storage };
  new Function("window", source)(browser);
  browser.TeamBingoWorldTournament.configure({ storage });
  return { api: browser.TeamBingoWorldTournament, read: () => JSON.parse(stored) };
}

test("six players create ten unique three-versus-three matchups", () => {
  const { api } = createApi();
  const players = ["A", "B", "C", "D", "E", "F"];
  const matchups = api.generateMatchups(players);
  assert.equal(matchups.length, 10);
  assert.ok(matchups.every((match) => match.redKeys.length === 3 && match.blueKeys.length === 3));
  assert.ok(matchups.every((match) => match.redKeys.includes("a")));
  const partitions = new Set(matchups.map((match) => match.redKeys.slice().sort().join("|")));
  assert.equal(partitions.size, 10);
});

test("tournament shuffle randomizes match order, sides, and player display order without losing combinations", () => {
  const { api } = createApi();
  const original = api.generateMatchups(["A", "B", "C", "D", "E", "F"]);
  const randomValues = [.12, .81, .27, .64, .05, .92, .33, .74];
  let cursor = 0;
  const shuffled = api.randomizeMatchups(original, () => randomValues[cursor++ % randomValues.length]);
  const signature = (match) => [match.redKeys.slice().sort().join("|"), match.blueKeys.slice().sort().join("|")].sort().join("::");

  assert.equal(shuffled.length, 10);
  assert.deepEqual(
    shuffled.map(signature).sort(),
    original.map(signature).sort(),
    "shuffle must preserve every unique team partition"
  );
  assert.notDeepEqual(
    shuffled.map((match) => [...match.redKeys, ...match.blueKeys]),
    original.map((match) => [...match.redKeys, ...match.blueKeys])
  );
  assert.deepEqual(shuffled.map((match) => match.order), Array.from({ length: 10 }, (_, index) => index + 1));
});

test("a tournament room can shuffle only before any matchup starts", () => {
  const { api } = createApi();
  const room = api.createRoom("DAY", ["A", "B", "C", "D"]);
  assert.equal(api.canShuffleRoom(room), true);
  assert.equal(api.shuffleRoom(room, () => .25), true);
  room.matches[0].startedAt = new Date().toISOString();
  assert.equal(api.canShuffleRoom(room), false);
  assert.equal(api.shuffleRoom(room, () => .75), false);
});

test("room statistics start independently and record completed tournament matches", () => {
  const { api } = createApi();
  const room = api.createRoom("2026/07/30", ["A", "B", "C", "D"], new Date("2026-07-30T00:00:00+09:00"));
  const storage = {
    value: JSON.stringify([room]),
    getItem() { return this.value; },
    setItem(_key, value) { this.value = value; }
  };
  api.configure({ storage });
  const match = api._getRooms()[0].matches[0];
  const roomPlayers = api._getRooms()[0].players;
  const winnerKey = match.redKeys[0];
  const winnerName = roomPlayers.find((player) => player.key === winnerKey).name;
  const loserKey = match.blueKeys[0];
  assert.equal(api.recordMatch(room.id, match.id, {
    winnerTeam: "red",
    score: { red: 2, blue: 1 },
    mvpName: winnerName,
    players: roomPlayers.map((player, index) => ({
      ...player,
      team: match.redKeys.includes(player.key) ? "red" : "blue",
      opens: index + 2,
      skills: player.key === winnerKey ? 1 : 0,
      characters: player.key === winnerKey ? { 53: 2 } : {}
    }))
  }), true);
  const saved = api._getRooms()[0];
  assert.equal(saved.matches[0].status, "complete");
  assert.equal(saved.stats[winnerKey].games, 1);
  assert.equal(saved.stats[winnerKey].wins, 1);
  assert.equal(saved.stats[winnerKey].mvps, 1);
  assert.equal(saved.stats[winnerKey].characters["53"], 2);
  assert.equal(saved.stats[loserKey].losses, 1);
});

test("world tournament CSV includes match, player, and character records", () => {
  const { api } = createApi();
  const room = api.createRoom("2026/07/30", ["A", "B"]);
  room.stats.a.opens = 7;
  room.stats.a.characters["53"] = 2;
  const csv = api.roomCsv(room);
  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /"MATCH"/);
  assert.match(csv, /"PLAYER"/);
  assert.match(csv, /"CHARACTER"/);
  assert.match(csv, /"2026\/07\/30"/);
});

test("all-time tournament stats combine every room without using normal career stats", () => {
  const { api } = createApi();
  const first = api.createRoom("DAY 1", ["A", "B"], new Date("2026-07-29T00:00:00+09:00"));
  const second = api.createRoom("DAY 2", ["A", "B"], new Date("2026-07-30T00:00:00+09:00"));

  first.matches[0].status = "complete";
  first.stats.a = { ...first.stats.a, games: 1, wins: 1, opens: 7, mvps: 1, characters: { 53: 2 } };
  first.stats.b = { ...first.stats.b, games: 1, losses: 1, opens: 4 };
  second.matches[0].status = "complete";
  second.stats.a = { ...second.stats.a, games: 1, losses: 1, opens: 3, skills: 1, characters: { 53: 1 } };
  second.stats.b = { ...second.stats.b, games: 1, wins: 1, opens: 8, comebackMoves: 1 };

  const totals = api.aggregateAllTimeStats([first, second]);
  const playerA = totals.find((stat) => stat.key === "a");
  const playerB = totals.find((stat) => stat.key === "b");

  assert.equal(playerA.tournaments, 2);
  assert.equal(playerA.championships, 1);
  assert.equal(playerA.games, 2);
  assert.equal(playerA.wins, 1);
  assert.equal(playerA.losses, 1);
  assert.equal(playerA.opens, 10);
  assert.equal(playerA.mvps, 1);
  assert.equal(playerA.skills, 1);
  assert.deepEqual(playerA.characters, { 53: 3 });
  assert.equal(playerB.championships, 1);
  assert.equal(playerB.comebackMoves, 1);
});

test("a server snapshot replaces the browser cache so every browser sees the same rooms", () => {
  const local = createApi();
  const localRoom = local.api.createRoom("LOCAL", ["A", "B"], new Date("2026-07-29T00:00:00+09:00"));
  const remoteRoom = local.api.createRoom("SHARED", ["A", "B"], new Date("2026-07-30T00:00:00+09:00"));
  const { api, read } = createApi([localRoom]);

  api._applyRemoteRooms([remoteRoom]);

  assert.deepEqual(api._getRooms().map((room) => room.name), ["SHARED"]);
  assert.deepEqual(read().map((room) => room.name), ["SHARED"]);
});

test("world tournament room deletion is visible and executable only in Admin mode", () => {
  assert.match(source, /const canDelete = host\.isAdmin\?\.\(\) === true/);
  assert.match(source, /\$\{canDelete \? `<button[^`]+data-world-delete/);
  assert.match(source, /if \(host\.isAdmin\?\.\(\) !== true\) return/);
});
