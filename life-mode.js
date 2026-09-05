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
  let cameraRegion = null;
  let freeCamera = null;
  let drag = null;
  let cameraLook = null;
  let waterTexture = null;
  let openOptions = {};
  let frame = 0;
  let resizeObserver = null;
  const TRACK_REGION_CENTERS = Object.freeze([
    { x: -160, z: -50 }, { x: -80, z: -50 }, { x: 0, z: -50 }, { x: 80, z: -50 }, { x: 160, z: -50 },
    { x: 160, z: 50 }, { x: 80, z: 50 }, { x: 0, z: 50 }, { x: -80, z: 50 }, { x: -160, z: 50 }
  ]);
  // Authored routes: street blocks, lake, city steps, overpass, piers,
  // mountain switchbacks, spiral ramp, castle walls, orbit, ceremonial approach.
  const ROUTE_KNOTS = [
    [[-32,0],[-26,0],[-26,-24],[-7,-24],[-7,17],[12,17],[12,-13],[29,-13],[29,0],[36,0]],
    [[-36,0],[-25,-6],[-18,-26],[5,-31],[25,-19],[28,5],[13,25],[-9,27],[-21,14],[-8,6],[12,8],[35,0]],
    [[-36,0],[-26,0],[-26,28],[-10,28],[-10,-25],[8,-25],[8,22],[26,22],[26,-8],[36,0]],
    [[-36,0],[-24,-24,0],[-7,-23,0],[16,20,7],[28,22,7],[31,0,5],[18,-23,0],[2,-23,0],[-21,22,0],[-10,30,0],[16,30,0],[36,0]],
    [[-36,0],[-26,-18,1],[-8,-18,1],[-8,14,1],[12,14,1],[12,-28,1],[29,-28,1],[29,30,1],[5,30,1],[0,43,0]],
    [[0,-43,0],[-26,-30,2],[26,-17,4],[-26,-4,6],[26,9,8],[-22,22,10],[-25,33,9],[5,33,6],[5,21,3],[-36,0,0]],
    [[36,0],[28,-25,0],[-25,-25,1],[-25,25,3],[22,25,5],[22,-13,7],[-12,-13,9],[-12,12,10],[8,12,10],[8,0,9],[-36,0,0]],
    [[36,0],[30,-30],[-30,-30],[-30,30],[20,30],[20,-16],[-15,-16],[-15,15],[5,15],[5,0],[-36,0]],
    [[36,0],[25,-22,2],[0,-30,4],[-26,-22,6],[-30,6,8],[-13,26,10],[14,23,10],[24,4,10],[8,-12,9],[-9,-10,7],[-12,6,5],[-36,0]],
    [[36,0],[27,-27],[9,-27],[9,-8],[-9,-8],[-9,-27],[-28,-27],[-28,17],[-12,30],[9,30],[24,17],[10,9],[0,17],[-18,12],[-26,0]]
  ];
  const ROUTE_NAMES = ["街角ブロック通り", "湖畔の回廊", "摩天楼アベニュー", "スカイクロス", "南海の桟橋", "天空のつづら坂", "スパイラルラボ", "城壁の迷路", "星めぐり軌道", "六王の凱旋路"];

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
      const knots = ROUTE_KNOTS[regionIndex].map(([x,z,y = 0]) => ({x: center.x + x, y, z: center.z + z}));
      const previous = TRACK_REGION_CENTERS[regionIndex - 1];
      const next = TRACK_REGION_CENTERS[regionIndex + 1];
      if (previous) knots.unshift({x: (previous.x + center.x) / 2, y: 0, z: (previous.z + center.z) / 2});
      if (next) knots.push({x: (next.x + center.x) / 2, y: 0, z: (next.z + center.z) / 2});
      const samples = [knots[0]];
      const blend = (a,b,t) => ({x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, z:a.z+(b.z-a.z)*t});
      for (let index = 1; index < knots.length - 1; index += 1) {
        const corner = knots[index];
        const rounding = [0,2,5,7,9].includes(regionIndex) ? .09 : .3;
        const entry = blend(corner, knots[index-1], rounding);
        const exit = blend(corner, knots[index+1], rounding);
        samples.push(entry);
        for (let step = 1; step <= 16; step += 1) {
          const t = step / 16;
          samples.push(blend(blend(entry,corner,t),blend(corner,exit,t),t));
        }
      }
      samples.push(knots[knots.length-1]);
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
          <div class="life-title"><strong>六王人生すごろく</strong></div>
          <div class="life-head-actions">
            <select class="life-simple-btn life-route-select" data-life-route aria-label="エリアへ移動">${ROUTE_NAMES.map((name,index) => `<option value="${index}">${index+1}. ${name}</option>`).join("")}</select>
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
      if (player) { selectedPlayerId = player.dataset.lifePlayer; cameraSpace = null; cameraRegion = null; freeCamera = null; overview = false; renderUi(); updateCamera(true); }
      if (event.target.closest("[data-life-view]")) { freeCamera = null; overview = !overview; if (!overview) { cameraRegion = null; cameraSpace = null; } renderUi(); updateCamera(true); }
      if (event.target.closest("[data-life-history]")) showHistory();
      if (event.target.closest("[data-life-admin]")) showAdmin();
      if (event.target.closest("[data-life-drawer-close]")) closeDrawer();
      if (event.target.closest("[data-life-export]")) exportState();
      if (event.target.closest("[data-life-import-button]")) root.querySelector("[data-life-import]")?.click();
      const reset = event.target.closest("[data-life-reset]");
      if (reset) void resetState(reset.dataset.lifeReset);
    });
    root.querySelector("[data-life-import]").addEventListener("change", importState);
    root.querySelector("[data-life-route]").addEventListener("change", (event) => {
      cameraSpace = Number(event.target.value) * System.REGION_SIZE + 25;
      freeCamera = null;
      cameraRegion = Number(event.target.value);
      overview = false;
      renderUi();
      updateCamera(true);
    });
    root.addEventListener("wheel", (event) => {
      if (drag) { event.preventDefault(); return; }
      if (event.target.closest(".life-drawer, .life-status, .life-roster, .life-head")) return;
      event.preventDefault();
      freeCamera = null;
      const player = state?.players?.[selectedPlayerId];
      const delta = (event.deltaY || event.deltaX) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
      cameraSpace = Math.max(1, Math.min(System.BOARD_SIZE, (cameraSpace ?? tileNumberForPlayer(player)) + Math.max(-15, Math.min(15, delta * .035))));
      cameraRegion = null;
      overview = false;
      root.classList.remove("life-overview");
      root.classList.remove("life-tour");
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
    const tileTexture = new THREE.TextureLoader().load("images/life/tile-porcelain-v1.png");
    tileTexture.colorSpace = THREE.SRGBColorSpace || "srgb";
    tileTexture.anisotropy = Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const topGeometry = new THREE.PlaneGeometry(1.24, .94);
    topGeometry.rotateX(-Math.PI/2);
    topGeometry.rotateY(Math.PI);
    const inlays = new THREE.InstancedMesh(topGeometry, new THREE.MeshStandardMaterial({ map: tileTexture, roughness: .58, metalness: .08 }), System.BOARD_SIZE);
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
    });
    tileMesh.instanceMatrix.needsUpdate = true;
    tileMesh.instanceColor.needsUpdate = true;
    scene.add(tileMesh);
    scene.add(inlays);

    const groundTexture = new THREE.TextureLoader().load("images/territory/textures/terrain-ground-v2.png");
    groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(20, 12);
    groundTexture.colorSpace = THREE.SRGBColorSpace || "srgb";
    const groundGeometry = new THREE.PlaneGeometry(440, 260, 110, 65);
    const positions = groundGeometry.attributes.position;
    const groundColors = [];
    const palette = [0x83a569,0x80b58d,0x9eaaa6,0x839697,0xecdab0,0xaaa18a,0x8aa5a6,0x99a66e,0x77869e,0xd0bd88];
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i), z = -positions.getY(i);
      let nearest = 0, distance = Infinity;
      TRACK_REGION_CENTERS.forEach((center,index) => {
        const d = Math.hypot(x-center.x,z-center.z);
        if (d < distance) { distance = d; nearest = index; }
      });
      const tint = new THREE.Color(0,0,0);
      let totalWeight = 0;
      TRACK_REGION_CENTERS.forEach((center,index) => {
        const weight = Math.exp(-Math.pow(Math.hypot(x-center.x,z-center.z)/35,2));
        tint.add(new THREE.Color(palette[index]).multiplyScalar(weight));
        totalWeight += weight;
      });
      if (totalWeight > .00001) tint.multiplyScalar(1/totalWeight);
      else tint.setHex(palette[nearest]);
      tint.multiplyScalar(.88 + .12 * Math.sin(x*.31)*Math.cos(z*.28));
      groundColors.push(tint.r,tint.g,tint.b);
      positions.setZ(i, -.55 + Math.sin(x*.13)*Math.cos(z*.17)*.08);
    }
    groundGeometry.setAttribute("color",new THREE.Float32BufferAttribute(groundColors,3));
    groundGeometry.computeVertexNormals();
    const floor = new THREE.Mesh(groundGeometry,
      new THREE.MeshStandardMaterial({ map: groundTexture, vertexColors: true, roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
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
    waterTexture = new THREE.TextureLoader().load("images/city/textures/terrain-water.png");
    waterTexture.wrapS = waterTexture.wrapT = THREE.RepeatWrapping;
    waterTexture.repeat.set(4,4);
    waterTexture.colorSpace = THREE.SRGBColorSpace || "srgb";
    const dark = new THREE.MeshStandardMaterial({ color: 0x151b23, roughness: .72, metalness: .28 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x84909c, roughness: .82, metalness: .06 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe5bc4c, emissive: 0x6b4c09, emissiveIntensity: .42, roughness: .32, metalness: .72 });
    const green = new THREE.MeshStandardMaterial({ color: 0x3d8754, roughness: .9 });
    const trunk = new THREE.MeshStandardMaterial({ color: 0x795332, roughness: 1 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe9edf1, roughness: .64, metalness: .08 });

    function addTree(group, x, z, scale = 1) {
      sceneryMesh(group, new THREE.CylinderGeometry(.16 * scale, .24 * scale, 1.45 * scale, 7), trunk, { x, y: .72 * scale, z });
      for (let leaf=0;leaf<3;leaf++) sceneryMesh(group, new THREE.IcosahedronGeometry(.75 * scale, 1), green, { x:x+Math.sin(leaf*2.1)*.36*scale, y: (1.5+leaf*.3)*scale, z:z+Math.cos(leaf*2.1)*.3*scale });
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
      const z = index===9 ? TRACK_POINTS[999].z : center.z + (index === 0 ? 7 : index === 5 ? 8 : 0);
      const x = index===9 ? TRACK_POINTS[999].x : center.x + (index === 0 ? -18 : 0);
      const accent = new THREE.MeshStandardMaterial({
        color: region.color,
        emissive: region.color,
        emissiveIntensity: .32,
        roughness: .4,
        metalness: .35
      });
      const glow = new THREE.MeshBasicMaterial({ color: region.color, transparent: true, opacity: .5 });
      const water = new THREE.MeshStandardMaterial({map:waterTexture,color:0x99e5eb, roughness:.3, metalness:.15});
      if (index === 1 || index === 4) {
        const lake = sceneryMesh(group,new THREE.CircleGeometry(index === 1 ? 16 : 33,64),water,{x:center.x,y:-.28,z:center.z},{x:-Math.PI/2},{x:index===1?1:1.1,y:index===1?.85:1.3,z:1});
        lake.name = "life-water";
        for (let wave=0;wave<12;wave++) sceneryMesh(group,new THREE.BoxGeometry(2+wave%4,.015,.07),white,{x:center.x+Math.sin(wave*4)*12,y:-.25,z:center.z+Math.cos(wave*3)*10});
      }
      if ([3,4,5,6,8].includes(index)) {
        for (let step=1;step<100;step+=3) {
          const point=TRACK_POINTS[index*100+step];
          if (point.y < .7) continue;
          sceneryMesh(group,new THREE.CylinderGeometry(.22,.4,point.y+.3,8),stone,{x:point.x,y:(point.y-.3)/2,z:point.z});
        }
      }
      if (index===4) {
        for (let boat=0;boat<3;boat++) {
          const bx=center.x-19+boat*17, bz=center.z+23-boat*13;
          sceneryMesh(group,new THREE.SphereGeometry(1.4,16,8),white,{x:bx,y:-.1,z:bz},null,{x:1.9,y:.3,z:.65});
          sceneryMesh(group,new THREE.CylinderGeometry(.06,.06,3,8),trunk,{x:bx,y:1.4,z:bz});
          sceneryMesh(group,new THREE.ConeGeometry(1.2,2.2,3),white,{x:bx+.5,y:1.8,z:bz},{y:Math.PI/2},{x:1,y:1,z:.08});
        }
        for(let step=2;step<100;step+=2) {
          const p=TRACK_POINTS[index*100+step], q=TRACK_POINTS[index*100+step+1]||p;
          const yaw=Math.atan2(q.x-p.x,q.z-p.z);
          sceneryMesh(group,new THREE.BoxGeometry(2.1,.16,1.8),trunk,{x:p.x,y:p.y-.18,z:p.z},{y:yaw});
        }
      }
      if (index === 5) {
        for(let peak=0;peak<7;peak++) {
          const px=center.x-25+peak*8, pz=center.z+40+(peak%2)*8;
          const height=9+(peak%3)*4;
          sceneryMesh(group,new THREE.ConeGeometry(8,height,9),stone,{x:px,y:height/2-.5,z:pz});
          sceneryMesh(group,new THREE.ConeGeometry(2.5,height*.32,9),white,{x:px,y:height*.84-.5,z:pz});
        }
      }
      if (index === 7) {
        for (const side of [-1,1]) {
          sceneryMesh(group,new THREE.BoxGeometry(44,2.2,.8),stone,{x:center.x,y:1,z:center.z+side*21});
          for(let merlon=0;merlon<16;merlon++) sceneryMesh(group,new THREE.BoxGeometry(1.1,.6,1),stone,{x:center.x-21+merlon*2.8,y:2.3,z:center.z+side*21});
        }
      }
      if (index === 8) {
        sceneryMesh(group,new THREE.CircleGeometry(34,64),dark,{x:center.x,y:-.29,z:center.z},{x:-Math.PI/2});
        for (let star=0;star<55;star++) {
          const angle=star*2.399, radius=5+Math.sqrt(star/55)*28;
          sceneryMesh(group,new THREE.OctahedronGeometry(.09+(star%3)*.05),white,{x:center.x+Math.cos(angle)*radius,y:-.2,z:center.z+Math.sin(angle)*radius});
        }
      }

      for (let propIndex = 0; propIndex < 36; propIndex += 1) {
        const urban=[2,3,6].includes(index);
        const propX = center.x - 32 + (propIndex%6)*12 + (urban?0:Math.sin(propIndex*7.3)*3);
        const propZ = center.z - 34 + Math.floor(propIndex/6)*13 + (urban?0:Math.cos(propIndex*4.7)*3);
        if (TRACK_POINTS.some((tile) => Math.hypot(tile.x-propX,tile.z-propZ)<4)) continue;
        if ([4,8].includes(index)) continue;
        if (index===1 && Math.hypot(propX-center.x,propZ-center.z)<20) continue;
        const scale = 1.1 + (propIndex%3)*.25;
        if ([2,3,6].includes(index)) {
          const height=2.5+(propIndex*7%9);
          sceneryMesh(group,new THREE.BoxGeometry(2.6,height,2.8),propIndex%2?stone:dark,{x:propX,y:height/2,z:propZ});
          for(let level=1;level<height;level+=1.1) sceneryMesh(group,new THREE.BoxGeometry(2.3,.28,2.85),accent,{x:propX,y:level,z:propZ});
        } else if (propIndex%3===0 && index!==5) addHouse(group,propX,propZ,scale,accent);
        else addTree(group,propX,propZ,scale);
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
        if ([4,8].includes(index)) continue;
        if (kind === 0 && index!==5) addHouse(group, propX, propZ, .9, accent);
        else if (kind === 1 || index===5) addTree(group, propX, propZ, 1.1);
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
    bindCameraDrag();
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

  function bindCameraDrag() {
    const canvas = renderer.domElement;
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane();
    const pointer = new THREE.Vector2();
    const hit = new THREE.Vector3();
    const groundPoint = (event) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.set((event.clientX-bounds.left)/bounds.width*2-1,1-(event.clientY-bounds.top)/bounds.height*2);
      ray.setFromCamera(pointer,camera);
      return ray.ray.intersectPlane(plane,hit);
    };
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || drag) return;
      plane.set(new THREE.Vector3(0,1,0),-cameraLook.y);
      const point = groundPoint(event);
      if (!point) return;
      drag = {id:event.pointerId,x:event.clientX,y:event.clientY,anchor:point.clone(),moved:false};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<4) return;
      const point = groundPoint(event);
      if (!point) return;
      if (!freeCamera || !drag.moved) freeCamera = {position:camera.position.clone(),look:cameraLook.clone()};
      drag.moved = true;
      canvas.classList.add("life-dragging");
      const dx = Math.max(-220,Math.min(220,freeCamera.look.x+drag.anchor.x-point.x))-freeCamera.look.x;
      const dz = Math.max(-135,Math.min(135,freeCamera.look.z+drag.anchor.z-point.z))-freeCamera.look.z;
      freeCamera.position.x += dx; freeCamera.look.x += dx;
      freeCamera.position.z += dz; freeCamera.look.z += dz;
      camera.position.copy(freeCamera.position);
      cameraLook.copy(freeCamera.look);
      camera.lookAt(cameraLook);
      camera.updateMatrixWorld();
      event.preventDefault();
    });
    const end = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      drag = null;
      canvas.classList.remove("life-dragging");
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener("pointerup",end);
    canvas.addEventListener("pointercancel",end);
    canvas.addEventListener("lostpointercapture",end);
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
    const target = freeCamera || (overview
      ? { position: new THREE.Vector3(0, Math.max(290, 390 / camera.aspect), Math.max(155, 185 / camera.aspect)), look: new THREE.Vector3(0, 0, 0) }
      : cameraRegion !== null
      ? {position:new THREE.Vector3(TRACK_REGION_CENTERS[cameraRegion].x,Math.max(105,110/camera.aspect),TRACK_REGION_CENTERS[cameraRegion].z+65),look:new THREE.Vector3(TRACK_REGION_CENTERS[cameraRegion].x,0,TRACK_REGION_CENTERS[cameraRegion].z)}
      : { position: new THREE.Vector3(point.x, point.y + 18, point.z + 16), look: new THREE.Vector3(point.x, point.y, point.z) });
    if (immediate) camera.position.copy(target.position);
    else camera.position.lerp(target.position, .08);
    if (immediate) cameraLook.copy(target.look);
    else cameraLook.lerp(target.look, .08);
    camera.lookAt(cameraLook);
    const regionIndex = Math.min(9,Math.floor((number-1)/System.REGION_SIZE));
    const label = freeCamera ? "マップ探索中" : `${regionIndex+1} / ${ROUTE_NAMES[regionIndex]} / ${Math.round(number)} - 1000`;
    const chip = root.querySelector("[data-life-region]");
    if (chip.textContent !== label) chip.textContent = label;
    const select = root.querySelector("[data-life-route]");
    if (select.value !== String(regionIndex)) select.value = String(regionIndex);
  }

  function animate() {
    if (!root?.classList.contains("open") || !renderer) { frame = 0; return; }
    const time = performance.now() * .001;
    if (waterTexture) waterTexture.offset.set(time*.003,time*.001);
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
        <img src="${AVATAR_URLS[definition.id]}" alt="" /><div class="life-player-info"><b>${escapeHtml(definition.name)}</b><small>${escapeHtml(player?.job?.name || "-")}</small><div class="life-player-cash"><small>所持金</small><strong>${money(player?.cash)}</strong></div><div class="life-player-position">現在位置 ${Number(player?.position) || 0} / 1000 マス</div></div>
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
    root.classList.toggle("life-tour", cameraRegion !== null);
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
    if (drag && renderer?.domElement.hasPointerCapture(drag.id)) renderer.domElement.releasePointerCapture(drag.id);
    drag = null;
    renderer?.domElement.classList.remove("life-dragging");
    rollAnimations.clear();
    diceMeshes.forEach((mesh) => { mesh.visible = false; });
    root.querySelector("[data-life-roll-call]")?.classList.remove("show");
    root._lifeOnClose?.();
  }

  global.TeamBingoLifeMode = { open, close, applySnapshot, isOpen: () => root?.classList.contains("open") === true };
})(typeof window !== "undefined" ? window : globalThis);
