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
        startedAt: "",
        endedAt: ""
      };
    });
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

  function createRoom(name, playerValues, now = new Date()) {
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
      players,
      matches: generateMatchups(players),
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
        playerResults: Array.isArray(source.playerResults) ? source.playerResults : []
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

  function saveRooms() {
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify(rooms));
    } catch (error) {
      console.warn("World Tournament save failed", error);
    }
  }

  function selectedRoom() {
    return rooms.find((room) => room.id === selectedRoomId) || null;
  }

  function playerNames(room, keys) {
    const names = new Map(room.players.map((player) => [player.key, player.name]));
    return keys.map((key) => names.get(key) || key);
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
    saveRooms();
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
          <span>LOCAL TOURNAMENT ROOM</span>
          <h2>世界大会を作成</h2>
          <label>大会名<input type="text" maxlength="40" data-world-room-name /></label>
          <div class="world-create-players" data-world-create-players></div>
          <p data-world-create-error></p>
          <div>
            <button type="button" class="world-simple-button" data-world-create-cancel>CANCEL</button>
            <button type="submit" class="world-simple-button primary">CREATE</button>
          </div>
        </form>
      </section>
    `;
    document.body.append(root);
    root.addEventListener("click", onClick);
    root.querySelector("[data-world-create-form]").addEventListener("submit", onCreate);
    return root;
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

  function characterSummary(stat) {
    const entries = Object.entries(stat.characters || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
    if (!entries.length) return `<span class="world-empty-character">まだ使用記録なし</span>`;
    return entries.map(([id, count]) => `
      <span class="world-character-chip">
        ${typeof host.characterMarkup === "function" ? host.characterMarkup(id) : `<b>${escapeHtml(id)}</b>`}
        <small>x${Number(count) || 0}</small>
      </span>
    `).join("");
  }

  function render() {
    if (!root) return;
    root.querySelector("[data-world-room-list]").innerHTML = rooms.length
      ? rooms.map(roomCardMarkup).join("")
      : `<div class="world-empty-room">大会部屋はまだありません</div>`;
    const detail = root.querySelector("[data-world-room-detail]");
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
    const leaderboard = Object.values(room.stats).sort((a, b) => (
      b.wins - a.wins || b.opens - a.opens || b.mvps - a.mvps || a.name.localeCompare(b.name, "ja-JP")
    ));
    detail.innerHTML = `
      <header class="world-room-head">
        <div>
          <span>LOCAL / PERSISTENT</span>
          <h2>${escapeHtml(room.name)}</h2>
          <p>${room.players.length} PLAYERS / ${complete} OF ${room.matches.length} COMPLETE</p>
        </div>
        <div>
          <button type="button" class="world-simple-button" data-world-csv="${escapeHtml(room.id)}">CSV</button>
          <button type="button" class="world-simple-button danger" data-world-delete="${escapeHtml(room.id)}">${deleteArmedId === room.id ? "CONFIRM DELETE" : "DELETE"}</button>
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
                <button type="button" class="world-simple-button ${match.status === "complete" ? "" : "primary"}" data-world-play="${escapeHtml(match.id)}" ${match.status === "complete" ? "disabled" : ""}>
                  ${match.status === "complete" ? "DONE" : "PLAY"}
                </button>
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
    dialog.querySelector("[data-world-create-players]").innerHTML = players.map((player) => `<span>${escapeHtml(player.name)}</span>`).join("");
    dialog.querySelector("[data-world-create-error]").textContent = players.length >= 2 && players.length % 2 === 0
      ? `${players.length}人 / ${generateMatchups(players).length}試合を生成`
      : "プレイヤー入力を2人以上の偶数にしてください。";
  }

  function hideCreate() {
    root.querySelector("[data-world-create]").hidden = true;
  }

  function onCreate(event) {
    event.preventDefault();
    const dialog = root.querySelector("[data-world-create]");
    const players = normalizePlayers(host.getPlayers?.() || []);
    try {
      const room = createRoom(dialog.querySelector("[data-world-room-name]").value, players);
      rooms.unshift(room);
      selectedRoomId = room.id;
      saveRooms();
      hideCreate();
      render();
    } catch (error) {
      dialog.querySelector("[data-world-create-error]").textContent = error.message;
    }
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

  function playMatch(matchId) {
    const room = selectedRoom();
    const match = room?.matches.find((entry) => entry.id === matchId);
    if (!room || !match || match.status === "complete") return;
    const red = playerNames(room, match.redKeys);
    const blue = playerNames(room, match.blueKeys);
    match.startedAt = new Date().toISOString();
    room.updatedAt = match.startedAt;
    activeMatch = { roomId: room.id, matchId: match.id };
    saveRooms();
    close();
    host.startMatch?.({ roomId: room.id, matchId: match.id, red, blue });
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
    if (event.target.closest("[data-world-create-cancel]")) {
      hideCreate();
      return;
    }
    const roomButton = event.target.closest("[data-world-room]");
    if (roomButton) {
      selectedRoomId = roomButton.dataset.worldRoom;
      deleteArmedId = "";
      render();
      return;
    }
    const play = event.target.closest("[data-world-play]");
    if (play) {
      playMatch(play.dataset.worldPlay);
      return;
    }
    const csv = event.target.closest("[data-world-csv]");
    if (csv) {
      const room = rooms.find((entry) => entry.id === csv.dataset.worldCsv);
      if (room) downloadCsv(room);
      return;
    }
    const remove = event.target.closest("[data-world-delete]");
    if (remove) {
      const id = remove.dataset.worldDelete;
      if (deleteArmedId !== id) {
        deleteArmedId = id;
        render();
        return;
      }
      rooms = rooms.filter((room) => room.id !== id);
      if (selectedRoomId === id) selectedRoomId = rooms[0]?.id || "";
      deleteArmedId = "";
      saveRooms();
      render();
    }
  }

  function configure(options = {}) {
    host = { ...host, ...options };
    loadRooms();
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
    createRoom,
    recordMatch,
    roomCsv,
    _loadRooms: loadRooms,
    _getRooms: () => rooms
  });
})(typeof window !== "undefined" ? window : globalThis);
