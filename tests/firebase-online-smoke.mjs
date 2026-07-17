import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

if (process.env.TEAM_BINGO_FIREBASE_SMOKE !== "1") {
  console.error("Set TEAM_BINGO_FIREBASE_SMOKE=1 to run the production Firebase smoke test.");
  process.exit(2);
}

const configSource = readFileSync(new URL("../online/firebase-config.js", import.meta.url), "utf8");
const readConfigValue = (name) => {
  const match = configSource.match(new RegExp(`${name}:\\s*\"([^\"]+)\"`));
  if (!match) throw new Error(`Firebase config value not found: ${name}`);
  return match[1];
};

const apiKey = readConfigValue("apiKey");
const databaseUrl = readConfigValue("databaseURL").replace(/\/$/, "");
const root = readConfigValue("databaseRoot");
const pinHash = "6440e6a91202aeddb45b070a80533f65a689c37d0cf1842ab2bd962e33377880";
const roomId = `SMOKE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

async function signUp() {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true })
  });
  const value = await response.json();
  assert.equal(response.ok, true, `Anonymous sign-in failed: ${JSON.stringify(value)}`);
  return value;
}

async function deleteAccount(account) {
  if (!account?.idToken) return;
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: account.idToken })
  }).catch(() => {});
}

async function databaseRequest(method, path, token, body) {
  const response = await fetch(`${databaseUrl}/${root}/${path}.json?auth=${encodeURIComponent(token)}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let value = null;
  try {
    value = text ? JSON.parse(text) : null;
  } catch {
    value = text;
  }
  return { ok: response.ok, status: response.status, value };
}

const accounts = [];
let master;
let member;
let outsider;
let ghostId = "";
let closeId = "";

