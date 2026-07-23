import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});

test("六王領土戦WorkerはOAuth認証後にETag付きで初期状態を保存する", async () => {
  const originalFetch = globalThis.fetch;
  const originalCrypto = globalThis.crypto;
  if (!globalThis.crypto) globalThis.crypto = (await import("node:crypto")).webcrypto;
  const requests = [];
  let savedState = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, init });
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (url.endsWith("/teamBingoV1/globalStats.json")) {
      return new Response(JSON.stringify({ playerStats: { players: {} } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (url.endsWith("/teamBingoV1/frontier/current.json") && (!init.method || init.method === "GET")) {
      return new Response("null", {
        status: 200,
        headers: { "content-type": "application/json", etag: "\"empty\"" }
      });
    }
    if (url.endsWith("/teamBingoV1/frontier/current.json") && init.method === "PUT") {
      savedState = JSON.parse(init.body);
      return new Response(init.body, {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    throw new Error(`Unexpected request: ${init.method || "GET"} ${url}`);
  };

  try {
    const { advanceFrontier } = await import("../worker/territory-worker.mjs");
    const result = await advanceFrontier({
      FIREBASE_CLIENT_EMAIL: "worker@example.test",
      FIREBASE_PRIVATE_KEY: privateKey,
      FIREBASE_DATABASE_URL: "https://database.test",
      FIREBASE_DATABASE_ROOT: "teamBingoV1"
    }, Date.UTC(2026, 6, 23, 0, 0));

    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.equal(savedState.version, 1);
    assert.equal(Object.keys(savedState.players).length, 6);
    const write = requests.find((request) => request.init.method === "PUT");
    assert.equal(write.init.headers["if-match"], "\"empty\"");
    assert.equal(write.init.headers.authorization, "Bearer test-token");
  } finally {
    globalThis.fetch = originalFetch;
    if (!originalCrypto) delete globalThis.crypto;
  }
});
