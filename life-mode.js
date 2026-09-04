(function bootstrapLifeMode(global) {
  "use strict";

  const System = global.TeamBingoLifeBoardSystem;
  const THREE = global.THREE;
  if (!System) return;

  const CATEGORY_COLORS = {
    money: 0x52c985, job: 0x4e92d8, property: 0xd49a5a, stock: 0x8b70d8,
    monster: 0xdb5b77, equipment: 0xe2b94d, city: 0x4ec3c9, territory: 0xe45746,
    tower: 0x8f72e8, interaction: 0xf17b4f,
    risk: 0xcf3e48, checkpoint: 0xffd84d
  };
  const AVATAR_URLS = Object.freeze(Object.fromEntries(System.PLAYERS.map((player) => [player.id, `images/life/avatars/${player.id}.png?v=20260905-nonhuman-3`])));
  const ROLL_AVATAR_URLS = Object.freeze(Object.fromEntries(System.PLAYERS.map((player) => [player.id, `images/life/avatars/poses/${player.id}-roll.png?v=20260905-nonhuman-3`])));
  let root = null;
  let state = null;
  let scene = null;
  let camera = null;
  let renderer = null;
  let tileMesh = null;
  let playerSprites = new Map();
  let diceMeshes = new Map();
  let rollAnimations = new Map();
  let displayedPositions = new Map();
  let lastRollIds = new Map();
  let selectedPlayerId = "tofu";
  let overview = false;
  let openOptions = {};
  let frame = 0;
  let resizeObserver = null;

  function money(value) {
    const amount = Number(value) || 0;
    return `${amount < 0 ? "-" : ""}¥${Math.abs(amount).toLocaleString("ja-JP")}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  }

  function tilePosition(number) {
    const index = Math.max(0, Math.min(System.BOARD_SIZE - 1, Number(number) - 1));
    const row = Math.floor(index / 25);
    const rawColumn = index % 25;
    const column = row % 2 ? 24 - rawColumn : rawColumn;
    return { x: (column - 12) * 2.25, y: 0, z: row * 2.25 };
  }

  function tileNumberForPlayer(player) {
    const position = Math.max(0, Number(player?.position) || 0);
    return position === 0 && Number(player?.totalSpaces) > 0 ? System.BOARD_SIZE : Math.max(1, position);
  }

  function ensureRoot() {
    if (root) return root;
    document.body.insertAdjacentHTML("beforeend", `
      <section class="life-mode" id="lifeMode" aria-hidden="true">
        <div class="life-head">
          <div class="life-title"><small>1000 SPACE LIFE BOARD</small><strong>六王人生すごろく</strong></div>
          <div class="life-head-actions">
            <button type="button" class="life-simple-btn" data-life-history>HISTORY</button>
            <button type="button" class="life-simple-btn" data-life-admin hidden>DATA</button>
            <button type="button" class="life-simple-btn" data-life-view>OVERVIEW</button>
            <button type="button" class="life-simple-btn" data-life-close>CLOSE</button>
          </div>
        </div>
        <div class="life-region-chip" data-life-region></div>
        <div class="life-roster" data-life-roster></div>
        <aside class="life-status" data-life-status></aside>
        <div class="life-event-log" data-life-event></div>
        <section class="life-drawer" data-life-drawer aria-hidden="true">
          <header><div><small data-life-drawer-kicker>LIFE ARCHIVE</small><h2 data-life-drawer-title>六王人生記録</h2></div><button type="button" class="life-simple-btn" data-life-drawer-close>CLOSE</button></header>
          <div data-life-drawer-body></div>
        </section>
        <div class="life-roll-call" data-life-roll-call aria-hidden="true"></div>
        <input type="file" data-life-import accept="application/json,.json" hidden />
      </section>`);
    root = document.getElementById("lifeMode");
    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-life-close]")) close();
      const player = event.target.closest("[data-life-player]");
      if (player) { selectedPlayerId = player.dataset.lifePlayer; overview = false; renderUi(); updateCamera(true); }
      if (event.target.closest("[data-life-view]")) { overview = !overview; renderUi(); updateCamera(true); }
      if (event.target.closest("[data-life-history]")) showHistory();
      if (event.target.closest("[data-life-admin]")) showAdmin();
      if (event.target.closest("[data-life-drawer-close]")) closeDrawer();
      if (event.target.closest("[data-life-export]")) exportState();
      if (event.target.closest("[data-life-import-button]")) root.querySelector("[data-life-import]")?.click();
      const reset = event.target.closest("[data-life-reset]");
      if (reset) void resetState(reset.dataset.lifeReset);
    });
    root.querySelector("[data-life-import]").addEventListener("change", importState);
    return root;
  }

  function makeTrack() {
    const geometry = new THREE.BoxGeometry(1.92, 0.32, 1.92);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: .12 });
    tileMesh = new THREE.InstancedMesh(geometry, material, System.BOARD_SIZE);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    System.BOARD.forEach((space, index) => {
      const point = tilePosition(space.number);
      const height = space.checkpoint ? 0.82 : 0.32;
      matrix.compose(
        new THREE.Vector3(point.x, height / 2, point.z),
        new THREE.Quaternion(),
        new THREE.Vector3(1, height / 0.32, 1)
      );
      tileMesh.setMatrixAt(index, matrix);
      color.setHex(CATEGORY_COLORS[space.category] || 0x777777);
      color.lerp(new THREE.Color(System.REGIONS[space.regionIndex].color), 0.22);
      tileMesh.setColorAt(index, color);
    });
    tileMesh.instanceMatrix.needsUpdate = true;
    tileMesh.instanceColor.needsUpdate = true;
    scene.add(tileMesh);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(64, 96),
      new THREE.MeshStandardMaterial({ color: 0x202d27, roughness: 1, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.18, 43.5);
    scene.add(floor);

    System.REGIONS.forEach((region, index) => {
      const band = new THREE.Mesh(
        new THREE.PlaneGeometry(61, 8.6),
        new THREE.MeshBasicMaterial({ color: region.color, transparent: true, opacity: 0.075, side: THREE.DoubleSide })
      );
      band.rotation.x = -Math.PI / 2;
      band.position.set(0, -0.16, index * 9 + 3.35);
      scene.add(band);
    });
    makeRegionScenery();
  }

  function sceneryMesh(group, geometry, material, position, rotation = null, scale = null) {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(position.x, position.y, position.z);
    if (rotation) item.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
    if (scale) item.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
    group.add(item);
    return item;
  }

  function makeRegionScenery() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x151b23, roughness: .72, metalness: .28 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x84909c, roughness: .82, metalness: .06 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe5bc4c, emissive: 0x6b4c09, emissiveIntensity: .42, roughness: .32, metalness: .72 });
    const green = new THREE.MeshStandardMaterial({ color: 0x3d8754, roughness: .9 });
    const trunk = new THREE.MeshStandardMaterial({ color: 0x795332, roughness: 1 });
    System.REGIONS.forEach((region, index) => {
      const group = new THREE.Group();
      group.name = `life-region-${region.id}`;
      const z = index * 9 + 3.4;
      const side = index % 2 ? 1 : -1;
      const x = side * 31;
      const accent = new THREE.MeshStandardMaterial({
        color: region.color,
        emissive: region.color,
        emissiveIntensity: .32,
        roughness: .4,
        metalness: .35
      });
      const glow = new THREE.MeshBasicMaterial({ color: region.color, transparent: true, opacity: .5 });
      sceneryMesh(group, new THREE.CylinderGeometry(4.1, 4.5, .48, 20), dark, { x, y: .06, z });
      sceneryMesh(group, new THREE.BoxGeometry(59, .08, .16), glow, { x: 0, y: .08, z: index * 9 - 1.05 });

      if (region.theme === "town") {
        [-1.8, 0, 1.8].forEach((offset, itemIndex) => {
          sceneryMesh(group, new THREE.BoxGeometry(1.5, 1.4 + itemIndex * .25, 1.35), itemIndex === 1 ? accent : stone, { x: x + offset, y: .95 + itemIndex * .12, z });
          sceneryMesh(group, new THREE.ConeGeometry(1.18, .9, 4), gold, { x: x + offset, y: 2.05 + itemIndex * .25, z }, { y: Math.PI / 4 });
        });
      } else if (region.theme === "campus") {
        sceneryMesh(group, new THREE.BoxGeometry(5.2, .42, .58), accent, { x, y: 3.45, z });
        [-2.25, 2.25].forEach((offset) => sceneryMesh(group, new THREE.BoxGeometry(.62, 5.8, .62), stone, { x: x + offset, y: 2.45, z }));
        sceneryMesh(group, new THREE.SphereGeometry(.62, 18, 12), gold, { x, y: 4.15, z });
      } else if (region.theme === "business" || region.theme === "metro") {
        [-1.8, 0, 1.7].forEach((offset, itemIndex) => {
          const height = region.theme === "metro" ? [4.2, 7.1, 5.4][itemIndex] : [3.8, 5.8, 4.6][itemIndex];
          sceneryMesh(group, new THREE.BoxGeometry(1.45, height, 1.45), itemIndex === 1 ? accent : dark, { x: x + offset, y: height / 2 + .35, z });
          sceneryMesh(group, new THREE.BoxGeometry(1.05, .1, 1.5), glow, { x: x + offset, y: height * .66, z: z - .73 });
        });
      } else if (region.theme === "coast") {
        sceneryMesh(group, new THREE.CylinderGeometry(3.45, 3.75, .18, 24), new THREE.MeshStandardMaterial({ color: 0x3e9ea9, emissive: 0x164d61, emissiveIntensity: .35, roughness: .24 }), { x, y: .42, z });
        [-1.5, 1.25].forEach((offset, itemIndex) => {
          sceneryMesh(group, new THREE.CylinderGeometry(.18, .28, 3.3, 9), trunk, { x: x + offset, y: 2, z: z + (itemIndex ? .5 : -.5) }, { z: offset * .06 });
          for (let leaf = 0; leaf < 5; leaf += 1) {
            sceneryMesh(group, new THREE.ConeGeometry(.38, 2.1, 6), green, { x: x + offset, y: 3.65, z: z + (itemIndex ? .5 : -.5) }, { x: Math.PI / 2, y: leaf * Math.PI * .4, z: .4 });
          }
        });
      } else if (region.theme === "mountain") {
        [-1.9, 0, 1.85].forEach((offset, itemIndex) => sceneryMesh(group, new THREE.ConeGeometry(1.5 + itemIndex * .2, 4.4 + itemIndex * .8, 8), itemIndex === 1 ? accent : stone, { x: x + offset, y: 2.5 + itemIndex * .4, z: z + Math.abs(offset) * .18 }));
      } else if (region.theme === "technology") {
        sceneryMesh(group, new THREE.CylinderGeometry(.7, 1.45, 5.8, 12), dark, { x, y: 3.15, z });
        [1.3, 2.35, 3.45].forEach((height, ringIndex) => sceneryMesh(group, new THREE.TorusGeometry(1.5 + ringIndex * .3, .12, 8, 30), ringIndex === 1 ? gold : accent, { x, y: height, z }, { x: Math.PI / 2, y: ringIndex * .55 }));
        sceneryMesh(group, new THREE.OctahedronGeometry(.85, 0), accent, { x, y: 6.3, z });
      } else if (region.theme === "kingdom") {
        sceneryMesh(group, new THREE.BoxGeometry(4.5, 3.5, 2.1), stone, { x, y: 2.05, z });
        [-2.2, 2.2].forEach((offset) => {
          sceneryMesh(group, new THREE.CylinderGeometry(.76, .92, 4.5, 10), stone, { x: x + offset, y: 2.55, z });
          sceneryMesh(group, new THREE.ConeGeometry(1.15, 1.7, 10), accent, { x: x + offset, y: 5.65, z });
        });
        sceneryMesh(group, new THREE.BoxGeometry(1.1, 2.2, .35), dark, { x, y: 1.35, z: z - 1.14 });
      } else if (region.theme === "space") {
        sceneryMesh(group, new THREE.SphereGeometry(2.25, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb9d9ef, emissive: 0x385681, emissiveIntensity: .35, transparent: true, opacity: .82, roughness: .18, metalness: .3 }), { x, y: .35, z });
        sceneryMesh(group, new THREE.TorusGeometry(3.2, .13, 8, 36), accent, { x, y: 2, z }, { x: Math.PI / 2.7, z: .28 });
        sceneryMesh(group, new THREE.SphereGeometry(.62, 16, 12), gold, { x: x + 3, y: 3.5, z: z - 1.8 });
      } else {
        [-2.4, 2.4].forEach((offset) => sceneryMesh(group, new THREE.CylinderGeometry(.45, .65, 6.2, 10), gold, { x: x + offset, y: 3.45, z }));
        sceneryMesh(group, new THREE.BoxGeometry(5.4, .5, .72), accent, { x, y: 6.3, z });
        sceneryMesh(group, new THREE.TorusGeometry(1.65, .22, 10, 32), gold, { x, y: 4.7, z }, { y: Math.PI / 2 });
      }
      scene.add(group);
    });
  }

  function makeScene() {
    if (!THREE || renderer) return;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1119);
    scene.fog = new THREE.Fog(0x0c1119, 105, 260);
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 250);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace || "srgb";
    renderer.shadowMap.enabled = false;
    root.prepend(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xe9f4ff, 0x26301f, 2.4));
    const key = new THREE.DirectionalLight(0xffefcf, 2.1);
    key.position.set(-18, 34, 12);
    scene.add(key);
    makeTrack();
    createPlayerSprites();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    resize();
  }

  function createPlayerSprites() {
    const loader = new THREE.TextureLoader();
    System.PLAYERS.forEach((player) => {
      const die = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 1.05, 1.05),
        new THREE.MeshStandardMaterial({ color: player.color, roughness: .28, metalness: .35, emissive: player.color, emissiveIntensity: .18 })
      );
      die.visible = false;
      die.renderOrder = 12;
      scene.add(die);
      diceMeshes.set(player.id, die);
      loader.load(AVATAR_URLS[player.id], (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace || "srgb";
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(4.8, 4.8, 1);
        sprite.renderOrder = 10;
        scene.add(sprite);
        playerSprites.set(player.id, sprite);
        updatePlayerSprites();
      });
    });
  }

  function updatePlayerSprites() {
    if (!state) return;
    const groups = new Map();
    System.PLAYERS.forEach((definition) => {
      const player = state.players?.[definition.id];
      const position = displayedPositions.get(definition.id) || tileNumberForPlayer(player);
      const key = String(position);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(definition.id);
    });
    groups.forEach((ids, key) => {
      const point = tilePosition(Number(key) || 1);
      ids.forEach((id, index) => {
        const sprite = playerSprites.get(id);
        if (!sprite) return;
        const angle = (Math.PI * 2 * index) / ids.length;
        const spread = ids.length > 1 ? 2.35 : 0;
        sprite.position.set(point.x + Math.cos(angle) * spread, 2.7, point.z + Math.sin(angle) * spread);
        const size = ids.length > 2 ? (id === selectedPlayerId ? 4.25 : 3.45) : (id === selectedPlayerId ? 5.4 : 4.5);
        sprite.scale.set(size, size, 1);
      });
    });
  }

  function resize() {
    if (!renderer || !root) return;
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function updateCamera(immediate = false) {
    if (!camera || !state) return;
    const selected = state.players?.[selectedPlayerId] || Object.values(state.players || {})[0];
    const point = tilePosition((Number(selected?.position) || 0) || 1);
    const target = overview
      ? { position: new THREE.Vector3(8, 91, 91), look: new THREE.Vector3(8, 0, 43) }
      : { position: new THREE.Vector3(point.x, 19, point.z + 16), look: new THREE.Vector3(point.x, 0, point.z) };
    if (immediate) camera.position.copy(target.position);
    else camera.position.lerp(target.position, .08);
    camera.lookAt(target.look);
  }

  function animate() {
    if (!root?.classList.contains("open") || !renderer) { frame = 0; return; }
    const time = performance.now() * .001;
    playerSprites.forEach((sprite, id) => {
      if (rollAnimations.has(id)) return;
      sprite.position.y = 2.7 + Math.sin(time * 2.4 + System.hash32(id)) * .1;
    });
    updateRollAnimations(performance.now());
    updateCamera(false);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }

  function rollTileNumber(total) {
    const normalized = Math.max(0, Number(total) || 0);
    if (normalized === 0) return 1;
    return normalized % System.BOARD_SIZE || System.BOARD_SIZE;
  }

  function startRollAnimation(player) {
    const roll = player?.lastRoll;
    if (!roll?.id) return;
    const die = Math.max(1, Math.min(6, Number(roll.die) || 1));
    const totalAfter = Math.max(die, Number(player.totalSpaces) || die);
    const totalBefore = Math.max(0, totalAfter - die);
    displayedPositions.set(player.id, rollTileNumber(totalBefore));
    rollAnimations.set(player.id, { startedAt: performance.now(), duration: 1900, die, totalBefore });
    const call = root.querySelector("[data-life-roll-call]");
    call.innerHTML = `<img src="${ROLL_AVATAR_URLS[player.id]}" alt="" decoding="async" /><span><small>${escapeHtml(player.name)}</small><b>${die}</b><strong>SPACE</strong></span>`;
    call.style.setProperty("--player-color", System.PLAYER_BY_ID[player.id]?.color || "#f2cc54");
    call.setAttribute("aria-hidden", "false");
    call.classList.add("show");
  }

  function updateRollAnimations(now) {
    rollAnimations.forEach((animation, playerId) => {
      const sprite = playerSprites.get(playerId);
      const dieMesh = diceMeshes.get(playerId);
      const progress = Math.max(0, Math.min(1, (now - animation.startedAt) / animation.duration));
      const rollPart = .36;
      const travel = Math.max(0, Math.min(1, (progress - rollPart) / (1 - rollPart)));
      const exactStep = travel * animation.die;
      const step = Math.min(animation.die - 1, Math.floor(exactStep));
      const fraction = Math.min(1, exactStep - step);
      const from = tilePosition(rollTileNumber(animation.totalBefore + step));
      const to = tilePosition(rollTileNumber(animation.totalBefore + Math.min(animation.die, step + 1)));
      if (sprite) {
        sprite.position.set(
          from.x + (to.x - from.x) * fraction,
          2.7 + Math.sin(fraction * Math.PI) * 1.35,
          from.z + (to.z - from.z) * fraction
        );
      }
      if (dieMesh) {
        dieMesh.visible = progress < rollPart;
        dieMesh.position.set(from.x, 3.8 + Math.sin(progress * Math.PI / rollPart) * 2.2, from.z);
        dieMesh.rotation.set(progress * 19, progress * 27, progress * 15);
      }
      if (progress < 1) return;
      if (dieMesh) dieMesh.visible = false;
      displayedPositions.set(playerId, rollTileNumber(animation.totalBefore + animation.die));
      rollAnimations.delete(playerId);
      if (!rollAnimations.size) {
        root.querySelector("[data-life-roll-call]")?.classList.remove("show");
        root.querySelector("[data-life-roll-call]")?.setAttribute("aria-hidden", "true");
        updatePlayerSprites();
      }
    });
  }

  function latestEvent(player) {
    return [...(player?.assets?.eventHistory || [])].sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0] || null;
  }

  function renderUi() {
    if (!root || !state) return;
    const roster = root.querySelector("[data-life-roster]");
    roster.innerHTML = System.PLAYERS.map((definition) => {
      const player = state.players?.[definition.id];
      return `<button type="button" class="life-player-card${definition.id === selectedPlayerId ? " active" : ""}" data-life-player="${definition.id}" style="--player-color:${definition.color}">
        <img src="${AVATAR_URLS[definition.id]}" alt="" /><span><b>${escapeHtml(definition.name)}</b><small>${escapeHtml(player?.job?.name || "-")}</small></span><span>${money(player?.netWorth)}<small>${Number(player?.position) || 0} / 1000</small></span>
      </button>`;
    }).join("");
    const player = state.players?.[selectedPlayerId] || state.players?.tofu;
    const definition = System.PLAYER_BY_ID[player.id];
    const region = System.REGIONS[Math.floor(Math.max(0, (Number(player.position) || 1) - 1) / 100)] || System.REGIONS[0];
    root.querySelector("[data-life-region]").textContent = `AREA ${region ? System.REGIONS.indexOf(region) + 1 : 1}  ${region?.name || ""}`;
    root.querySelector("[data-life-status]").innerHTML = `
      <div class="life-status-head"><img src="${AVATAR_URLS[player.id]}" alt="" /><div><small>${escapeHtml(definition?.strategy || "PLAYER")}</small><b>${escapeHtml(player.name)}</b><strong>${escapeHtml(player.job?.name || "-")}</strong></div></div>
      <div class="life-stat-grid">
        <div class="life-stat"><small>NET WORTH</small><b>${money(player.netWorth)}</b></div>
        <div class="life-stat"><small>CASH</small><b>${money(player.cash)}</b></div>
        <div class="life-stat"><small>DEBT</small><b>${money(player.debt)}</b></div>
        <div class="life-stat"><small>POSITION</small><b>${player.position || 0} / 1000</b></div>
        <div class="life-stat"><small>LAP</small><b>${player.lap || 0}</b></div>
        <div class="life-stat"><small>ROLL</small><b>${player.rolls || 0}</b></div>
        <div class="life-stat"><small>PROPERTY</small><b>${Object.keys(player.assets?.homes || {}).length}</b></div>
        <div class="life-stat"><small>PAYDAY</small><b>${player.paydays || 0}</b></div>
      </div>
      <div class="life-market"><h3>SHARED MARKET</h3>${Object.values(state.market?.stocks || {}).map((stock) => `<div class="life-stock"><b>${escapeHtml(stock.name)}</b><span>¥${Number(stock.price).toLocaleString("ja-JP")}</span><span class="${stock.change >= 0 ? "up" : "down"}">${stock.change >= 0 ? "+" : ""}${Math.round(Number(stock.change) * 1000) / 10}%</span></div>`).join("")}</div>`;
    const event = latestEvent(player);
    root.querySelector("[data-life-event]").innerHTML = event
      ? `<small>${escapeHtml(event.category.toUpperCase())} / SPACE ${event.space}</small><b>${escapeHtml(event.title)}</b><p>${escapeHtml(event.detail)}${event.amount ? `　${event.amount > 0 ? "+" : ""}${money(event.amount)}` : ""}</p>`
      : `<small>LIFE LOG</small><b>次のOPENを待機中</b><p>六王の人生コースは、ここから始まります。</p>`;
    root.querySelector("[data-life-view]").textContent = overview ? "FOLLOW" : "OVERVIEW";
    root.querySelector("[data-life-view]").classList.toggle("active", overview);
    updatePlayerSprites();
  }

  function playerStandingRows() {
    return System.PLAYERS.map((definition) => state.players?.[definition.id] || System.createInitialState().players[definition.id])
      .sort((a, b) => Number(b.netWorth) - Number(a.netWorth))
      .map((player, index) => `<button type="button" class="life-standing" data-life-player="${player.id}" style="--player-color:${System.PLAYER_BY_ID[player.id]?.color || "#f2cc54"}">
        <span>${index + 1}</span><img src="${AVATAR_URLS[player.id]}" alt="" /><b>${escapeHtml(player.name)}</b><strong>${money(player.netWorth)}</strong><small>${player.position || 0} / 1000</small>
      </button>`).join("");
  }

  function showDrawer(title, kicker, body) {
    const drawer = root.querySelector("[data-life-drawer]");
    root.querySelector("[data-life-drawer-title]").textContent = title;
    root.querySelector("[data-life-drawer-kicker]").textContent = kicker;
    root.querySelector("[data-life-drawer-body]").innerHTML = body;
    drawer.classList.add("show");
    drawer.setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    const drawer = root?.querySelector("[data-life-drawer]");
    drawer?.classList.remove("show");
    drawer?.setAttribute("aria-hidden", "true");
  }

  function showHistory() {
    const events = Object.values(state.globalHistory || {}).sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    showDrawer("六王人生記録", "LIFE ARCHIVE", `
      <div class="life-standing-list">${playerStandingRows()}</div>
      <div class="life-history-list">${events.length ? events.map((event) => `<article style="--player-color:${System.PLAYER_BY_ID[event.playerId]?.color || "#f2cc54"}">
        <time>${new Date(Number(event.createdAt) || Date.now()).toLocaleString("ja-JP")}</time><small>${escapeHtml(event.playerName)} / SPACE ${event.space}</small>
        <b>${escapeHtml(event.title)}</b><p>${escapeHtml(event.detail)}</p>
      </article>`).join("") : "<p class=\"life-empty\">まだ人生イベントはありません。</p>"}</div>`);
  }

  function showAdmin() {
    if (!openOptions.isAdmin) return;
    showDrawer("人生データ管理", "ADMIN DATA", `
      <div class="life-admin-summary">REVISION ${Number(state.revision) || 0} / EVENTS ${Object.keys(state.globalHistory || {}).length} / OPEN ${Object.keys(state.processedOpens || {}).length}</div>
      <div class="life-admin-grid">
        <button type="button" class="life-simple-btn" data-life-export>EXPORT</button>
        <button type="button" class="life-simple-btn" data-life-import-button>IMPORT</button>
        <button type="button" class="life-simple-btn danger" data-life-reset="${selectedPlayerId}">RESET ${escapeHtml(System.PLAYER_BY_ID[selectedPlayerId]?.name || "PLAYER")}</button>
        <button type="button" class="life-simple-btn danger" data-life-reset="all">RESET ALL</button>
      </div>
      <p class="life-admin-note">リセットとインポートは管理者セッション中だけ実行されます。操作前にJSONをエクスポートできます。</p>`);
  }

  function exportState() {
    const payload = { format: "team-bingo-life-board", version: 1, exportedAt: new Date().toISOString(), data: state };
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `team-bingo-life-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    global.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function resetState(target) {
    if (!openOptions.isAdmin || typeof openOptions.onReset !== "function") return;
    const label = target === "all" ? "全員の人生データ" : `${System.PLAYER_BY_ID[target]?.name || "PLAYER"}の人生データ`;
    if (!global.confirm(`${label}をリセットしますか？`)) return;
    const result = await openOptions.onReset(target);
    if (result?.ok === false) global.alert(result.error || "リセットできませんでした。");
    else closeDrawer();
  }

  async function importState(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !openOptions.isAdmin || typeof openOptions.onImport !== "function") return;
    try {
      const payload = JSON.parse(await file.text());
      const data = payload?.format === "team-bingo-life-board" ? payload.data : payload;
      if (!global.confirm("このJSONで六王人生すごろくを復元しますか？")) return;
      const result = await openOptions.onImport(data);
      if (result?.ok === false) throw new Error(result.error || "インポートできませんでした。");
      closeDrawer();
    } catch (error) {
      global.alert(`IMPORT ERROR: ${String(error?.message || error)}`);
    }
  }

  function initializeTracking(snapshot) {
    System.PLAYERS.forEach((definition) => {
      const player = snapshot.players?.[definition.id];
      displayedPositions.set(definition.id, tileNumberForPlayer(player));
      lastRollIds.set(definition.id, String(player?.lastRoll?.id || ""));
    });
  }

  function applySnapshot(snapshot) {
    const next = System.normalizeState(snapshot, Date.now());
    if (!state) initializeTracking(next);
    const changed = state ? System.PLAYERS.filter((definition) => {
      const id = String(next.players?.[definition.id]?.lastRoll?.id || "");
      return id && id !== lastRollIds.get(definition.id);
    }) : [];
    state = next;
    System.PLAYERS.forEach((definition) => lastRollIds.set(definition.id, String(next.players?.[definition.id]?.lastRoll?.id || "")));
    renderUi();
    changed.forEach((definition) => startRollAnimation(next.players[definition.id]));
  }

  function open(options = {}) {
    ensureRoot();
    state = System.normalizeState(options.state, Date.now());
    openOptions = { ...options };
    if (!displayedPositions.size) initializeTracking(state);
    selectedPlayerId = System.PLAYER_BY_ID[options.playerId] ? options.playerId : selectedPlayerId;
    root._lifeOnClose = typeof options.onClose === "function" ? options.onClose : null;
    root.classList.add("open");
    root.setAttribute("aria-hidden", "false");
    makeScene();
    root.querySelector("[data-life-admin]").hidden = !openOptions.isAdmin;
    renderUi();
    updateCamera(true);
    if (!frame) frame = requestAnimationFrame(animate);
  }

  function close() {
    if (!root) return;
    root.classList.remove("open");
    root.setAttribute("aria-hidden", "true");
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    rollAnimations.clear();
    diceMeshes.forEach((mesh) => { mesh.visible = false; });
    root.querySelector("[data-life-roll-call]")?.classList.remove("show");
    root._lifeOnClose?.();
  }

  global.TeamBingoLifeMode = { open, close, applySnapshot, isOpen: () => root?.classList.contains("open") === true };
})(typeof window !== "undefined" ? window : globalThis);
