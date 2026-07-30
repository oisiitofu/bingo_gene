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
