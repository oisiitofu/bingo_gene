# TEAM BINGO オンライン版セットアップ

このオンライン版は、静的ファイルを Cloudflare Pages、リアルタイム通信を Firebase Spark 無料プランで運用します。Cloud Functions と課金登録は不要です。

## 1. Firebaseプロジェクト

1. Firebase Consoleでプロジェクトを作成します。
2. Webアプリを登録します。
3. AuthenticationのSign-in methodで「匿名」を有効にします。
4. Realtime Databaseを作成します。本番モードで構いません。
5. Firebase CLIでこのフォルダを開き、`firebase login`、`firebase use --add`を実行します。
6. `firebase deploy --only database`で`firebase-database.rules.json`を反映します。

## 2. 接続設定

`online/firebase-config.js`を開き、Firebase Consoleに表示されるWebアプリ設定を入力します。

```js
enabled: true,
firebase: {
  apiKey: "...",
  authDomain: "PROJECT_ID.firebaseapp.com",
  databaseURL: "https://PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "PROJECT_ID",
  appId: "..."
}
```

Firebaseの設定値はWebアプリから利用する公開識別情報です。アクセス制御は`firebase-database.rules.json`で行います。

## 3. ローカル検証

Firebase未設定でも、URL末尾に`?onlineMock=1`を付けると同一PCの複数タブでオンライン同期を検証できます。

例：`http://127.0.0.1:4173/index.html?onlineMock=1`

Firebase Emulatorを使用する場合は`online/firebase-config.js`へ次を一時追加します。

```js
useEmulator: true,
emulatorHost: "127.0.0.1",
emulatorPort: 9000,
authEmulatorPort: 9099
```

その後、`firebase emulators:start`を実行します。

## 4. Cloudflare Pages

1. このフォルダをGitリポジトリへ登録します。
2. Cloudflare DashboardのWorkers & PagesからPagesプロジェクトを作成します。
3. Framework presetは「None」、Build commandは空欄、Output directoryは`.`にします。
4. デプロイ後のURLをFirebase Authenticationの承認済みドメインへ追加します。

`_headers`によりHTMLとFirebase設定は更新確認され、画像・音声・スキル素材は長期キャッシュされます。

## 5. 最初の運用

1. 旧戦績が入っている管理ブラウザで最初の部屋を作成します。
2. その端末のランキングとSTATSが一度だけ共通戦績へ統合されます。
3. 以後、全ルームが同じランキング・STATSを参照します。
4. RANK RESETとSTATS RESETは、この管理ブラウザだけがUI上から実行できます。

## 部屋作成・管理

- 「部屋を作る」を押すと従来の準備画面へ移動します。固定プレイヤー、最大8人の名前、TEAM SHUFFLE、5x5/7x7、DECK MODEを設定し、`ROOM CREATE`で部屋を作成します。
- `ROOM CREATE`を押したら、RED/BLUEのメンバーから部屋主自身のプレイヤーを選択します。作成者はその名前の席を確保したルームマスターとして準備画面に残り、再入室は不要です。作成完了後に同じボタンが`GAME START`へ戻ります。
- ルームマスターがブラウザを閉じても部屋と試合結果は残ります。別の参加者が入室すると、必要に応じてマスターを引き継いで連戦できます。
- 「LOCAL MODE」を選ぶと、Firebaseへ接続せず従来どおりその端末だけでプレイできます。「ONLINE ROOMS」でロビーへ戻れます。
- 幽霊部屋を削除する場合は、ロビーの「ADMIN」へ管理者パスワードを入力します。30分間、通常は非表示の古い部屋も`GHOST`として表示され、DELETEできます。
- 管理者削除を使うには、最新版の`firebase-database.rules.json`を`firebase deploy --only database`で反映してください。Cloudflare PagesへのGitデプロイだけではRealtime Database Rulesは更新されません。

## 制約

無料優先版のため、参加者は信頼できるメンバーを想定しています。Security Rulesで匿名ユーザー以外を拒否し、ルーム参加者の操作を制限していますが、改造したクライアントによる完全な不正防止にはサーバー処理が必要です。
