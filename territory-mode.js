(function bootstrapTerritoryMode(global) {
  "use strict";

  const Territory = global.TeamBingoTerritorySystem;
  if (!Territory) return;

  let root = null;
  let state = null;
  let playerStats = {};
  let selectedTileId = "0,0";
  let preview = true;
  let spriteMarkup = () => "";
  let replayBattle = () => {};
  let countdownTimer = 0;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(Number(value) || Date.now()));
  }

  function formatClock(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function ensureRoot() {
    if (root) return root;
    root = document.createElement("section");
    root.className = "territory-mode";
    root.id = "territoryMode";
    root.hidden = true;
    root.setAttribute("aria-label", "六王領土戦");
    root.innerHTML = `
      <header class="territory-mode-head">
        <h1 class="territory-mode-title">六王領土戦</h1>
        <div class="territory-mode-season">
          <span class="territory-live-badge" data-territory-live>LIVE</span>
          <span data-territory-season></span>
          <span>次の自動進行 <strong data-territory-countdown>--:--</strong></span>
        </div>
        <button type="button" class="territory-mode-close" data-territory-close>CLOSE</button>
      </header>
      <div class="territory-mode-layout">
        <aside class="territory-panel territory-ranking">
          <h2 class="territory-panel-title">六王ランキング</h2>
          <div class="territory-ranking-list" data-territory-ranking></div>
        </aside>
        <main class="territory-panel territory-map-panel">
          <svg class="territory-map" data-territory-map viewBox="-520 -470 1040 940" role="img" aria-label="六王領土戦マップ"></svg>
          <div class="territory-map-legend"><span>本拠地 ◆</span><span>玉座 王</span><span>拠点 砦</span></div>
        </main>
        <aside class="territory-panel territory-detail">
          <h2 class="territory-panel-title">領地・自動編成</h2>
          <div class="territory-detail-body" data-territory-detail></div>
        </aside>
        <section class="territory-panel territory-feed">
          <h2 class="territory-panel-title">戦況ログ</h2>
          <div class="territory-feed-list" data-territory-feed></div>
        </section>
      </div>
    `;
    document.body.append(root);
    root.addEventListener("click", onClick);
    return root;
  }

  function onClick(event) {
    if (event.target.closest("[data-territory-close]")) {
      close();
      return;
    }
    const hex = event.target.closest("[data-tile-id]");
    if (hex) {
      selectedTileId = hex.dataset.tileId;
      renderMap();
      renderDetail();
      return;
    }
    const king = event.target.closest("[data-king-id]");
    if (king) {
      const player = Territory.PLAYER_BY_ID[king.dataset.kingId];
      if (player) selectedTileId = Territory.tileId(player.home[0], player.home[1]);
      render();
      return;
    }
    const replay = event.target.closest("[data-territory-replay]");
    if (replay) {
      const battle = state?.battles?.find((item) => item.id === replay.dataset.territoryReplay);
      if (battle) replayBattle(battle);
    }
  }

  function hexPoints(cx, cy, size) {
    return Array.from({ length: 6 }, (_, index) => {
      const angle = (Math.PI / 180) * (60 * index - 30);
      return `${(cx + size * Math.cos(angle)).toFixed(2)},${(cy + size * Math.sin(angle)).toFixed(2)}`;
    }).join(" ");
  }

  function tileMark(tile) {
    if (tile.kind === "base") return "◆";
    if (tile.kind === "throne") return "王";
    if (tile.kind === "outpost") return "砦";
    return Territory.TERRAIN_BY_ID[tile.terrain]?.mark || "";
  }

  function renderMap() {
    if (!root || !state) return;
    const map = root.querySelector("[data-territory-map]");
    const size = 47;
    const scale = 1.35;
    map.innerHTML = Object.values(state.tiles || {}).map((tile) => {
      const x = size * Math.sqrt(3) * (tile.q + tile.r / 2) * scale;
      const y = size * 1.5 * tile.r * scale;
      const owner = Territory.PLAYER_BY_ID[tile.ownerId];
      const classes = [
        "territory-hex",
        owner ? "" : "neutral",
        tile.kind,
        tile.id === selectedTileId ? "selected" : ""
      ].filter(Boolean).join(" ");
      return `
        <g class="${classes}" data-tile-id="${escapeHtml(tile.id)}" style="--tile-color:${owner?.color || "#657083"}">
          <polygon points="${hexPoints(x, y, size * scale * .94)}"></polygon>
          <text x="${x}" y="${y}">${escapeHtml(tileMark(tile))}</text>
          <title>${escapeHtml(Territory.tileSummary(state, tile.id)?.terrainName || "")} / ${escapeHtml(owner?.name || "中立")}</title>
        </g>
      `;
    }).join("");
  }

  function renderRanking() {
    const list = root.querySelector("[data-territory-ranking]");
    const ranking = Territory.standings(state);
    list.innerHTML = ranking.map((player, index) => `
      <button type="button" class="territory-rank-row ${state.tiles?.[selectedTileId]?.ownerId === player.id ? "active" : ""}" data-king-id="${player.id}" style="--king-color:${player.color}">
        <span class="territory-rank-position">${index + 1}</span>
        <span class="territory-rank-copy"><strong>${escapeHtml(player.name)}</strong><span>${player.territoryCount}領地 / ${player.wins}勝</span></span>
        <span class="territory-rank-score"><strong>${player.score}</strong><span>POINT</span></span>
      </button>
    `).join("");
  }

  function renderMonster(member) {
    const node = global.TeamBingoMonsterSystem?.NODES?.[member.nodeId];
    return `
      <div class="territory-monster">
        <span class="territory-monster-art">${spriteMarkup(member.nodeId)}</span>
        <strong title="${escapeHtml(node?.name || member.name || member.nodeId)}">${escapeHtml(node?.name || member.name || member.nodeId)}</strong>
      </div>
    `;
  }

  function renderDetail() {
    const detail = root.querySelector("[data-territory-detail]");
    const tile = Territory.tileSummary(state, selectedTileId) || Territory.tileSummary(state, "0,0");
    if (!tile) {
      detail.innerHTML = `<div class="territory-empty">領地を選択してください</div>`;
      return;
    }
    const owner = Territory.PLAYER_BY_ID[tile.ownerId];
    const squads = owner ? state.players?.[owner.id]?.squads || [] : [];
    detail.innerHTML = `
      <div class="territory-tile-heading">
        <span>${tile.kind === "base" ? "本拠地" : (tile.kind === "throne" ? "中央玉座" : (tile.kind === "outpost" ? "重要拠点" : "領地"))}</span>
        <strong>${escapeHtml(tile.terrainName)}</strong>
      </div>
      <div class="territory-owner" style="--owner-color:${owner?.color || "#657083"}">${escapeHtml(owner?.name || "中立領地")}</div>
      ${squads.length ? squads.map((squad, index) => `
        <section class="territory-squad">
          <div class="territory-squad-head"><span>AUTO SQUAD ${index + 1}</span><span>戦力 ${Math.round(squad.lineup.reduce((sum, member) => sum + (Number(member.power) || 0), 0))}</span></div>
          <div class="territory-squad-lineup">${squad.lineup.map(renderMonster).join("")}</div>
        </section>
      `).join("") : `<div class="territory-empty">守備部隊なし</div>`}
    `;
  }

  function renderFeed() {
    const feed = root.querySelector("[data-territory-feed]");
    const logs = [...(state.logs || [])].reverse().slice(0, 50);
    feed.innerHTML = logs.length ? logs.map((log) => `
      <div class="territory-feed-row">
        <time>${formatDate(log.at)}</time>
        <span>${escapeHtml(log.text)}</span>
        ${log.battleId ? `<button type="button" class="territory-replay-button" data-territory-replay="${escapeHtml(log.battleId)}">REPLAY</button>` : ""}
      </div>
    `).join("") : `<div class="territory-empty">開戦待機中</div>`;
  }

  function renderHeader() {
    const live = root.querySelector("[data-territory-live]");
    live.textContent = preview ? "PREVIEW" : "LIVE";
    live.classList.toggle("preview", preview);
    const season = state?.season;
    root.querySelector("[data-territory-season]").textContent = season
      ? `SEASON ${season.id} / ${formatDate(season.startsAt)} - ${formatDate(season.endsAt)}`
      : "";
    updateCountdown();
  }

  function updateCountdown() {
    if (!root || root.hidden) return;
    const output = root.querySelector("[data-territory-countdown]");
    if (!output) return;
    if (state?.season?.status === "complete") {
      output.textContent = "終了";
      return;
    }
    output.textContent = formatClock((Number(state?.season?.nextTickAt) || Date.now()) - Date.now());
  }

  function render() {
    if (!root || !state) return;
    renderHeader();
    renderRanking();
    renderMap();
    renderDetail();
    renderFeed();
  }

  function createPreview(now = Date.now()) {
    const initial = Territory.createInitialState(playerStats, now);
    return Territory.advanceState(
      initial,
      playerStats,
      initial.season.nextTickAt + Territory.TICK_MS * 35,
      { maxTicks: 36 }
    ).state;
  }

  function open(options = {}) {
    ensureRoot();
    playerStats = options.playerStats || playerStats || {};
    spriteMarkup = typeof options.spriteMarkup === "function" ? options.spriteMarkup : spriteMarkup;
    replayBattle = typeof options.replayBattle === "function" ? options.replayBattle : replayBattle;
    if (options.state) {
      state = Territory.normalizeState(options.state, playerStats, Date.now());
      preview = options.preview === true;
    } else if (!state || preview) {
      state = createPreview();
      preview = true;
    }
    selectedTileId = state.tiles?.[selectedTileId] ? selectedTileId : "0,0";
    root.hidden = false;
    document.body.classList.add("territory-mode-open");
    render();
    window.clearInterval(countdownTimer);
    countdownTimer = window.setInterval(updateCountdown, 1000);
  }

  function close() {
    if (!root) return;
    root.hidden = true;
    document.body.classList.remove("territory-mode-open");
    window.clearInterval(countdownTimer);
    countdownTimer = 0;
  }

  function applySnapshot(snapshot, stats = null) {
    if (stats) playerStats = stats;
    if (!snapshot) return;
    state = Territory.normalizeState(snapshot, playerStats, Date.now());
    preview = false;
    if (root && !root.hidden) render();
  }

  function setPlayerStats(stats) {
    playerStats = stats || {};
  }

  global.TeamBingoTerritoryMode = Object.freeze({
    open,
    close,
    applySnapshot,
    setPlayerStats,
    isOpen: () => Boolean(root && !root.hidden),
    getState: () => state
  });
})(typeof window !== "undefined" ? window : globalThis);
