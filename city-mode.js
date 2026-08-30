(function bootstrapBingoCityMode(global) {
  "use strict";

  const City = global.TeamBingoCitySystem;
  let root = null;
  let map3d = null;
  let state = null;
  let activePlayerId = "tofu";
  let selectedTileId = "";
  let buildMode = "";
  let options = {};
  let busy = false;
  let noticeTimer = 0;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function formatNumber(value) {
    return Math.round(Number(value) || 0).toLocaleString("ja-JP");
  }

  function ensureRoot() {
    if (root) return root;
    document.body.insertAdjacentHTML("beforeend", `
      <section class="city-mode" id="cityMode" hidden aria-label="BINGO CITY 六王都市開発">
        <header class="city-head">
          <div class="city-brand">
            <span>BINGO CITY</span>
            <h1>六王都市開発</h1>
          </div>
          <div class="city-city-tabs" data-city-tabs></div>
          <div class="city-head-actions">
            <button type="button" class="city-simple-button" data-city-reset-view>全景</button>
            <button type="button" class="city-simple-button" data-city-close>CLOSE</button>
          </div>
        </header>
        <div class="city-status-bar">
          <div class="city-current-title">
            <span data-city-owner></span>
            <strong data-city-name></strong>
            <b data-city-level></b>
          </div>
          <div class="city-resource-list" data-city-resources></div>
          <div class="city-tick"><span>NEXT UPDATE</span><strong data-city-next-tick>--:--</strong></div>
        </div>
        <div class="city-layout">
          <aside class="city-tool-panel">
            <div class="city-panel-heading"><span>DEVELOP</span><strong>建設メニュー</strong></div>
            <div class="city-build-list" data-city-build-list></div>
            <div class="city-tool-help">建設する施設を選び、3Dマップ上の区画を押してください。</div>
          </aside>
          <main class="city-map-panel">
            <div class="city-map-viewport" data-city-map></div>
            <div class="city-map-toolbar">
              <span>ドラッグ: 回転</span><span>SHIFT + ドラッグ: 移動</span><span>ホイール: ズーム</span>
            </div>
            <div class="city-notice" data-city-notice hidden></div>
          </main>
          <aside class="city-info-panel">
            <section class="city-metrics" data-city-metrics></section>
            <section class="city-selection" data-city-selection></section>
            <section class="city-ranking">
              <div class="city-panel-heading"><span>CITY SCORE</span><strong>都市ランキング</strong></div>
              <div data-city-ranking></div>
            </section>
          </aside>
        </div>
      </section>
    `);
    root = document.getElementById("cityMode");
    root.addEventListener("click", onClick);
    return root;
  }

  function onClick(event) {
    const cityButton = event.target.closest("[data-city-player]");
    if (cityButton) {
      activePlayerId = cityButton.dataset.cityPlayer;
      selectedTileId = "";
      buildMode = "";
      render();
      return;
    }
    const buildButton = event.target.closest("[data-city-build]");
    if (buildButton && !busy) {
      buildMode = buildMode === buildButton.dataset.cityBuild ? "" : buildButton.dataset.cityBuild;
      map3d?.setBuildMode(buildMode);
      renderBuildMenu();
      renderSelection();
      return;
    }
    if (event.target.closest("[data-city-upgrade]")) submitCommand("upgrade");
    if (event.target.closest("[data-city-demolish]")) submitCommand("demolish");
    if (event.target.closest("[data-city-reset-view]")) map3d?.focusTile("7,7");
    if (event.target.closest("[data-city-close]")) close();
  }

  function activeCity() {
    return state?.players?.[activePlayerId] || null;
  }

  function renderTabs() {
    const host = root.querySelector("[data-city-tabs]");
    host.innerHTML = City.PLAYERS.map((player) => `
      <button type="button" class="city-player-tab ${player.id === activePlayerId ? "active" : ""}" data-city-player="${player.id}" style="--city-player:${player.color};--city-accent:${player.accent}">
        <span></span><b>${escapeHtml(player.name)}</b>
      </button>
    `).join("");
  }

  function renderResources() {
    const city = activeCity();
    if (!city) return;
    root.querySelector("[data-city-owner]").textContent = city.ownerName;
    root.querySelector("[data-city-name]").textContent = city.name;
    root.querySelector("[data-city-level]").textContent = `CITY LEVEL ${city.level}`;
    root.querySelector("[data-city-resources]").innerHTML = [
      ["資金", `¥ ${formatNumber(city.resources.money)}`, "money"],
      ["資材", formatNumber(city.resources.materials), "materials"],
      ["研究", formatNumber(city.resources.research), "research"],
      ["HYPE", `${formatNumber(city.resources.hype)}%`, "hype"],
      ["設計図", formatNumber(city.resources.blueprints), "blueprint"]
    ].map(([label, value, kind]) => `<div class="city-resource ${kind}"><span>${label}</span><strong>${value}</strong></div>`).join("");
  }

  function renderBuildMenu() {
    const city = activeCity();
    const host = root.querySelector("[data-city-build-list]");
    host.innerHTML = Object.values(City.BUILDINGS)
      .filter((building) => building.id !== "civic" && city?.unlocks?.[building.id])
      .map((building) => {
        const affordable = city.resources.money >= building.cost && city.resources.materials >= building.materials;
        return `<button type="button" class="city-build-button ${buildMode === building.id ? "active" : ""}" data-city-build="${building.id}" ${busy || !affordable ? "disabled" : ""}>
          <span class="city-build-icon ${building.id}" aria-hidden="true"></span>
          <span class="city-build-copy"><strong>${escapeHtml(building.name)}</strong><small>¥${formatNumber(building.cost)} / 資材 ${building.materials}</small></span>
        </button>`;
      }).join("");
  }

  function metric(label, value, suffix = "") {
    return `<div class="city-metric"><span>${label}</span><strong>${formatNumber(value)}${suffix}</strong></div>`;
  }

  function renderMetrics() {
    const city = activeCity();
    const metrics = City.calculateMetrics(city);
    root.querySelector("[data-city-metrics]").innerHTML = `
      <div class="city-panel-heading"><span>CITY STATUS</span><strong>都市指標</strong></div>
      <div class="city-population"><span>人口</span><strong>${formatNumber(metrics.population)}</strong><small>収容 ${formatNumber(metrics.capacity)}</small></div>
      <div class="city-metric-grid">
        ${metric("幸福度", metrics.happiness, "%")}
        ${metric("雇用", metrics.employmentRate, "%")}
        ${metric("電力", metrics.powerCoverage, "%")}
        ${metric("水道", metrics.waterCoverage, "%")}
        ${metric("観光", metrics.tourism)}
        ${metric("環境", metrics.environment, "%")}
      </div>
      <div class="city-economy-line"><span>前回収支</span><b class="${city.economy.balance >= 0 ? "plus" : "minus"}">${city.economy.balance >= 0 ? "+" : ""}¥${formatNumber(city.economy.balance)}</b></div>
    `;
  }

  function renderSelection() {
    const host = root.querySelector("[data-city-selection]");
    const city = activeCity();
    if (buildMode) {
      const building = City.BUILDINGS[buildMode];
      host.innerHTML = `<div class="city-panel-heading"><span>BUILD MODE</span><strong>${escapeHtml(building.name)}</strong></div>
        <p>${escapeHtml(building.description)}</p><div class="city-build-active">マップの空き区画を選択</div>`;
      return;
    }
    if (!selectedTileId) {
      host.innerHTML = `<div class="city-panel-heading"><span>SELECT</span><strong>区画情報</strong></div><p>マップ上の区画や建物を選択してください。</p>`;
      return;
    }
    const tile = city?.tiles?.[selectedTileId];
    if (!tile) {
      host.innerHTML = `<div class="city-panel-heading"><span>EMPTY PLOT</span><strong>区画 ${escapeHtml(selectedTileId)}</strong></div><p>建設可能な空き区画です。</p>`;
      return;
    }
    const building = City.BUILDINGS[tile.buildingId];
    const level = Number(tile.level) || 1;
    host.innerHTML = `<div class="city-panel-heading"><span>${escapeHtml(building.category.toUpperCase())}</span><strong>${escapeHtml(building.name)}</strong></div>
      <div class="city-building-level">LEVEL ${level}</div>
      <p>${escapeHtml(building.description)}</p>
      <div class="city-selection-actions">
        ${building.id !== "road" && level < 3 ? `<button type="button" class="city-simple-button primary" data-city-upgrade ${busy ? "disabled" : ""}>UPGRADE</button>` : ""}
        ${building.id !== "civic" ? `<button type="button" class="city-simple-button danger" data-city-demolish ${busy ? "disabled" : ""}>撤去</button>` : ""}
      </div>`;
  }

  function renderRanking() {
    const ranking = City.standings(state);
    root.querySelector("[data-city-ranking]").innerHTML = ranking.map((entry, index) => `
      <button type="button" class="city-rank-row ${entry.id === activePlayerId ? "active" : ""}" data-city-player="${entry.id}">
        <span class="city-rank-number">${index + 1}</span>
        <span class="city-rank-color" style="--rank-color:${entry.color}"></span>
        <span class="city-rank-name"><b>${escapeHtml(entry.cityName)}</b><small>${escapeHtml(entry.name)}</small></span>
        <strong>${formatNumber(entry.cityScore)}</strong>
      </button>
    `).join("");
  }

  function renderTick() {
    const host = root.querySelector("[data-city-next-tick]");
    const remaining = Math.max(0, (Number(state?.nextTickAt) || Date.now()) - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor(remaining % 60000 / 1000);
    host.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function renderMap() {
    const city = activeCity();
    if (!map3d) {
      map3d = global.TeamBingoCityMap3D.create(root.querySelector("[data-city-map]"), {
        onSelect: (tileId) => {
          selectedTileId = tileId;
          if (buildMode) submitCommand("build", buildMode);
          else renderSelection();
        }
      });
    }
    map3d.render(city);
    map3d.setBuildMode(buildMode);
  }

  function render() {
    if (!root || !state) return;
    renderTabs();
    renderResources();
    renderBuildMenu();
    renderMetrics();
    renderSelection();
    renderRanking();
    renderMap();
    renderTick();
  }

  function showNotice(text, kind = "") {
    const host = root?.querySelector("[data-city-notice]");
    if (!host) return;
    clearTimeout(noticeTimer);
    host.textContent = text;
    host.className = `city-notice ${kind}`;
    host.hidden = false;
    noticeTimer = setTimeout(() => { host.hidden = true; }, 3200);
  }

  async function submitCommand(type, buildingId = "") {
    if (busy || !selectedTileId || !options.onCommand) return;
    busy = true;
    renderBuildMenu();
    renderSelection();
    try {
      const result = await options.onCommand({
        id: `city-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type,
        playerId: activePlayerId,
        tileId: selectedTileId,
        buildingId
      });
      if (result?.ok === false) throw new Error(result.error || "都市操作を反映できませんでした。");
      showNotice(type === "build" ? "建設を開始しました" : type === "upgrade" ? "建物を強化しました" : "区画を撤去しました", "success");
      if (type === "build") buildMode = "";
    } catch (error) {
      showNotice(String(error?.message || error), "error");
    } finally {
      busy = false;
      renderBuildMenu();
      renderSelection();
    }
  }

  function applySnapshot(snapshot) {
    if (!snapshot) return;
    state = City.clone(snapshot);
    if (root && !root.hidden) render();
  }

  function open(nextOptions = {}) {
    ensureRoot();
    options = nextOptions;
    state = City.clone(nextOptions.state || City.createInitialState(Date.now()));
    activePlayerId = nextOptions.playerId && state.players?.[nextOptions.playerId] ? nextOptions.playerId : activePlayerId;
    selectedTileId = "";
    buildMode = "";
    root.hidden = false;
    root.classList.add("show");
    document.body.classList.add("city-mode-open");
    render();
    options.onOpen?.();
  }

  function close() {
    if (!root) return;
    root.hidden = true;
    root.classList.remove("show");
    document.body.classList.remove("city-mode-open");
    map3d?.destroy();
    map3d = null;
    options.onClose?.();
  }

  global.setInterval(() => {
    if (root && !root.hidden) renderTick();
  }, 1000);

  global.TeamBingoCityMode = { open, close, applySnapshot };
})(typeof window !== "undefined" ? window : globalThis);