try {
  [master, member, outsider] = await Promise.all([signUp(), signUp(), signUp()]);
  accounts.push(master, member, outsider);
  const now = Date.now();
  const room = {
    meta: {
      id: roomId,
      masterUid: master.localId,
      revision: 0,
      eventSeq: 0,
      active: true,
      phase: "setup",
      createdAt: now,
      updatedAt: now
    },
    setup: {
      gridSize: 5,
      players: ["Smoke Master", "Smoke Member"],
      redMembers: ["Smoke Master"],
      blueMembers: ["Smoke Member"]
    },
    participants: {
      [master.localId]: {
        uid: master.localId,
        role: "master",
        team: "red",
        memberName: "Smoke Master",
        online: true,
        joinedAt: now,
        lastSeenAt: now
      }
    },
    seats: {},
    game: { gameStarted: false, winner: null }
  };

  const created = await databaseRequest("PUT", `rooms/${roomId}`, master.idToken, room);
  assert.equal(created.ok, true, `Master could not create room: ${JSON.stringify(created)}`);

  const lobby = await databaseRequest("PUT", `lobby/${roomId}`, master.idToken, {
    active: true,
    phase: "setup",
    updatedAt: now
  });
  assert.equal(lobby.ok, true, `Lobby summary could not be created: ${JSON.stringify(lobby)}`);

  const outsiderLobbyDelete = await databaseRequest("DELETE", `lobby/${roomId}`, outsider.idToken);
  assert.equal(outsiderLobbyDelete.ok, false, "A non-participant unexpectedly deleted the lobby summary");
  assert.equal(outsiderLobbyDelete.status, 401, "A non-participant lobby write should receive permission_denied");

  const joined = await databaseRequest("PUT", `rooms/${roomId}/participants/${member.localId}`, member.idToken, {
    uid: member.localId,
    role: "player",
    team: "blue",
    memberName: "Smoke Member",
    online: true,
    joinedAt: now,
    lastSeenAt: now
  });
  assert.equal(joined.ok, true, `Member could not join room: ${JSON.stringify(joined)}`);

  const memberLobbyUpdate = await databaseRequest("PATCH", `lobby/${roomId}`, member.idToken, {
    phase: "playing",
    updatedAt: Date.now()
  });
  assert.equal(memberLobbyUpdate.ok, true, `Participant could not update the lobby summary: ${JSON.stringify(memberLobbyUpdate)}`);

  const outsiderWrite = await databaseRequest("PATCH", `rooms/${roomId}/game`, outsider.idToken, {
    gameStarted: true
  });
  assert.equal(outsiderWrite.ok, false, "A non-participant unexpectedly changed the game");
  assert.equal(outsiderWrite.status, 401, "A non-participant should receive permission_denied");

  const outsiderFreshDelete = await databaseRequest("DELETE", `rooms/${roomId}`, outsider.idToken);
  assert.equal(outsiderFreshDelete.ok, false, "A non-participant unexpectedly deleted a fresh room");
  assert.equal(outsiderFreshDelete.status, 401, "A fresh room delete should receive permission_denied");

  const memberWrite = await databaseRequest("PATCH", `rooms/${roomId}/game`, member.idToken, {
    gameStarted: true
  });
  assert.equal(memberWrite.ok, true, `Participant could not change the game: ${JSON.stringify(memberWrite)}`);

  closeId = `${roomId}-CLOSE`;
  const closeRoom = structuredClone(room);
  closeRoom.meta.id = closeId;
  closeRoom.meta.updatedAt = Date.now();
  const closeCreated = await databaseRequest("PUT", `rooms/${closeId}`, master.idToken, closeRoom);
  assert.equal(closeCreated.ok, true, `Close fixture room could not be created: ${JSON.stringify(closeCreated)}`);
  const closeLobby = await databaseRequest("PUT", `lobby/${closeId}`, master.idToken, {
    active: true,
    phase: "playing",
    updatedAt: Date.now()
  });
  assert.equal(closeLobby.ok, true, `Close fixture lobby could not be created: ${JSON.stringify(closeLobby)}`);
  const masterClose = await databaseRequest("PATCH", "", master.idToken, {
    [`rooms/${closeId}`]: null,
    [`lobby/${closeId}`]: null
  });
  assert.equal(masterClose.ok, true, `Master could not close the room atomically: ${JSON.stringify(masterClose)}`);
  const closedRoom = await databaseRequest("GET", `rooms/${closeId}`, member.idToken);
  assert.equal(closedRoom.value, null, "Closed room data still exists");
  const closedLobby = await databaseRequest("GET", `lobby/${closeId}`, member.idToken);
  assert.equal(closedLobby.value, null, "Closed room remained in the lobby");

  ghostId = `${roomId}-GHOST`;
  const ghostUpdatedAt = Date.now() - 11 * 60 * 1000;
  const ghostRoom = structuredClone(room);
  ghostRoom.meta.id = ghostId;
  ghostRoom.meta.updatedAt = ghostUpdatedAt;
  const ghostCreated = await databaseRequest("PUT", `rooms/${ghostId}`, master.idToken, ghostRoom);
  assert.equal(ghostCreated.ok, true, `Ghost fixture room could not be created: ${JSON.stringify(ghostCreated)}`);
  const ghostLobby = await databaseRequest("PUT", `lobby/${ghostId}`, master.idToken, {
    active: true,
    phase: "playing",
    updatedAt: ghostUpdatedAt
  });
  assert.equal(ghostLobby.ok, true, `Ghost fixture lobby could not be created: ${JSON.stringify(ghostLobby)}`);
  const ghostDelete = await databaseRequest("PATCH", "", outsider.idToken, {
    [`rooms/${ghostId}`]: null,
    [`lobby/${ghostId}`]: null
  });
  assert.equal(ghostDelete.ok, true, `A stale room could not be automatically cleaned: ${JSON.stringify(ghostDelete)}`);
  const removedGhost = await databaseRequest("GET", `rooms/${ghostId}`, master.idToken);
  assert.equal(removedGhost.value, null, "Automatically cleaned ghost room still exists");

  const adminSession = await databaseRequest("PUT", `adminSessions/${outsider.localId}`, outsider.idToken, {
    pinHash,
    expiresAt: Date.now() + 10 * 60 * 1000
  });
  assert.equal(adminSession.ok, true, `Admin session could not be created: ${JSON.stringify(adminSession)}`);

  const adminDelete = await databaseRequest("DELETE", `rooms/${roomId}`, outsider.idToken);
  assert.equal(adminDelete.ok, true, `Admin could not delete the room: ${JSON.stringify(adminDelete)}`);

  const lobbyDelete = await databaseRequest("DELETE", `lobby/${roomId}`, outsider.idToken);
  assert.equal(lobbyDelete.ok, true, `Admin could not delete the lobby summary: ${JSON.stringify(lobbyDelete)}`);

  const removedRoom = await databaseRequest("GET", `rooms/${roomId}`, master.idToken);
  assert.equal(removedRoom.ok, true);
  assert.equal(removedRoom.value, null, "Deleted smoke-test room still exists");

  const adminSessionDelete = await databaseRequest("DELETE", `adminSessions/${outsider.localId}`, outsider.idToken);
  assert.equal(adminSessionDelete.ok, true, `Admin session could not be cleaned up: ${JSON.stringify(adminSessionDelete)}`);

  console.log(`Firebase online smoke test passed (${roomId}).`);
} finally {
  if (master?.idToken) {
    await databaseRequest("DELETE", `rooms/${roomId}`, master.idToken).catch(() => {});
    await databaseRequest("DELETE", `lobby/${roomId}`, master.idToken).catch(() => {});
    if (ghostId) {
      await databaseRequest("DELETE", `lobby/${ghostId}`, master.idToken).catch(() => {});
      await databaseRequest("DELETE", `rooms/${ghostId}`, master.idToken).catch(() => {});
    }
    if (closeId) {
      await databaseRequest("DELETE", `lobby/${closeId}`, master.idToken).catch(() => {});
      await databaseRequest("DELETE", `rooms/${closeId}`, master.idToken).catch(() => {});
    }
  }
  if (outsider?.idToken) {
    await databaseRequest("DELETE", `adminSessions/${outsider.localId}`, outsider.idToken).catch(() => {});
  }
  await Promise.all(accounts.map(deleteAccount));
}
