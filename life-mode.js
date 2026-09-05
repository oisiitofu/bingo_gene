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
  let cameraSpace = null;
  let cameraLook = null;
  let openOptions = {};
  let frame = 0;
  let resizeObserver = null;
  const TRACK_REGION_CENTERS = Object.freeze([
    { x: -225, z: -12 }, { x: -175, z: -34 }, { x: -125, z: 8 }, { x: -75, z: -29 }, { x: -25, z: 2 },
    { x: 25, z: 31 }, { x: 75, z: -8 }, { x: 125, z: 28 }, { x: 175, z: -23 }, { x: 225, z: 10 }
  ]);

  function resampleTrackSegment(samples, count) {
    const lengths = [0];
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      lengths.push(lengths[index - 1] + Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z));
    }
    const total = lengths[lengths.length - 1];
    const result = [];
    let cursor = 1;
    for (let index = 0; index < count; index += 1) {
      const target = total * ((index + .5) / count);
      while (cursor < lengths.length - 1 && lengths[cursor] < target) cursor += 1;
      const previousLength = lengths[cursor - 1];
      const interval = Math.max(.0001, lengths[cursor] - previousLength);
      const mix = (target - previousLength) / interval;
      const previous = samples[cursor - 1];
      const current = samples[cursor];
      result.push({
        x: previous.x + (current.x - previous.x) * mix,
        y: previous.y + (current.y - previous.y) * mix,
        z: previous.z + (current.z - previous.z) * mix
      });
    }
    return result;
  }

  function buildTrackPoints() {
    const points = [];
    TRACK_REGION_CENTERS.forEach((center, regionIndex) => {
      const previousCenter = TRACK_REGION_CENTERS[regionIndex - 1] || {
        x: center.x - (TRACK_REGION_CENTERS[1].x - center.x),
        z: center.z - (TRACK_REGION_CENTERS[1].z - center.z)
      };
      const nextCenter = TRACK_REGION_CENTERS[regionIndex + 1] || {
        x: center.x + (center.x - TRACK_REGION_CENTERS[regionIndex - 1].x),
        z: center.z + (center.z - TRACK_REGION_CENTERS[regionIndex - 1].z)
      };
      const start = { x: (previousCenter.x + center.x) / 2, z: (previousCenter.z + center.z) / 2 };
      const end = { x: (center.x + nextCenter.x) / 2, z: (center.z + nextCenter.z) / 2 };
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const distance = Math.max(1, Math.hypot(dx, dz));
      const normalX = -dz / distance;
      const normalZ = dx / distance;
      const waves = 2 + (regionIndex % 3);
      const amplitude = waves === 2 ? 21 : (waves === 3 ? 15 : 11);
      const samples = [];
      for (let step = 0; step <= 800; step += 1) {
        const t = step / 800;
        const envelope = Math.sin(Math.PI * t);
        const wave = envelope * (
          Math.sin(t * Math.PI * 2 * waves + regionIndex * .72) * amplitude +
          Math.cos(t * Math.PI) * (regionIndex % 2 ? 5 : -5)
        );
        const hill = envelope * ([0, .25, .45, .2, .7, 2.15, .35, .65, .3, 1.1][regionIndex] || 0);
        samples.push({
          x: start.x + dx * t + normalX * wave,
          y: hill + Math.sin(t * Math.PI * 4 + regionIndex) * .08,
          z: start.z + dz * t + normalZ * wave
        });
      }
      points.push(...resampleTrackSegment(samples, System.REGION_SIZE));
    });
    return Object.freeze(points);
  }

  const TRACK_POINTS = buildTrackPoints();

  function money(value) {
    const amount = Number(value) || 0;
    return `${amount < 0 ? "-" : ""}¥${Math.abs(amount).toLocaleString("ja-JP")}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  }

  function tilePosition(number) {
    const index = Math.max(0, Math.min(System.BOARD_SIZE - 1, Number(number) - 1));
    return TRACK_POINTS[index];
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
      if (player) { selectedPlayerId = player.dataset.lifePlayer; cameraSpace = null; overview = false; renderUi(); updateCamera(true); }
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
    root.addEventListener("wheel", (event) => {
      if (event.target.closest(".life-drawer, .life-status, .life-roster")) return;
      event.preventDefault();
      const player = state?.players?.[selectedPlayerId];
      const delta = (event.deltaY || event.deltaX) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
      cameraSpace = Math.max(1, Math.min(System.BOARD_SIZE, (cameraSpace ?? tileNumberForPlayer(player)) + Math.max(-15, Math.min(15, delta * .035))));
      overview = false;
      root.classList.remove("life-overview");
      root.querySelector("[data-life-view]").textContent = "OVERVIEW";
      root.querySelector("[data-life-view]").classList.remove("active");
    }, { passive: false });
    return root;
  }

  function makeTrack() {
    const roadCurve = new THREE.CatmullRomCurve3(TRACK_POINTS.map((point) => new THREE.Vector3(point.x, point.y - .78, point.z)));
    const road = new THREE.Mesh(
      new THREE.TubeGeometry(roadCurve, System.BOARD_SIZE, .82, 4, false),
      new THREE.MeshStandardMaterial({ color: 0x222933, roughness: .8, metalness: .12 })
    );
    scene.add(road);

    const geometry = new THREE.BoxGeometry(1.34, 0.28, 1.02);
    const material = new THREE.MeshStandardMaterial({ roughness: .72, metalness: .04 });
    tileMesh = new THREE.InstancedMesh(geometry, material, System.BOARD_SIZE);
    const inlays = new THREE.InstancedMesh(new THREE.BoxGeometry(1.18, .025, .86), new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: .38, metalness: .12 }), System.BOARD_SIZE);
    const marks = new THREE.InstancedMesh(new THREE.BoxGeometry(.12, .03, .48), material, System.BOARD_SIZE);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    System.BOARD.forEach((space, index) => {
      const point = tilePosition(space.number);
      const before = tilePosition(Math.max(1, space.number - 1));
      const after = tilePosition(Math.min(System.BOARD_SIZE, space.number + 1));
      const yaw = Math.atan2(after.x - before.x, after.z - before.z);
      quaternion.setFromAxisAngle(up, yaw);
      const height = space.checkpoint ? 0.72 : 0.28;
      matrix.compose(
        new THREE.Vector3(point.x, point.y + height / 2, point.z),
        quaternion,
        new THREE.Vector3(space.checkpoint ? 1.28 : 1, height / 0.28, space.checkpoint ? 1.18 : 1)
      );
      tileMesh.setMatrixAt(index, matrix);
      color.setHex(CATEGORY_COLORS[space.category] || 0x777777);
      color.lerp(new THREE.Color(System.REGIONS[space.regionIndex].color), 0.22);
      tileMesh.setColorAt(index, color);
      matrix.compose(new THREE.Vector3(point.x, point.y + height + .013, point.z), quaternion, new THREE.Vector3(space.checkpoint ? 1.28 : 1, 1, space.checkpoint ? 1.18 : 1));
      inlays.setMatrixAt(index, matrix);
      matrix.compose(new THREE.Vector3(point.x, point.y + height + .04, point.z), quaternion, new THREE.Vector3(1, 1, 1));
      marks.setMatrixAt(index, matrix);
      marks.setColorAt(index, color);
    });
    tileMesh.instanceMatrix.needsUpdate = true;
    tileMesh.instanceColor.needsUpdate = true;
    scene.add(tileMesh);
    scene.add(inlays, marks);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 170),
      new THREE.MeshStandardMaterial({ color: 0x26352d, roughness: 1, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.34, 0);
    scene.add(floor);

    System.REGIONS.forEach((region, index) => {
      const band = new THREE.Mesh(
        new THREE.CircleGeometry(32, 36),
        new THREE.MeshBasicMaterial({ color: region.color, transparent: true, opacity: 0.065, side: THREE.DoubleSide })
      );
      band.rotation.x = -Math.PI / 2;
      band.position.set(TRACK_REGION_CENTERS[index].x, -0.3, TRACK_REGION_CENTERS[index].z);
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
    const white = new THREE.MeshStandardMaterial({ color: 0xe9edf1, roughness: .64, metalness: .08 });

    function addTree(group, x, z, scale = 1) {
      sceneryMesh(group, new THREE.CylinderGeometry(.16 * scale, .24 * scale, 1.45 * scale, 7), trunk, { x, y: .72 * scale, z });
      sceneryMesh(group, new THREE.ConeGeometry(.72 * scale, 1.85 * scale, 8), green, { x, y: 1.9 * scale, z });
    }

    function addHouse(group, x, z, scale, accent) {
      sceneryMesh(group, new THREE.BoxGeometry(1.7 * scale, 1.35 * scale, 1.45 * scale), white, { x, y: .68 * scale, z });
      sceneryMesh(group, new THREE.ConeGeometry(1.35 * scale, .9 * scale, 4), accent, { x, y: 1.78 * scale, z }, { y: Math.PI / 4 });
      sceneryMesh(group, new THREE.BoxGeometry(.42 * scale, .72 * scale, .12), dark, { x, y: .36 * scale, z: z - .79 * scale });
      [-.57, .57].forEach((offset) => {
        sceneryMesh(group, new THREE.BoxGeometry(.4 * scale, .48 * scale, .1), dark, { x: x + offset * scale, y: .85 * scale, z: z - .76 * scale });
        sceneryMesh(group, new THREE.BoxGeometry(.025, .48 * scale, .13), white, { x: x + offset * scale, y: .85 * scale, z: z - .78 * scale });
      });
      sceneryMesh(group, new THREE.BoxGeometry(1.9 * scale, .16, 1.65 * scale), stone, { x, y: .02, z });
      sceneryMesh(group, new THREE.BoxGeometry(.23 * scale, .7 * scale, .25 * scale), stone, { x: x + .45 * scale, y: 1.95 * scale, z: z + .25 * scale });
    }

    function addCar(group, x, z, scale, accent, rotation) {
      const car = new THREE.Group();
      car.position.set(x, 0, z);
      car.rotation.y = rotation;
      car.scale.setScalar(scale);
      group.add(car);
      sceneryMesh(car, new THREE.BoxGeometry(1.7, .38, .86), accent, { x: 0, y: .4, z: 0 });
      sceneryMesh(car, new THREE.BoxGeometry(.8, .34, .7), dark, { x: -.08, y: .74, z: 0 });
      sceneryMesh(car, new THREE.BoxGeometry(.86, .07, .74), accent, { x: -.08, y: .94, z: 0 });
      for (const axle of [-.54, .54]) for (const side of [-.45, .45]) {
        sceneryMesh(car, new THREE.CylinderGeometry(.23, .23, .15, 16), dark, { x: axle, y: .24, z: side }, { x: Math.PI / 2 });
        sceneryMesh(car, new THREE.CylinderGeometry(.12, .12, .16, 12), stone, { x: axle, y: .24, z: side }, { x: Math.PI / 2 });
      }
      for (const side of [-.28, .28]) sceneryMesh(car, new THREE.BoxGeometry(.04, .12, .2), white, { x: .87, y: .48, z: side });
    }

    function addLamp(group, x, z, scale, accent) {
      sceneryMesh(group, new THREE.CylinderGeometry(.08 * scale, .12 * scale, 2.1 * scale, 8), dark, { x, y: 1.05 * scale, z });
      sceneryMesh(group, new THREE.SphereGeometry(.24 * scale, 10, 8), accent, { x, y: 2.2 * scale, z });
    }

    function addCoin(group, x, z, scale) {
      sceneryMesh(group, new THREE.CylinderGeometry(.55 * scale, .55 * scale, .14 * scale, 18), gold, { x, y: 1.05 * scale, z }, { x: Math.PI / 2 });
      sceneryMesh(group, new THREE.CylinderGeometry(.06 * scale, .09 * scale, 1.3 * scale, 7), dark, { x, y: .4 * scale, z });
    }

    System.REGIONS.forEach((region, index) => {
      const group = new THREE.Group();
      group.name = `life-region-${region.id}`;
      const center = TRACK_REGION_CENTERS[index];
      const z = center.z;
      const side = index % 2 ? 1 : -1;
      const x = center.x + side * 25;
      const accent = new THREE.MeshStandardMaterial({
        color: region.color,
        emissive: region.color,
        emissiveIntensity: .32,
        roughness: .4,
        metalness: .35
      });
      const glow = new THREE.MeshBasicMaterial({ color: region.color, transparent: true, opacity: .5 });
      sceneryMesh(group, new THREE.CylinderGeometry(4.1, 4.5, .48, 20), dark, { x, y: .06, z });
      sceneryMesh(group, new THREE.TorusGeometry(28, .09, 5, 64), glow, { x: center.x, y: .02, z }, { x: Math.PI / 2 });

      for (let propIndex = 0; propIndex < 10; propIndex += 1) {
        const angle = (Math.PI * 2 * propIndex) / 10 + index * .41;
        const radius = 25 + ((propIndex * 7 + index * 3) % 7);
        const propX = center.x + Math.cos(angle) * radius;
        const propZ = center.z + Math.sin(angle) * radius;
        const scale = .72 + ((propIndex + index) % 4) * .1;
        const kind = (propIndex + index * 2) % 5;
        if (kind === 0) addTree(group, propX, propZ, scale);
        else if (kind === 1) addHouse(group, propX, propZ, scale, accent);
        else if (kind === 2) addCar(group, propX, propZ, scale, accent, angle + Math.PI / 2);
        else if (kind === 3) addLamp(group, propX, propZ, scale, accent);
        else addCoin(group, propX, propZ, scale);
      }

      for (let step = 4; step < 100; step += 8) {
        const pointIndex = index * 100 + step;
        const point = TRACK_POINTS[pointIndex];
        const next = TRACK_POINTS[pointIndex + 1] || point;
        const angle = Math.atan2(next.z - point.z, next.x - point.x) + Math.PI / 2;
        const direction = step % 16 < 8 ? 1 : -1;
        const propX = point.x + Math.cos(angle) * direction * 4.5;
        const propZ = point.z + Math.sin(angle) * direction * 4.5;
        if (TRACK_POINTS.some((tile) => Math.hypot(tile.x - propX, tile.z - propZ) < 2.8)) continue;
        const kind = (Math.floor(step / 8) + index) % 4;
        if (kind === 0) addHouse(group, propX, propZ, .9, accent);
        else if (kind === 1) addTree(group, propX, propZ, 1.1);
        else if (kind === 2) addCar(group, propX, propZ, .85, accent, -angle);
        else addLamp(group, propX, propZ, 1, gold);
      }

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
    cameraLook = new THREE.Vector3();
    scene.background = new THREE.Color(0x0c1119);
    scene.fog = new THREE.Fog(0x0c1119, 550, 1200);
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 900);
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
        sprite.scale.set(2.15, 2.15, 1);
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
        const spread = ids.length > 1 ? 1.45 : 0;
        sprite.position.set(point.x + Math.cos(angle) * spread, point.y + 1.45, point.z + Math.sin(angle) * spread);
        const size = ids.length > 2 ? (id === selectedPlayerId ? 1.95 : 1.55) : (id === selectedPlayerId ? 2.55 : 2.15);
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
    const number = cameraSpace ?? tileNumberForPlayer(selected);
    const first = tilePosition(Math.floor(number));
    const second = tilePosition(Math.min(System.BOARD_SIZE, Math.floor(number) + 1));
    const mix = number % 1;
    const point = { x: first.x + (second.x - first.x) * mix, y: first.y + (second.y - first.y) * mix, z: first.z + (second.z - first.z) * mix };
    const target = overview
      ? { position: new THREE.Vector3(0, Math.max(400, 430 / camera.aspect), Math.max(250, 270 / camera.aspect)), look: new THREE.Vector3(0, 0, 0) }
      : { position: new THREE.Vector3(point.x, point.y + 18, point.z + 16), look: new THREE.Vector3(point.x, point.y, point.z) };
    if (immediate) camera.position.copy(target.position);
    else camera.position.lerp(target.position, .08);
    if (immediate) cameraLook.copy(target.look);
    else cameraLook.lerp(target.look, .08);
    camera.lookAt(cameraLook);
  }

  function animate() {
    if (!root?.classList.contains("open") || !renderer) { frame = 0; return; }
    const time = performance.now() * .001;
    playerSprites.forEach((sprite, id) => {
      if (rollAnimations.has(id)) return;
      const player = state.players?.[id];
      const point = tilePosition(displayedPositions.get(id) || tileNumberForPlayer(player));
      sprite.position.y = point.y + 1.45 + Math.sin(time * 2.4 + System.hash32(id)) * .06;
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
          from.y + (to.y - from.y) * fraction + 1.45 + Math.sin(fraction * Math.PI) * .8,
          from.z + (to.z - from.z) * fraction
        );
      }
      if (dieMesh) {
        dieMesh.visible = progress < rollPart;
        dieMesh.position.set(from.x, from.y + 2.6 + Math.sin(progress * Math.PI / rollPart) * 1.6, from.z);
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
    root.classList.toggle("life-overview", overview);
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
