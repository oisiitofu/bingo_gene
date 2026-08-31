(function bootstrapMonsterTowerMode(global) {
  "use strict";

  const Tower = () => global.TeamBingoMonsterTowerSystem;
  const Monsters = () => global.TeamBingoMonsterSystem;
  let root = null;
  let state = null;
  let repository = null;
  let selectedPlayerId = "tofu";
  let timer = 0;
  let lastRevision = -1;
  let closeHandler = null;
  let showMonsterDetail = null;
  let animationTimers = [];

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  }

  function ensureRoot() {
    if (root) return root;
    root = document.createElement("section");
    root.className = "monster-tower-overlay";
    root.id = "monsterTowerOverlay";
    root.innerHTML = `<div class="tower-shell">
      <header class="tower-header">
        <h2 class="tower-title">MONSTER TOWER<small>AUTO CLIMBING CHRONICLE</small></h2>
        <div class="tower-progress"><div class="tower-floor" data-tower-floor>1F</div><div class="tower-phase" data-tower-phase>PHASE 1 / 10</div></div>
        <div class="tower-header-actions"><button type="button" class="tower-simple-button" data-tower-history>HISTORY</button><button type="button" class="tower-simple-button" data-tower-refresh>SYNC</button><button type="button" class="tower-simple-button" data-tower-close>CLOSE</button></div>
      </header>
      <nav class="tower-player-tabs" data-tower-tabs></nav>
      <main class="tower-battlefield">
        <section class="tower-enemy-zone" data-tower-enemy></section>
        <div class="tower-center-readout"><div class="tower-next-tick" data-tower-timer>--:--</div><div class="tower-next-label">NEXT AUTO TURN</div><div class="tower-event-flash" data-tower-event></div></div>
        <section class="tower-party" data-tower-party></section>
      </main>
      <section class="tower-history-panel" data-tower-history-panel hidden>
        <div class="tower-history-card"><header><div><small>BATTLE ARCHIVE</small><h3>塔攻略履歴</h3></div><button type="button" class="tower-simple-button" data-tower-history-close>CLOSE</button></header><div class="tower-history-list" data-tower-log></div></div>
      </section>
    </div>`;
    document.body.appendChild(root);
    root.querySelector("[data-tower-close]")?.addEventListener("click", close);
    root.querySelector("[data-tower-refresh]")?.addEventListener("click", () => repository?.settleTower?.(true));
    root.querySelector("[data-tower-history]")?.addEventListener("click", () => {
      const panel = root.querySelector("[data-tower-history-panel]");
      if (panel) panel.hidden = false;
    });
    root.querySelector("[data-tower-history-close]")?.addEventListener("click", () => {
      const panel = root.querySelector("[data-tower-history-panel]");
      if (panel) panel.hidden = true;
    });
    root.querySelector("[data-tower-history-panel]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) event.currentTarget.hidden = true;
    });
    root.querySelector("[data-tower-tabs]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-player-id]");
      if (!button) return;
      selectedPlayerId = button.dataset.playerId;
      render();
    });
    root.querySelector("[data-tower-party]")?.addEventListener("click", (event) => {
      const fighter = event.target.closest("[data-tower-monster]");
      if (!fighter || !showMonsterDetail) return;
      const player = state?.players?.[selectedPlayerId];
      const member = player?.party?.[Number(fighter.dataset.towerIndex)];
      const playerDefinition = Tower()?.PLAYER_BY_ID?.[selectedPlayerId] || Tower()?.PLAYERS?.find((item) => item.id === selectedPlayerId);
      if (!member) return;
      showMonsterDetail(member.nodeId, `${playerDefinition?.name || player?.name || "TOWER"} / TOWER PT`, playerDefinition?.color || "#f0cc5c", {
        masteryXp: member.masteryXp,
        equipment: member.equipment
      });
      const detailOverlay = document.getElementById("monsterZoomOverlay");
      if (detailOverlay?.classList.contains("show")) {
        const observer = new MutationObserver(() => {
          if (detailOverlay.classList.contains("show")) return;
          observer.disconnect();
          root.classList.add("is-open");
          document.body.classList.add("monster-tower-open");
          render();
        });
        observer.observe(detailOverlay, { attributes: true, attributeFilter: ["class", "aria-hidden"] });
      }
    });
    return root;
  }

  function spriteStyle(nodeId, desiredFacing = "left") {
    const sprite = Monsters()?.NODES?.[nodeId]?.sprite || Monsters()?.NODES?.egg?.sprite || {};
    const flip = String(sprite.facing || "left") !== desiredFacing;
    return [
      `background-image:url('${String(sprite.sheet || "").replace(/'/g, "%27")}')`,
      `background-size:${sprite.size || "contain"}`,
      `background-position:${sprite.position || "center"}`,
      `--tower-facing:${flip ? -1 : 1}`
    ].join(";");
  }

  function tabsHtml() {
    return Tower().PLAYERS.map((player) => {
      const current = state?.players?.[player.id] || {};
      const status = current.status === "resting" ? "REST" : current.status === "complete" ? "CLEAR" : `PHASE ${Number(current.phase) || 1}`;
      return `<button type="button" class="tower-player-tab${player.id === selectedPlayerId ? " is-active" : ""}" style="--tower-player-color:${player.color}" data-player-id="${player.id}"><b>${escapeHtml(player.name)}</b><span>${Number(current.floor) || 1}F · ${status}</span></button>`;
    }).join("");
  }

  function enemyHtml(player) {
    const enemy = Tower().enemyFor(player.floor, player.phase);
    const art = enemy.boss
      ? `<img class="tower-enemy-art" src="${enemy.sprite}" alt="${escapeHtml(enemy.name)}">`
      : `<div class="tower-enemy-art is-regular" style="${spriteStyle(enemy.nodeId, "right")}"></div>`;
    return `${art}<div class="tower-enemy-label"><div class="tower-enemy-name">${escapeHtml(enemy.name)}</div><div class="tower-enemy-meta">${enemy.boss ? "FLOOR BOSS" : `TOWER GUARD / PHASE ${player.phase}`} · POWER ${enemy.power.toLocaleString()}</div></div>`;
  }

  function memberHtml(member, player, index) {
    const ratio = Math.max(0, Math.min(100, Math.round((Number(member.hp) || 0) / Math.max(1, Number(member.maxHp) || 1) * 100)));
    const masteryLevel = Monsters()?.masteryLevel?.(member.masteryXp)?.level || 1;
    return `<button type="button" class="tower-party-member${member.hp <= 0 ? " is-ko" : ""}" style="--tower-player-color:${player.color};--tower-slot:${index}" data-tower-monster="${escapeHtml(member.nodeId)}" data-tower-index="${index}" aria-label="${escapeHtml(member.name)}の詳細">
      <span class="tower-mini-monster" style="${spriteStyle(member.nodeId, "left")}"></span>
      <span class="tower-member-info"><b class="tower-member-name">${escapeHtml(member.name)}</b><span class="tower-member-meta">絆 Lv.${masteryLevel} · POWER ${(Number(member.power) || 0).toLocaleString()}</span><span class="tower-hp"><i style="--tower-hp:${ratio}%"></i></span></span>
    </button>`;
  }

  function logHtml() {
    const entries = Object.values(state?.log || {}).sort((a, b) => Number(b.createdAt || b.at) - Number(a.createdAt || a.at)).slice(0, 80);
    return entries.length ? entries.map((entry) => {
      const owner = Tower()?.PLAYER_BY_ID?.[entry.playerId] || Tower()?.PLAYERS?.find((item) => item.id === entry.playerId);
      const time = Number(entry.createdAt || entry.at);
      return `<div class="tower-log-line"><time>${Number.isFinite(time) ? new Date(time).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "--"}</time><strong>${escapeHtml(owner?.name || "TOWER")}</strong><span>${escapeHtml(entry.message || entry.text || "攻略状況を更新")}</span></div>`;
    }).join("") : `<div class="tower-log-line"><strong>TOWER</strong><span>六人の自動遠征隊が出撃しました。</span></div>`;
  }

  function animateTurn() {
    if (!root || !root.classList.contains("is-open")) return;
    animationTimers.forEach(clearTimeout);
    animationTimers = [];
    const party = [...root.querySelectorAll(".tower-party-member:not(.is-ko)")];
    const attacker = party.length ? party[Math.abs(Number(state?.revision) || 0) % party.length] : null;
    const enemy = root.querySelector("[data-tower-enemy]");
    root.querySelectorAll(".is-attacking,.is-hit").forEach((element) => element.classList.remove("is-attacking", "is-hit"));
    if (attacker) attacker.classList.add("is-attacking");
    animationTimers.push(setTimeout(() => {
      if (!enemy) return;
      enemy.classList.add("is-hit");
      const impact = document.createElement("i");
      impact.className = "tower-battle-impact is-party-hit";
      root.querySelector(".tower-battlefield")?.appendChild(impact);
      setTimeout(() => impact.remove(), 700);
    }, 330));
    animationTimers.push(setTimeout(() => {
      attacker?.classList.remove("is-attacking");
      enemy?.classList.remove("is-hit");
      enemy?.classList.add("is-attacking");
    }, 980));
    animationTimers.push(setTimeout(() => {
      enemy?.classList.remove("is-attacking");
      const target = party.length ? party[(Math.abs(Number(state?.revision) || 0) + 2) % party.length] : null;
      target?.classList.add("is-hit");
      const impact = document.createElement("i");
      impact.className = "tower-battle-impact is-enemy-hit";
      root.querySelector(".tower-battlefield")?.appendChild(impact);
      setTimeout(() => impact.remove(), 700);
      setTimeout(() => target?.classList.remove("is-hit"), 600);
    }, 1320));
  }

  function render() {
    if (!state || !Tower()) return;
    ensureRoot();
    const player = state.players?.[selectedPlayerId] || state.players?.[Tower().PLAYERS[0].id];
    if (!player) return;
    root.querySelector("[data-tower-tabs]").innerHTML = tabsHtml();
    root.querySelector("[data-tower-floor]").textContent = `${player.floor}F`;
    root.querySelector("[data-tower-phase]").textContent = `PHASE ${player.phase} / 10 · SAVE ${player.checkpointFloor}F${player.status === "resting" ? " · RESTING" : ""}`;
    root.querySelector("[data-tower-enemy]").innerHTML = enemyHtml(player);
    root.querySelector("[data-tower-party]").innerHTML = (player.party || []).map((member, index) => memberHtml(member, player, index)).join("");
    root.querySelector("[data-tower-event]").textContent = player.lastEvent?.message || "AUTO BATTLE RUNNING";
    root.querySelector("[data-tower-log]").innerHTML = logHtml();
    if (lastRevision >= 0 && Number(state.revision) !== lastRevision) animateTurn();
    lastRevision = Number(state.revision) || 0;
    updateCountdown();
  }

  function updateCountdown() {
    if (!root || !state) return;
    const remaining = Math.max(0, Number(state.nextTickAt) - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    const text = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    const target = root.querySelector("[data-tower-timer]");
    if (target) target.textContent = text;
    if (remaining <= 0) repository?.settleTower?.();
  }

  function applySnapshot(snapshot) {
    if (!snapshot || !Tower()) return;
    state = Tower().normalizeState(snapshot, repository?.getGlobalStats?.()?.playerStats, Date.now());
    render();
  }

  function open(options = {}) {
    repository = options.repository || repository;
    closeHandler = typeof options.onClose === "function" ? options.onClose : null;
    showMonsterDetail = typeof options.showMonsterDetail === "function" ? options.showMonsterDetail : showMonsterDetail;
    selectedPlayerId = options.playerId || selectedPlayerId;
    const source = options.state || repository?.getTowerState?.() || Tower()?.createInitialState(repository?.getGlobalStats?.()?.playerStats, Date.now());
    applySnapshot(source);
    ensureRoot().classList.add("is-open");
    document.body.classList.add("monster-tower-open");
    clearInterval(timer);
    animationTimers.forEach(clearTimeout);
    animationTimers = [];
    timer = setInterval(updateCountdown, 1000);
    repository?.settleTower?.();
  }

  function close() {
    root?.classList.remove("is-open");
    document.body.classList.remove("monster-tower-open");
    clearInterval(timer);
    timer = 0;
    const callback = closeHandler;
    closeHandler = null;
    callback?.();
  }

  global.TeamBingoTowerMode = Object.freeze({ open, close, applySnapshot });
})(typeof window !== "undefined" ? window : globalThis);
