(function bootstrapWorldTournament(global) {
  "use strict";

  const STORAGE_KEY = "teamBingo.worldTournamentRooms.v1";
  const VERSION = 1;
  let host = {};
  let root = null;
  let rooms = [];
  let selectedRoomId = "";
  let activeMatch = null;
  let returnPending = false;
  let deleteArmedId = "";
  let viewMode = "room";
  let pendingMatchId = "";
  let pendingMatchSettings = null;
  let repository = null;
  let repositoryUnsubscribe = null;
  let repositoryQueue = Promise.resolve();
  let syncState = "local";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function playerKey(name) {
    return String(name || "").trim().toLocaleLowerCase("ja-JP");
  }

  function localDateName(date = new Date()) {
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  }

  function normalizeRoomSettings(value = {}) {
    return { gridSize: Number(value.gridSize) === 7 ? 7 : 5 };
  }

  function normalizeMatchSettings(value = {}, roomSettings = {}) {
    return {
      gridSize: Number(value.gridSize ?? roomSettings.gridSize) === 7 ? 7 : 5,
      deckMode: value.deckMode === "custom" ? "custom" : "default",
      randomEventsEnabled: value.randomEventsEnabled === true,
      monsterBattleMode: value.monsterBattleMode !== false,
      doubleMonsterMode: value.doubleMonsterMode === true,
      compactMode: value.compactMode === true
    };
  }

  function normalizeBoardResult(value) {
    if (!value || typeof value !== "object") return null;
    const gridSize = Number(value.gridSize) === 7 ? 7 : 5;
    const normalizeSide = (side = {}) => ({
      title: String(side.title || ""),
      members: Array.isArray(side.members) ? side.members.map(String) : [],
      card: Array.isArray(side.card) ? side.card.slice(0, gridSize * gridSize).map((cell) => ({
        id: Math.max(0, Number(cell?.id) || 0),
        free: Boolean(cell?.free),
        marked: Boolean(cell?.marked)
      })) : []
    });
    return { gridSize, red: normalizeSide(value.red), blue: normalizeSide(value.blue) };
  }

  function normalizePlayers(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).map((value) => {
      const name = String(value?.name || value || "").trim();
      const key = String(value?.key || playerKey(name));
      return { key, name };
    }).filter((player) => {
      if (!player.name || !player.key || seen.has(player.key)) return false;
      seen.add(player.key);
      return true;
    });
  }

  function combinations(values, size, offset = 0, selected = [], output = []) {
    if (selected.length === size) {
      output.push([...selected]);
      return output;
    }
    for (let index = offset; index <= values.length - (size - selected.length); index += 1) {
      selected.push(values[index]);
      combinations(values, size, index + 1, selected, output);
      selected.pop();
    }
    return output;
  }

  function shuffleArray(values, random = Math.random) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  function generateMatchups(playerValues) {
    const players = normalizePlayers(playerValues);
    if (players.length < 2 || players.length % 2 !== 0) return [];
    const half = players.length / 2;
    const anchor = players[0];
    const remainder = players.slice(1);
    return combinations(remainder, half - 1).map((selected, index) => {
      const red = [anchor, ...selected];
      const redKeys = new Set(red.map((player) => player.key));
      const blue = players.filter((player) => !redKeys.has(player.key));
      return {
        id: `match-${String(index + 1).padStart(3, "0")}`,
        order: index + 1,
        redKeys: red.map((player) => player.key),
        blueKeys: blue.map((player) => player.key),
        status: "pending",
        winnerTeam: "",
        winnerKeys: [],
        mvpName: "",
        victoryKind: "",
        score: { red: 0, blue: 0 },
        playerResults: [],
        settings: null,
        boardResult: null,
        startedAt: "",
        endedAt: ""
      };
    });
  }

  function randomizeMatchups(matchups, random = Math.random) {
    const randomized = (Array.isArray(matchups) ? matchups : []).map((match) => {
      let redKeys = shuffleArray(match.redKeys || [], random);
      let blueKeys = shuffleArray(match.blueKeys || [], random);
      if (random() < .5) [redKeys, blueKeys] = [blueKeys, redKeys];
      return { ...match, redKeys, blueKeys };
    });
    return shuffleArray(randomized, random).map((match, index) => ({
      ...match,
      id: `match-${String(index + 1).padStart(3, "0")}`,
      order: index + 1
    }));
  }

  function canShuffleRoom(room) {
    return Boolean(room?.matches?.length) && room.matches.every((match) => (
      match.status === "pending" && !match.startedAt
    ));
  }

  function shuffleRoom(room, random = Math.random) {
    if (!canShuffleRoom(room)) return false;
    room.matches = randomizeMatchups(generateMatchups(room.players), random);
    room.updatedAt = new Date().toISOString();
    return true;
  }

  function emptyPlayerStat(player) {
    return {
      key: player.key,
      name: player.name,
      games: 0,
      wins: 0,
      losses: 0,
      opens: 0,
      skills: 0,
      comebackMoves: 0,
      mvps: 0,
      characters: {}
    };
  }

  function createRoom(name, playerValues, now = new Date(), options = {}) {
    const players = normalizePlayers(playerValues);
    if (players.length < 2 || players.length % 2 !== 0) {
      throw new Error("参加人数は2人以上の偶数にしてください。");
    }
    const createdAt = now.toISOString();
    return {
      version: VERSION,
      id: `world-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(name || "").trim() || localDateName(now),
      createdAt,
      updatedAt: createdAt,
      settings: normalizeRoomSettings(options),
      players,
      matches: randomizeMatchups(generateMatchups(players)),
      stats: Object.fromEntries(players.map((player) => [player.key, emptyPlayerStat(player)]))
    };
  }

  function normalizeRoom(value) {
    if (!value || typeof value !== "object") return null;
    const players = normalizePlayers(value.players);
    if (players.length < 2) return null;
    const generated = generateMatchups(players);
    const sourceMatches = Array.isArray(value.matches) ? value.matches : [];
    const matches = generated.map((fallback, index) => {
      const source = sourceMatches.find((entry) => entry?.id === fallback.id) || sourceMatches[index] || {};
      return {
        ...fallback,
        ...source,
        redKeys: Array.isArray(source.redKeys) ? source.redKeys : fallback.redKeys,
        blueKeys: Array.isArray(source.blueKeys) ? source.blueKeys : fallback.blueKeys,
        score: { ...fallback.score, ...(source.score || {}) },
        playerResults: Array.isArray(source.playerResults) ? source.playerResults : [],
        settings: source.settings ? normalizeMatchSettings(source.settings, value.settings) : null,
        boardResult: normalizeBoardResult(source.boardResult)
      };
    });
    const stats = Object.fromEntries(players.map((player) => [
      player.key,
      {
        ...emptyPlayerStat(player),
        ...(value.stats?.[player.key] || {}),
        key: player.key,
        name: player.name,
        characters: { ...(value.stats?.[player.key]?.characters || {}) }
      }
    ]));
    return {
      version: VERSION,
      id: String(value.id || `world-${Date.now()}`),
      name: String(value.name || localDateName()),
      createdAt: String(value.createdAt || new Date().toISOString()),
      updatedAt: String(value.updatedAt || value.createdAt || new Date().toISOString()),
      settings: normalizeRoomSettings(value.settings),
      players,
      matches,
      stats
    };
  }

  function storage() {
    return host.storage || global.localStorage;
  }

  function loadRooms() {
    try {
      const parsed = JSON.parse(storage()?.getItem(STORAGE_KEY) || "[]");
      rooms = (Array.isArray(parsed) ? parsed : []).map(normalizeRoom).filter(Boolean);
    } catch {
      rooms = [];
    }
    rooms.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!rooms.some((room) => room.id === selectedRoomId)) selectedRoomId = rooms[0]?.id || "";
    return rooms;
  }

  function persistLocalRooms() {
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify(rooms));
    } catch (error) {
      console.warn("World Tournament save failed", error);
    }
  }

  function applyRemoteRooms(values) {
    rooms = (Array.isArray(values) ? values : []).map(normalizeRoom).filter(Boolean);
    rooms.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!rooms.some((room) => room.id === selectedRoomId)) selectedRoomId = rooms[0]?.id || "";
    persistLocalRooms();
    if (root && !root.hidden) render();
    return rooms;
  }

  function setSyncState(next) {
    syncState = next;
    if (root && !root.hidden) renderSyncState();
  }

  async function connectRepository() {
    if (!repository?.mergeWorldTournamentRooms || !repository?.subscribeWorldTournamentRooms) return false;
    const localRooms = rooms.map((room) => structuredClone(room));
    setSyncState("loading");
    try {
      const merged = await repository.mergeWorldTournamentRooms(localRooms);
      applyRemoteRooms(merged);
      repositoryUnsubscribe?.();
      repositoryUnsubscribe = repository.subscribeWorldTournamentRooms((snapshot) => {
        setSyncState("shared");
        applyRemoteRooms(snapshot);
      });
      setSyncState("shared");
      return true;
    } catch (error) {
      console.warn("World Tournament sync failed", error);
      setSyncState("error");
      return false;
    }
  }

  function saveRooms(room = null) {
    persistLocalRooms();
    if (!room || !repository?.saveWorldTournamentRoom) return;
    const snapshot = structuredClone(room);
    setSyncState("saving");
    repositoryQueue = repositoryQueue
      .catch(() => {})
      .then(() => repository.saveWorldTournamentRoom(snapshot))
      .then(async () => {
        if (!repositoryUnsubscribe) await connectRepository();
        else setSyncState("shared");
      })
      .catch((error) => {
        console.warn("World Tournament remote save failed", error);
        setSyncState("error");
      });
  }

  function deleteRoom(roomId) {
    persistLocalRooms();
    if (!roomId || !repository?.deleteWorldTournamentRoom) return;
    setSyncState("saving");
    repositoryQueue = repositoryQueue
      .catch(() => {})
      .then(() => repository.deleteWorldTournamentRoom(roomId))
      .then(async () => {
        if (!repositoryUnsubscribe) await connectRepository();
        else setSyncState("shared");
      })
      .catch((error) => {
        console.warn("World Tournament remote delete failed", error);
        setSyncState("error");
      });
  }

  function selectedRoom() {
    return rooms.find((room) => room.id === selectedRoomId) || null;
  }

  function playerNames(room, keys) {
    const names = new Map(room.players.map((player) => [player.key, player.name]));
    return keys.map((key) => names.get(key) || key);
  }

  function aggregateAllTimeStats(roomValues = rooms) {
    const totals = {};
    (Array.isArray(roomValues) ? roomValues : []).forEach((room) => {
      const roomStats = Object.values(room?.stats || {});
      const complete = Boolean(room?.matches?.length) && room.matches.every((match) => match.status === "complete");
      const bestWins = complete ? Math.max(0, ...roomStats.map((stat) => Number(stat.wins) || 0)) : -1;
      room.players.forEach((player) => {
        const source = room.stats?.[player.key] || emptyPlayerStat(player);
        const total = totals[player.key] || (totals[player.key] = {
          ...emptyPlayerStat(player),
          tournaments: 0,
          championships: 0
        });
        total.name = player.name;
        total.tournaments += 1;
        total.championships += complete && Number(source.wins) === bestWins ? 1 : 0;
        ["games", "wins", "losses", "opens", "skills", "comebackMoves", "mvps"].forEach((field) => {
          total[field] += Number(source[field]) || 0;
        });
        Object.entries(source.characters || {}).forEach(([characterId, count]) => {
          total.characters[characterId] = (Number(total.characters[characterId]) || 0) + (Number(count) || 0);
        });
      });
    });
    return Object.values(totals).sort((a, b) => (
      b.championships - a.championships ||
      b.wins - a.wins ||
      b.opens - a.opens ||
      b.mvps - a.mvps ||
      a.name.localeCompare(b.name, "ja-JP")
    ));
  }

  function recordMatch(roomId, matchId, result = {}) {
    const room = rooms.find((entry) => entry.id === roomId);
    const match = room?.matches.find((entry) => entry.id === matchId);
    if (!room || !match || match.status === "complete") return false;
    const winnerTeam = result.winnerTeam === "blue" ? "blue" : "red";
    const winnerKeys = winnerTeam === "red" ? match.redKeys : match.blueKeys;
    match.status = "complete";
    match.winnerTeam = winnerTeam;
    match.winnerKeys = [...winnerKeys];
    match.mvpName = String(result.mvpName || "");
    match.victoryKind = String(result.victoryKind || "normal");
    match.score = {
      red: Math.max(0, Number(result.score?.red) || 0),
      blue: Math.max(0, Number(result.score?.blue) || 0)
    };
    match.settings = normalizeMatchSettings(result.settings || match.settings || {}, room.settings);
    match.boardResult = normalizeBoardResult(result.boardResult);
    match.startedAt = String(result.startedAt || match.startedAt || new Date().toISOString());
    match.endedAt = String(result.endedAt || new Date().toISOString());
    match.playerResults = (Array.isArray(result.players) ? result.players : []).map((entry) => ({
      key: String(entry.key || playerKey(entry.name)),
      name: String(entry.name || ""),
      team: entry.team === "blue" ? "blue" : "red",
      opens: Math.max(0, Number(entry.opens) || 0),
      skills: Math.max(0, Number(entry.skills) || 0),
      comebackMoves: Math.max(0, Number(entry.comebackMoves) || 0),
      characters: { ...(entry.characters || {}) }
    }));
    room.players.forEach((player) => {
      const stat = room.stats[player.key] || (room.stats[player.key] = emptyPlayerStat(player));
      const entry = match.playerResults.find((item) => item.key === player.key);
      stat.games += 1;
      stat.wins += winnerKeys.includes(player.key) ? 1 : 0;
      stat.losses += winnerKeys.includes(player.key) ? 0 : 1;
      stat.opens += Number(entry?.opens) || 0;
      stat.skills += Number(entry?.skills) || 0;
      stat.comebackMoves += Number(entry?.comebackMoves) || 0;
      if (playerKey(match.mvpName) === player.key) stat.mvps += 1;
      Object.entries(entry?.characters || {}).forEach(([characterId, count]) => {
        stat.characters[characterId] = (Number(stat.characters[characterId]) || 0) + (Number(count) || 0);
      });
    });
    room.updatedAt = match.endedAt;
    saveRooms(room);
    activeMatch = null;
    return true;
  }

  function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function roomCsv(room) {
    const rows = [[
      "種別", "大会部屋", "試合", "状態", "RED", "BLUE", "勝者", "プレイヤー",
      "試合数", "勝利", "敗北", "OPEN", "スキル", "逆転", "MVP", "使用キャラ", "回数", "開始", "終了"
    ]];
    room.matches.forEach((match) => {
      rows.push([
        "MATCH", room.name, match.order, match.status,
        playerNames(room, match.redKeys).join(" / "),
        playerNames(room, match.blueKeys).join(" / "),
        playerNames(room, match.winnerKeys || []).join(" / "),
        "", "", "", "", "", "", "", match.mvpName, "", "", match.startedAt, match.endedAt
      ]);
    });
    Object.values(room.stats).forEach((stat) => {
      rows.push([
        "PLAYER", room.name, "", "", "", "", "", stat.name,
        stat.games, stat.wins, stat.losses, stat.opens, stat.skills, stat.comebackMoves, stat.mvps, "", "", "", ""
      ]);
      Object.entries(stat.characters || {}).sort((a, b) => Number(b[1]) - Number(a[1])).forEach(([characterId, count]) => {
        rows.push([
          "CHARACTER", room.name, "", "", "", "", "", stat.name,
          "", "", "", "", "", "", "", characterId, count, "", ""
        ]);
      });
    });
    return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  }

  function ensureRoot() {
    if (root) return root;
    root = document.createElement("section");
    root.className = "world-tournament";
    root.hidden = true;
    root.innerHTML = `
      <div class="world-tournament-shell">
        <header class="world-tournament-head">
          <div>
            <span>DAILY ALL COMBINATIONS</span>
            <h1>世界大会</h1>
          </div>
          <div class="world-tournament-head-actions">
            <span class="world-sync-state" data-world-sync-state>LOCAL</span>
            <button type="button" class="world-simple-button" data-world-all-stats>ALL STATS</button>
            <button type="button" class="world-simple-button" data-world-new>NEW</button>
            <button type="button" class="world-simple-button" data-world-close>CLOSE</button>
          </div>
        </header>
        <div class="world-tournament-layout">
          <aside class="world-room-list" data-world-room-list></aside>
          <main class="world-room-detail" data-world-room-detail></main>
        </div>
      </div>
      <section class="world-create-dialog" data-world-create hidden>
        <form class="world-create-card" data-world-create-form>
          <header class="world-create-head">
            <div><span>NEW WORLD TOURNAMENT</span><h2>世界大会 準備</h2></div>
            <button type="button" class="world-simple-button" data-world-create-cancel>CANCEL</button>
          </header>
          <div class="world-create-body">
            <label>大会名<input type="text" maxlength="40" data-world-room-name /></label>
            <div class="world-create-size">
              <span>BINGO CARD</span>
              <div>
                <button type="button" class="world-simple-button active" data-world-create-size="5">5x5</button>
                <button type="button" class="world-simple-button" data-world-create-size="7">7x7</button>
              </div>
            </div>
            <section class="world-create-player-section">
              <div><span>PLAYERS</span><small>2人以上の偶数で登録</small></div>
              <div class="world-create-player-grid" data-world-create-players>
                ${Array.from({ length: 8 }, (_, index) => `<input type="text" maxlength="24" placeholder="PLAYER ${index + 1}" data-world-create-player="${index}" />`).join("")}
              </div>
              <div class="world-create-member-bank" data-world-create-members></div>
            </section>
            <p data-world-create-error></p>
          </div>
          <footer>
            <button type="button" class="world-simple-button" data-world-create-cancel>CANCEL</button>
            <button type="submit" class="world-simple-button primary">CREATE</button>
          </footer>
        </form>
      </section>
      <section class="world-settings-dialog" data-world-match-settings hidden>
        <form class="world-settings-card" data-world-match-settings-form>
          <header><div><span>MATCH SETTINGS</span><h2>試合設定</h2></div><button type="button" class="world-simple-button" data-world-settings-cancel>CANCEL</button></header>
          <div class="world-settings-match" data-world-settings-match></div>
          <div class="world-settings-grid">
            <section><span>DECK MODE</span><div><button type="button" data-world-setting="deckMode" data-world-value="default">DEFAULT</button><button type="button" data-world-setting="deckMode" data-world-value="custom">SETUP DECK</button></div></section>
            <section><span>EVENT</span><div><button type="button" data-world-setting="randomEventsEnabled" data-world-value="false">OFF</button><button type="button" data-world-setting="randomEventsEnabled" data-world-value="true">ON</button></div></section>
            <section><span>MONSTER BATTLE</span><div><button type="button" data-world-setting="monsterBattleMode" data-world-value="false">OFF</button><button type="button" data-world-setting="monsterBattleMode" data-world-value="true">ON</button></div></section>
            <section><span>MONSTERS / PLAYER</span><div><button type="button" data-world-setting="doubleMonsterMode" data-world-value="false">x1</button><button type="button" data-world-setting="doubleMonsterMode" data-world-value="true">x2</button></div></section>
            <section><span>LITE MODE</span><div><button type="button" data-world-setting="compactMode" data-world-value="false">OFF</button><button type="button" data-world-setting="compactMode" data-world-value="true">ON</button></div></section>
          </div>
          <footer><button type="submit" class="world-simple-button primary">MATCH START</button></footer>
        </form>
      </section>
      <section class="world-result-dialog" data-world-result hidden>
        <div class="world-result-card">
          <header><div><span>FINAL BINGO CARDS</span><h2 data-world-result-title>試合結果</h2></div><button type="button" class="world-simple-button" data-world-result-close>CLOSE</button></header>
          <div class="world-result-boards" data-world-result-boards></div>
        </div>
      </section>
    `;
    document.body.append(root);
    root.addEventListener("click", onClick);
    root.querySelector("[data-world-create-form]").addEventListener("submit", onCreate);
    root.querySelector("[data-world-create-form]").addEventListener("input", updateCreateSummary);
    root.querySelector("[data-world-match-settings-form]").addEventListener("submit", onMatchSettingsSubmit);
    return root;
  }

  function renderSyncState() {
    if (!root) return;
    const badge = root.querySelector("[data-world-sync-state]");
    if (!badge) return;
    const labels = {
      local: "LOCAL",
      loading: "SYNCING",
      saving: "SAVING",
      shared: "SHARED",
      error: "SYNC ERROR"
    };
    badge.textContent = labels[syncState] || "LOCAL";
    badge.className = `world-sync-state ${syncState}`;
    root.querySelector("[data-world-all-stats]")?.classList.toggle("active", viewMode === "stats");
  }

  function roomCardMarkup(room) {
    const complete = room.matches.filter((match) => match.status === "complete").length;
    return `
      <button type="button" class="world-room-card ${room.id === selectedRoomId ? "active" : ""}" data-world-room="${escapeHtml(room.id)}">
        <strong>${escapeHtml(room.name)}</strong>
        <span>${complete} / ${room.matches.length} MATCH</span>
      </button>
    `;
  }

  function characterSummary(stat, options = {}) {
    const entries = Object.entries(stat.characters || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
    if (!entries.length) return `<span class="world-empty-character">まだ使用記録なし</span>`;
    return entries.map(([id, count]) => `
      <span class="world-character-chip${options.showNumber ? " numbered" : ""}" title="No.${escapeHtml(id)} / ${Number(count) || 0} OPEN">
        ${typeof host.characterMarkup === "function" ? host.characterMarkup(id) : `<b>${escapeHtml(id)}</b>`}
        ${options.showNumber ? `<em>No.${String(id).padStart(2, "0")}</em>` : ""}
        <small>x${Number(count) || 0}</small>
      </span>
    `).join("");
  }

  function allTimeStatsMarkup() {
    const totals = aggregateAllTimeStats();
    const completedMatches = rooms.reduce((count, room) => (
      count + room.matches.filter((match) => match.status === "complete").length
    ), 0);
    return `
      <header class="world-room-head world-all-stats-head">
        <div>
          <span>ALL TOURNAMENT HISTORY</span>
          <h2>世界大会 累計STATS</h2>
          <p>${rooms.length} TOURNAMENTS / ${completedMatches} MATCHES / ${totals.length} PLAYERS</p>
        </div>
      </header>
      <section class="world-leaderboard world-all-stats">
        <h3>ALL-TIME STANDINGS <span>すべての世界大会を合算</span></h3>
        <div class="world-leaderboard-grid">
          ${totals.length ? totals.map((stat, index) => {
            const winRate = stat.games ? Math.round((stat.wins / stat.games) * 1000) / 10 : 0;
            return `
              <article class="world-player-stat world-all-player-stat">
                <b>${index + 1}</b>
                <div>
                  <strong>${escapeHtml(stat.name)}</strong>
                  <span>${stat.tournaments}大会 / 優勝 ${stat.championships}回 / 勝率 ${winRate}%</span>
                </div>
                <dl>
                  <dt>PLAY</dt><dd>${stat.games}</dd>
                  <dt>WIN</dt><dd>${stat.wins}</dd>
                  <dt>LOSE</dt><dd>${stat.losses}</dd>
                  <dt>OPEN</dt><dd>${stat.opens}</dd>
                  <dt>MVP</dt><dd>${stat.mvps}</dd>
                  <dt>SKILL</dt><dd>${stat.skills}</dd>
                  <dt>COMEBACK</dt><dd>${stat.comebackMoves}</dd>
                </dl>
                <div class="world-opened-cells">
                  <h4>OPENED CELLS <span>${Object.keys(stat.characters || {}).length} TYPES</span></h4>
                  <div class="world-character-list">${characterSummary(stat, { showNumber: true })}</div>
                </div>
              </article>
            `;
          }).join("") : `<div class="world-empty-detail"><strong>累計記録はまだありません</strong></div>`}
        </div>
      </section>
    `;
  }

  function render() {
    if (!root) return;
    renderSyncState();
    root.querySelector("[data-world-room-list]").innerHTML = rooms.length
      ? rooms.map(roomCardMarkup).join("")
      : `<div class="world-empty-room">大会部屋はまだありません</div>`;
    const detail = root.querySelector("[data-world-room-detail]");
    if (viewMode === "stats") {
      detail.innerHTML = allTimeStatsMarkup();
      return;
    }
    const room = selectedRoom();
    if (!room) {
      detail.innerHTML = `
        <div class="world-empty-detail">
          <strong>今日の最強決定戦を作成</strong>
          <span>参加者の全チーム組み合わせを自動生成します。</span>
          <button type="button" class="world-simple-button primary" data-world-new>CREATE ROOM</button>
        </div>`;
      return;
    }
    const complete = room.matches.filter((match) => match.status === "complete").length;
    const shuffleEnabled = canShuffleRoom(room);
    const canDelete = host.isAdmin?.() === true;
    if (!canDelete) deleteArmedId = "";
    const leaderboard = Object.values(room.stats).sort((a, b) => (
      b.wins - a.wins || b.opens - a.opens || b.mvps - a.mvps || a.name.localeCompare(b.name, "ja-JP")
    ));
    detail.innerHTML = `
      <header class="world-room-head">
        <div>
          <span>SHARED / PERSISTENT</span>
          <h2>${escapeHtml(room.name)}</h2>
          <p>${room.players.length} PLAYERS / ${room.settings.gridSize}x${room.settings.gridSize} / ${complete} OF ${room.matches.length} COMPLETE</p>
        </div>
        <div>
          <button type="button" class="world-simple-button" data-world-shuffle="${escapeHtml(room.id)}" ${shuffleEnabled ? "" : "disabled"} title="${shuffleEnabled ? "全対戦カードをシャッフル" : "試合開始後はシャッフルできません"}">SHUFFLE</button>
          <button type="button" class="world-simple-button" data-world-csv="${escapeHtml(room.id)}">CSV</button>
          ${canDelete ? `<button type="button" class="world-simple-button danger" data-world-delete="${escapeHtml(room.id)}">${deleteArmedId === room.id ? "CONFIRM DELETE" : "DELETE"}</button>` : ""}
        </div>
      </header>
      <section class="world-progress"><i style="width:${room.matches.length ? (complete / room.matches.length) * 100 : 0}%"></i></section>
      <section class="world-leaderboard">
        <h3>ROOM STANDINGS <span>この大会だけの記録</span></h3>
        <div class="world-leaderboard-grid">
          ${leaderboard.map((stat, index) => `
            <article class="world-player-stat">
              <b>${index + 1}</b>
              <div><strong>${escapeHtml(stat.name)}</strong><span>${stat.games} PLAY / ${stat.wins} WIN / ${stat.losses} LOSE</span></div>
              <dl><dt>OPEN</dt><dd>${stat.opens}</dd><dt>MVP</dt><dd>${stat.mvps}</dd><dt>SKILL</dt><dd>${stat.skills}</dd></dl>
              <div class="world-character-list">${characterSummary(stat)}</div>
            </article>
          `).join("")}
        </div>
      </section>
      <section class="world-matchups">
        <h3>ALL MATCHUPS</h3>
        <div>
          ${room.matches.map((match) => {
            const red = playerNames(room, match.redKeys);
            const blue = playerNames(room, match.blueKeys);
            const winner = playerNames(room, match.winnerKeys || []);
            return `
              <article class="world-match-row ${match.status}">
                <span class="world-match-number">#${String(match.order).padStart(2, "0")}</span>
                <div class="world-match-team red">${red.map(escapeHtml).join(" / ")}</div>
                <strong>VS</strong>
                <div class="world-match-team blue">${blue.map(escapeHtml).join(" / ")}</div>
                <div class="world-match-result">${match.status === "complete"
                  ? `<b>${escapeHtml(winner.join(" / "))} WIN</b><span>${match.score.red} - ${match.score.blue}</span>`
                  : `<span>PENDING</span>`}</div>
                ${match.status === "complete"
                  ? `<button type="button" class="world-simple-button" data-world-result="${escapeHtml(match.id)}">DONE</button>`
                  : `<button type="button" class="world-simple-button primary" data-world-play="${escapeHtml(match.id)}">SETTINGS</button>`}
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function showCreate() {
    const players = normalizePlayers(host.getPlayers?.() || []);
    const dialog = root.querySelector("[data-world-create]");
    dialog.hidden = false;
    dialog.querySelector("[data-world-room-name]").value = localDateName();
    dialog.dataset.gridSize = "5";
    dialog.querySelectorAll("[data-world-create-size]").forEach((button) => button.classList.toggle("active", button.dataset.worldCreateSize === "5"));
    dialog.querySelectorAll("[data-world-create-player]").forEach((input, index) => { input.value = players[index]?.name || ""; });
    const fixedPlayers = normalizePlayers(host.getFixedPlayers?.() || players);
    dialog.querySelector("[data-world-create-members]").innerHTML = fixedPlayers.map((player) => (
      `<button type="button" data-world-create-member="${escapeHtml(player.name)}">${escapeHtml(player.name)}</button>`
    )).join("");
    updateCreateSummary();
  }

  function createPlayerValues() {
    return Array.from(root.querySelectorAll("[data-world-create-player]")).map((input) => input.value);
  }

  function updateCreateSummary() {
    if (!root) return;
    const dialog = root.querySelector("[data-world-create]");
    if (!dialog || dialog.hidden) return;
    const players = normalizePlayers(createPlayerValues());
    dialog.querySelector("[data-world-create-error]").textContent = players.length >= 2 && players.length % 2 === 0
      ? `${players.length}人 / ${generateMatchups(players).length}試合 / ${dialog.dataset.gridSize || 5}x${dialog.dataset.gridSize || 5}`
      : "プレイヤー入力を2人以上の偶数にしてください。";
  }

  function hideCreate() {
    root.querySelector("[data-world-create]").hidden = true;
  }

  function onCreate(event) {
    event.preventDefault();
    const dialog = root.querySelector("[data-world-create]");
    const rawPlayers = createPlayerValues().map((name) => String(name || "").trim()).filter(Boolean);
    const players = normalizePlayers(rawPlayers);
    try {
      if (rawPlayers.length !== players.length) throw new Error("同じプレイヤー名は登録できません。");
      const room = createRoom(dialog.querySelector("[data-world-room-name]").value, players, new Date(), {
        gridSize: Number(dialog.dataset.gridSize) === 7 ? 7 : 5
      });
      rooms.unshift(room);
      selectedRoomId = room.id;
      viewMode = "room";
      saveRooms(room);
      hideCreate();
      render();
    } catch (error) {
      dialog.querySelector("[data-world-create-error]").textContent = error.message;
    }
  }

  function syncMatchSettingsUi() {
    if (!root || !pendingMatchSettings) return;
    root.querySelectorAll("[data-world-setting]").forEach((button) => {
      const key = button.dataset.worldSetting;
      const raw = button.dataset.worldValue;
      const value = raw === "true" ? true : (raw === "false" ? false : raw);
      button.classList.toggle("active", pendingMatchSettings[key] === value);
      button.disabled = key === "doubleMonsterMode" && !pendingMatchSettings.monsterBattleMode;
    });
  }

  function showMatchSettings(matchId) {
    const room = selectedRoom();
    const match = room?.matches.find((entry) => entry.id === matchId);
    if (!room || !match || match.status === "complete") return false;
    pendingMatchId = match.id;
    pendingMatchSettings = normalizeMatchSettings(match.settings || host.getTournamentSettings?.() || {}, room.settings);
    const dialog = root.querySelector("[data-world-match-settings]");
    const red = playerNames(room, match.redKeys).map(escapeHtml).join(" / ");
    const blue = playerNames(room, match.blueKeys).map(escapeHtml).join(" / ");
    dialog.querySelector("[data-world-settings-match]").innerHTML = `<strong>${red}</strong><span>VS</span><strong>${blue}</strong><em>${room.settings.gridSize}x${room.settings.gridSize}</em>`;
    dialog.hidden = false;
    syncMatchSettingsUi();
    return true;
  }

  function hideMatchSettings() {
    root.querySelector("[data-world-match-settings]").hidden = true;
    pendingMatchId = "";
    pendingMatchSettings = null;
  }

  function onMatchSettingsSubmit(event) {
    event.preventDefault();
    if (!pendingMatchId || !pendingMatchSettings) return;
    const matchId = pendingMatchId;
    const settings = { ...pendingMatchSettings };
    hideMatchSettings();
    playMatch(matchId, settings);
  }

  function boardSideMarkup(side, gridSize, team) {
    const cells = Array.isArray(side?.card) ? side.card : [];
    return `
      <article class="world-result-board ${team}">
        <header><div><span>${team.toUpperCase()} TEAM</span><strong>${escapeHtml(side?.title || "BINGO CARD")}</strong></div><small>${(side?.members || []).map(escapeHtml).join(" / ")}</small></header>
        <div class="world-result-grid" style="--world-grid-size:${gridSize}">
          ${cells.map((cell) => `<div class="world-result-cell${cell.marked ? " marked" : ""}${cell.free ? " free" : ""}">${cell.free ? "<b>FREE</b>" : (typeof host.characterMarkup === "function" ? host.characterMarkup(cell.id) : `<b>${cell.id}</b>`)}</div>`).join("")}
        </div>
      </article>`;
  }

  function showBoardResult(matchId) {
    const room = selectedRoom();
    const match = room?.matches.find((entry) => entry.id === matchId);
    if (!room || !match || match.status !== "complete") return false;
    const dialog = root.querySelector("[data-world-result]");
    dialog.querySelector("[data-world-result-title]").textContent = `${room.name} / MATCH ${String(match.order).padStart(2, "0")}`;
    const board = normalizeBoardResult(match.boardResult);
    dialog.querySelector("[data-world-result-boards]").innerHTML = board
      ? `${boardSideMarkup(board.red, board.gridSize, "red")}${boardSideMarkup(board.blue, board.gridSize, "blue")}`
      : `<div class="world-result-empty">この試合は盤面保存機能の追加前に終了したため、最終カードがありません。</div>`;
    dialog.hidden = false;
    return true;
  }

  function downloadCsv(room) {
    const blob = new Blob([roomCsv(room)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${room.name.replace(/[\\/:*?"<>|]/g, "-")}-世界大会.csv`;
    anchor.click();
    global.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function playMatch(matchId, settings = {}) {
    const room = selectedRoom();
    const match = room?.matches.find((entry) => entry.id === matchId);
    if (!room || !match || match.status === "complete") return;
    const red = playerNames(room, match.redKeys);
    const blue = playerNames(room, match.blueKeys);
    match.startedAt = new Date().toISOString();
    match.settings = normalizeMatchSettings(settings, room.settings);
    room.updatedAt = match.startedAt;
    activeMatch = { roomId: room.id, matchId: match.id };
    saveRooms(room);
    close();
    host.startMatch?.({ roomId: room.id, matchId: match.id, red, blue, settings: match.settings });
  }

  function onClick(event) {
    if (event.target.closest("[data-world-close]")) {
      close();
      return;
    }
    if (event.target.closest("[data-world-new]")) {
      showCreate();
      return;
    }
    if (event.target.closest("[data-world-all-stats]")) {
      viewMode = viewMode === "stats" ? "room" : "stats";
      render();
      return;
    }
    if (event.target.closest("[data-world-create-cancel]")) {
      hideCreate();
      return;
    }
    const createSize = event.target.closest("[data-world-create-size]");
    if (createSize) {
      const dialog = root.querySelector("[data-world-create]");
      dialog.dataset.gridSize = createSize.dataset.worldCreateSize === "7" ? "7" : "5";
      dialog.querySelectorAll("[data-world-create-size]").forEach((button) => button.classList.toggle("active", button === createSize));
      updateCreateSummary();
      return;
    }
    const createMember = event.target.closest("[data-world-create-member]");
    if (createMember) {
      const name = createMember.dataset.worldCreateMember;
      const inputs = Array.from(root.querySelectorAll("[data-world-create-player]"));
      const same = inputs.find((input) => playerKey(input.value) === playerKey(name));
      if (same) same.value = "";
      else (inputs.find((input) => !input.value.trim()) || inputs.at(-1)).value = name;
      updateCreateSummary();
      return;
    }
    if (event.target.closest("[data-world-settings-cancel]")) {
      hideMatchSettings();
      return;
    }
    const setting = event.target.closest("[data-world-setting]");
    if (setting && pendingMatchSettings) {
      const raw = setting.dataset.worldValue;
      pendingMatchSettings[setting.dataset.worldSetting] = raw === "true" ? true : (raw === "false" ? false : raw);
      if (setting.dataset.worldSetting === "monsterBattleMode" && raw === "false") pendingMatchSettings.doubleMonsterMode = false;
      syncMatchSettingsUi();
      return;
    }
    if (event.target.closest("[data-world-result-close]")) {
      root.querySelector("[data-world-result]").hidden = true;
      return;
    }
    const roomButton = event.target.closest("[data-world-room]");
    if (roomButton) {
      selectedRoomId = roomButton.dataset.worldRoom;
      viewMode = "room";
      deleteArmedId = "";
      render();
      return;
    }
    const play = event.target.closest("[data-world-play]");
    if (play) {
      showMatchSettings(play.dataset.worldPlay);
      return;
    }
    const result = event.target.closest("[data-world-result]");
    if (result && result.dataset.worldResult) {
      showBoardResult(result.dataset.worldResult);
      return;
    }
    const csv = event.target.closest("[data-world-csv]");
    if (csv) {
      const room = rooms.find((entry) => entry.id === csv.dataset.worldCsv);
      if (room) downloadCsv(room);
      return;
    }
    const shuffle = event.target.closest("[data-world-shuffle]");
    if (shuffle) {
      const room = rooms.find((entry) => entry.id === shuffle.dataset.worldShuffle);
      if (room && shuffleRoom(room)) {
        saveRooms(room);
        render();
      }
      return;
    }
    const remove = event.target.closest("[data-world-delete]");
    if (remove) {
      if (host.isAdmin?.() !== true) return;
      const id = remove.dataset.worldDelete;
      if (deleteArmedId !== id) {
        deleteArmedId = id;
        render();
        return;
      }
      rooms = rooms.filter((room) => room.id !== id);
      if (selectedRoomId === id) selectedRoomId = rooms[0]?.id || "";
      deleteArmedId = "";
      deleteRoom(id);
      render();
    }
  }

  function configure(options = {}) {
    const nextRepository = options.repository || repository;
    host = { ...host, ...options };
    loadRooms();
    if (nextRepository && nextRepository !== repository) {
      repositoryUnsubscribe?.();
      repositoryUnsubscribe = null;
      repository = nextRepository;
      repositoryQueue = repositoryQueue.catch(() => {}).then(() => connectRepository());
    }
  }

  function open() {
    ensureRoot();
    loadRooms();
    root.hidden = false;
    document.body.classList.add("world-tournament-open");
    render();
  }

  function close() {
    if (!root) return;
    root.hidden = true;
    hideCreate();
    root.querySelector("[data-world-match-settings]").hidden = true;
    root.querySelector("[data-world-result]").hidden = true;
    pendingMatchId = "";
    pendingMatchSettings = null;
    document.body.classList.remove("world-tournament-open");
  }

  function recordActiveMatch(result) {
    if (!activeMatch) return false;
    const recorded = recordMatch(activeMatch.roomId, activeMatch.matchId, result);
    returnPending = recorded;
    return recorded;
  }

  function returnToRoom() {
    if (!selectedRoomId) return false;
    returnPending = false;
    open();
    return true;
  }

  global.TeamBingoWorldTournament = Object.freeze({
    configure,
    open,
    close,
    recordActiveMatch,
    returnToRoom,
    hasActiveRoom: () => Boolean(selectedRoomId),
    hasActiveMatch: () => Boolean(activeMatch),
    shouldReturnAfterMatch: () => returnPending,
    generateMatchups,
    randomizeMatchups,
    canShuffleRoom,
    shuffleRoom,
    createRoom,
    recordMatch,
    aggregateAllTimeStats,
    roomCsv,
    _loadRooms: loadRooms,
    _applyRemoteRooms: applyRemoteRooms,
    _getRooms: () => rooms
  });
})(typeof window !== "undefined" ? window : globalThis);
