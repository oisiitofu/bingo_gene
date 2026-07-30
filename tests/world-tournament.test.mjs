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
  assert.equal(api.recordMatch(room.id, match.id, {
    winnerTeam: "red",
    score: { red: 2, blue: 1 },
    mvpName: "A",
    players: [
      { key: "a", name: "A", team: "red", opens: 5, skills: 1, characters: { 53: 2 } },
      { key: "b", name: "B", team: "red", opens: 4, characters: { 69: 1 } },
      { key: "c", name: "C", team: "blue", opens: 3, characters: { 12: 1 } },
      { key: "d", name: "D", team: "blue", opens: 2, characters: {} }
    ]
  }), true);
  const saved = api._getRooms()[0];
  assert.equal(saved.matches[0].status, "complete");
  assert.equal(saved.stats.a.games, 1);
  assert.equal(saved.stats.a.wins, 1);
  assert.equal(saved.stats.a.opens, 5);
  assert.equal(saved.stats.a.mvps, 1);
  assert.equal(saved.stats.a.characters["53"], 2);
  assert.equal(saved.stats.c.losses, 1);
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
