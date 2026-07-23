import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { advanceFrontierWithToken } from "../worker/territory-worker.mjs";

const configSource = readFileSync(new URL("../online/firebase-config.js", import.meta.url), "utf8");
const configValue = (name) => {
  const match = configSource.match(new RegExp(`${name}:\\s*"([^"]+)"`));
  assert.ok(match, `Firebase config value not found: ${name}`);
  return match[1];
};

const apiKey = configValue("apiKey");
const databaseUrl = configValue("databaseURL").replace(/\/+$/g, "");
const databaseRoot = configValue("databaseRoot");
const adminPinHash = process.env.TEAM_BINGO_ADMIN_PIN_HASH ||
  "6440e6a91202aeddb45b070a80533f65a689c37d0cf1842ab2bd962e33377880";
const identityUrl = `https://identitytoolkit.googleapis.com/v1`;

async function identityRequest(method, body) {
  const response = await fetch(`${identityUrl}/${method}?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`${method} failed: ${JSON.stringify(value)}`);
  return value;
}

async function databaseRequest(method, path, token, body) {
  const response = await fetch(
    `${databaseUrl}/${databaseRoot}/${path}.json?auth=${encodeURIComponent(token)}`,
    {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    }
  );
  if (!response.ok) throw new Error(`Firebase ${method} ${path} failed: ${response.status} ${await response.text()}`);
  return response;
}

let account = null;
try {
  account = await identityRequest("accounts:signUp", { returnSecureToken: true });
  const expiresAt = Date.now() + 15 * 60 * 1000;
  await databaseRequest("PUT", `adminSessions/${account.localId}`, account.idToken, {
    pinHash: adminPinHash,
    expiresAt
  });
  const result = await advanceFrontierWithToken({
    FIREBASE_DATABASE_URL: databaseUrl,
    FIREBASE_DATABASE_ROOT: databaseRoot,
    FIREBASE_USE_AUTH_QUERY: "true"
  }, account.idToken, Date.now());
  console.log(JSON.stringify(result));
} finally {
  if (account?.idToken) {
    await databaseRequest("DELETE", `adminSessions/${account.localId}`, account.idToken).catch(() => {});
    await identityRequest("accounts:delete", { idToken: account.idToken }).catch(() => {});
  }
}
