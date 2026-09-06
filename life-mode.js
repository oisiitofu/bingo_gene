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
  const SPACE_EFFECTS = {
    money: ["人生イベント", "ボーナス・出費・税金など、暮らしの出来事で所持金が増減します。内容と金額は止まったときに決まります。"],
    job: ["仕事", "新しい職業からスカウトが届きます。現在の仕事やプレイヤーの方針に応じて、自動で転職するか判断します。"],
    property: ["不動産", "物件の購入や、所有物件からの臨時収入が発生します。資金が足りない場合は内見費用がかかります。"],
    stock: ["株式", "株価・所持金・投資方針に応じて株を自動で売買します。今回は売買せず見送ることもあります。"],
    monster: ["モンスター育成", "手持ちモンスターへの経験値を30～120獲得します。連携報酬として処理されます。"],
    equipment: ["装備", "装備ガチャを1回獲得します。連携報酬として処理されます。"],
    city: ["都市支援", "BINGO CITYの都市資金を3,000～12,000円獲得します。すごろくの所持金とは別の報酬です。"],
    territory: ["領土戦支援", "負傷したモンスターの待機時間を30～120分短縮し、守備隊を回復する連携報酬を獲得します。"],
    tower: ["塔の休息", "TOWERの休養時間を30～120分短縮し、登頂部隊を回復する連携報酬を獲得します。"],
    interaction: ["プレイヤー交流", "他のプレイヤーと40,000～180,000円のやり取りが発生します。受け取るか支払うかはランダムです。"],
    risk: ["大勝負", "120,000～600,000円を賭けて勝負します。勝つと賭け金の1.4倍を獲得し、負けると賭け金を失います。"],
    checkpoint: ["チェックポイント", "100マスごとの通過報酬です。所持金から借金を引いた金額に応じて、装備ガチャを1～8回獲得します。報酬獲得で所持金は消費しません。"]
  };
  const tileArt = (category) => `images/life/tiles/${category}.png`;
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
        <aside class="life-space-detail" data-life-space hidden aria-label="マスの効果" aria-live="polite"></aside>
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
      if (event.target.closest("[data-life-space-close]")) root.querySelector("[data-life-space]").hidden = true;
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
      if (event.target.closest(".life-drawer, .life-status, .life-roster, .life-head, .life-space-detail")) return;
      event.preventDefault();
      if (!camera) return;
      const delta = (event.deltaY || event.deltaX) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
      camera.zoom = Math.max(.25, Math.min(5, camera.zoom * Math.exp(-Math.max(-250, Math.min(250, delta)) * .002)));
      camera.updateProjectionMatrix();
    }, { passive: false });
    return root;
  }

  function makeTrack() {
    System.REGIONS.forEach((region,index)=>{
      const points=TRACK_POINTS.slice(index*100,index*100+100);
      const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2});
      if(index>0)points.unshift(midpoint(TRACK_POINTS[index*100-1],points[0]));
      if(index<9)points.push(midpoint(points[points.length-1],TRACK_POINTS[index*100+100]));
      const texture=new THREE.TextureLoader().load(`images/life/roads/${region.theme}.png`);
      texture.colorSpace=THREE.SRGBColorSpace||"srgb";
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      scene.add(new THREE.Mesh(makeRoadGeometry(points),new THREE.MeshStandardMaterial({map:texture,roughness:.86,metalness:.03,side:THREE.DoubleSide})));
    });

    const geometry = makeTileBodyGeometry();
    const edgeTexture = new THREE.TextureLoader().load("images/life/tile-silver-edge-v1.png");
    edgeTexture.colorSpace = THREE.SRGBColorSpace || "srgb";
    edgeTexture.anisotropy = Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const material = new THREE.MeshStandardMaterial({ map: edgeTexture, color: 0xd0d2d4, roughness: .46, metalness: .48 });
    tileMesh = new THREE.InstancedMesh(geometry, material, System.BOARD_SIZE);
    const topGeometry = new THREE.PlaneGeometry(1.24, .94);
    topGeometry.rotateX(-Math.PI/2);
    topGeometry.rotateY(Math.PI);
    const surfaces = {};
    Object.keys(SPACE_EFFECTS).forEach((category) => {
      const texture = new THREE.TextureLoader().load(tileArt(category));
      texture.colorSpace = THREE.SRGBColorSpace || "srgb";
      texture.anisotropy = Math.min(8,renderer.capabilities.getMaxAnisotropy());
      const count = System.BOARD.filter(space=>space.category===category).length;
      const mesh = new THREE.InstancedMesh(topGeometry,new THREE.MeshStandardMaterial({map:texture,roughness:.58,metalness:.08}),count);
      surfaces[category] = {mesh,next:0};
      scene.add(mesh);
    });
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    System.BOARD.forEach((space, index) => {
      const point = tilePosition(space.number);
      const before = tilePosition(Math.max(1, space.number - 1));
      const after = tilePosition(Math.min(System.BOARD_SIZE, space.number + 1));
      const yaw = Math.atan2(after.x - before.x, after.z - before.z);
      quaternion.setFromAxisAngle(up, yaw);
      const height = space.checkpoint ? 0.38 : 0.24;
      matrix.compose(
        new THREE.Vector3(point.x, point.y, point.z),
        quaternion,
        new THREE.Vector3(space.checkpoint ? 1.28 : 1, height / 0.24, space.checkpoint ? 1.18 : 1)
      );
      tileMesh.setMatrixAt(index, matrix);
      tileMesh.setColorAt(index,new THREE.Color(CATEGORY_COLORS[space.category]).lerp(new THREE.Color(0xffffff),.22));
      matrix.compose(new THREE.Vector3(point.x, point.y + height + .002, point.z), quaternion, new THREE.Vector3(space.checkpoint ? 1.28 : 1, 1, space.checkpoint ? 1.18 : 1));
      const surface = surfaces[space.category];
      surface.mesh.setMatrixAt(surface.next++, matrix);
    });
    tileMesh.instanceMatrix.needsUpdate = true;
    tileMesh.instanceColor.needsUpdate = true;
    scene.add(tileMesh);

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
    makeRegionFloors();
    makeRegionScenery();
  }

  function makeRegionFloors() {
    const surfaces = [
      ["images/life/scenery/paving.png",0xf0e3d2,7],
      ["images/city/textures/ground-grass-soil.png",0xb9d8a0,8],
      ["images/life/roads/business.png",0xd7ddd9,8],
      ["images/city/textures/road-asphalt.png",0xb5c0c9,9],
      ["images/life/terrain/sand.png",0xffecc7,7],
      ["images/life/terrain/alpine.png",0xc6c9b9,7],
      ["images/life/scenery/ceramic.png",0xc4e5e7,10],
      ["images/life/roads/kingdom.png",0xe0ceb2,8],
      ["images/life/terrain/lunar.png",0xcbd3e3,7],
      ["images/life/terrain/plaza.png",0xf3eee1,7]
    ];
    TRACK_REGION_CENTERS.forEach((center,index) => {
      const [path,color,repeat]=surfaces[index];
      const texture=new THREE.TextureLoader().load(path);
      texture.colorSpace=THREE.SRGBColorSpace||"srgb";
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      texture.repeat.set(repeat,repeat*1.4);
      texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      const geometry=new THREE.PlaneGeometry(100,150,50,75);
      const positions=geometry.attributes.position;
      const alpha=[];
      for(let vertex=0;vertex<positions.count;vertex++) {
        const px=positions.getX(vertex),pz=-positions.getY(vertex);
        const x=center.x+px,z=center.z+pz;
        const border=Math.min(50-Math.abs(px),75-Math.abs(pz));
        const blend=Math.max(0,Math.min(1,(border-2+Math.sin(x*.17)*Math.sin(z*.13)*2)/18));
        alpha.push(blend*blend*(3-2*blend));
        positions.setZ(vertex,-.43+Math.sin(x*.13)*Math.cos(z*.17)*.08);
      }
      geometry.setAttribute("terrainOpacity",new THREE.Float32BufferAttribute(alpha,1));
      geometry.computeVertexNormals();
      const material=new THREE.MeshStandardMaterial({map:texture,color,roughness:.94,transparent:true,depthWrite:false});
      // Feather regional materials over the shared terrain without coplanar depth writes.
      material.onBeforeCompile=shader=>{
        shader.vertexShader="attribute float terrainOpacity; varying float vTerrainOpacity;\n"+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nvTerrainOpacity=terrainOpacity;");
        shader.fragmentShader="varying float vTerrainOpacity;\n"+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace("#include <color_fragment>","#include <color_fragment>\ndiffuseColor.a *= vTerrainOpacity;");
      };
      const mesh=new THREE.Mesh(geometry,material);
      mesh.name=`life-floor-${System.REGIONS[index].theme}`;
      mesh.rotation.x=-Math.PI/2;
      mesh.position.set(center.x,0,center.z);
      mesh.renderOrder=index;
      scene.add(mesh);
    });
  }

  function makeTileBodyGeometry() {
    // Matching top footprint and bevel rings keep the printed silver rim flush.
    const rings = [[1.24,.94,0],[1.34,1.04,.035],[1.34,1.04,.205],[1.24,.94,.24]];
    const corners = rings.map(([w,d,y])=>[[-w/2,y,-d/2],[-w/2,y,d/2],[w/2,y,d/2],[w/2,y,-d/2]]);
    const positions=[],uvs=[];
    const quad=(vertices,uv)=>{
      for(const index of [0,1,2,0,2,3]) {positions.push(...vertices[index]);uvs.push(...uv[index]);}
    };
    for(let band=0;band<3;band++) for(let side=0;side<4;side++) {
      const next=(side+1)%4;
      quad([corners[band][side],corners[band][next],corners[band+1][next],corners[band+1][side]],
        [[0,rings[band][2]/.24],[1,rings[band][2]/.24],[1,rings[band+1][2]/.24],[0,rings[band+1][2]/.24]]);
    }
    quad(corners[3],[[0,0],[0,1],[1,1],[1,0]]);
    quad([...corners[0]].reverse(),[[0,0],[0,1],[1,1],[1,0]]);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
    geometry.computeVertexNormals();
    return geometry;
  }

  function makeRoadGeometry(points) {
    const vertices=[],uvs=[],indices=[];
    let distance=0;
    points.forEach((point,index)=>{
      const before=points[Math.max(0,index-1)],after=points[Math.min(points.length-1,index+1)];
      const length=Math.hypot(after.x-before.x,after.z-before.z)||1;
      const nx=-(after.z-before.z)/length,nz=(after.x-before.x)/length;
      if(index) distance+=Math.hypot(point.x-before.x,point.y-before.y,point.z-before.z);
      for(const [side,height,u] of [[-1,-.38,0],[-1,-.10,.1],[1,-.10,.9],[1,-.38,1]]) {
        vertices.push(point.x+nx*side*1.04,point.y+height,point.z+nz*side*1.04);
        uvs.push(u,distance/3);
      }
      if(index) for(let strip=0;strip<3;strip++) {
        const a=(index-1)*4+strip,b=index*4+strip;
        indices.push(a,b,b+1,a,b+1,a+1);
      }
    });
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function sceneryMesh(group, geometry, material, position, rotation = null, scale = null) {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(position.x, position.y, position.z);
    if (rotation) item.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
    if (scale) item.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);
    group.add(item);
    return item;
  }

  function batchStaticScenery(group) {
    group.updateMatrixWorld(true);
    const batches = new Map();
    const originals = new Set();
    const inverse = group.matrixWorld.clone().invert();
    group.traverse(object => {
      if (!object.isMesh) return;
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
      if (!batches.has(object.material)) batches.set(object.material, []);
      batches.get(object.material).push(geometry);
      originals.add(object.geometry);
    });
    group.clear();
    // Bake static details by material, keeping draw calls independent of window/branch count.
    for (const [material, geometries] of batches) {
      const merged = new THREE.BufferGeometry();
      for (const [name, size] of [["position", 3], ["normal", 3], ["uv", 2]]) {
        const count = geometries.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
        const array = new Float32Array(count * size);
        let offset = 0;
        for (const geometry of geometries) {
          const attribute = geometry.getAttribute(name);
          if (attribute) array.set(attribute.array, offset);
          offset += geometry.attributes.position.count * size;
        }
        merged.setAttribute(name, new THREE.BufferAttribute(array, size));
      }
      merged.computeBoundingSphere();
      group.add(new THREE.Mesh(merged, material));
      geometries.forEach(geometry => geometry.dispose());
    }
    originals.forEach(geometry => geometry.dispose());
  }

  function makeRegionScenery() {
    const materialFrom = (name,color,roughness=.82,metalness=0) => {
      const map=new THREE.TextureLoader().load(`images/life/scenery/${name}.png`);
      map.colorSpace=THREE.SRGBColorSpace||"srgb";
      map.wrapS=map.wrapT=THREE.RepeatWrapping;
      map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      return new THREE.MeshStandardMaterial({map,color,roughness,metalness});
    };
    waterTexture = new THREE.TextureLoader().load("images/city/textures/terrain-water.png");
    waterTexture.wrapS = waterTexture.wrapT = THREE.RepeatWrapping;
    waterTexture.repeat.set(4,4);
    waterTexture.colorSpace = THREE.SRGBColorSpace || "srgb";
    const dark = new THREE.MeshStandardMaterial({ color: 0x151b23, roughness: .72, metalness: .28 });
    const stone = materialFrom("masonry",0xd2d1c9);
    const plaster = materialFrom("stucco",0xf0e9db);
    const slate = materialFrom("roof",0x9caebc,.68,.1);
    const facade = materialFrom("glass",0xc5e3e8,.32,.35);
    const windowGlass = new THREE.MeshStandardMaterial({color:0x29495e,roughness:.22,metalness:.48});
    const gold = new THREE.MeshStandardMaterial({ color: 0xe5bc4c, emissive: 0x6b4c09, emissiveIntensity: .42, roughness: .32, metalness: .72 });
    const green = materialFrom("foliage",0xb4d18f,.95);
    const trunk = materialFrom("bark",0xd1b395,1);
    const white = new THREE.MeshStandardMaterial({ color: 0xe9edf1, roughness: .64, metalness: .08 });

    function addTree(group, x, z, scale = 1) {
      sceneryMesh(group, new THREE.CylinderGeometry(.10 * scale, .23 * scale, 2.1 * scale, 12), trunk, { x, y: 1.05 * scale, z });
      for (let leaf=0;leaf<5;leaf++) {
        const angle=leaf*2.399+x*.1;
        const dx=Math.sin(angle)*.56*scale,dz=Math.cos(angle)*.56*scale;
        const branch=sceneryMesh(group,new THREE.CylinderGeometry(.045*scale,.085*scale,.9*scale,7),trunk,{x:x+dx*.5,y:1.55*scale,z:z+dz*.5});
        branch.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(dx,.6*scale,dz).normalize());
        sceneryMesh(group,new THREE.IcosahedronGeometry((.60+leaf%2*.12)*scale,2),green,{x:x+dx,y:(1.85+leaf*.12)*scale,z:z+dz},null,{x:1,y:.87,z:1});
      }
    }

    function addWindow(group,x,y,z,yaw=0) {
      const window=new THREE.Group();window.position.set(x,y,z);window.rotation.y=yaw;group.add(window);
      sceneryMesh(window,new THREE.BoxGeometry(.5,.58,.09),white,{x:0,y:0,z:0});
      sceneryMesh(window,new THREE.BoxGeometry(.39,.46,.10),windowGlass,{x:0,y:0,z:.018});
      sceneryMesh(window,new THREE.BoxGeometry(.035,.47,.13),white,{x:0,y:0,z:.035});
      sceneryMesh(window,new THREE.BoxGeometry(.4,.035,.13),white,{x:0,y:0,z:.035});
      sceneryMesh(window,new THREE.BoxGeometry(.59,.08,.2),stone,{x:0,y:-.31,z:.06});
    }

    function addHouse(group, x, z, scale, accent) {
      const house=new THREE.Group();house.position.set(x,0,z);house.scale.setScalar(scale);group.add(house);
      sceneryMesh(house,new THREE.BoxGeometry(2.16,.16,1.98),stone,{x:0,y:.08,z:0});
      sceneryMesh(house,new THREE.BoxGeometry(1.9,1.45,1.7),plaster,{x:0,y:.88,z:0});
      const roofShape=new THREE.Shape();roofShape.moveTo(-1.1,0);roofShape.lineTo(0,.78);roofShape.lineTo(1.1,0);roofShape.closePath();
      sceneryMesh(house,new THREE.ExtrudeGeometry(roofShape,{depth:2,bevelEnabled:true,bevelSize:.035,bevelThickness:.025,bevelSegments:2,steps:1}),slate,{x:0,y:1.6,z:-1});
      for(const side of [-1,1]) {
        sceneryMesh(house,new THREE.BoxGeometry(.08,.1,2.06),white,{x:side*1.06,y:1.59,z:0});
        addWindow(house,side*.57,.95,.87);
        addWindow(house,side*.57,.95,-.87,Math.PI);
        addWindow(house,side*.97,.95,0,side*Math.PI/2);
      }
      sceneryMesh(house,new THREE.BoxGeometry(.39,.85,.13),accent,{x:0,y:.59,z:.9});
      sceneryMesh(house,new THREE.SphereGeometry(.035,8,6),gold,{x:.12,y:.59,z:.98});
      sceneryMesh(house,new THREE.BoxGeometry(.66,.10,.55),stone,{x:0,y:.16,z:1.08});
      sceneryMesh(house,new THREE.BoxGeometry(.72,.10,.49),slate,{x:0,y:1.13,z:1.08},{x:.13});
      sceneryMesh(house,new THREE.BoxGeometry(.27,.88,.30),stone,{x:.56,y:2.05,z:-.35});
      sceneryMesh(house,new THREE.BoxGeometry(.37,.09,.40),dark,{x:.56,y:2.52,z:-.35});
    }

    function addOffice(group,x,z,height,width=2.6) {
      const body=new THREE.BoxGeometry(width,height,width);
      const uv=body.attributes.uv;
      for(let i=0;i<uv.count;i++)if(i<8||i>=16)uv.setY(i,uv.getY(i)*height/2.2);
      sceneryMesh(group,body,facade,{x,y:height/2+.3,z});
      sceneryMesh(group,new THREE.BoxGeometry(width+.5,.35,width+.5),stone,{x,y:.16,z});
      sceneryMesh(group,new THREE.BoxGeometry(width+.15,.15,width+.15),white,{x,y:height+.34,z});
      for(const side of [-1,1])sceneryMesh(group,new THREE.BoxGeometry(.12,height+.2,.12),white,{x:x+side*width/2,y:height/2+.3,z:z+width/2});
      sceneryMesh(group,new THREE.BoxGeometry(.7,.45,.9),stone,{x:x+.2,y:height+.64,z});
      sceneryMesh(group,new THREE.BoxGeometry(.9,1.2,.12),windowGlass,{x,y:.85,z:z+width/2+.03});
      sceneryMesh(group,new THREE.BoxGeometry(1.3,.08,.65),white,{x,y:1.55,z:z+width/2+.22});
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
      sceneryMesh(group, new THREE.BoxGeometry(.32*scale,.46*scale,.32*scale),accent,{x,y:2.22*scale,z});
      sceneryMesh(group,new THREE.ConeGeometry(.32*scale,.22*scale,4),dark,{x,y:2.56*scale,z},{y:Math.PI/4});
      for(const dx of [-.16,.16])for(const dz of [-.16,.16])sceneryMesh(group,new THREE.BoxGeometry(.035*scale,.5*scale,.035*scale),dark,{x:x+dx*scale,y:2.22*scale,z:z+dz*scale});
    }

    function addCoin(group, x, z, scale) {
      sceneryMesh(group, new THREE.CylinderGeometry(.55 * scale, .55 * scale, .14 * scale, 18), gold, { x, y: 1.05 * scale, z }, { x: Math.PI / 2 });
      sceneryMesh(group, new THREE.CylinderGeometry(.06 * scale, .09 * scale, 1.3 * scale, 7), dark, { x, y: .4 * scale, z });
    }

    const brick = materialFrom("brick", 0xf2d5c6);
    const timber = materialFrom("timber", 0xe2d2b9);
    const ceramic = materialFrom("ceramic", 0xd9eef0, .42, .25);
    const copper = materialFrom("copper", 0xb9d4c4, .7, .25);
    const paving = materialFrom("paving", 0xd0d3ce);
    const redPaint = new THREE.MeshStandardMaterial({color:0xbc3943,roughness:.65});
    const rockMap = new THREE.TextureLoader().load("images/city/textures/terrain-mountain-rock.png");
    rockMap.colorSpace = THREE.SRGBColorSpace || "srgb";
    const mountainRock = new THREE.MeshStandardMaterial({map:rockMap,color:0xa8aaa9,roughness:1});

    function addRegionalProp(group, theme, x, z, variant, accent) {
      const prop = new THREE.Group();
      prop.position.set(x, 0, z);
      group.add(prop);
      const box = (w,h,d,mat,px,py,pz) => sceneryMesh(prop,new THREE.BoxGeometry(w,h,d),mat,{x:px,y:py,z:pz});
      const cylinder = (rt,rb,h,mat,px,py,pz) => sceneryMesh(prop,new THREE.CylinderGeometry(rt,rb,h,24),mat,{x:px,y:py,z:pz});
      const cone = (r,h,mat,py) => sceneryMesh(prop,new THREE.ConeGeometry(r,h,32),mat,{x:0,y:py,z:0});
      if (theme === "town") {
        addHouse(prop,0,0,1.35,accent);
        box(2.8,.16,1.1,redPaint,0,1.6,1.4);
        for(let i=0;i<5;i++)box(.24,.17,1.12,white,-1.05+i*.52,1.61,1.4);
        for(const side of [-1,1]) {
          box(.1,1.5,.1,white,side*1.3,.75,1.9);
          box(.7,.5,.6,timber,side*1.05,.25,2.15);
          for(let fruit=0;fruit<4;fruit++)sceneryMesh(prop,new THREE.SphereGeometry(.13,8,6),side===1?gold:green,{x:side*1.05+(fruit%2)*.22-.1,y:.56,z:2.05+Math.floor(fruit/2)*.2});
        }
      } else if (theme === "campus") {
        box(5.5,3.7,2.8,brick,0,1.85,0);
        box(5.8,.2,3.1,stone,0,3.75,0);
        for(const floor of [1,2.6])for(const wx of [-2,-1,1,2])addWindow(prop,wx,floor,1.45);
        box(.85,1.7,.12,dark,0,.85,1.44);
        box(1.8,1.8,1.8,brick,0,4.4,0);
        cone(1.55,1.4,slate,6);
        sceneryMesh(prop,new THREE.CylinderGeometry(.6,.6,.08,32),white,{x:0,y:4.8,z:.94},{x:Math.PI/2});
        box(.05,.42,.1,dark,0,4.93,1);
        box(.31,.05,.1,dark,.14,4.8,1);
      } else if (theme === "business") {
        box(4.9,2.6,3,stone,0,1.3,0);
        box(5.5,.3,3.5,white,0,2.8,0);
        for(const px of [-1.9,-.65,.65,1.9])cylinder(.16,.21,2.5,white,px,1.25,1.85);
        const pediment=new THREE.Shape();pediment.moveTo(-2.8,0);pediment.lineTo(0,1.2);pediment.lineTo(2.8,0);pediment.closePath();
        sceneryMesh(prop,new THREE.ExtrudeGeometry(pediment,{depth:.3,bevelEnabled:false}),stone,{x:0,y:2.95,z:1.65});
        box(1.3,1.9,.12,windowGlass,0,.95,1.54);
        for(const px of [-1.7,1.7])addWindow(prop,px,1.5,1.55);
      } else if (theme === "metro") {
        addOffice(prop,0,0,8+variant%3*2,3.8);
        box(2.7,1.7,.22,dark,0,4.4,2);
        for(let i=0;i<4;i++)box(.3,.9+i*.13,.04,i%2?gold:accent,-.8+i*.55,4.4,2.14);
        box(4.1,.2,1.3,ceramic,0,1.8,2.2);
      } else if (theme === "coast") {
        cylinder(1.2,1.5,.35,stone,0,.17,0);
        cylinder(.7,1.05,5.5,white,0,2.9,0);
        for(const y of [1.5,3.5])cylinder(.97-y*.04,1.01-y*.04,.55,redPaint,0,y,0);
        cylinder(1.22,1.22,.18,stone,0,5.8,0);
        cylinder(.73,.73,1.1,windowGlass,0,6.4,0);
        for(let i=0;i<8;i++){const a=i*Math.PI/4;box(.07,1.2,.07,white,Math.sin(a)*.73,6.4,Math.cos(a)*.73);}
        cone(1.13,.85,redPaint,7.35);
        sceneryMesh(prop,new THREE.TorusGeometry(1.14,.04,6,32),white,{x:0,y:6.2,z:0},{x:Math.PI/2});
      } else if (theme === "mountain") {
        if(variant%3) {
          cylinder(.18,.4,4.6,trunk,0,2.3,0);
          for(let tier=0;tier<4;tier++)cone(1.9-tier*.36,2.4,green,2+tier*.9);
        } else {
          box(3.3,2.4,2.7,timber,0,1.2,0);
          const roof=new THREE.Shape();roof.moveTo(-2,0);roof.lineTo(0,1.8);roof.lineTo(2,0);roof.closePath();
          sceneryMesh(prop,new THREE.ExtrudeGeometry(roof,{depth:3.3,bevelEnabled:false}),slate,{x:0,y:2.4,z:-1.65});
          for(const px of [-.95,.95])addWindow(prop,px,1.5,1.4);
          box(.75,1.5,.12,timber,0,.75,1.4);
          box(3.8,.15,1,stone,0,.25,1.7);
        }
      } else if (theme === "technology") {
        cylinder(2.4,2.6,2.7,ceramic,0,1.35,0);
        cylinder(2.43,2.43,.55,windowGlass,0,1.9,0);
        sceneryMesh(prop,new THREE.SphereGeometry(2.4,32,16,0,Math.PI*2,0,Math.PI/2),ceramic,{x:0,y:2.7,z:0});
        for(const side of [-1,1]) {
          box(2.4,.12,1.6,facade,side*3.7,1.4,0);
          cylinder(.08,.13,1.4,stone,side*3.7,.7,0);
          for(let line=0;line<5;line++)box(.025,.025,1.6,white,side*3.7-1+line*.5,1.48,0);
        }
        cylinder(.08,.12,2,white,0,5,0);
      } else if (theme === "kingdom") {
        box(3,2.8,2.6,stone,0,1.4,0);
        box(3.3,.3,2.9,stone,0,2.9,0);
        for(const px of [-1.3,0,1.3])for(const pz of [-1.2,1.2])box(.55,.7,.5,stone,px,3.3,pz);
        box(.8,1.8,.1,timber,0,.9,1.35);
        cylinder(.05,.05,3,white,0,4.5,0);
        box(1.3,.85,.07,accent,.65,5.45,0);
      } else if (theme === "space") {
        if(variant%2) {
          cylinder(2,2.2,.4,ceramic,0,.2,0);
          sceneryMesh(prop,new THREE.SphereGeometry(2,32,16,0,Math.PI*2,0,Math.PI/2),facade,{x:0,y:.4,z:0});
          box(1.3,1.1,2.3,ceramic,0,.55,2);
          cylinder(.08,.13,3,white,2.8,1.5,0);
          sceneryMesh(prop,new THREE.SphereGeometry(1.2,24,12,0,Math.PI*2,0,.9),ceramic,{x:2.8,y:3,z:0},{z:.7});
          return;
        }
        cylinder(2,2,.3,stone,0,.15,0);
        cylinder(.7,.8,4.8,ceramic,0,2.65,0);
        cone(.7,1.65,white,5.85);
        cylinder(.8,.8,.4,accent,0,3.8,0);
        for(const side of [-1,1]) {
          cylinder(.35,.45,2.6,ceramic,side*.98,1.6,0);
          sceneryMesh(prop,new THREE.ConeGeometry(.36,.75,24),white,{x:side*.98,y:3.25,z:0});
          cylinder(.18,.3,.4,dark,side*.98,.35,0);
        }
      } else {
        cylinder(2.6,2.8,.35,stone,0,.17,0);
        cylinder(2.2,2.3,.6,white,0,.5,0);
        cylinder(1.9,1.9,.08,windowGlass,0,.84,0);
        cylinder(.22,.5,2.5,stone,0,1.8,0);
        cylinder(1.05,1.15,.3,white,0,2.7,0);
        sceneryMesh(prop,new THREE.SphereGeometry(.45,20,12),gold,{x:0,y:3.2,z:0});
        for(let i=0;i<6;i++){const a=i*Math.PI/3;box(.14,1.5,.14,gold,Math.sin(a)*3,.75,Math.cos(a)*3);box(.8,.5,.1,accent,Math.sin(a)*3,1.6,Math.cos(a)*3);}
      }
    }

    function addRegionalLandmark(group, theme, x, z, accent) {
      const prop=new THREE.Group();
      prop.position.set(x,0,z);
      prop.name=`life-scenery-${theme}-landmark`;
      group.add(prop);
      const box=(w,h,d,mat,px,py,pz)=>sceneryMesh(prop,new THREE.BoxGeometry(w,h,d),mat,{x:px,y:py,z:pz});
      const tube=(rt,rb,h,mat,px,py,pz)=>sceneryMesh(prop,new THREE.CylinderGeometry(rt,rb,h,24),mat,{x:px,y:py,z:pz});
      const ball=(r,mat,px,py,pz)=>sceneryMesh(prop,new THREE.SphereGeometry(r,24,16),mat,{x:px,y:py,z:pz});
      const roof=(width,height,depth,mat,y)=>{
        const shape=new THREE.Shape();shape.moveTo(-width/2,0);shape.lineTo(0,height);shape.lineTo(width/2,0);shape.closePath();
        sceneryMesh(prop,new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false}),mat,{x:0,y,z:-depth/2});
      };
      box(7,.12,6,paving,0,-.02,0);
      if(theme==="town") {
        box(4.8,2.2,2.4,brick,0,1.1,0);
        roof(5.5,1.1,3,copper,2.2);
        for(const wx of [-1.7,-.85,.85,1.7])addWindow(prop,wx,1.3,1.24);
        box(.65,1.65,.1,timber,0,.83,1.26);
        box(6,.15,1.4,slate,0,1.9,1.9);
        for(const px of [-2.7,2.7])tube(.065,.065,1.9,white,px,.95,2.4);
        box(1.1,.34,.06,accent,0,2.4,1.55);
        for(const rz of [-2,-2.55])box(6,.07,.06,dark,0,.1,rz);
        for(let i=0;i<15;i++)box(.14,.04,.8,timber,-2.8+i*.4,.1,-2.28);
      } else if(theme==="campus") {
        box(4.8,.45,3,brick,0,.22,0);
        box(4.7,1.9,2.9,facade,0,1.35,0);
        roof(4.8,1.3,3,facade,2.3);
        for(const px of [-2.35,-1.18,0,1.18,2.35]) {
          for(const side of [-1,1])box(.07,2.1,.07,white,px,1.3,side*1.48);
        }
        for(const y of [.5,1.6,2.3])for(const side of [-1,1])box(4.8,.07,.07,white,0,y,side*1.48);
        box(.08,.08,3.1,white,0,3.6,0);
        for(const side of [-1,1])for(const pz of [-1.5,-.75,0,.75,1.5])sceneryMesh(prop,new THREE.BoxGeometry(2.75,.08,.06),white,{x:side*1.2,y:2.95,z:pz},{z:-side*.495});
        for(const px of [-1.5,1.5]){tube(.45,.3,.55,timber,px,.65,0);ball(.65,green,px,1.25,0);}
      } else if(theme==="business") {
        box(4.8,2.5,3.1,white,0,1.25,0);
        box(4.5,1.8,.08,windowGlass,0,1.25,1.6);
        roof(5.4,1,3.6,copper,2.5);
        for(const px of [-2,-1,0,1,2])box(.08,2.3,.12,stone,px,1.3,1.65);
        for(const side of [-1,1]) {
          tube(.45,.45,.7,stone,side*2.7,.4,2.1);
          ball(.6,green,side*2.7,1.1,2.1);
        }
        box(2,.4,.12,gold,0,2.5,1.82);
      } else if(theme==="metro") {
        box(5.6,.3,2.6,stone,0,.15,0);
        box(5.8,.2,2.9,copper,0,2.9,0);
        for(const px of [-2.5,0,2.5])tube(.085,.085,2.8,dark,px,1.5,-1.1);
        box(5.2,2.5,.1,windowGlass,0,1.5,-1.1);
        box(4.7,1.2,1.6,accent,0,1,0);
        box(4.1,.7,1.5,windowGlass,0,1.9,0);
        box(4.7,.14,1.7,white,0,2.3,0);
        for(const px of [-1.5,1.5])for(const side of [-1,1])sceneryMesh(prop,new THREE.CylinderGeometry(.35,.35,.16,16),dark,{x:px,y:.55,z:side*.79},{x:Math.PI/2});
        for(const px of [-1.3,0,1.3])box(.06,.75,1.53,white,px,1.9,0);
      } else if(theme==="coast") {
        for(let i=0;i<12;i++)box(3.1,.16,.37,timber,0,.35,-2.4+i*.42);
        for(const px of [-1.35,1.35])for(const pz of [-2,0,2]){tube(.09,.12,1.2,trunk,px,.5,pz);ball(.14,white,px,1.14,pz);}
        box(2.6,1.4,1.8,white,0,1.2,-1.1);
        roof(3,1,2.2,copper,1.9);
        addWindow(prop,-.65,1.35,-.15);addWindow(prop,.65,1.35,-.15);
        for(const px of [-2.5,2.5])sceneryMesh(prop,new THREE.TorusGeometry(.43,.12,10,24),redPaint,{x:px,y:.4,z:1.5},{x:Math.PI/2});
      } else if(theme==="mountain") {
        tube(.9,1.4,4.8,stone,0,2.4,0);
        sceneryMesh(prop,new THREE.ConeGeometry(1.3,1.7,24),copper,{x:0,y:5.65,z:0});
        const rotor=new THREE.Group();rotor.position.set(0,4,1);rotor.rotation.z=.4;prop.add(rotor);
        for(let blade=0;blade<4;blade++) {
          const arm=new THREE.Group();arm.rotation.z=blade*Math.PI/2;rotor.add(arm);
          sceneryMesh(arm,new THREE.BoxGeometry(.13,2.8,.14),timber,{x:0,y:1.3,z:0});
          sceneryMesh(arm,new THREE.BoxGeometry(.65,1.8,.08),white,{x:.26,y:1.7,z:.08});
          for(let rib=0;rib<6;rib++)sceneryMesh(arm,new THREE.BoxGeometry(.7,.045,.1),timber,{x:.26,y:1+rib*.29,z:.14});
        }
        ball(.23,gold,0,4,1.15);
        box(.7,1.5,.1,timber,0,.75,1.32);
      } else if(theme==="technology") {
        box(3.4,2.1,2.5,ceramic,0,1.05,0);
        for(const side of [-1,1])tube(.45,.55,3.3,ceramic,side*2.3,1.65,0);
        box(3.2,.4,2.55,facade,0,1.45,0);
        tube(.2,.3,3,white,0,3.5,0);
        const dish=sceneryMesh(prop,new THREE.SphereGeometry(1.7,32,16,0,Math.PI*2,0,1.2),copper,{x:0,y:5,z:0},{z:.8});
        dish.material.side=THREE.DoubleSide;
        sceneryMesh(prop,new THREE.CylinderGeometry(.045,.045,2,16),white,{x:.55,y:5.8,z:0},{z:-.65});
        ball(.15,accent,1.1,6.55,0);
      } else if(theme==="kingdom") {
        for(const px of [-2.6,2.6]) {
          tube(.8,.95,4.1,stone,px,2.05,0);
          sceneryMesh(prop,new THREE.ConeGeometry(1.12,1.6,24),copper,{x:px,y:4.9,z:0});
          box(.7,1.8,.12,accent,px,2.5,1);
        }
        box(4.7,.7,1.5,stone,0,3.6,0);
        for(const px of [-1.7,-.85,0,.85,1.7])box(.15,2.8,.15,timber,px,2.2,0);
        box(4.8,.13,2.7,timber,0,.1,1.5);
        for(let i=0;i<11;i++)box(4.8,.04,.04,dark,0,.19,.3+i*.24);
      } else if(theme==="space") {
        box(3.8,1.8,2.8,ceramic,0,1.1,0);
        box(3.2,.6,.1,windowGlass,0,1.35,1.45);
        for(const px of [-1.3,1.3])for(const pz of [-1.55,1.55])sceneryMesh(prop,new THREE.CylinderGeometry(.6,.6,.38,20),dark,{x:px,y:.65,z:pz},{x:Math.PI/2});
        box(4,.1,3,facade,0,2.1,0);
        tube(.055,.08,2.5,white,.9,3.1,0);
        ball(.17,gold,.9,4.4,0);
        for(const px of [-1.2,1.2])ball(.18,white,px,1,1.55);
      } else {
        tube(2.9,3,.2,stone,0,.1,0);
        for(let column=0;column<8;column++){const a=column*Math.PI/4;tube(.1,.14,2.5,white,Math.cos(a)*2.2,1.4,Math.sin(a)*2.2);}
        sceneryMesh(prop,new THREE.ConeGeometry(3.2,1.6,8),copper,{x:0,y:3.45,z:0});
        ball(.25,gold,0,4.4,0);
        tube(.8,.95,.2,timber,0,.4,0);
      }
      // Small furnishings bind each landmark to its plaza without covering the route.
      for(const side of [-1,1]) {
        box(1.1,.12,.42,timber,side*2.6,.55,-2.4);
        box(1.1,.42,.07,timber,side*2.6,.82,-2.58);
        for(const leg of [-.4,.4])box(.07,.5,.3,dark,side*2.6+leg,.25,-2.4);
      }
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
        // The wooden road ribbon is the pier deck; a second coplanar deck causes flicker.
      }
      if (index === 5) {
        for(let peak=0;peak<7;peak++) {
          const px=center.x-25+peak*8, pz=center.z+40+(peak%2)*8;
          const height=9+(peak%3)*4;
          const mountain = new THREE.ConeGeometry(8,height,32,8);
          const positions = mountain.attributes.position;
          for(let vertex=0;vertex<positions.count;vertex++) {
            const vx=positions.getX(vertex),vy=positions.getY(vertex),vz=positions.getZ(vertex);
            const ridge=1+.16*Math.sin(Math.atan2(vz,vx)*7+peak)+.06*Math.sin(vy*2);
            positions.setXYZ(vertex,vx*ridge,vy,vz*ridge);
          }
          mountain.computeVertexNormals();
          sceneryMesh(group,mountain,mountainRock,{x:px,y:height/2-.5,z:pz});
          sceneryMesh(group,new THREE.ConeGeometry(2.5,height*.32,24),white,{x:px,y:height*.84-.5,z:pz});
        }
      }
      if (index === 7) {
        for (const side of [-1,1]) {
          sceneryMesh(group,new THREE.BoxGeometry(44,2.2,.8),stone,{x:center.x,y:1,z:center.z+side*21});
          for(let merlon=0;merlon<16;merlon++) sceneryMesh(group,new THREE.BoxGeometry(1.1,.6,1),stone,{x:center.x-21+merlon*2.8,y:2.3,z:center.z+side*21});
        }
      }
      for (let propIndex = 0; propIndex < 36; propIndex += 1) {
        const urban=[2,3,6].includes(index);
        const propX = center.x - 32 + (propIndex%6)*12 + (urban?0:Math.sin(propIndex*7.3)*3);
        const propZ = center.z - 34 + Math.floor(propIndex/6)*13 + (urban?0:Math.cos(propIndex*4.7)*3);
        if (TRACK_POINTS.some((tile) => Math.hypot(tile.x-propX,tile.z-propZ)<(propIndex%4===1?5.8:4))) continue;
        if (index===4 && Math.hypot(propX-center.x,propZ-center.z)<37) continue;
        if (index===1 && Math.hypot(propX-center.x,propZ-center.z)<20) continue;
        const scale = 1.1 + (propIndex%3)*.25;
        if (propIndex%4===1) {
          addRegionalLandmark(group,region.theme,propX,propZ,accent);
        } else if (index===5 || index===6 || index===8 || propIndex%3===0) {
          addRegionalProp(group,region.theme,propX,propZ,propIndex,accent);
        } else if ([2,3].includes(index)) {
          const height=2.5+(propIndex*7%9);
          addOffice(group,propX,propZ,height);
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
        if (kind === 0 || index===5) addRegionalProp(group,region.theme,propX,propZ,step,accent);
        else if (kind === 1) addTree(group, propX, propZ, 1.1);
        else if (kind === 2) addCar(group, propX, propZ, .85, accent, -angle);
        else addLamp(group, propX, propZ, 1, gold);
      }

      if (region.theme === "town") {
        [-1.8, 0, 1.8].forEach((offset, itemIndex) => {
          addHouse(group,x+offset*1.5,z,.95+itemIndex*.1,accent);
        });
      } else if (region.theme === "campus") {
        sceneryMesh(group, new THREE.BoxGeometry(5.2, .42, .58), accent, { x, y: 3.45, z });
        [-2.25, 2.25].forEach((offset) => sceneryMesh(group, new THREE.BoxGeometry(.62, 5.8, .62), stone, { x: x + offset, y: 2.45, z }));
        sceneryMesh(group, new THREE.SphereGeometry(.62, 18, 12), gold, { x, y: 4.15, z });
      } else if (region.theme === "business" || region.theme === "metro") {
        [-1.8, 0, 1.7].forEach((offset, itemIndex) => {
          const height = region.theme === "metro" ? [4.2, 7.1, 5.4][itemIndex] : [3.8, 5.8, 4.6][itemIndex];
          addOffice(group,x+offset*1.25,z,height,1.6);
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
        [-1.9, 0, 1.85].forEach((offset, itemIndex) => sceneryMesh(group, new THREE.ConeGeometry(1.5 + itemIndex * .2, 4.4 + itemIndex * .8, 24), mountainRock, { x: x + offset, y: 2.5 + itemIndex * .4, z: z + Math.abs(offset) * .18 }));
      } else if (region.theme === "technology") {
        sceneryMesh(group, new THREE.CylinderGeometry(.7, 1.45, 5.8, 12), dark, { x, y: 3.15, z });
        [1.3, 2.35, 3.45].forEach((height, ringIndex) => sceneryMesh(group, new THREE.TorusGeometry(1.5 + ringIndex * .3, .12, 8, 30), ringIndex === 1 ? gold : accent, { x, y: height, z }, { x: Math.PI / 2, y: ringIndex * .55 }));
        sceneryMesh(group, new THREE.OctahedronGeometry(.85, 0), accent, { x, y: 6.3, z });
      } else if (region.theme === "kingdom") {
        sceneryMesh(group, new THREE.BoxGeometry(4.5, 3.5, 2.1), stone, { x, y: 2.05, z });
        [-2.2, 2.2].forEach((offset) => {
          sceneryMesh(group, new THREE.CylinderGeometry(.76, .92, 4.5, 10), stone, { x: x + offset, y: 2.55, z });
          sceneryMesh(group, new THREE.ConeGeometry(1.15, 1.7, 24), slate, { x: x + offset, y: 5.65, z });
          for(let merlon=0;merlon<8;merlon++) {
            const angle=merlon*Math.PI/4;
            sceneryMesh(group,new THREE.BoxGeometry(.26,.42,.26),stone,{x:x+offset+Math.sin(angle)*.74,y:4.9,z:z+Math.cos(angle)*.74});
          }
          for(const side of [-1,1])addWindow(group,x+offset,2.8,z+side*.91,side===1?0:Math.PI);
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
      batchStaticScenery(group);
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
      if (!drag.moved && event.type === "pointerup") {
        groundPoint(event);
        const match = ray.intersectObject(tileMesh,false)[0];
        if (match && Number.isInteger(match.instanceId)) showSpaceDetail(System.BOARD[match.instanceId]);
      }
      drag = null;
      canvas.classList.remove("life-dragging");
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener("pointerup",end);
    canvas.addEventListener("pointercancel",end);
    canvas.addEventListener("lostpointercapture",end);
  }

  function showSpaceDetail(space) {
    if (!space) return;
    const [name,description] = SPACE_EFFECTS[space.category];
    const multiplier=System.regionMultiplier(space);
    const range=(min,max,unit=1)=>`${(Math.round(min*multiplier)*unit).toLocaleString("ja-JP")}～${(Math.round(max*multiplier)*unit).toLocaleString("ja-JP")}`;
    const details={
      monster:`手持ちモンスターへの経験値を${range(30,120)}獲得します。`,
      equipment:`装備ガチャを${Math.ceil(multiplier)}回獲得します。`,
      city:`BINGO CITYの都市資金を${range(30,120,100)}円獲得します。すごろくの所持金とは別の報酬です。`,
      territory:`負傷待機を${range(30,120)}分短縮し、守備隊を回復する連携報酬を獲得します。`,
      tower:`休養時間を${range(30,120)}分短縮し、登頂部隊を回復する連携報酬を獲得します。`,
      interaction:`他のプレイヤーと${range(40000,180000)}円をやり取りします。受け取るか支払うかはランダムです。`,
      risk:`${range(120000,600000)}円を賭けます。勝つと賭け金の1.4倍を獲得し、負けると賭け金を失います。`,
      checkpoint:`100マスごとの通過報酬です。所持金から借金を引いた金額に応じて装備ガチャを${Math.ceil(multiplier)}～${Math.ceil(8*multiplier)}回獲得します。所持金は消費しません。`
    };
    const panel = root.querySelector("[data-life-space]");
    panel.innerHTML = `<header><small>マス ${space.number} / ${escapeHtml(System.REGIONS[space.regionIndex].name)}</small><button type="button" class="life-simple-btn" data-life-space-close>CLOSE</button></header><div><img src="${tileArt(space.category)}" alt="${escapeHtml(name)}" /><section><small>${escapeHtml(name)} / エリア倍率 ×${multiplier}</small><h2>${escapeHtml(space.title)}</h2><p>${escapeHtml(details[space.category]||description)}</p></section></div>`;
    panel.hidden = false;
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
    const label = ROUTE_NAMES[regionIndex];
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
    root.querySelector("[data-life-space]").hidden = true;
    renderer?.domElement.classList.remove("life-dragging");
    rollAnimations.clear();
    diceMeshes.forEach((mesh) => { mesh.visible = false; });
    root.querySelector("[data-life-roll-call]")?.classList.remove("show");
    root._lifeOnClose?.();
  }

  global.TeamBingoLifeMode = { open, close, applySnapshot, isOpen: () => root?.classList.contains("open") === true };
})(typeof window !== "undefined" ? window : globalThis);
