# 六王領土戦 Worker

Cloudflare Worker Cron が10分ごとにFirebaseの領土戦を1ターン進めます。ブラウザは読み取り専用です。

## Required secrets

```powershell
npx wrangler secret put FIREBASE_CLIENT_EMAIL
npx wrangler secret put FIREBASE_PRIVATE_KEY
npx wrangler secret put FRONTIER_ADMIN_TOKEN
```

`FIREBASE_CLIENT_EMAIL` と `FIREBASE_PRIVATE_KEY` は、Firebaseプロジェクト `team-bingo-3b04c` のサービスアカウントから取得します。秘密鍵ファイル自体はリポジトリへ追加しません。

## Deploy

```powershell
npx wrangler deploy
```

手動進行は、デプロイ先の `/tick` へ `Authorization: Bearer <FRONTIER_ADMIN_TOKEN>` を付けたPOSTで実行できます。`/health` は認証なしの稼働確認用です。

Cloudflare認証が未設定の期間も、`.github/workflows/six-kings-territory.yml` が同じETag付き処理を10分ごとに実行します。両方が動いても同じターンは二重処理されません。
