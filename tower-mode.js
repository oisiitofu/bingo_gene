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
        <div class="tower-center-readout"><div class="tower-next-tick" data-tower-timer>TURN 0</div><div class="tower-next-label">HP BATTLE IN PROGRESS</div><div class="tower-event-flash" data-tower-event></div></div>
        <section class="tower-party" data-tower-party></section>
      </main>
      <section class="tower-history-panel" data-tower-history-panel hidden>
        <div class="tower-history-card"><header><div><small>BATTLE ARCHIVE</small><h3>塔攻略履歴</h3></div><button type="button" class="tower-simple-button" data-tower-history-close>CLOSE</button></header><div class="tower-history-list" data-tower-log></div></div>
      </section>
      <section class="tower-detail-panel" data-tower-detail-panel hidden>
        <div class="tower-detail-card"><button type="button" class="tower-detail-close" data-tower-detail-close aria-label="詳細を閉じる">×</button><div data-tower-detail-content></div></div>
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
    root.querySelector("[data-tower-detail-close]")?.addEventListener("click", () => {
      const panel = root.querySelector("[data-tower-detail-panel]");
      if (panel) panel.hidden = true;
    });
    root.querySelector("[data-tower-detail-panel]")?.addEventListener("click", (event) => {
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
      if (!fighter) return;
      const player = state?.players?.[selectedPlayerId];
      const member = player?.party?.[Number(fighter.dataset.towerIndex)];
      const playerDefinition = Tower()?.PLAYER_BY_ID?.[selectedPlayerId] || Tower()?.PLAYERS?.find((item) => item.id === selectedPlayerId);
      if (!member) return;
      renderMemberDetail(member, playerDefinition || player);
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
      return `<button type="button" class="tower-player-tab${player.id === selectedPlayerId ? " is-active" : ""}" style="--tower-player-color:${player.color}" data-player-id="${player.id}"><b>${escapeHtml(player.name)}</b><span>NOW ${Number(current.floor) || 1}F · ${status}</span><em>最高記録 ${Number(current.bestFloor) || 1}F-P${Number(current.bestPhase) || 1}</em></button>`;
    }).join("");
  }

  function enemyHtml(player) {
    const enemy = Tower().enemyFor(player.floor, player.phase);
    const battle = player.battle || Tower().enemyBattleFor(player.floor, player.phase);
    const hpRatio = Math.max(0, Math.min(100, Math.round((Number(battle.hp) || 0) / Math.max(1, Number(battle.maxHp) || 1) * 100)));
    const art = enemy.boss
      ? `<img class="tower-enemy-art" src="${enemy.sprite}" alt="${escapeHtml(enemy.name)}">`
      : `<div class="tower-enemy-art is-regular" style="${spriteStyle(enemy.nodeId, "right")}"></div>`;
    return `${art}<div class="tower-enemy-label"><div class="tower-enemy-name">${escapeHtml(enemy.name)}</div><div class="tower-enemy-meta">${enemy.boss ? "FLOOR BOSS" : `TOWER GUARD / PHASE ${player.phase}`} · POWER ${enemy.power.toLocaleString()}</div><div class="tower-enemy-hp-label"><b>HP</b><span>${Math.round(Number(battle.hp) || 0).toLocaleString()} / ${Math.round(Number(battle.maxHp) || 1).toLocaleString()}</span></div><div class="tower-enemy-hp"><i style="--tower-enemy-hp:${hpRatio}%"></i></div></div>`;
  }

  function memberHtml(member, player, index) {
    const ratio = Math.max(0, Math.min(100, Math.round((Number(member.hp) || 0) / Math.max(1, Number(member.maxHp) || 1) * 100)));
    const masteryLevel = Number(Monsters()?.masteryLevel?.(member.masteryXp)) || 1;
    return `<button type="button" class="tower-party-member${member.hp <= 0 ? " is-ko" : ""}" style="--tower-player-color:${player.color};--tower-slot:${index}" data-tower-monster="${escapeHtml(member.nodeId)}" data-tower-index="${index}" aria-label="${escapeHtml(member.name)}の詳細">
      <span class="tower-mini-monster" style="${spriteStyle(member.nodeId, "left")}"></span>
      <span class="tower-member-info"><b class="tower-member-name">${escapeHtml(member.name)}</b><span class="tower-member-meta">絆 Lv.${masteryLevel} · POWER ${(Number(member.power) || 0).toLocaleString()}</span><span class="tower-hp-label"><b>HP</b>${Math.round(Number(member.hp) || 0).toLocaleString()} / ${Math.round(Number(member.maxHp) || 1).toLocaleString()}</span><span class="tower-hp"><i style="--tower-hp:${ratio}%"></i></span></span>
    </button>`;
  }

  function equipmentHtml(member) {
    const api = global.TeamBingoTerritoryEquipment;
    const items = api?.loadoutItems?.(api.normalizeLoadout?.(member.equipment) || {}) || [];
    if (!items.length) return `<div class="tower-detail-empty">装備なし</div>`;
    return items.map((item) => {
      const rarity = api.RARITY_BY_ID?.[item.rarity] || {};
      return `<div class="tower-detail-equipment" style="--tower-rarity:${rarity.color || "#87939a"}"><span>${escapeHtml(api.SLOT_BY_ID?.[item.slot]?.name || item.slot)}</span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.description || "")}</small></div>`;
    }).join("");
  }

  function renderMemberDetail(member, player) {
    const panel = root?.querySelector("[data-tower-detail-panel]");
    const host = root?.querySelector("[data-tower-detail-content]");
    if (!panel || !host) return;
    const node = Monsters()?.NODES?.[member.nodeId] || Monsters()?.NODES?.egg || {};
    const stats = Tower()?.combatStats?.(member.nodeId, member.masteryXp, member.equipment) || {};
    const masteryLevel = Number(Monsters()?.masteryLevel?.(member.masteryXp)) || 1;
    const rows = [["HP", stats.hp], ["攻撃", stats.attack], ["防御", stats.defense], ["魔攻", stats.magic], ["魔防", stats.magicDefense], ["素早さ", stats.speed]];
    host.innerHTML = `<div class="tower-detail-layout" style="--tower-player-color:${player?.color || "#f0cc5c"}">
      <div class="tower-detail-art"><div style="${spriteStyle(member.nodeId, "left")}"></div></div>
      <div class="tower-detail-copy"><small>${escapeHtml(player?.name || "TOWER PT")} / PARTY MEMBER</small><h3>${escapeHtml(node.name || member.name)}</h3><p>☆${Number(node.stage) || 0} · 絆 Lv.${masteryLevel} · POWER ${(Number(member.power) || 0).toLocaleString()}</p>
        <div class="tower-detail-current-hp"><span>CURRENT HP</span><b>${Math.round(Number(member.hp) || 0).toLocaleString()} / ${Math.round(Number(member.maxHp) || 1).toLocaleString()}</b></div>
        <div class="tower-detail-stats">${rows.map(([label, value]) => `<span><small>${label}</small><b>${Math.round(Number(value) || 0).toLocaleString()}</b></span>`).join("")}</div>
        <h4>EQUIPMENT</h4><div class="tower-detail-equipment-list">${equipmentHtml(member)}</div>
      </div></div>`;
    panel.hidden = false;
  }

  function logHtml() {
    const entries = Object.values(state?.log || {}).sort((a, b) => Number(b.createdAt || b.at) - Number(a.createdAt || a.at)).slice(0, 80);
    return entries.length ? entries.map((entry) => {
      const owner = Tower()?.PLAYER_BY_ID?.[entry.playerId] || Tower()?.PLAYERS?.find((item) => item.id === entry.playerId);
      const time = Number(entry.createdAt || entry.at);
      const message = String(entry.message || entry.text || "攻略状況を更新");
      const defeatPrefix = entry.type === "defeat" && !message.includes("敗北") ? "敗北 · " : "";
      return `<div class="tower-log-line${entry.type === "defeat" ? " is-defeat" : ""}"><time>${Number.isFinite(time) ? new Date(time).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "--"}</time><strong>${escapeHtml(owner?.name || "TOWER")}</strong><span>${defeatPrefix}${escapeHtml(message)}</span></div>`;
    }).join("") : `<div class="tower-log-line"><strong>TOWER</strong><span>六人の自動遠征隊が出撃しました。</span></div>`;
  }

  function animateTurn() {
    if (!root || !root.classList.contains("is-open")) return;
    animationTimers.forEach(clearTimeout);
    animationTimers = [];
    const party = [...root.querySelectorAll(".tower-party-member")];
    const player = state?.players?.[selectedPlayerId];
    const combatTurn = player?.lastCombatTurn || player?.battle?.lastTurn || {};
    const attackers = (combatTurn.attackers || []).map((attack) => party.find((element) => Number(element.dataset.towerIndex) === Number(attack.slot))).filter(Boolean);
    const targets = (combatTurn.targets || []).map((target) => party.find((element) => Number(element.dataset.towerIndex) === Number(target.slot))).filter(Boolean);
    const enemy = root.querySelector("[data-tower-enemy]");
    root.querySelectorAll(".is-attacking,.is-hit").forEach((element) => element.classList.remove("is-attacking", "is-hit"));
    attackers.forEach((attacker, index) => {
      animationTimers.push(setTimeout(() => {
        attacker.classList.add("is-attacking");
        enemy?.classList.add("is-hit");
        const impact = document.createElement("i");
        impact.className = "tower-battle-impact is-party-hit";
        root.querySelector(".tower-battlefield")?.appendChild(impact);
        setTimeout(() => impact.remove(), 650);
        setTimeout(() => { attacker.classList.remove("is-attacking"); enemy?.classList.remove("is-hit"); }, 480);
      }, index * 180));
    });
    const counterAt = Math.max(760, attackers.length * 180 + 220);
    animationTimers.push(setTimeout(() => {
      enemy?.classList.remove("is-hit");
      if (targets.length) enemy?.classList.add("is-attacking");
    }, counterAt));
    animationTimers.push(setTimeout(() => {
      enemy?.classList.remove("is-attacking");
      targets.forEach((target) => target.classList.add("is-hit"));
      if (targets.length) {
        const impact = document.createElement("i");
        impact.className = "tower-battle-impact is-enemy-hit";
        root.querySelector(".tower-battlefield")?.appendChild(impact);
        setTimeout(() => impact.remove(), 700);
      }
      setTimeout(() => targets.forEach((target) => target.classList.remove("is-hit")), 600);
    }, counterAt + 350));
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
    const player = state.players?.[selectedPlayerId];
    const text = player?.status === "resting" ? "PARTY REST" : `TURN ${Math.max(0, Number(player?.battle?.turn) || 0)}`;
    const target = root.querySelector("[data-tower-timer]");
    if (target) target.textContent = text;
    if (remaining <= 0) repository?.settleTower?.();
  }

  function applySnapshot(snapshot) {
    if (!snapshot || !Tower()) return;
    state = Tower().normalizeState(snapshot, repository?.getGlobalStats?.()?.playerStats, Date.now());
    if (root?.classList.contains("is-open")) render();
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
    animationTimers.forEach(clearTimeout);
    animationTimers = [];
    render();
    timer = setInterval(updateCountdown, 1000);
    repository?.settleTower?.();
  }

  function close() {
    root?.classList.remove("is-open");
    document.body.classList.remove("monster-tower-open");
    clearInterval(timer);
    timer = 0;
    animationTimers.forEach(clearTimeout);
    animationTimers = [];
    root?.remove();
    root = null;
    const callback = closeHandler;
    closeHandler = null;
    callback?.();
  }

  global.TeamBingoTowerMode = Object.freeze({ open, close, applySnapshot });
})(typeof window !== "undefined" ? window : globalThis);
