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
        <div class="tower-header-actions"><button type="button" class="tower-simple-button" data-tower-refresh>SYNC</button><button type="button" class="tower-simple-button" data-tower-close>CLOSE</button></div>
      </header>
      <nav class="tower-player-tabs" data-tower-tabs></nav>
      <main class="tower-battlefield">
        <section class="tower-enemy-zone" data-tower-enemy></section>
        <div class="tower-center-readout"><div class="tower-next-tick" data-tower-timer>--:--</div><div class="tower-next-label">NEXT AUTO TURN</div><div class="tower-event-flash" data-tower-event></div></div>
        <section class="tower-party" data-tower-party></section>
      </main>
      <footer class="tower-footer"><div class="tower-log" data-tower-log></div><div class="tower-standings" data-tower-standings></div></footer>
    </div>`;
    document.body.appendChild(root);
    root.querySelector("[data-tower-close]")?.addEventListener("click", close);
    root.querySelector("[data-tower-refresh]")?.addEventListener("click", () => repository?.settleTower?.(true));
    root.querySelector("[data-tower-tabs]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-player-id]");
      if (!button) return;
      selectedPlayerId = button.dataset.playerId;
      render();
    });
    return root;
  }

  function spriteStyle(nodeId, flip = false) {
    const sprite = Monsters()?.NODES?.[nodeId]?.sprite || Monsters()?.NODES?.egg?.sprite || {};
    return [
      `background-image:url('${String(sprite.sheet || "").replace(/'/g, "%27")}')`,
      `background-size:${sprite.size || "contain"}`,
      `background-position:${sprite.position || "center"}`,
      `transform:${flip ? "scaleX(-1)" : "none"}`
    ].join(";");
  }

  function tabsHtml() {
    return Tower().PLAYERS.map((player) => {
      const current = state?.players?.[player.id] || {};
      return `<button type="button" class="tower-player-tab${player.id === selectedPlayerId ? " is-active" : ""}" style="--tower-player-color:${player.color}" data-player-id="${player.id}">${escapeHtml(player.name)} ${Number(current.floor) || 1}F</button>`;
    }).join("");
  }

  function enemyHtml(player) {
    const enemy = Tower().enemyFor(player.floor, player.phase);
    const art = enemy.boss
      ? `<img class="tower-enemy-art" src="${enemy.sprite}" alt="${escapeHtml(enemy.name)}">`
      : `<div class="tower-enemy-art is-regular" style="${spriteStyle(enemy.nodeId, true)}"></div>`;
    return `${art}<div class="tower-enemy-label"><div class="tower-enemy-name">${escapeHtml(enemy.name)}</div><div class="tower-enemy-meta">${enemy.boss ? "FLOOR BOSS" : `TOWER GUARD / PHASE ${player.phase}`} · POWER ${enemy.power.toLocaleString()}</div></div>`;
  }

  function memberHtml(member, player, index) {
    const ratio = Math.max(0, Math.min(100, Math.round((Number(member.hp) || 0) / Math.max(1, Number(member.maxHp) || 1) * 100)));
    const masteryLevel = Monsters()?.masteryLevel?.(member.masteryXp)?.level || 1;
    return `<article class="tower-party-member${member.hp <= 0 ? " is-ko" : ""}" style="--tower-player-color:${player.color};animation-delay:${index * 90}ms">
      <div class="tower-mini-monster" style="${spriteStyle(member.nodeId, false)}"></div>
      <div class="tower-member-info"><div class="tower-member-name">${escapeHtml(member.name)}</div><div class="tower-member-meta">絆 Lv.${masteryLevel} · POWER ${(Number(member.power) || 0).toLocaleString()}</div><div class="tower-hp"><i style="--tower-hp:${ratio}%"></i></div></div>
    </article>`;
  }

  function logHtml() {
    const entries = Object.values(state?.log || {}).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)).slice(0, 6);
    return entries.length ? entries.map((entry) => `<div class="tower-log-line"><strong>${escapeHtml(state?.players?.[entry.playerId]?.name || "TOWER")}</strong><span>${escapeHtml(entry.message)}</span></div>`).join("") : `<div class="tower-log-line"><strong>TOWER</strong><span>六人の自動遠征隊が出撃しました。</span></div>`;
  }

  function standingsHtml() {
    return Tower().standings(state).map((entry, index) => `<div class="tower-rank" style="--tower-player-color:${entry.color}"><b>${index + 1}. ${escapeHtml(entry.name)}</b><span>${entry.bestFloor}F / ${entry.status === "resting" ? "REST" : entry.status === "complete" ? "CLEAR" : `PHASE ${entry.phase}`}</span></div>`).join("");
  }

  function animateTurn() {
    if (!root || !root.classList.contains("is-open")) return;
    const party = [...root.querySelectorAll(".tower-party-member")];
    party.forEach((element, index) => setTimeout(() => {
      element.classList.remove("is-attacking");
      void element.offsetWidth;
      element.classList.add("is-attacking");
    }, index * 100));
    const enemy = root.querySelector("[data-tower-enemy]");
    if (enemy) {
      enemy.classList.remove("is-hit", "is-attacking");
      void enemy.offsetWidth;
      enemy.classList.add("is-hit");
      setTimeout(() => { enemy.classList.remove("is-hit"); enemy.classList.add("is-attacking"); }, 760);
    }
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
    root.querySelector("[data-tower-standings]").innerHTML = standingsHtml();
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
    selectedPlayerId = options.playerId || selectedPlayerId;
    const source = options.state || repository?.getTowerState?.() || Tower()?.createInitialState(repository?.getGlobalStats?.()?.playerStats, Date.now());
    applySnapshot(source);
    ensureRoot().classList.add("is-open");
    document.body.classList.add("monster-tower-open");
    clearInterval(timer);
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
