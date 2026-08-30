(function bootstrapBingoCityMap3D(global) {
  "use strict";

  const TILE = 1.28;
  const MAP_SIZE = 16;

  function create(container, options = {}) {
    const THREE = global.THREE;
    if (!THREE || !container) throw new Error("Three.js city renderer is unavailable");

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa9c9df);
    scene.fog = new THREE.FogExp2(0xb7cfde, .014);

    const camera = new THREE.PerspectiveCamera(42, 1, .1, 180);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    else renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.physicallyCorrectLights = true;
    renderer.domElement.className = "city-map-canvas";
    container.replaceChildren(renderer.domElement);

    const cityRoot = new THREE.Group();
    const tileRoot = new THREE.Group();
    const buildingRoot = new THREE.Group();
    const ambienceRoot = new THREE.Group();
    cityRoot.add(tileRoot, buildingRoot, ambienceRoot);
    scene.add(cityRoot);

    const textures = loadTextures(THREE);
    const materials = createMaterials(THREE, textures);
    const shared = createSharedGeometry(THREE);
    const dynamicResources = [];
    const tileTargets = [];
    const tileMeshes = new Map();
    const animated = [];
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const clock = new THREE.Clock();
    let frame = 0;
    let city = null;
    let selectedId = "";
    let buildMode = "";
    let destroyed = false;
    let target = new THREE.Vector3(0, 0, 0);
    let yaw = Math.PI * .25;
    let pitch = .72;
    let distance = 21;
    let drag = null;

    setupLights();
    createEnvironment();
    bindControls();
    resize();
    updateCamera();
    frame = global.requestAnimationFrame(animate);

    function loadTexture(path, repeat = [1, 1]) {
      const texture = new THREE.TextureLoader().load(path, () => renderer.render(scene, camera));
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeat[0], repeat[1]);
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      if ("colorSpace" in texture) texture.colorSpace = THREE.SRGBColorSpace;
      else texture.encoding = THREE.sRGBEncoding;
      return texture;
    }

    function loadTextures() {
      return {
        ground: loadTexture("images/city/textures/ground-grass-soil.png", [8, 8]),
        road: loadTexture("images/city/textures/road-asphalt.png", [2, 2]),
        residential: loadTexture("images/city/textures/facade-residential.png", [1.3, 2.3]),
        commercial: loadTexture("images/city/textures/facade-commercial.png", [1.2, 2.8]),
        industrial: loadTexture("images/city/textures/facade-industrial.png", [1.2, 1.3]),
        civic: loadTexture("images/city/textures/facade-civic.png", [1.1, 1.8])
      };
    }

    function createMaterials() {
      return {
        ground: new THREE.MeshStandardMaterial({ color: 0xc4c7a0, map: textures.ground, bumpMap: textures.ground, bumpScale: .035, roughness: .96 }),
        plot: new THREE.MeshStandardMaterial({ color: 0xa1a48a, map: textures.ground, roughness: .95 }),
        road: new THREE.MeshStandardMaterial({ color: 0x5b6065, map: textures.road, bumpMap: textures.road, bumpScale: .018, roughness: .91 }),
        sidewalk: new THREE.MeshStandardMaterial({ color: 0xa8a9a6, roughness: .9, metalness: .02 }),
        lane: new THREE.MeshStandardMaterial({ color: 0xf5e7a9, emissive: 0x3a2d0a, emissiveIntensity: .12, roughness: .75 }),
        residential: new THREE.MeshStandardMaterial({ color: 0xffffff, map: textures.residential, roughness: .58, metalness: .08 }),
        commercial: new THREE.MeshStandardMaterial({ color: 0xd9ecff, map: textures.commercial, roughness: .25, metalness: .3 }),
        industrial: new THREE.MeshStandardMaterial({ color: 0xd8dce0, map: textures.industrial, roughness: .62, metalness: .25 }),
        civic: new THREE.MeshStandardMaterial({ color: 0xfff9e8, map: textures.civic, roughness: .52, metalness: .08 }),
        roof: new THREE.MeshStandardMaterial({ color: 0x29343d, roughness: .54, metalness: .38 }),
        concrete: new THREE.MeshStandardMaterial({ color: 0xb9b7af, roughness: .84 }),
        darkMetal: new THREE.MeshStandardMaterial({ color: 0x27343e, roughness: .42, metalness: .72 }),
        copper: new THREE.MeshStandardMaterial({ color: 0xa36b45, roughness: .42, metalness: .65 }),
        gold: new THREE.MeshStandardMaterial({ color: 0xd4ad4e, roughness: .3, metalness: .76 }),
        glass: new THREE.MeshPhysicalMaterial({ color: 0x8bc0de, transparent: true, opacity: .68, roughness: .08, metalness: .22, clearcoat: 1 }),
        water: new THREE.MeshPhysicalMaterial({ color: 0x2c9ac1, transparent: true, opacity: .72, roughness: .1, metalness: .1, clearcoat: 1 }),
        grass: new THREE.MeshStandardMaterial({ color: 0x5e9b4d, roughness: .92 }),
        treeTrunk: new THREE.MeshStandardMaterial({ color: 0x755338, roughness: .95 }),
        treeLeaf: new THREE.MeshStandardMaterial({ color: 0x3e814a, roughness: .86 }),
        treeLeafLight: new THREE.MeshStandardMaterial({ color: 0x67a84f, roughness: .86 }),
        red: new THREE.MeshStandardMaterial({ color: 0xe54545, roughness: .5, metalness: .15 }),
        white: new THREE.MeshStandardMaterial({ color: 0xf3f1e9, roughness: .66 }),
        glow: new THREE.MeshStandardMaterial({ color: 0x9feaff, emissive: 0x27b9ff, emissiveIntensity: 2.2, roughness: .2 })
      };
    }

    function createSharedGeometry() {
      return {
        tile: new THREE.BoxGeometry(TILE * .98, .08, TILE * .98),
        road: new THREE.BoxGeometry(TILE, .055, TILE),
        lane: new THREE.BoxGeometry(.05, .012, .32),
        cube: new THREE.BoxGeometry(1, 1, 1),
        cylinder: new THREE.CylinderGeometry(.5, .5, 1, 24),
        cylinder12: new THREE.CylinderGeometry(.5, .5, 1, 12),
        sphere: new THREE.SphereGeometry(.5, 24, 14),
        cone: new THREE.ConeGeometry(.5, 1, 16),
        torus: new THREE.TorusGeometry(.5, .08, 12, 32),
        treeCrown: new THREE.IcosahedronGeometry(.5, 2),
        selection: new THREE.RingGeometry(.48, .59, 4, 1),
        beacon: new THREE.CylinderGeometry(.18, .55, 3.8, 24, 1, true)
      };
    }

    function setupLights() {
      scene.add(new THREE.HemisphereLight(0xdff4ff, 0x53614b, 2.1));
      const sun = new THREE.DirectionalLight(0xfff2d3, 5.2);
      sun.position.set(-12, 24, 10);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -18;
      sun.shadow.camera.right = 18;
      sun.shadow.camera.top = 18;
      sun.shadow.camera.bottom = -18;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 55;
      sun.shadow.bias = -.0003;
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x7ab7ff, 1.1);
      fill.position.set(14, 9, -16);
      scene.add(fill);
    }

    function createEnvironment() {
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), materials.ground);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -.1;
      ground.receiveShadow = true;
      scene.add(ground);

      const horizon = new THREE.Mesh(
        new THREE.CylinderGeometry(36, 42, 3.2, 48, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x6e8590, roughness: .86, side: THREE.BackSide })
      );
      horizon.position.y = 1.25;
      scene.add(horizon);
    }

    function mesh(geometry, material, position, scale, parent = buildingRoot) {
      const object = new THREE.Mesh(geometry, material);
      object.position.set(position[0], position[1], position[2]);
      object.scale.set(scale[0], scale[1], scale[2]);
      object.castShadow = true;
      object.receiveShadow = true;
      parent.add(object);
      return object;
    }

    function worldPosition(id) {
      const { x, z } = global.TeamBingoCitySystem.parseTileId(id);
      return {
        x: (x - (MAP_SIZE - 1) / 2) * TILE,
        z: (z - (MAP_SIZE - 1) / 2) * TILE
      };
    }

    function clearDynamic() {
      tileRoot.clear();
      buildingRoot.clear();
      ambienceRoot.clear();
      tileTargets.length = 0;
      tileMeshes.clear();
      animated.length = 0;
      while (dynamicResources.length) dynamicResources.pop()?.dispose?.();
    }

    function render(nextCity) {
      city = nextCity ? JSON.parse(JSON.stringify(nextCity)) : null;
      clearDynamic();
      if (!city) return;
      const playerColor = new THREE.Color(city.color || "#f5c84c");
      for (let z = 0; z < MAP_SIZE; z += 1) {
        for (let x = 0; x < MAP_SIZE; x += 1) createPlot(x, z, playerColor);
      }
      Object.values(city.tiles || {}).forEach((tile) => {
        if (tile.buildingId === "road") createRoad(tile);
        else createBuilding(tile, playerColor);
      });
      createTraffic();
      updateSelection();
    }

    function createPlot(x, z, playerColor) {
      const id = global.TeamBingoCitySystem.tileId(x, z);
      const position = worldPosition(id);
      const material = materials.plot.clone();
      material.color = new THREE.Color(0x9eaa82).lerp(playerColor, .045);
      dynamicResources.push(material);
      const plot = new THREE.Mesh(shared.tile, material);
      plot.position.set(position.x, -.025, position.z);
      plot.receiveShadow = true;
      plot.userData.tileId = id;
      tileRoot.add(plot);
      tileTargets.push(plot);
      tileMeshes.set(id, plot);

      if ((x + z) % 7 === 0 && !city.tiles?.[id]) addGroundDetail(position.x, position.z, id);
    }

    function addGroundDetail(x, z, seed) {
      const hash = hashText(seed);
      if (hash % 3 === 0) {
        const rock = mesh(shared.sphere, materials.concrete, [x + .25, .07, z - .22], [.13, .08, .1], ambienceRoot);
        rock.rotation.y = (hash % 100) / 100 * Math.PI;
      } else {
        const grass = mesh(shared.cone, materials.grass, [x - .22, .07, z + .2], [.08, .13, .08], ambienceRoot);
        grass.rotation.z = .18;
      }
    }

    function createRoad(tile) {
      const position = worldPosition(tile.id);
      const road = mesh(shared.road, materials.road, [position.x, .035, position.z], [1, 1, 1], tileRoot);
      road.userData.tileId = tile.id;
      const links = global.TeamBingoCitySystem.neighbors(tile.id).filter((id) => city.tiles?.[id]?.buildingId === "road");
      const horizontal = links.some((id) => global.TeamBingoCitySystem.parseTileId(id).x !== global.TeamBingoCitySystem.parseTileId(tile.id).x);
      const vertical = links.some((id) => global.TeamBingoCitySystem.parseTileId(id).z !== global.TeamBingoCitySystem.parseTileId(tile.id).z);
      if (horizontal) {
        [-.32, .32].forEach((offset) => mesh(shared.cube, materials.sidewalk, [position.x, .08, position.z + offset], [1.28, .09, .12], tileRoot));
        [-.34, .34].forEach((offset) => mesh(shared.lane, materials.lane, [position.x + offset, .072, position.z], [1, 1, 1], tileRoot).rotateZ(Math.PI / 2));
      }
      if (vertical) {
        [-.32, .32].forEach((offset) => mesh(shared.cube, materials.sidewalk, [position.x + offset, .08, position.z], [.12, .09, 1.28], tileRoot));
        [-.34, .34].forEach((offset) => mesh(shared.lane, materials.lane, [position.x, .072, position.z + offset], [1, 1, 1], tileRoot));
      }
    }

    function createBuilding(tile, playerColor) {
      const position = worldPosition(tile.id);
      const group = new THREE.Group();
      group.position.set(position.x, .05, position.z);
      group.userData.tileId = tile.id;
      buildingRoot.add(group);
      const level = Math.max(1, Math.min(3, Number(tile.level) || 1));
      const builders = {
        residential: buildResidential,
        commercial: buildCommercial,
        industrial: buildIndustrial,
        park: buildPark,
        power: buildPower,
        water: buildWater,
        civic: buildCivic,
        arena: buildArena
      };
      (builders[tile.buildingId] || buildResidential)(group, level, playerColor, tile.id);
    }

    function addBase(group, color) {
      const material = materials.concrete.clone();
      material.color = new THREE.Color(color).lerp(new THREE.Color(0xffffff), .78);
      dynamicResources.push(material);
      mesh(shared.cube, material, [0, .07, 0], [1.05, .14, 1.05], group);
    }

    function buildResidential(group, level, color) {
      addBase(group, color);
      const height = 1.2 + level * .48;
      mesh(shared.cube, materials.residential, [0, .14 + height / 2, 0], [.82, height, .78], group);
      mesh(shared.cube, materials.roof, [0, .17 + height, 0], [.86, .08, .82], group);
      const utility = mesh(shared.cube, materials.darkMetal, [.18, .29 + height, -.08], [.22, .18, .25], group);
      utility.castShadow = true;
      [-.28, .28].forEach((x) => {
        const balcony = mesh(shared.cube, materials.darkMetal, [x, height * .54, .43], [.32, .035, .12], group);
        balcony.castShadow = true;
      });
    }

    function buildCommercial(group, level, color) {
      addBase(group, color);
      const lower = 1.18 + level * .42;
      mesh(shared.cube, materials.commercial, [0, .15 + lower / 2, 0], [.86, lower, .78], group);
      if (level >= 2) mesh(shared.cube, materials.commercial, [-.08, lower + .42, -.04], [.62, .8, .58], group);
      if (level >= 3) mesh(shared.cube, materials.commercial, [.02, lower + 1.03, -.02], [.38, .46, .4], group);
      const crown = materials.gold.clone();
      crown.color = new THREE.Color(color).lerp(new THREE.Color(0xffffff), .35);
      dynamicResources.push(crown);
      mesh(shared.cube, crown, [0, lower + (level >= 2 ? .84 : .08), 0], [.92 - level * .12, .08, .84 - level * .1], group);
    }

    function buildIndustrial(group, level) {
      addBase(group, 0x727a80);
      mesh(shared.cube, materials.industrial, [-.13, .43, .04], [.74, .72, .84], group);
      mesh(shared.cube, materials.roof, [-.13, .82, .04], [.8, .08, .88], group);
      const stackCount = level + 1;
      for (let index = 0; index < stackCount; index += 1) {
        const x = -.34 + index * .28;
        mesh(shared.cylinder12, materials.darkMetal, [x, 1.08 + level * .08, -.18], [.1, .66 + level * .15, .1], group);
        mesh(shared.cylinder12, materials.copper, [x, 1.44 + level * .15, -.18], [.13, .07, .13], group);
      }
      const tank = mesh(shared.cylinder, materials.darkMetal, [.33, .36, .22], [.22, .55, .22], group);
      tank.rotation.z = Math.PI / 2;
      const pipe = mesh(shared.torus, materials.copper, [.18, .57, .31], [.34, .34, .34], group);
      pipe.rotation.x = Math.PI / 2;
    }

    function buildPark(group, level, color, seed) {
      addBase(group, color);
      mesh(shared.cube, materials.grass, [0, .13, 0], [.94, .12, .94], group);
      const treeCount = 3 + level * 2;
      for (let index = 0; index < treeCount; index += 1) {
        const angle = index / treeCount * Math.PI * 2 + hashText(seed) * .0001;
        const radius = .25 + (index % 2) * .16;
        addTree(group, Math.cos(angle) * radius, Math.sin(angle) * radius, .7 + (index % 3) * .12, index % 2);
      }
      const fountain = mesh(shared.cylinder, materials.concrete, [0, .2, 0], [.23, .12, .23], group);
      fountain.castShadow = false;
      const water = mesh(shared.cylinder, materials.water, [0, .27, 0], [.18, .03, .18], group);
      animated.push({ object: water, type: "water" });
    }

    function addTree(group, x, z, scale, variant) {
      mesh(shared.cylinder12, materials.treeTrunk, [x, .22 * scale, z], [.055 * scale, .44 * scale, .055 * scale], group);
      const crown = mesh(shared.treeCrown, variant ? materials.treeLeafLight : materials.treeLeaf, [x, .55 * scale, z], [.3 * scale, .42 * scale, .3 * scale], group);
      crown.rotation.y = x * 3;
    }

    function buildPower(group, level) {
      addBase(group, 0x626d74);
      mesh(shared.cube, materials.industrial, [0, .38, 0], [.86, .58, .82], group);
      const turbines = level + 2;
      for (let index = 0; index < turbines; index += 1) {
        const x = -.32 + index * (.64 / Math.max(1, turbines - 1));
        const turbine = mesh(shared.cylinder, materials.darkMetal, [x, .83, .05], [.12, .44, .12], group);
        turbine.rotation.x = Math.PI / 2;
        const ring = mesh(shared.torus, materials.glow, [x, .83, .29], [.16, .16, .16], group);
        animated.push({ object: ring, type: "spin", speed: 1.4 + index * .22 });
      }
      mesh(shared.cube, materials.copper, [0, .71, -.34], [.68, .08, .08], group);
    }

    function buildWater(group, level) {
      addBase(group, 0x718690);
      const towerHeight = .72 + level * .14;
      [-.28, .28].forEach((x) => [-.28, .28].forEach((z) => {
        const leg = mesh(shared.cylinder12, materials.darkMetal, [x, towerHeight / 2, z], [.045, towerHeight, .045], group);
        leg.rotation.z = x * .14;
      }));
      mesh(shared.cylinder, materials.water, [0, towerHeight + .22, 0], [.44, .38, .44], group);
      mesh(shared.sphere, materials.glass, [0, towerHeight + .41, 0], [.39, .18, .39], group);
      const ring = mesh(shared.torus, materials.gold, [0, towerHeight + .21, 0], [.46, .46, .46], group);
      ring.rotation.x = Math.PI / 2;
    }

    function buildCivic(group, level, color) {
      addBase(group, color);
      mesh(shared.cube, materials.civic, [0, .57, 0], [.92, 1.02, .76], group);
      mesh(shared.cube, materials.civic, [0, 1.18, -.05], [.58, .28, .55], group);
      const dome = mesh(shared.sphere, materials.gold, [0, 1.42, -.05], [.28, .16, .28], group);
      dome.castShadow = true;
      for (let index = -2; index <= 2; index += 1) {
        mesh(shared.cylinder12, materials.civic, [index * .16, .48, .43], [.04, .74, .04], group);
      }
      const banner = materials.gold.clone();
      banner.color = new THREE.Color(color);
      banner.emissive = new THREE.Color(color);
      banner.emissiveIntensity = .3;
      dynamicResources.push(banner);
      mesh(shared.cube, banner, [0, .98, .395], [.48, .12, .025], group);
    }

    function buildArena(group, level, color) {
      addBase(group, color);
      const bowl = mesh(shared.cylinder, materials.civic, [0, .34, 0], [.5, .56, .5], group);
      bowl.scale.z = .72;
      const roof = mesh(shared.torus, materials.darkMetal, [0, .66, 0], [.62, .62, .62], group);
      roof.rotation.x = Math.PI / 2;
      roof.scale.z = .72;
      const field = mesh(shared.cylinder, materials.grass, [0, .68, 0], [.4, .04, .4], group);
      field.scale.z = .68;
      const accent = materials.glow.clone();
      accent.color = new THREE.Color(color);
      accent.emissive = new THREE.Color(color);
      dynamicResources.push(accent);
      const halo = mesh(shared.torus, accent, [0, .78 + level * .05, 0], [.68, .68, .68], group);
      halo.rotation.x = Math.PI / 2;
      halo.scale.z = .72;
      animated.push({ object: halo, type: "pulse" });
    }

    function createTraffic() {
      const roads = Object.values(city.tiles || {}).filter((tile) => tile.buildingId === "road");
      roads.slice(0, 12).forEach((tile, index) => {
        const position = worldPosition(tile.id);
        const car = new THREE.Group();
        const bodyMaterial = [materials.red, materials.white, materials.gold, materials.darkMetal][index % 4];
        mesh(shared.cube, bodyMaterial, [0, .11, 0], [.25, .1, .13], car);
        mesh(shared.cube, materials.glass, [0, .18, 0], [.13, .08, .11], car);
        car.position.set(position.x + ((index % 3) - 1) * .18, .07, position.z + (index % 2 ? .12 : -.12));
        ambienceRoot.add(car);
        animated.push({ object: car, type: "car", origin: car.position.clone(), axis: index % 2, phase: index * .7 });
      });
    }

    function updateSelection() {
      tileMeshes.forEach((plot, id) => {
        const active = id === selectedId;
        plot.material.emissive = new THREE.Color(active ? (buildMode ? 0x4adfff : 0xffd45a) : 0x000000);
        plot.material.emissiveIntensity = active ? .8 : 0;
      });
      if (!selectedId) return;
      const position = worldPosition(selectedId);
      const selectionMaterial = new THREE.MeshBasicMaterial({
        color: buildMode ? 0x55e2ff : 0xffd45d,
        transparent: true,
        opacity: .88,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      dynamicResources.push(selectionMaterial);
      const ring = new THREE.Mesh(shared.selection, selectionMaterial);
      ring.position.set(position.x, .14, position.z);
      ring.rotation.x = -Math.PI / 2;
      ring.rotation.z = Math.PI / 4;
      ambienceRoot.add(ring);
      const beaconMaterial = new THREE.MeshBasicMaterial({ color: selectionMaterial.color, transparent: true, opacity: .13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      dynamicResources.push(beaconMaterial);
      const beacon = new THREE.Mesh(shared.beacon, beaconMaterial);
      beacon.position.set(position.x, 1.8, position.z);
      ambienceRoot.add(beacon);
      animated.push({ object: ring, type: "selection", beacon, material: selectionMaterial, beaconMaterial });
    }

    function hashText(value) {
      let hash = 2166136261;
      for (const char of String(value || "")) {
        hash ^= char.codePointAt(0);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    }

    function bindControls() {
      const canvas = renderer.domElement;
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
      canvas.addEventListener("wheel", onWheel, { passive: false });
      global.addEventListener("resize", resize);
    }

    function onPointerDown(event) {
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: 0, button: event.button };
      renderer.domElement.setPointerCapture?.(event.pointerId);
    }

    function onPointerMove(event) {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (event.shiftKey || drag.button === 2) {
        const pan = distance * .0028;
        target.x -= dx * pan * Math.cos(yaw) + dy * pan * Math.sin(yaw);
        target.z += dx * pan * Math.sin(yaw) - dy * pan * Math.cos(yaw);
      } else {
        yaw -= dx * .006;
        pitch = Math.max(.3, Math.min(1.18, pitch + dy * .004));
      }
      updateCamera();
    }

    function onPointerUp(event) {
      if (!drag || drag.id !== event.pointerId) return;
      if (drag.moved < 8) pickTile(event);
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      drag = null;
    }

    function onWheel(event) {
      event.preventDefault();
      distance = Math.max(9, Math.min(38, distance * Math.exp(event.deltaY * .0012)));
      updateCamera();
    }

    function pickTile(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(tileTargets, false)[0];
      if (!hit?.object?.userData?.tileId) return;
      selectedId = hit.object.userData.tileId;
      render(city);
      options.onSelect?.(selectedId);
    }

    function updateCamera() {
      const horizontal = Math.cos(pitch) * distance;
      camera.position.set(
        target.x + Math.sin(yaw) * horizontal,
        target.y + Math.sin(pitch) * distance,
        target.z + Math.cos(yaw) * horizontal
      );
      camera.lookAt(target);
    }

    function resize() {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function animate() {
      if (destroyed) return;
      const elapsed = clock.getElapsedTime();
      animated.forEach((item) => {
        if (item.type === "spin") item.object.rotation.z = elapsed * item.speed;
        else if (item.type === "water") item.object.scale.y = .95 + Math.sin(elapsed * 2.4) * .1;
        else if (item.type === "pulse") item.object.scale.x = item.object.scale.y = 1 + Math.sin(elapsed * 2.2) * .035;
        else if (item.type === "car") {
          const travel = Math.sin(elapsed * .34 + item.phase) * .34;
          item.object.position[item.axis ? "x" : "z"] = item.origin[item.axis ? "x" : "z"] + travel;
        } else if (item.type === "selection") {
          item.object.rotation.z = Math.PI / 4 + elapsed * .65;
          item.material.opacity = .68 + Math.sin(elapsed * 3) * .2;
          item.beaconMaterial.opacity = .1 + Math.sin(elapsed * 2.2) * .045;
          item.beacon.position.y = 1.75 + Math.sin(elapsed * 1.7) * .12;
        }
      });
      renderer.render(scene, camera);
      frame = global.requestAnimationFrame(animate);
    }

    function setSelected(id) {
      selectedId = String(id || "");
      if (city) render(city);
    }

    function setBuildMode(id) {
      buildMode = String(id || "");
      if (city) render(city);
    }

    function focusTile(id) {
      const position = worldPosition(id);
      target.set(position.x, 0, position.z);
      distance = 14;
      updateCamera();
      setSelected(id);
    }

    function destroy() {
      destroyed = true;
      global.cancelAnimationFrame(frame);
      global.removeEventListener("resize", resize);
      clearDynamic();
      Object.values(shared).forEach((resource) => resource.dispose?.());
      Object.values(materials).forEach((resource) => resource.dispose?.());
      Object.values(textures).forEach((resource) => resource.dispose?.());
      renderer.dispose();
      renderer.domElement.remove();
    }

    return { render, resize, setSelected, setBuildMode, focusTile, destroy };
  }

  global.TeamBingoCityMap3D = { create };
})(typeof window !== "undefined" ? window : globalThis);
