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
  let showMonsterDetail = () => {};
  let openMonsterPage = () => {};
  let map3D = null;
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
        <div class="territory-mode-actions">
          <button type="button" class="territory-mode-close" data-territory-items>MONSTER / ITEMS</button>
          <button type="button" class="territory-mode-close" data-territory-close>CLOSE</button>
        </div>
      </header>
      <div class="territory-mode-layout">
        <aside class="territory-panel territory-ranking">
          <h2 class="territory-panel-title">六王ランキング</h2>
          <div class="territory-ranking-list" data-territory-ranking></div>
        </aside>
        <main class="territory-panel territory-map-panel">
          <div class="territory-map-3d" data-territory-map-3d></div>
          <svg class="territory-map territory-map-fallback" data-territory-map viewBox="-520 -470 1040 940" role="img" aria-label="六王領土戦マップ"></svg>
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
    const mapHost = root.querySelector("[data-territory-map-3d]");
    if (mapHost && global.TeamBingoTerritoryMap3D) {
      try {
        map3D = global.TeamBingoTerritoryMap3D.create(mapHost, {
          playerById: Territory.PLAYER_BY_ID,
          onSelect: selectTile,
          summarize: (currentState, tileId) => Territory.tileSummary(currentState, tileId)
        });
        mapHost.classList.add("ready");
      } catch (error) {
        console.warn("3D territory map unavailable; using 2D fallback.", error);
        mapHost.hidden = true;
      }
    } else if (mapHost) {
      mapHost.hidden = true;
    }
    return root;
  }

  function selectTile(tileId) {
    if (!state?.tiles?.[tileId]) return;
    selectedTileId = tileId;
    renderRanking();
    renderMap();
    renderDetail();
  }

  function onClick(event) {
    if (event.target.closest("[data-territory-close]")) {
      close();
      return;
    }
    if (event.target.closest("[data-territory-items]")) {
      openMonsterPage();
      return;
    }
    const monster = event.target.closest("[data-territory-monster]");
    if (monster) {
      const tile = state?.tiles?.[selectedTileId];
      const owner = Territory.PLAYER_BY_ID[tile?.ownerId];
      showMonsterDetail(
        monster.dataset.territoryMonster,
        `${owner?.name || "六王"} / TERRITORY PARTY`,
        owner?.color || "#f7c64a"
      );
      return;
    }
    const hex = event.target.closest("[data-tile-id]");
    if (hex) {
      selectTile(hex.dataset.tileId);
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
    if (map3D) {
      map.setAttribute("hidden", "");
      map3D.update(state, selectedTileId);
      return;
    }
    map.removeAttribute("hidden");
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
      const event = Territory.TILE_EVENT_BY_ID[tile.eventId];
      const hype = Number.isFinite(Number(tile.garrison?.hype)) ? Number(tile.garrison.hype) : Territory.DEFAULT_HYPE;
      const hypeLabel = tile.garrison ? Math.round(hype) : "--";
      return `
        <g class="${classes}" data-tile-id="${escapeHtml(tile.id)}" style="--tile-color:${owner?.color || "#657083"}">
          <polygon points="${hexPoints(x, y, size * scale * .94)}"></polygon>
          <text x="${x}" y="${y - 7}">${escapeHtml(tileMark(tile))}</text>
          <text class="territory-event-mark" x="${x}" y="${y + 20}">${escapeHtml(event?.icon || "")}</text>
          <title>${escapeHtml(Territory.tileSummary(state, tile.id)?.terrainName || "")} / ${escapeHtml(owner?.name || "中立")} / ${escapeHtml(event?.name || "")} / HYPE ${hypeLabel}</title>
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
        <span class="territory-rank-copy"><strong>${escapeHtml(player.name)}</strong><span>${player.territoryCount}領地 / ${player.wins}勝 / HYPE ${player.averageHype}</span></span>
        <span class="territory-rank-score"><strong>${player.score}</strong><span>POINT</span></span>
      </button>
    `).join("");
  }

  function renderMonster(member) {
    const node = global.TeamBingoMonsterSystem?.NODES?.[member.nodeId];
    const equipment = global.TeamBingoTerritoryEquipment;
    const name = node?.name || member.name || member.nodeId;
    const equipped = equipment?.loadoutItems?.(member.equipment) || [];
    return `
      <button type="button" class="territory-monster" data-territory-monster="${escapeHtml(member.nodeId)}" aria-label="${escapeHtml(name)}の詳細を表示">
        <span class="territory-monster-art">${spriteMarkup(member.nodeId)}</span>
        <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
        <span class="territory-monster-equipment">${equipped.length ? equipped.map((item) => (
          `<i style="--item-color:${equipment.RARITY_BY_ID[item.rarity].color}" title="${escapeHtml(item.name)}">${escapeHtml(equipment.SLOT_BY_ID[item.slot].mark)}</i>`
        )).join("") : "NO GEAR"}</span>
        <span class="territory-monster-detail-label">DETAIL</span>
      </button>
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
    const party = owner ? tile.garrison : null;
    const event = tile.event;
    const hype = Number.isFinite(Number(party?.hype)) ? Number(party.hype) : Territory.DEFAULT_HYPE;
    detail.innerHTML = `
      <div class="territory-tile-heading">
        <span>${tile.kind === "base" ? "本拠地" : (tile.kind === "throne" ? "中央玉座" : (tile.kind === "outpost" ? "重要拠点" : "領地"))}</span>
        <strong>${escapeHtml(tile.terrainName)}</strong>
      </div>
      <div class="territory-owner" style="--owner-color:${owner?.color || "#657083"}">${escapeHtml(owner?.name || "中立領地")}</div>
      ${event ? `
        <section class="territory-event-card">
          <div class="territory-event-title"><span>${escapeHtml(event.icon)}</span><strong>${escapeHtml(event.name)}</strong></div>
          <p class="territory-event-benefit">＋ ${escapeHtml(event.benefit)}</p>
          <p class="territory-event-drawback">－ ${escapeHtml(event.drawback)}</p>
        </section>
      ` : ""}
      ${party?.lineup?.length ? `
        <section class="territory-squad">
          <div class="territory-squad-head"><span>TERRITORY PARTY</span><span>戦力 ${Math.round(party.lineup.reduce((sum, member) => sum + (Number(member.power) || 0), 0))}</span></div>
          <div class="territory-squad-lineup">${party.lineup.map(renderMonster).join("")}</div>
          <div class="territory-hype-row">
            <span>HYPE</span>
            <div class="territory-hype-track"><i style="width:${Math.max(0, Math.min(100, hype))}%"></i></div>
            <strong>${Math.round(hype)}</strong>
          </div>
        </section>
      ` : `<div class="territory-empty">${owner ? "PT編成待ち" : "中立領地のためPTなし"}</div>`}
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
      ? `SEASON ${formatDate(season.startsAt)} - ${formatDate(season.endsAt)}`
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
    showMonsterDetail = typeof options.showMonsterDetail === "function" ? options.showMonsterDetail : showMonsterDetail;
    openMonsterPage = typeof options.openMonsterPage === "function" ? options.openMonsterPage : openMonsterPage;
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
    map3D?.setActive(true);
    global.requestAnimationFrame(() => map3D?.resize());
    window.clearInterval(countdownTimer);
    countdownTimer = window.setInterval(updateCountdown, 1000);
  }

  function close() {
    if (!root) return;
    root.hidden = true;
    document.body.classList.remove("territory-mode-open");
    map3D?.setActive(false);
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
