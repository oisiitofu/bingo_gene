(function bootstrapBingoCityMode(global) {
  "use strict";

  const City = global.TeamBingoCitySystem;
  let root = null;
  let map3d = null;
  let state = null;
  let activePlayerId = "tofu";
  let selectedTileId = "";
  let buildMode = "";
  let buildCategory = "transport";
  let buildPage = 0;
  let interactionTargetId = "";
  let albumOpen = false;
  const BUILD_PAGE_SIZE = 12;
  let options = {};
  let busy = false;
  let noticeTimer = 0;

  function ownershipLocked() {
    return Boolean(options.editablePlayerId);
  }

  function canEditActiveCity() {
    return !ownershipLocked() || options.editablePlayerId === activePlayerId;
  }

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
            <button type="button" class="city-simple-button" data-city-album-open>ALBUM</button>
            <button type="button" class="city-simple-button" data-city-focus-center>中心街</button>
            <button type="button" class="city-simple-button" data-city-reset-view>全域</button>
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
            <div class="city-build-categories" data-city-build-categories></div>
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
            <section class="city-life-panel" data-city-life></section>
            <section class="city-interaction-panel" data-city-interactions></section>
            <section class="city-selection" data-city-selection></section>
            <section class="city-ranking">
              <div class="city-panel-heading"><span>CITY SCORE</span><strong>都市ランキング</strong></div>
              <div data-city-ranking></div>
            </section>
          </aside>
        </div>
        <div class="city-album-overlay" data-city-album hidden>
          <section class="city-album-shell">
            <header class="city-album-head">
              <div><span>CITY ARCHIVE</span><h2>CITYアルバム</h2><p data-city-album-summary></p></div>
              <div class="city-album-actions">
                <button type="button" class="city-simple-button primary" data-city-album-capture>記念撮影</button>
                <button type="button" class="city-simple-button" data-city-album-close>CLOSE</button>
              </div>
            </header>
            <nav class="city-album-tabs" data-city-album-tabs></nav>
            <div class="city-album-grid" data-city-album-grid></div>
          </section>
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
      map3d?.setBuildMode("");
      render();
      return;
    }
    const albumPlayer = event.target.closest("[data-city-album-player]");
    if (albumPlayer) {
      activePlayerId = albumPlayer.dataset.cityAlbumPlayer;
      renderAlbum();
      return;
    }
    if (event.target.closest("[data-city-album-open]")) {
      albumOpen = true;
      renderAlbum();
      return;
    }
    if (event.target.closest("[data-city-album-close]")) {
      albumOpen = false;
      renderAlbum();
      return;
    }
    if (event.target.closest("[data-city-album-capture]")) {
      submitAlbumCapture();
      return;
    }
    const buildButton = event.target.closest("[data-city-build]");
    if (buildButton && !busy) {
      if (!canEditActiveCity()) {
        showNotice("この都市は閲覧専用です。", "error");
        return;
      }
      buildMode = buildMode === buildButton.dataset.cityBuild ? "" : buildButton.dataset.cityBuild;
      map3d?.setBuildMode(buildMode);
      renderBuildMenu();
      renderSelection();
      return;
    }
    const categoryButton = event.target.closest("[data-city-category]");
    if (categoryButton) {
      buildCategory = categoryButton.dataset.cityCategory;
      buildPage = 0;
      renderBuildMenu();
      return;
    }
    const pageButton = event.target.closest("[data-city-build-page]");
    if (pageButton) {
      buildPage = Math.max(0, Number(pageButton.dataset.cityBuildPage) || 0);
      renderBuildMenu();
      return;
    }
    const policyButton = event.target.closest("[data-city-policy]");
    if (policyButton && !busy && !policyButton.disabled) {
      submitPolicy(policyButton.dataset.cityPolicy);
      return;
    }
    const interactionTarget = event.target.closest("[data-city-interaction-target]");
    if (interactionTarget) {
      interactionTargetId = interactionTarget.dataset.cityInteractionTarget;
      renderInteractions();
      return;
    }
    const interactionButton = event.target.closest("[data-city-interaction]");
    if (interactionButton && !busy && !interactionButton.disabled) {
      submitInteraction(interactionButton.dataset.cityInteraction);
      return;
    }
    if (event.target.closest("[data-city-upgrade]")) submitCommand("upgrade");
    if (event.target.closest("[data-city-demolish]")) submitCommand("demolish");
    if (event.target.closest("[data-city-focus-center]")) map3d?.focusTile(City.tileId(City.CITY_CENTER, City.CITY_CENTER));
    if (event.target.closest("[data-city-reset-view]")) map3d?.focusTile(City.tileId(City.CITY_CENTER, City.CITY_CENTER), true);
    if (event.target.closest("[data-city-close]")) close();
  }

  function activeCity() {
    return state?.players?.[activePlayerId] || null;
  }

  function renderTabs() {
    const host = root.querySelector("[data-city-tabs]");
    host.innerHTML = City.PLAYERS.map((player) => `
      <button type="button" class="city-player-tab ${player.id === activePlayerId ? "active" : ""}" data-city-player="${player.id}" style="--city-player:${player.color};--city-accent:${player.accent}">
        <span></span><b>${escapeHtml(player.name)}</b>${ownershipLocked() ? `<small>${options.editablePlayerId === player.id ? "EDIT" : "VIEW"}</small>` : ""}
      </button>
    `).join("");
  }

  function renderResources() {
    const city = activeCity();
    if (!city) return;
    const stage = City.cityStage(city.level);
    const environment = City.cityEnvironment(city, Date.now());
    root.querySelector("[data-city-owner]").textContent = city.ownerName;
    root.querySelector("[data-city-name]").textContent = city.name;
    root.querySelector("[data-city-level]").textContent = `LEVEL ${city.level} ${stage.name}`;
    root.dataset.cityStage = String(city.level);
    root.classList.toggle("is-readonly-city", !canEditActiveCity());
    root.querySelector("[data-city-resources]").innerHTML = [
      ["資金", `¥ ${formatNumber(city.resources.money)}`, "money"],
      [environment.phase.name, environment.weather.name, `weather ${environment.weather.id}`]
    ].map(([label, value, kind]) => `<div class="city-resource ${kind}"><span>${label}</span><strong>${value}</strong></div>`).join("");
  }

  function renderBuildMenu() {
    const city = activeCity();
    const host = root.querySelector("[data-city-build-list]");
    const categories = [
      ["transport", "道路"], ["residential", "住宅"], ["commercial", "商業"],
      ["industrial", "工業"], ["public", "公共"], ["infrastructure", "都市基盤"], ["landmark", "ランドマーク"]
    ];
    root.querySelector("[data-city-build-categories]").innerHTML = categories.map(([id, label]) => {
      const count = Object.values(City.BUILDINGS).filter((building) => building.id !== "civic" && building.category === id).length;
      return `<button type="button" class="city-category-button ${buildCategory === id ? "active" : ""}" data-city-category="${id}"><span>${label}</span><b>${count}</b></button>`;
    }).join("");
    const available = Object.values(City.BUILDINGS)
      .filter((building) => building.id !== "civic" && building.category === buildCategory && city?.unlocks?.[building.id] && (!building.ownerId || building.ownerId === city.id));
    const pageCount = Math.max(1, Math.ceil(available.length / BUILD_PAGE_SIZE));
    buildPage = Math.min(buildPage, pageCount - 1);
    const pageBuildings = available.slice(buildPage * BUILD_PAGE_SIZE, (buildPage + 1) * BUILD_PAGE_SIZE);
    host.innerHTML = pageBuildings
      .map((building) => {
        const affordable = city.resources.money >= building.cost;
        const districtCount = City.analyzeDistricts(city).groups.length;
        const unlocked = (!building.unlockLevel || city.level >= building.unlockLevel) && (!building.unlockDistricts || districtCount >= building.unlockDistricts);
        const detail = unlocked ? `STYLE ${String((building.visualTheme || 0) + 1).padStart(2, "0")} / ¥${formatNumber(building.cost)}` : `LOCKED / Lv.${building.unlockLevel}・${building.unlockDistricts}地区`;
        return `<button type="button" class="city-build-button ${building.signatureLandmark ? "signature" : ""} ${buildMode === building.id ? "active" : ""}" data-city-build="${building.id}" ${busy || !affordable || !unlocked || !canEditActiveCity() ? "disabled" : ""}>
          <span class="city-build-icon ${building.model || building.id}" aria-hidden="true"></span>
          <span class="city-build-copy"><strong>${escapeHtml(building.name)}</strong><small>${escapeHtml(detail)}</small></span>
        </button>`;
      }).join("") + (pageCount > 1 ? `<nav class="city-build-pager" aria-label="建設カタログページ">
        <button type="button" data-city-build-page="${Math.max(0, buildPage - 1)}" ${buildPage === 0 ? "disabled" : ""}>PREV</button>
        <strong>${buildPage + 1}<small> / ${pageCount}</small></strong>
        <button type="button" data-city-build-page="${Math.min(pageCount - 1, buildPage + 1)}" ${buildPage >= pageCount - 1 ? "disabled" : ""}>NEXT</button>
      </nav>` : "");
  }

  function metric(label, value, suffix = "") {
    return `<div class="city-metric"><span>${label}</span><strong>${formatNumber(value)}${suffix}</strong></div>`;
  }

  function renderMetrics() {
    const city = activeCity();
    const metrics = City.calculateMetrics(city);
    const districts = City.analyzeDistricts(city);
    const landmark = City.landmarkStatus(city);
    const identity = City.CITY_IDENTITIES[city.id];
    const currentPolicy = City.CITY_POLICIES[city.policy?.id] || City.CITY_POLICIES.balanced;
    const missionStatus = City.missionStatus(city);
    const districtList = districts.summary.length
      ? districts.summary.map((district) => `<div class="city-district-chip" style="--district-color:${district.color}"><span></span><b>${escapeHtml(district.name)}</b><small>${district.groups}地区 / ${district.tiles}区画</small></div>`).join("")
      : `<p class="city-district-empty">周辺に同系統の建物を集めると地区が成立します。</p>`;
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
        ${metric("交通効率", metrics.transportEfficiency, "%")}
        ${metric("混雑度", metrics.trafficCongestion, "%")}
      </div>
      <div class="city-traffic-line"><span>道路接続 ${metrics.roadConnectivity}%</span><span>公共交通 ${metrics.publicTransit}</span><b>${formatNumber(metrics.trafficDemand)} / ${formatNumber(metrics.trafficCapacity)}</b></div>
      <div class="city-economy-line"><span>前回収支</span><b class="${city.economy.balance >= 0 ? "plus" : "minus"}">${city.economy.balance >= 0 ? "+" : ""}¥${formatNumber(city.economy.balance)}</b></div>
      <div class="city-district-head"><span>DISTRICTS</span><b>${districts.groups.length}地区</b></div>
      <div class="city-district-list">${districtList}</div>
      ${identity ? `<div class="city-identity" style="--identity-color:${city.color}">
        <span>CITY IDENTITY</span><b>${escapeHtml(identity.title)}</b><small>${escapeHtml(identity.focus)}</small><p>${escapeHtml(identity.description)}</p>
      </div>` : ""}
      <div class="city-policy">
        <div class="city-policy-head"><span>MAYOR POLICY</span><b>${escapeHtml(currentPolicy.name)}</b></div>
        <p>${escapeHtml(currentPolicy.description)}</p>
        <div class="city-policy-options">${Object.values(City.CITY_POLICIES).map((policy) => `<button type="button" class="${policy.id === currentPolicy.id ? "active" : ""}" data-city-policy="${policy.id}" title="${escapeHtml(policy.description)}" ${busy || !canEditActiveCity() || policy.id === currentPolicy.id ? "disabled" : ""}>${escapeHtml(policy.short)}</button>`).join("")}</div>
      </div>
      <div class="city-missions">
        <div class="city-mission-head"><span>BINGO MISSIONS</span><b>${missionStatus.recent ? `${missionStatus.recent.completed}/3 CLEAR` : "NO RECORD"}</b></div>
        ${missionStatus.recent ? missionStatus.recent.missions.map((mission) => `<div class="city-mission-row ${mission.completed ? "complete" : ""}">
          <i>${mission.completed ? "CLEAR" : `${Math.min(mission.progress, mission.target)}/${mission.target}`}</i><strong>${escapeHtml(mission.title)}</strong><small>+¥${formatNumber(mission.reward)}</small>
        </div>`).join("") : `<p>ビンゴをプレイすると都市ミッションが記録されます。</p>`}
        <div class="city-mission-total"><span>累計 ${formatNumber(missionStatus.completed)} / ${formatNumber(missionStatus.total)} 達成</span><b>+¥${formatNumber(missionStatus.earned)}</b></div>
      </div>
      ${landmark.definition ? `<div class="city-landmark-status ${landmark.built ? "built" : landmark.unlocked ? "ready" : "locked"}">
        <span>LANDMARK</span><b>${escapeHtml(landmark.definition.name)}</b><small>${landmark.built ? "完成" : landmark.unlocked ? "建設可能" : `Lv.${landmark.requiredLevel}・${landmark.requiredDistricts}地区で解放`}</small>
      </div>` : ""}
    `;
  }

  function renderSelection() {
    const host = root.querySelector("[data-city-selection]");
    const city = activeCity();
    if (!canEditActiveCity()) {
      const selected = selectedTileId ? ` / ${escapeHtml(selectedTileId)}` : "";
      host.innerHTML = `<div class="city-panel-heading"><span>VIEW ONLY${selected}</span><strong>${escapeHtml(city?.name || "他都市視察")}</strong></div><p>この都市は確認のみ可能です。建設・強化・撤去は所有プレイヤーの都市で行えます。</p>`;
      return;
    }
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
    const point = City.parseTileId(selectedTileId);
    const terrain = City.terrainAt(city?.id, point.x, point.z);
    if (!tile) {
      host.innerHTML = `<div class="city-panel-heading"><span>${terrain.buildable ? "EMPTY PLOT" : "NATURAL AREA"}</span><strong>${escapeHtml(City.TERRAIN[terrain.type]?.name || terrain.type)} ${escapeHtml(selectedTileId)}</strong></div><p>${terrain.buildable ? "道路を接続すると建設できる空き区画です。" : "自然地形です。川と湖には橋を建設できます。"}</p>`;
      return;
    }
    const building = City.BUILDINGS[tile.buildingId];
    const level = Number(tile.level) || 1;
    const districtType = City.analyzeDistricts(city).tiles[selectedTileId];
    const district = City.DISTRICTS[districtType];
    host.innerHTML = `<div class="city-panel-heading"><span>${escapeHtml(building.category.toUpperCase())}</span><strong>${escapeHtml(building.name)}</strong></div>
      <div class="city-building-level">LEVEL ${level}</div>
      ${district ? `<div class="city-selection-district" style="--district-color:${district.color}"><span></span><b>${escapeHtml(district.name)}</b></div>` : ""}
      <p>${escapeHtml(building.description)}</p>
      <div class="city-selection-actions">
        ${building.id !== "road" && level < 3 ? `<button type="button" class="city-simple-button primary" data-city-upgrade ${busy ? "disabled" : ""}>UPGRADE</button>` : ""}
        ${building.id !== "civic" ? `<button type="button" class="city-simple-button danger" data-city-demolish ${busy ? "disabled" : ""}>撤去</button>` : ""}
      </div>`;
  }

  function renderCityLife() {
    const city = activeCity();
    const life = City.lifeStatus(city);
    const latest = life.news[0];
    const eventStatus = City.eventStatus(city, Date.now());
    const speakers = life.residents.slice().sort((a, b) => (Number(b.lastSpokeAt) || 0) - (Number(a.lastSpokeAt) || 0)).slice(0, 3);
    root.querySelector("[data-city-life]").innerHTML = `
      <div class="city-panel-heading"><span>CITY LIVE</span><strong>市民・ニュース</strong></div>
      ${latest ? `<article class="city-news ${escapeHtml(latest.tone || "neutral")}"><span>${escapeHtml(latest.type.toUpperCase())}</span><b>${escapeHtml(latest.title)}</b><p>${escapeHtml(latest.detail)}</p></article>` : ""}
      ${eventStatus.active.length ? `<div class="city-active-events">${eventStatus.active.map((entry) => `<div class="city-event ${escapeHtml(entry.tone || "neutral")}"><span>ACTIVE EVENT</span><b>${escapeHtml(entry.title)}</b><small>${Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 60000))}分</small></div>`).join("")}</div>` : ""}
      <div class="city-resident-list">${speakers.map((resident) => `<div class="city-resident">
        <i>${escapeHtml(resident.name.slice(0, 1))}</i><span><b>${escapeHtml(resident.name)}</b><small>${escapeHtml(resident.job)} / 満足 ${Math.round(resident.satisfaction)}%</small></span>
      </div>`).join("")}</div>
    `;
  }

  function renderInteractions() {
    const host = root.querySelector("[data-city-interactions]");
    if (!host) return;
    const city = activeCity();
    const targets = City.PLAYERS.filter((player) => player.id !== city.id);
    if (!targets.some((player) => player.id === interactionTargetId)) interactionTargetId = targets[0]?.id || "";
    const relation = city.relations?.[interactionTargetId] || {};
    const remaining = Math.max(0, City.INTERACTION_COOLDOWN_MS - (Date.now() - (Number(relation.lastAt) || 0)));
    host.innerHTML = `
      <div class="city-panel-heading"><span>CITY LINK</span><strong>都市間交流</strong></div>
      <div class="city-interaction-targets">${targets.map((player) => `<button type="button" class="${player.id === interactionTargetId ? "active" : ""}" data-city-interaction-target="${player.id}" style="--link-color:${player.color}"><span></span>${escapeHtml(player.name)}</button>`).join("")}</div>
      <div class="city-relation-line"><span>友好度</span><b>${Math.round(Number(relation.score) || 0)} / 100</b><small>${remaining ? `再交流 ${Math.ceil(remaining / 60000)}分後` : "交流可能"}</small></div>
      <div class="city-interaction-actions">${Object.values(City.CITY_INTERACTIONS).map((interaction) => `<button type="button" data-city-interaction="${interaction.id}" title="${escapeHtml(interaction.description)}" ${busy || remaining || !canEditActiveCity() ? "disabled" : ""}><b>${escapeHtml(interaction.short)}</b><small>${interaction.sourceMoney >= 0 ? "+" : ""}¥${formatNumber(interaction.sourceMoney)}</small></button>`).join("")}</div>
    `;
  }

  function renderRanking() {
    const ranking = City.standings(state);
    root.querySelector("[data-city-ranking]").innerHTML = ranking.map((entry, index) => `
      <button type="button" class="city-rank-row ${entry.id === activePlayerId ? "active" : ""}" data-city-player="${entry.id}">
        <span class="city-rank-number">${index + 1}</span>
        <span class="city-rank-color" style="--rank-color:${entry.color}"></span>
        <span class="city-rank-name"><b>${escapeHtml(entry.cityName)}</b><small>${escapeHtml(entry.name)} / Lv.${entry.level} ${escapeHtml(City.cityStage(entry.level).name)}</small></span>
        <strong>${formatNumber(entry.cityScore)}</strong>
      </button>
    `).join("");
  }

  function renderAlbum() {
    const overlay = root.querySelector("[data-city-album]");
    if (!overlay) return;
    overlay.hidden = !albumOpen;
    if (!albumOpen) return;
    const city = activeCity();
    const album = City.albumStatus(city);
    const remaining = Math.max(0, City.ALBUM_CAPTURE_COOLDOWN_MS - (Date.now() - album.lastCapturedAt));
    root.querySelector("[data-city-album-summary]").textContent = `${city.name} / ${album.entries.length} RECORDS`;
    root.querySelector("[data-city-album-capture]").disabled = busy || !canEditActiveCity() || remaining > 0;
    root.querySelector("[data-city-album-capture]").textContent = remaining ? `撮影まで ${Math.ceil(remaining / 60000)}分` : "記念撮影";
    root.querySelector("[data-city-album-tabs]").innerHTML = City.PLAYERS.map((player) => `<button type="button" class="${player.id === activePlayerId ? "active" : ""}" data-city-album-player="${player.id}" style="--album-city:${player.color}"><span></span>${escapeHtml(player.name)}</button>`).join("");
    root.querySelector("[data-city-album-grid]").innerHTML = album.entries.length ? album.entries.map((entry) => {
      const date = new Date(Number(entry.createdAt) || 0).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      return `<article class="city-album-card type-${escapeHtml(entry.type)} phase-${escapeHtml(entry.phaseId)} weather-${escapeHtml(entry.weatherId)}" style="--album-city:${city.color};--album-accent:${city.accent}">
        <div class="city-album-scene"><span>${escapeHtml(entry.phaseName)} / ${escapeHtml(entry.weatherName)}</span><b>LEVEL ${entry.level}</b><i>${escapeHtml(entry.stage)}</i></div>
        <div class="city-album-copy"><span>${escapeHtml(entry.type.toUpperCase())} / ${escapeHtml(date)}</span><strong>${escapeHtml(entry.title)}</strong><p>${escapeHtml(entry.caption)}</p><footer><b>人口 ${formatNumber(entry.population)}</b><b>SCORE ${formatNumber(entry.cityScore)}</b><b>${entry.districtCount}地区</b></footer></div>
      </article>`;
    }).join("") : `<p class="city-album-empty">まだ都市の記録がありません。</p>`;
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
          if (buildMode && canEditActiveCity()) submitCommand("build", buildMode);
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
    renderCityLife();
    renderInteractions();
    renderSelection();
    renderRanking();
    renderMap();
    renderTick();
    renderAlbum();
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
    if (!canEditActiveCity()) {
      showNotice("この都市は閲覧専用です。", "error");
      return;
    }
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

  async function submitPolicy(policyId) {
    if (busy || !options.onCommand || !canEditActiveCity()) return;
    busy = true;
    renderMetrics();
    try {
      const result = await options.onCommand({
        id: `city-policy-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: "set-policy",
        playerId: activePlayerId,
        policyId
      });
      if (result?.ok === false) throw new Error(result.error || "都市方針を反映できませんでした。");
      showNotice(`市長方針を「${City.CITY_POLICIES[policyId]?.name || "新方針"}」へ変更しました`, "success");
    } catch (error) {
      showNotice(String(error?.message || error), "error");
    } finally {
      busy = false;
      renderMetrics();
    }
  }

  async function submitInteraction(interactionId) {
    if (busy || !options.onCommand || !canEditActiveCity() || !interactionTargetId) return;
    busy = true;
    renderInteractions();
    try {
      const result = await options.onCommand({
        id: `city-link-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: "interact",
        playerId: activePlayerId,
        targetPlayerId: interactionTargetId,
        interactionId
      });
      if (result?.ok === false) throw new Error(result.error || "都市交流を反映できませんでした。");
      showNotice(`${City.CITY_INTERACTIONS[interactionId]?.name || "都市交流"}が成立しました`, "success");
    } catch (error) {
      showNotice(String(error?.message || error), "error");
    } finally {
      busy = false;
      renderInteractions();
    }
  }

  async function submitAlbumCapture() {
    if (busy || !options.onCommand || !canEditActiveCity()) return;
    busy = true;
    renderAlbum();
    try {
      const result = await options.onCommand({
        id: `city-album-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: "capture-album",
        playerId: activePlayerId
      });
      if (result?.ok === false) throw new Error(result.error || "記念撮影を保存できませんでした。");
      showNotice("CITYアルバムへ記念写真を保存しました", "success");
    } catch (error) {
      showNotice(String(error?.message || error), "error");
    } finally {
      busy = false;
      renderAlbum();
    }
  }

  function applySnapshot(snapshot) {
    if (!snapshot) return;
    state = City.normalizeState(snapshot, Date.now());
    if (root && !root.hidden) render();
  }

  function open(nextOptions = {}) {
    ensureRoot();
    options = nextOptions;
    state = City.normalizeState(nextOptions.state || City.createInitialState(Date.now()), Date.now());
    const preferredPlayerId = nextOptions.playerId || nextOptions.editablePlayerId;
    activePlayerId = preferredPlayerId && state.players?.[preferredPlayerId] ? preferredPlayerId : activePlayerId;
    selectedTileId = "";
    buildMode = "";
    buildCategory = "transport";
    interactionTargetId = "";
    albumOpen = false;
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
    albumOpen = false;
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
