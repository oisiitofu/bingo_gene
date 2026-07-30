(function bootstrapTerritoryMode(global) {
  "use strict";

  const Territory = global.TeamBingoTerritorySystem;
  if (!Territory) return;

  let root = null;
  let state = null;
  let previousState = null;
  let archiveStates = [];
  let selectedArchiveId = "";
  let playerStats = {};
  let selectedTileId = "0,0";
  let selectedPlayerId = "";
  let preview = true;
  let spriteMarkup = () => "";
  let replayBattle = () => {};
  let showMonsterDetail = () => {};
  let openMonsterPage = () => {};
  let onOpen = () => {};
  let onClose = () => {};
  let map3D = null;
  let historyMap3D = null;
  let historySelectedTileId = "0,0";
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
          <button type="button" class="territory-mode-close territory-history-button" data-territory-history-open>SEASON HISTORY</button>
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
      <section class="territory-history" data-territory-history hidden>
        <div class="territory-history-panel">
          <header class="territory-history-head">
            <div>
              <span>ARCHIVED RESULT</span>
              <h2>シーズン結果</h2>
            </div>
            <div class="territory-history-head-actions">
              <select data-territory-history-season aria-label="保存シーズン"></select>
              <button type="button" class="territory-mode-close" data-territory-history-close>CLOSE</button>
            </div>
          </header>
          <div class="territory-history-body">
            <section class="territory-history-final-map" data-territory-history-final-map hidden>
              <div class="territory-history-map" data-territory-history-map></div>
              <aside class="territory-history-map-detail" data-territory-history-map-detail></aside>
            </section>
            <div data-territory-history-body></div>
          </div>
        </div>
      </section>
    `;
    document.body.append(root);
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
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

  function ensureHistoryMap() {
    if (historyMap3D) return historyMap3D;
    const historyMapHost = root?.querySelector("[data-territory-history-map]");
    if (historyMapHost && global.TeamBingoTerritoryMap3D) {
      try {
        historyMap3D = global.TeamBingoTerritoryMap3D.create(historyMapHost, {
          playerById: Territory.PLAYER_BY_ID,
          onSelect: selectHistoryTile,
          summarize: (currentState, tileId) => Territory.tileSummary(currentState, tileId)
        });
        historyMapHost.classList.add("ready");
      } catch (error) {
        console.warn("Archived 3D territory map unavailable.", error);
        historyMapHost.hidden = true;
      }
    }
    return historyMap3D;
  }

  function selectedArchiveState() {
    return archiveStates.find((snapshot) => snapshot?.season?.id === selectedArchiveId) || archiveStates[0] || null;
  }

  function selectHistoryTile(tileId) {
    const archived = selectedArchiveState();
    if (!archived?.tiles?.[tileId]) return;
    historySelectedTileId = tileId;
    historyMap3D?.update(archived, historySelectedTileId, "");
    renderHistoryMapDetail(archived);
  }

  function onChange(event) {
    if (!event.target.matches("[data-territory-history-season]")) return;
    selectedArchiveId = event.target.value;
    historySelectedTileId = "0,0";
    renderPreviousSeason();
  }

  function selectTile(tileId) {
    if (!state?.tiles?.[tileId]) return;
    selectedTileId = tileId;
    selectedPlayerId = "";
    renderRanking();
    renderMap();
    renderDetail();
  }

  function onClick(event) {
    if (event.target.closest("[data-territory-history-close]")) {
      closePreviousSeason();
      return;
    }
    if (event.target.closest("[data-territory-history-open]")) {
      openPreviousSeason();
      return;
    }
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
      const tile = state?.tiles?.[monster.dataset.territoryTileId || selectedTileId];
      const owner = Territory.PLAYER_BY_ID[tile?.ownerId];
      const member = tile?.garrison?.lineup?.find((entry) => entry?.nodeId === monster.dataset.territoryMonster);
      showMonsterDetail(
        monster.dataset.territoryMonster,
        `${owner?.name || "六王"} / TERRITORY PARTY`,
        owner?.color || "#f7c64a",
        {
          equipment: effectiveTerritoryLoadout(member, owner),
          masteryXp: Number(member?.masteryXp) || 0,
          territory: true
        }
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
      if (player) {
        selectedPlayerId = player.id;
        selectedTileId = Territory.tileId(player.home[0], player.home[1]);
      }
      render();
      return;
    }
    const replay = event.target.closest("[data-territory-replay]");
    if (replay) {
      const source = root.querySelector("[data-territory-history]")?.hidden ? state : selectedArchiveState();
      const battle = source?.battles?.find((item) => item.id === replay.dataset.territoryReplay);
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
      map3D.update(state, selectedTileId, selectedPlayerId);
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
        tile.id === selectedTileId ? "selected" : "",
        selectedPlayerId && tile.ownerId === selectedPlayerId ? "owner-focus" : ""
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
      <button type="button" class="territory-rank-row ${(selectedPlayerId || state.tiles?.[selectedTileId]?.ownerId) === player.id ? "active" : ""}" data-king-id="${player.id}" style="--king-color:${player.color}">
        <span class="territory-rank-position">${index + 1}</span>
        <span class="territory-rank-copy"><strong>${escapeHtml(player.name)}</strong><span>${player.territoryCount}領地 / ${player.wins}勝 / HYPE ${player.averageHype}</span></span>
        <span class="territory-rank-score"><strong>${player.score}</strong><span>POINT</span></span>
      </button>
    `).join("");
  }

  function resolveOwnerRecord(owner) {
    if (!owner) return null;
    const records = playerStats?.players || {};
    const key = Territory.playerKey(owner.name);
    return records[key] || Object.values(records).find((record) => Territory.playerKey(record?.name) === key) || null;
  }

  function effectiveTerritoryLoadout(member, owner) {
    const equipment = global.TeamBingoTerritoryEquipment;
    const record = resolveOwnerRecord(owner);
    const manual = record ? equipment?.manualLoadouts?.(record)?.[member?.nodeId] : null;
    return equipment?.normalizeLoadout?.({ ...(member?.equipment || {}), ...(manual || {}) }) || {};
  }

  function renderMonster(member, owner, tileId = selectedTileId) {
    const node = global.TeamBingoMonsterSystem?.NODES?.[member.nodeId];
    const equipment = global.TeamBingoTerritoryEquipment;
    const name = node?.name || member.name || member.nodeId;
    const loadout = effectiveTerritoryLoadout(member, owner);
    const equipped = equipment?.loadoutItems?.(loadout) || [];
    return `
      <button type="button" class="territory-monster" data-territory-monster="${escapeHtml(member.nodeId)}" data-territory-tile-id="${escapeHtml(tileId)}" aria-label="${escapeHtml(name)}の詳細を表示">
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
    if (selectedPlayerId && Territory.PLAYER_BY_ID[selectedPlayerId]) {
      renderPlayerParties(detail, Territory.PLAYER_BY_ID[selectedPlayerId]);
      return;
    }
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
          <div class="territory-squad-lineup">${party.lineup.map((member) => renderMonster(member, owner, tile.id)).join("")}</div>
          <div class="territory-hype-row">
            <span>HYPE</span>
            <div class="territory-hype-track"><i style="width:${Math.max(0, Math.min(100, hype))}%"></i></div>
            <strong>${Math.round(hype)}</strong>
          </div>
        </section>
      ` : `<div class="territory-empty">${owner ? "PT編成待ち" : "中立領地のためPTなし"}</div>`}
    `;
  }

  function renderPlayerParties(detail, owner) {
    const territories = Object.values(state.tiles || {})
      .filter((tile) => tile.ownerId === owner.id && tile.garrison?.ownerId === owner.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    detail.innerHTML = `
      <div class="territory-player-heading" style="--owner-color:${owner.color}">
        <span>ALL TERRITORY PARTIES</span>
        <strong>${escapeHtml(owner.name)}</strong>
        <em>${territories.length} PT</em>
      </div>
      <div class="territory-player-parties">
        ${territories.map((tile) => {
          const party = tile.garrison;
          const summary = Territory.tileSummary(state, tile.id);
          const hype = Number.isFinite(Number(party.hype)) ? Number(party.hype) : Territory.DEFAULT_HYPE;
          const power = party.lineup.reduce((sum, member) => sum + (Number(member.power) || 0), 0);
          return `
            <section class="territory-squad territory-player-party">
              <button type="button" class="territory-player-party-head" data-tile-id="${escapeHtml(tile.id)}">
                <span>${escapeHtml(summary?.terrainName || tile.id)}</span>
                <strong>戦力 ${Math.round(power)} / HYPE ${Math.round(hype)}</strong>
              </button>
              <div class="territory-squad-lineup">${party.lineup.map((member) => renderMonster(member, owner, tile.id)).join("")}</div>
            </section>
          `;
        }).join("") || `<div class="territory-empty">配置中のPTはありません</div>`}
      </div>
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

  function archiveTimestamp(snapshot) {
    return Number(snapshot?.archivedAt) || Number(snapshot?.season?.completedAt) || Number(snapshot?.season?.endsAt) || 0;
  }

  function setArchive(value) {
    const snapshots = Array.isArray(value) ? value : Object.values(value || {});
    archiveStates = snapshots
      .filter((snapshot) => snapshot?.season?.id)
      .map((snapshot) => structuredClone(snapshot))
      .sort((a, b) => archiveTimestamp(b) - archiveTimestamp(a));
    if (previousState?.season?.id && !archiveStates.some((snapshot) => snapshot.season.id === previousState.season.id)) {
      archiveStates.push(structuredClone(previousState));
      archiveStates.sort((a, b) => archiveTimestamp(b) - archiveTimestamp(a));
    }
    previousState = archiveStates[0] || previousState || null;
    if (!archiveStates.some((snapshot) => snapshot.season.id === selectedArchiveId)) {
      selectedArchiveId = archiveStates[0]?.season?.id || "";
    }
  }

  function previousSeasonPlayerTerrains(playerId, archived = selectedArchiveState()) {
    const counts = {};
    Object.values(archived?.tiles || {}).forEach((tile) => {
      if (tile.ownerId !== playerId) return;
      const name = Territory.TERRAIN_BY_ID[tile.terrain]?.name || tile.terrain || "不明";
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja-JP"))
      .map(([name, count]) => `${name} ${count}`)
      .join(" / ");
  }

  function archivedMonsterMarkup(member) {
    const monsterSystem = global.TeamBingoMonsterSystem;
    const equipment = global.TeamBingoTerritoryEquipment;
    const node = monsterSystem?.NODES?.[member?.nodeId];
    const loadout = equipment?.normalizeLoadout?.(member?.equipment || {}) || {};
    const items = equipment?.loadoutItems?.(loadout) || [];
    return `
      <article class="territory-history-monster">
        <span>${spriteMarkup(member?.nodeId || "egg")}</span>
        <div>
          <strong>${escapeHtml(node?.name || member?.name || member?.nodeId || "たまご")}</strong>
          <small>戦力 ${Math.round(Number(member?.power) || 0)} / 絆 Lv.${Math.max(1, Math.floor((Number(member?.masteryXp) || 0) / 100) + 1)}</small>
          <em>${items.length ? items.map((item) => `${equipment.SLOT_BY_ID[item.slot]?.mark || ""} ${item.name}`).map(escapeHtml).join(" / ") : "装備なし"}</em>
        </div>
      </article>
    `;
  }

  function renderHistoryMapDetail(archived) {
    const detail = root?.querySelector("[data-territory-history-map-detail]");
    if (!detail || !archived) return;
    const tile = archived.tiles?.[historySelectedTileId] || archived.tiles?.["0,0"] || Object.values(archived.tiles || {})[0];
    if (!tile) {
      detail.innerHTML = `<div class="territory-history-empty">保存盤面がありません</div>`;
      return;
    }
    historySelectedTileId = tile.id;
    const owner = Territory.PLAYER_BY_ID[tile.ownerId];
    const terrain = Territory.TERRAIN_BY_ID[tile.terrain];
    const event = Territory.TILE_EVENT_BY_ID[tile.eventId];
    const lineup = tile.garrison?.lineup || [];
    const hype = Number.isFinite(Number(tile.garrison?.hype)) ? Number(tile.garrison.hype) : Territory.DEFAULT_HYPE;
    detail.innerHTML = `
      <span class="territory-history-map-kicker">FINAL GARRISON</span>
      <h3>${escapeHtml(terrain?.name || tile.terrain || "領地")}</h3>
      <div class="territory-history-map-owner" style="--history-owner:${owner?.color || "#657083"}">${escapeHtml(owner?.name || "中立領地")}</div>
      ${event ? `<p class="territory-history-map-event">${escapeHtml(event.icon)} ${escapeHtml(event.name)}</p>` : ""}
      ${lineup.length ? `
        <div class="territory-history-monsters">${lineup.map(archivedMonsterMarkup).join("")}</div>
        <div class="territory-history-map-hype"><span>HYPE</span><i><b style="width:${Math.max(0, Math.min(100, hype))}%"></b></i><strong>${Math.round(hype)}</strong></div>
      ` : `<div class="territory-empty">この領地にPT配置はありません</div>`}
    `;
  }

  function renderPreviousSeason() {
    const body = root?.querySelector("[data-territory-history-body]");
    const selector = root?.querySelector("[data-territory-history-season]");
    const mapSection = root?.querySelector("[data-territory-history-final-map]");
    if (!body) return;
    if (!archiveStates.length && previousState?.season?.id) setArchive([previousState]);
    if (!archiveStates.length) {
      if (selector) selector.innerHTML = "";
      if (mapSection) mapSection.hidden = true;
      historyMap3D?.setActive(false);
      body.innerHTML = `<div class="territory-history-empty"><strong>前回シーズンの保存データはありません</strong><span>現在のシーズン終了後、結果がここに自動保存されます。</span></div>`;
      return;
    }
    const archived = selectedArchiveState();
    const latest = archived === archiveStates[0];
    if (selector) {
      selector.innerHTML = archiveStates.map((snapshot, index) => `
        <option value="${escapeHtml(snapshot.season.id)}" ${snapshot.season.id === archived.season.id ? "selected" : ""}>
          ${index === 0 ? "前回" : `過去 ${index + 1}`} / ${escapeHtml(snapshot.season.id)}
        </option>
      `).join("");
    }
    if (mapSection) mapSection.hidden = !latest;
    if (latest) {
      ensureHistoryMap();
      historySelectedTileId = archived.tiles?.[historySelectedTileId] ? historySelectedTileId : (archived.tiles?.["0,0"] ? "0,0" : Object.keys(archived.tiles || {})[0]);
      historyMap3D?.update(archived, historySelectedTileId, "");
      historyMap3D?.setActive(true);
      renderHistoryMapDetail(archived);
      global.requestAnimationFrame(() => historyMap3D?.resize());
    } else {
      historyMap3D?.setActive(false);
    }
    const ranking = Territory.standings(archived);
    const champion = ranking[0] || Territory.PLAYER_BY_ID[archived.season.championId] || null;
    const battles = [...(archived.battles || [])].reverse();
    const totalCaptures = ranking.reduce((sum, player) => sum + (Number(player.captures) || 0), 0);
    const totalDefenseWins = ranking.reduce((sum, player) => sum + (Number(player.defenseWins) || 0), 0);
    body.innerHTML = `
      <section class="territory-history-hero" style="--champion-color:${champion?.color || "#f7c64a"}">
        <div class="territory-history-season">
          <span>${latest ? "PREVIOUS SEASON" : "PAST SEASON"} / ${escapeHtml(archived.season.id)}</span>
          <small>${formatDate(archived.season.startsAt)} - ${formatDate(archived.season.endsAt)}</small>
        </div>
        <div class="territory-history-champion">
          <span>CHAMPION</span>
          <strong>${escapeHtml(champion?.name || "NO RESULT")}</strong>
        </div>
        <div class="territory-history-totals">
          <span><strong>${battles.length}</strong>RECORD</span>
          <span><strong>${totalCaptures}</strong>CAPTURE</span>
          <span><strong>${totalDefenseWins}</strong>DEFENSE</span>
        </div>
      </section>
      <section class="territory-history-section">
        <h3>FINAL STANDINGS</h3>
        <div class="territory-history-ranking">
          ${ranking.map((player, index) => `
            <article class="territory-history-rank" style="--history-player-color:${player.color}">
              <span class="territory-history-position">${index + 1}</span>
              <div class="territory-history-player">
                <strong>${escapeHtml(player.name)}</strong>
                <small>${escapeHtml(previousSeasonPlayerTerrains(player.id, archived) || "領地なし")}</small>
              </div>
              <div class="territory-history-stat"><strong>${player.score}</strong><span>POINT</span></div>
              <div class="territory-history-stat"><strong>${player.territoryCount}</strong><span>領地</span></div>
              <div class="territory-history-stat"><strong>${Number(player.wins) || 0}-${Number(player.losses) || 0}</strong><span>勝敗</span></div>
              <div class="territory-history-stat"><strong>${Number(player.captures) || 0}</strong><span>占領</span></div>
              <div class="territory-history-stat"><strong>${Number(player.defenseWins) || 0}</strong><span>防衛</span></div>
              <div class="territory-history-stat"><strong>${Number(player.averageHype) || 0}</strong><span>HYPE</span></div>
            </article>
          `).join("")}
        </div>
      </section>
      ${latest ? `<section class="territory-history-section">
        <div class="territory-history-section-head">
          <h3>BATTLE ARCHIVE</h3>
          <span>${battles.length} RECORDS</span>
        </div>
        <div class="territory-history-battles">
          ${battles.length ? battles.map((battle) => {
            const winner = Territory.PLAYER_BY_ID[battle.winnerId];
            const opponents = (battle.sides || [])
              .filter((side) => side.playerId !== battle.winnerId)
              .map((side) => side.playerName)
              .join(" / ");
            return `
              <article class="territory-history-battle">
                <time>${formatDate(battle.at)}</time>
                <div>
                  <strong>${escapeHtml(winner?.name || battle.sides?.[0]?.playerName || "BATTLE")}</strong>
                  <span>vs ${escapeHtml(opponents || "DEFENDER")} / ${escapeHtml(Territory.TERRAIN_BY_ID[battle.terrain]?.name || battle.terrain || "")}</span>
                </div>
                <span class="territory-history-result">${battle.captured ? "CAPTURE" : "DEFENSE"}</span>
                <button type="button" class="territory-replay-button" data-territory-replay="${escapeHtml(battle.id)}">REPLAY</button>
              </article>
            `;
          }).join("") : `<div class="territory-empty">戦闘記録はありません</div>`}
        </div>
      </section>` : ""}
    `;
  }

  function openPreviousSeason() {
    const history = root?.querySelector("[data-territory-history]");
    if (!history) return;
    history.hidden = false;
    map3D?.setActive(false);
    renderPreviousSeason();
    global.requestAnimationFrame(() => historyMap3D?.resize());
  }

  function closePreviousSeason() {
    const history = root?.querySelector("[data-territory-history]");
    if (history) history.hidden = true;
    historyMap3D?.setActive(false);
    if (root && !root.hidden) map3D?.setActive(true);
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
    onOpen = typeof options.onOpen === "function" ? options.onOpen : onOpen;
    onClose = typeof options.onClose === "function" ? options.onClose : onClose;
    if (Object.hasOwn(options, "previousState")) previousState = options.previousState ? structuredClone(options.previousState) : null;
    if (Object.hasOwn(options, "archive")) setArchive(options.archive);
    else if (previousState?.season?.id) setArchive([previousState]);
    if (options.state) {
      state = Territory.normalizeState(options.state, playerStats, Date.now());
      preview = options.preview === true;
    } else if (!state || preview) {
      state = createPreview();
      preview = true;
    }
    selectedTileId = state.tiles?.[selectedTileId] ? selectedTileId : "0,0";
    selectedPlayerId = Territory.PLAYER_BY_ID[selectedPlayerId] ? selectedPlayerId : "";
    root.hidden = false;
    document.body.classList.add("territory-mode-open");
    render();
    map3D?.setActive(true);
    global.requestAnimationFrame(() => map3D?.resize());
    window.clearInterval(countdownTimer);
    countdownTimer = window.setInterval(updateCountdown, 1000);
    onOpen();
  }

  function close() {
    if (!root || root.hidden) return;
    closePreviousSeason();
    root.hidden = true;
    document.body.classList.remove("territory-mode-open");
    map3D?.setActive(false);
    historyMap3D?.setActive(false);
    window.clearInterval(countdownTimer);
    countdownTimer = 0;
    onClose();
  }

  function applySnapshot(snapshot, stats = null) {
    if (stats) playerStats = stats;
    if (!snapshot) return;
    state = Territory.normalizeState(snapshot, playerStats, Date.now());
    preview = false;
    if (root && !root.hidden) render();
  }

  function applyPreviousSnapshot(snapshot) {
    previousState = snapshot ? structuredClone(snapshot) : null;
    if (previousState?.season?.id) {
      const merged = Object.fromEntries(archiveStates.map((entry) => [entry.season.id, entry]));
      merged[previousState.season.id] = previousState;
      setArchive(merged);
    }
    if (root && !root.hidden && !root.querySelector("[data-territory-history]")?.hidden) renderPreviousSeason();
  }

  function applyArchive(archive) {
    setArchive(archive);
    if (root && !root.hidden && !root.querySelector("[data-territory-history]")?.hidden) renderPreviousSeason();
  }

  function setPlayerStats(stats) {
    playerStats = stats || {};
    if (root && !root.hidden) renderDetail();
  }

  global.TeamBingoTerritoryMode = Object.freeze({
    open,
    close,
    applySnapshot,
    applyPreviousSnapshot,
    applyArchive,
    setPlayerStats,
    isOpen: () => Boolean(root && !root.hidden),
    getState: () => state
  });
})(typeof window !== "undefined" ? window : globalThis);
