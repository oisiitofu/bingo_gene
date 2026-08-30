(function bootstrapBingoCityMap3D(global) {
  "use strict";

  const TILE = .86;

  function create(container, options = {}) {
    const THREE = global.THREE;
    const City = global.TeamBingoCitySystem;
    if (!THREE || !City || !container) throw new Error("Three.js city renderer is unavailable");

    const MAP_SIZE = City.GRID_SIZE;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaed1e5);
    scene.fog = new THREE.FogExp2(0xc4d9e4, .0045);
    const camera = new THREE.PerspectiveCamera(39, 1, .1, 420);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
    else renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;
    renderer.physicallyCorrectLights = true;
    renderer.domElement.className = "city-map-canvas";
    container.replaceChildren(renderer.domElement);

    const terrainRoot = new THREE.Group();
    const buildingRoot = new THREE.Group();
    const natureRoot = new THREE.Group();
    const trafficRoot = new THREE.Group();
    const selectionRoot = new THREE.Group();
    scene.add(terrainRoot, buildingRoot, natureRoot, trafficRoot, selectionRoot);

    const textures = loadTextures();
    const materials = createMaterials();
    const shared = createGeometry();
    const dynamicResources = [];
    const selectionResources = [];
    const terrainTargets = [];
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
    let yaw = Math.PI * .24;
    let pitch = .74;
    let distance = 48;
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
      texture.anisotropy = Math.min(12, renderer.capabilities.getMaxAnisotropy());
      if ("colorSpace" in texture) texture.colorSpace = THREE.SRGBColorSpace;
      else texture.encoding = THREE.sRGBEncoding;
      return texture;
    }

    function loadTextures() {
      return {
        grass: loadTexture("images/city/textures/ground-grass-soil.png", [1.2, 1.2]),
        soil: loadTexture("images/city/textures/terrain-soil.png", [1.35, 1.35]),
        rock: loadTexture("images/city/textures/terrain-mountain-rock.png", [1.1, 1.1]),
        water: loadTexture("images/city/textures/terrain-water.png", [1.7, 1.7]),
        foliage: loadTexture("images/city/textures/foliage-canopy.png", [1.1, 1.1]),
        vehicle: loadTexture("images/city/textures/vehicle-metallic.png", [1, 1]),
        road: loadTexture("images/city/textures/road-asphalt.png", [1.4, 1.4]),
        residential: loadTexture("images/city/textures/facade-residential.png", [1.3, 2.3]),
        commercial: loadTexture("images/city/textures/facade-commercial.png", [1.2, 2.8]),
        industrial: loadTexture("images/city/textures/facade-industrial.png", [1.2, 1.3]),
        civic: loadTexture("images/city/textures/facade-civic.png", [1.1, 1.8])
      };
    }

    function createMaterials() {
      return {
        grass: new THREE.MeshStandardMaterial({ color: 0xb9c78e, map: textures.grass, bumpMap: textures.grass, bumpScale: .02, roughness: .98 }),
        soil: new THREE.MeshStandardMaterial({ color: 0xc1a177, map: textures.soil, bumpMap: textures.soil, bumpScale: .035, roughness: 1 }),
        mountain: new THREE.MeshStandardMaterial({ color: 0x737b78, map: textures.rock, bumpMap: textures.rock, bumpScale: .08, roughness: .94 }),
        river: new THREE.MeshPhysicalMaterial({ color: 0x48a9c1, map: textures.water, transparent: true, opacity: .84, roughness: .14, metalness: .08, clearcoat: 1 }),
        lake: new THREE.MeshPhysicalMaterial({ color: 0x2d8ca7, map: textures.water, transparent: true, opacity: .88, roughness: .11, metalness: .1, clearcoat: 1 }),
        sea: new THREE.MeshPhysicalMaterial({ color: 0x176a8a, map: textures.water, transparent: true, opacity: .92, roughness: .08, metalness: .14, clearcoat: 1 }),
        road: new THREE.MeshStandardMaterial({ color: 0x62696c, map: textures.road, bumpMap: textures.road, bumpScale: .018, roughness: .9 }),
        sidewalk: new THREE.MeshStandardMaterial({ color: 0xb8b7b1, roughness: .9 }),
        lane: new THREE.MeshStandardMaterial({ color: 0xffe799, emissive: 0x3a2b09, emissiveIntensity: .15, roughness: .7 }),
        residential: new THREE.MeshStandardMaterial({ color: 0xffffff, map: textures.residential, roughness: .55, metalness: .08 }),
        commercial: new THREE.MeshStandardMaterial({ color: 0xd9efff, map: textures.commercial, roughness: .22, metalness: .32 }),
        industrial: new THREE.MeshStandardMaterial({ color: 0xdce0e2, map: textures.industrial, roughness: .6, metalness: .28 }),
        civic: new THREE.MeshStandardMaterial({ color: 0xfff8e8, map: textures.civic, roughness: .5, metalness: .08 }),
        roof: new THREE.MeshStandardMaterial({ color: 0x27343e, roughness: .5, metalness: .42 }),
        concrete: new THREE.MeshStandardMaterial({ color: 0xbcb9b0, roughness: .82 }),
        darkMetal: new THREE.MeshStandardMaterial({ color: 0x202c34, roughness: .38, metalness: .76 }),
        copper: new THREE.MeshStandardMaterial({ color: 0xa66a42, roughness: .38, metalness: .68 }),
        gold: new THREE.MeshStandardMaterial({ color: 0xd7b24f, roughness: .26, metalness: .8 }),
        glass: new THREE.MeshPhysicalMaterial({ color: 0x91cbe8, transparent: true, opacity: .72, roughness: .06, metalness: .2, clearcoat: 1 }),
        treeTrunk: new THREE.MeshStandardMaterial({ color: 0x68452e, roughness: 1 }),
        treeLeaf: new THREE.MeshStandardMaterial({ color: 0x4a924b, map: textures.foliage, roughness: .88 }),
        treeLeafLight: new THREE.MeshStandardMaterial({ color: 0x79ac54, map: textures.foliage, roughness: .86 }),
        grassDetail: new THREE.MeshStandardMaterial({ color: 0x57964a, roughness: .95 }),
        white: new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: .62 }),
        tire: new THREE.MeshStandardMaterial({ color: 0x111518, roughness: .82 }),
        chrome: new THREE.MeshStandardMaterial({ color: 0xbec8cb, roughness: .16, metalness: .92 }),
        headlight: new THREE.MeshStandardMaterial({ color: 0xeafaff, emissive: 0xaeeaff, emissiveIntensity: 1.7 }),
        glow: new THREE.MeshStandardMaterial({ color: 0x9feaff, emissive: 0x27b9ff, emissiveIntensity: 2.2, roughness: .2 })
      };
    }

    function createGeometry() {
      return {
        terrain: new THREE.BoxGeometry(TILE * .96, 1, TILE * .96),
        road: new THREE.BoxGeometry(TILE, .055, TILE),
        lane: new THREE.BoxGeometry(.04, .012, .24),
        cube: new THREE.BoxGeometry(1, 1, 1),
        cylinder: new THREE.CylinderGeometry(.5, .5, 1, 24),
        cylinder12: new THREE.CylinderGeometry(.5, .5, 1, 12),
        wheel: new THREE.CylinderGeometry(.5, .5, 1, 18),
        sphere: new THREE.SphereGeometry(.5, 24, 16),
        cone: new THREE.ConeGeometry(.5, 1, 18),
        torus: new THREE.TorusGeometry(.5, .08, 12, 32),
        treeCrown: new THREE.IcosahedronGeometry(.5, 3),
        mountain: new THREE.ConeGeometry(.52, 1, 7, 3),
        selection: new THREE.RingGeometry(.37, .46, 4, 1),
        beacon: new THREE.CylinderGeometry(.12, .42, 4.2, 24, 1, true)
      };
    }

    function setupLights() {
      scene.add(new THREE.HemisphereLight(0xe9f7ff, 0x66705a, 2.35));
      const sun = new THREE.DirectionalLight(0xfff1d1, 5.8);
      sun.position.set(-34, 52, 24);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -32;
      sun.shadow.camera.right = 32;
      sun.shadow.camera.top = 32;
      sun.shadow.camera.bottom = -32;
      sun.shadow.camera.near = 3;
      sun.shadow.camera.far = 120;
      sun.shadow.bias = -.00025;
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x78bdff, 1.35);
      fill.position.set(36, 22, -40);
      scene.add(fill);
    }

    function createEnvironment() {
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), materials.sea);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -1.15;
      ground.receiveShadow = true;
      scene.add(ground);
      const horizon = new THREE.Mesh(new THREE.CylinderGeometry(155, 170, 12, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x7e9fa9, roughness: .88, side: THREE.BackSide }));
      horizon.position.y = 3.5;
      scene.add(horizon);
    }

    function worldPosition(id) {
      const { x, z } = City.parseTileId(id);
      return { x: (x - (MAP_SIZE - 1) / 2) * TILE, z: (z - (MAP_SIZE - 1) / 2) * TILE };
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

    function clearRoot(root) {
      root.clear();
    }

    function clearDynamic() {
      clearRoot(terrainRoot);
      clearRoot(buildingRoot);
      clearRoot(natureRoot);
      clearRoot(trafficRoot);
      clearRoot(selectionRoot);
      while (selectionResources.length) selectionResources.pop()?.dispose?.();
      terrainTargets.length = 0;
      animated.length = 0;
      while (dynamicResources.length) dynamicResources.pop()?.dispose?.();
    }

    function render(nextCity) {
      city = nextCity ? JSON.parse(JSON.stringify(nextCity)) : null;
      clearDynamic();
      if (!city) return;
      createTerrain();
      const playerColor = new THREE.Color(city.color || "#f5c84c");
      Object.values(city.tiles || {}).forEach((tile) => {
        const definition = City.BUILDINGS[tile.buildingId];
        if (definition?.model === "road") createRoad(tile, definition);
        else createBuilding(tile, definition, playerColor);
      });
      createTraffic();
      updateSelection();
    }

    function createTerrain() {
      const buckets = { grass: [], soil: [], mountain: [], river: [], lake: [], sea: [] };
      const dummy = new THREE.Object3D();
      for (let z = 0; z < MAP_SIZE; z += 1) {
        for (let x = 0; x < MAP_SIZE; x += 1) {
          const terrain = City.terrainAt(city.id, x, z);
          buckets[terrain.type].push({ x, z, terrain });
        }
      }
      Object.entries(buckets).forEach(([type, entries]) => {
        if (!entries.length) return;
        const instances = new THREE.InstancedMesh(shared.terrain, materials[type], entries.length);
        const ids = [];
        entries.forEach((entry, index) => {
          const id = City.tileId(entry.x, entry.z);
          const position = worldPosition(id);
          const water = entry.terrain.water;
          const height = type === "mountain" ? .22 : water ? .04 : .08 + Math.max(0, entry.terrain.height) * .08;
          dummy.position.set(position.x, water ? -.14 : height / 2 - .05, position.z);
          dummy.scale.set(1, height, 1);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          instances.setMatrixAt(index, dummy.matrix);
          ids.push(id);
          if (type === "mountain" && ((entry.x * 7 + entry.z * 13) % 31 === 0)) createMountainDetail(position.x, position.z, entry.terrain.height, id);
          else if ((type === "grass" || type === "soil") && !city.tiles?.[id]) createNaturalDetail(position.x, position.z, id, type);
        });
        instances.instanceMatrix.needsUpdate = true;
        instances.receiveShadow = !["river", "lake", "sea"].includes(type);
        instances.userData.tileIds = ids;
        instances.userData.terrainType = type;
        terrainRoot.add(instances);
        terrainTargets.push(instances);
      });
    }

    function hashText(value) {
      let hash = 2166136261;
      for (const char of String(value || "")) {
        hash ^= char.codePointAt(0);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    }

    function createMountainDetail(x, z, height, seed) {
      const hash = hashText(`${city.id}-${seed}`);
      const scale = .5 + (hash % 100) / 180 + Math.max(0, height) * .18;
      const peak = mesh(shared.mountain, materials.mountain, [x, .18 + scale * .48, z], [scale, scale, scale], natureRoot);
      peak.rotation.y = (hash % 628) / 100;
      peak.castShadow = false;
    }

    function createNaturalDetail(x, z, seed, type) {
      const hash = hashText(`${city.id}-${seed}`);
      if (hash % 211 === 0) addTree(natureRoot, x - .16, z + .12, .58 + (hash % 17) / 80, hash % 2);
      else if (hash % 149 === 0) {
        const rock = mesh(shared.sphere, type === "soil" ? materials.mountain : materials.concrete, [x + .16, .06, z - .18], [.11, .07, .09], natureRoot);
        rock.rotation.y = hash * .001;
        rock.castShadow = false;
      } else if (hash % 97 === 0) {
        const grass = mesh(shared.cone, materials.grassDetail, [x - .16, .06, z + .16], [.055, .11, .055], natureRoot);
        grass.rotation.z = .12;
        grass.castShadow = false;
      }
    }

    function createRoad(tile, definition) {
      const position = worldPosition(tile.id);
      const terrain = City.terrainAt(city.id, City.parseTileId(tile.id).x, City.parseTileId(tile.id).z);
      const y = definition.bridge ? .2 : .055;
      const road = mesh(shared.road, materials.road, [position.x, y, position.z], [1, definition.bridge ? 1.7 : 1, 1], terrainRoot);
      road.userData.tileId = tile.id;
      const links = City.neighbors(tile.id).filter((id) => City.isRoadTile(city.tiles?.[id]));
      const point = City.parseTileId(tile.id);
      const horizontal = links.some((id) => City.parseTileId(id).x !== point.x);
      const vertical = links.some((id) => City.parseTileId(id).z !== point.z);
      if (horizontal || !vertical) {
        [-.27, .27].forEach((offset) => mesh(shared.cube, materials.sidewalk, [position.x, y + .045, position.z + offset], [TILE, .07, .09], terrainRoot));
        [-.25, .25].forEach((offset) => mesh(shared.lane, materials.lane, [position.x + offset, y + .04, position.z], [1, 1, 1], terrainRoot).rotateZ(Math.PI / 2));
      }
      if (vertical) {
        [-.27, .27].forEach((offset) => mesh(shared.cube, materials.sidewalk, [position.x + offset, y + .045, position.z], [.09, .07, TILE], terrainRoot));
        [-.25, .25].forEach((offset) => mesh(shared.lane, materials.lane, [position.x, y + .04, position.z + offset], [1, 1, 1], terrainRoot));
      }
      if (definition.id === "avenue") addTree(terrainRoot, position.x + .31, position.z + .31, .38, point.x % 2);
      if (terrain.water && definition.bridge) {
        [-.3, .3].forEach((offset) => mesh(shared.cylinder12, materials.concrete, [position.x + offset, -.02, position.z], [.05, .42, .05], terrainRoot));
      }
    }

    function createBuilding(tile, definition, playerColor) {
      if (!definition) return;
      const position = worldPosition(tile.id);
      const group = new THREE.Group();
      group.position.set(position.x, .07, position.z);
      group.userData.tileId = tile.id;
      buildingRoot.add(group);
      const level = Math.max(1, Math.min(3, Number(tile.level) || 1));
      const variant = Math.max(0, Number(definition.variant) || 0);
      const builders = { residential: buildResidential, commercial: buildCommercial, industrial: buildIndustrial, park: buildPark, power: buildPower, water: buildWater, civic: buildCivic, arena: buildArena };
      (builders[definition.model] || buildResidential)(group, level, playerColor, tile.id, variant);
    }

    function addBase(group, color) {
      const material = materials.concrete.clone();
      material.color = new THREE.Color(color).lerp(new THREE.Color(0xffffff), .78);
      dynamicResources.push(material);
      mesh(shared.cube, material, [0, .055, 0], [.76, .11, .76], group);
    }

    function accentMaterial(color, lightness = .35) {
      const material = materials.gold.clone();
      material.color = new THREE.Color(color).lerp(new THREE.Color(0xffffff), lightness);
      dynamicResources.push(material);
      return material;
    }

    function buildResidential(group, level, color, seed, variant) {
      addBase(group, color);
      const height = .82 + level * .28 + (variant % 5) * .08;
      const width = .54 + (variant % 3) * .06;
      mesh(shared.cube, materials.residential, [0, .1 + height / 2, 0], [width, height, .56], group);
      if (variant % 4 === 1) mesh(shared.cube, materials.residential, [.23, .22 + height * .38, -.08], [.27, height * .7, .42], group);
      mesh(shared.cube, materials.roof, [0, .13 + height, 0], [width + .04, .06, .6], group);
      const accent = accentMaterial(color);
      [-.2, .2].forEach((x) => mesh(shared.cube, accent, [x, height * .53, .3], [.2, .025, .08], group));
      if (variant >= 10) mesh(shared.cylinder12, materials.glass, [0, height + .28, 0], [.12, .28, .12], group);
    }

    function buildCommercial(group, level, color, seed, variant) {
      addBase(group, color);
      const lower = .9 + level * .31 + (variant % 4) * .1;
      mesh(shared.cube, materials.commercial, [0, .1 + lower / 2, 0], [.62, lower, .56], group);
      if (level >= 2 || variant > 5) mesh(shared.cube, materials.commercial, [-.05, lower + .26, -.03], [.45, .5 + variant * .015, .42], group);
      if (level >= 3 || variant > 11) mesh(shared.cube, materials.commercial, [.02, lower + .7, -.02], [.27, .36, .3], group);
      const crown = accentMaterial(color, .2);
      mesh(shared.cube, crown, [0, lower + (level >= 2 ? .53 : .07), 0], [.65 - level * .08, .06, .6 - level * .07], group);
      if (variant % 3 === 2) {
        const spire = mesh(shared.cone, crown, [0, lower + 1.05, 0], [.08, .5, .08], group);
        spire.rotation.y = variant;
      }
    }

    function buildIndustrial(group, level, color, seed, variant) {
      addBase(group, 0x727a80);
      mesh(shared.cube, materials.industrial, [-.08, .31, .03], [.55, .54 + variant * .015, .62], group);
      mesh(shared.cube, materials.roof, [-.08, .6 + variant * .015, .03], [.59, .055, .66], group);
      const count = 2 + level + variant % 3;
      for (let index = 0; index < count; index += 1) {
        const x = -.26 + index * (.52 / Math.max(1, count - 1));
        mesh(shared.cylinder12, materials.darkMetal, [x, .82 + level * .05, -.14], [.065, .48 + level * .1, .065], group);
        mesh(shared.cylinder12, materials.copper, [x, 1.08 + level * .1, -.14], [.085, .05, .085], group);
      }
      const tank = mesh(shared.cylinder, materials.darkMetal, [.25, .28, .18], [.16, .4, .16], group);
      tank.rotation.z = Math.PI / 2;
      if (variant >= 8) mesh(shared.torus, materials.copper, [.12, .48, .25], [.23, .23, .23], group).rotation.x = Math.PI / 2;
    }

    function buildPark(group, level, color, seed, variant) {
      addBase(group, color);
      mesh(shared.cube, materials.grass, [0, .09, 0], [.7, .08, .7], group);
      const count = 3 + level + variant % 4;
      for (let index = 0; index < count; index += 1) {
        const angle = index / count * Math.PI * 2 + hashText(seed) * .0001;
        const radius = .22 + (index % 2) * .12;
        addTree(group, Math.cos(angle) * radius, Math.sin(angle) * radius, .56 + (index % 3) * .08, index % 2);
      }
      if (variant % 3 === 0) {
        mesh(shared.cylinder, materials.concrete, [0, .14, 0], [.16, .08, .16], group);
        const water = mesh(shared.cylinder, materials.lake, [0, .19, 0], [.13, .025, .13], group);
        animated.push({ object: water, type: "water" });
      } else if (variant % 3 === 1) mesh(shared.cube, materials.civic, [0, .16, 0], [.34, .04, .12], group);
    }

    function addTree(group, x, z, scale, variant) {
      mesh(shared.cylinder12, materials.treeTrunk, [x, .19 * scale, z], [.045 * scale, .38 * scale, .045 * scale], group);
      const leaf = variant ? materials.treeLeafLight : materials.treeLeaf;
      [[0, .47, 0, .24], [-.12, .4, .03, .19], [.12, .42, -.02, .2]].forEach(([dx, y, dz, size], index) => {
        const crown = mesh(shared.treeCrown, leaf, [x + dx * scale, y * scale, z + dz * scale], [size * scale, size * 1.18 * scale, size * scale], group);
        crown.rotation.y = x * 3 + index;
        crown.castShadow = scale > .5;
      });
    }

    function buildPower(group, level, color, seed, variant) {
      addBase(group, 0x626d74);
      mesh(shared.cube, materials.industrial, [0, .3, 0], [.62, .44, .6], group);
      const turbines = 3 + level + variant % 3;
      for (let index = 0; index < turbines; index += 1) {
        const x = -.25 + index * (.5 / Math.max(1, turbines - 1));
        const turbine = mesh(shared.cylinder, materials.darkMetal, [x, .65, .04], [.08, .32, .08], group);
        turbine.rotation.x = Math.PI / 2;
        const ring = mesh(shared.torus, materials.glow, [x, .65, .21], [.11, .11, .11], group);
        animated.push({ object: ring, type: "spin", speed: 1.4 + index * .2 });
      }
      if (variant >= 4) mesh(shared.sphere, materials.glass, [0, .92, -.12], [.22, .14, .22], group);
    }

    function buildWater(group, level, color, seed, variant) {
      addBase(group, 0x718690);
      const height = .56 + level * .1 + variant * .015;
      [-.22, .22].forEach((x) => [-.22, .22].forEach((z) => mesh(shared.cylinder12, materials.darkMetal, [x, height / 2, z], [.034, height, .034], group)));
      mesh(shared.cylinder, materials.lake, [0, height + .16, 0], [.34, .28, .34], group);
      mesh(shared.sphere, materials.glass, [0, height + .3, 0], [.3, .13, .3], group);
      const ring = mesh(shared.torus, materials.gold, [0, height + .15, 0], [.36, .36, .36], group);
      ring.rotation.x = Math.PI / 2;
      if (variant >= 4) mesh(shared.cylinder12, materials.copper, [0, height + .62, 0], [.03, .55, .03], group);
    }

    function buildCivic(group, level, color, seed, variant) {
      addBase(group, color);
      const width = .64 + (variant % 3) * .04;
      mesh(shared.cube, materials.civic, [0, .42, 0], [width, .76 + variant * .02, .55], group);
      mesh(shared.cube, materials.civic, [0, .89 + variant * .02, -.04], [.42, .2, .4], group);
      const dome = mesh(shared.sphere, materials.gold, [0, 1.06 + variant * .02, -.04], [.2, .12, .2], group);
      dome.castShadow = true;
      for (let index = -2; index <= 2; index += 1) mesh(shared.cylinder12, materials.civic, [index * .11, .36, .31], [.028, .54, .028], group);
      const banner = accentMaterial(color, .05);
      banner.emissive = new THREE.Color(color);
      banner.emissiveIntensity = .28;
      mesh(shared.cube, banner, [0, .74, .29], [.34, .08, .02], group);
      if (variant >= 6) mesh(shared.cylinder12, materials.glass, [0, 1.4, 0], [.08, .62, .08], group);
    }

    function buildArena(group, level, color, seed, variant) {
      addBase(group, color);
      const bowl = mesh(shared.cylinder, materials.civic, [0, .28, 0], [.39, .46 + variant * .015, .39], group);
      bowl.scale.z = .72;
      const roof = mesh(shared.torus, materials.darkMetal, [0, .53 + variant * .015, 0], [.47, .47, .47], group);
      roof.rotation.x = Math.PI / 2;
      roof.scale.z = .72;
      const field = mesh(shared.cylinder, materials.grass, [0, .55 + variant * .015, 0], [.3, .03, .3], group);
      field.scale.z = .68;
      const accent = accentMaterial(color, .1);
      accent.emissive = new THREE.Color(color);
      accent.emissiveIntensity = .8;
      const halo = mesh(shared.torus, accent, [0, .64 + level * .04 + variant * .015, 0], [.51, .51, .51], group);
      halo.rotation.x = Math.PI / 2;
      halo.scale.z = .72;
      animated.push({ object: halo, type: "pulse" });
      if (variant >= 5) mesh(shared.cube, materials.glass, [0, .92, 0], [.24, .4, .24], group);
    }

    function createTraffic() {
      const roads = Object.values(city.tiles || {}).filter(City.isRoadTile);
      roads.slice(0, 28).forEach((tile, index) => {
        const position = worldPosition(tile.id);
        const car = createVehicle(index);
        car.position.set(position.x + ((index % 3) - 1) * .12, .1, position.z + (index % 2 ? .1 : -.1));
        trafficRoot.add(car);
        animated.push({ object: car, type: "car", origin: car.position.clone(), axis: index % 2, phase: index * .7 });
      });
    }

    function createVehicle(index) {
      const car = new THREE.Group();
      const palette = [0xd82f3d, 0xf4f2e8, 0x2f7bd8, 0xe0aa2e, 0x20282f, 0x6a42aa];
      const paint = new THREE.MeshPhysicalMaterial({ color: palette[index % palette.length], map: textures.vehicle, roughness: .16, metalness: .72, clearcoat: 1, clearcoatRoughness: .08 });
      dynamicResources.push(paint);
      mesh(shared.cube, materials.darkMetal, [0, .055, 0], [.29, .045, .14], car);
      mesh(shared.cube, paint, [0, .105, 0], [.31, .075, .15], car);
      const hood = mesh(shared.cube, paint, [.12, .145, 0], [.11, .05, .145], car);
      hood.rotation.z = -.08;
      const cabin = mesh(shared.cube, materials.glass, [-.035, .175, 0], [.14, .09, .13], car);
      cabin.rotation.z = .04;
      [-.105, .105].forEach((x) => [-.085, .085].forEach((z) => {
        const wheel = mesh(shared.wheel, materials.tire, [x, .07, z], [.045, .035, .045], car);
        wheel.rotation.x = Math.PI / 2;
        mesh(shared.wheel, materials.chrome, [x, .07, z * 1.01], [.018, .037, .018], car).rotation.x = Math.PI / 2;
      }));
      [-.048, .048].forEach((z) => mesh(shared.cube, materials.headlight, [.177, .12, z], [.012, .025, .025], car));
      mesh(shared.cube, materials.chrome, [.185, .08, 0], [.014, .018, .12], car);
      car.scale.setScalar(1.05);
      return car;
    }

    function updateSelection() {
      selectionRoot.clear();
      while (selectionResources.length) selectionResources.pop()?.dispose?.();
      if (!selectedId) return;
      const position = worldPosition(selectedId);
      const terrain = City.terrainAt(city?.id, City.parseTileId(selectedId).x, City.parseTileId(selectedId).z);
      const color = buildMode ? 0x55e2ff : 0xffd45d;
      const selectionMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
      const beaconMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      selectionResources.push(selectionMaterial, beaconMaterial);
      const ring = new THREE.Mesh(shared.selection, selectionMaterial);
      ring.position.set(position.x, Math.max(.16, terrain.height * .05 + .16), position.z);
      ring.rotation.x = -Math.PI / 2;
      ring.rotation.z = Math.PI / 4;
      selectionRoot.add(ring);
      const beacon = new THREE.Mesh(shared.beacon, beaconMaterial);
      beacon.position.set(position.x, 2, position.z);
      selectionRoot.add(beacon);
      animated.push({ object: ring, type: "selection", beacon, material: selectionMaterial, beaconMaterial });
    }

    function bindControls() {
      const canvas = renderer.domElement;
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
      canvas.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("contextmenu", (event) => event.preventDefault());
      global.addEventListener("resize", resize);
    }

    function onPointerDown(event) {
      drag = { id: event.pointerId, lastX: event.clientX, lastY: event.clientY, moved: 0, button: event.button };
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
        const pan = distance * .0025;
        target.x -= dx * pan * Math.cos(yaw) + dy * pan * Math.sin(yaw);
        target.z += dx * pan * Math.sin(yaw) - dy * pan * Math.cos(yaw);
        const limit = MAP_SIZE * TILE * .52;
        target.x = Math.max(-limit, Math.min(limit, target.x));
        target.z = Math.max(-limit, Math.min(limit, target.z));
      } else {
        yaw -= dx * .006;
        pitch = Math.max(.28, Math.min(1.2, pitch + dy * .004));
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
      distance = Math.max(8, Math.min(165, distance * Math.exp(event.deltaY * .0012)));
      updateCamera();
    }

    function pickTile(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(terrainTargets, false)[0];
      const id = hit?.object?.userData?.tileIds?.[hit.instanceId];
      if (!id) return;
      selectedId = id;
      updateSelection();
      options.onSelect?.(selectedId);
    }

    function updateCamera() {
      const horizontal = Math.cos(pitch) * distance;
      camera.position.set(target.x + Math.sin(yaw) * horizontal, target.y + Math.sin(pitch) * distance, target.z + Math.cos(yaw) * horizontal);
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
      textures.water.offset.x = elapsed * .004;
      textures.water.offset.y = elapsed * .002;
      animated.forEach((item) => {
        if (item.type === "spin") item.object.rotation.z = elapsed * item.speed;
        else if (item.type === "water") item.object.scale.y = .95 + Math.sin(elapsed * 2.4) * .1;
        else if (item.type === "pulse") item.object.scale.x = item.object.scale.y = 1 + Math.sin(elapsed * 2.2) * .035;
        else if (item.type === "car") {
          const travel = Math.sin(elapsed * .32 + item.phase) * .28;
          item.object.position[item.axis ? "x" : "z"] = item.origin[item.axis ? "x" : "z"] + travel;
          item.object.rotation.y = item.axis ? Math.PI / 2 : 0;
        } else if (item.type === "selection") {
          item.object.rotation.z = Math.PI / 4 + elapsed * .65;
          item.material.opacity = .68 + Math.sin(elapsed * 3) * .2;
          item.beaconMaterial.opacity = .1 + Math.sin(elapsed * 2.2) * .045;
          item.beacon.position.y = 1.95 + Math.sin(elapsed * 1.7) * .14;
        }
      });
      renderer.render(scene, camera);
      frame = global.requestAnimationFrame(animate);
    }

    function setSelected(id) {
      selectedId = String(id || "");
      if (city) updateSelection();
    }

    function setBuildMode(id) {
      buildMode = String(id || "");
      if (city) updateSelection();
    }

    function focusTile(id, overview = false) {
      const position = worldPosition(id || City.tileId(City.CITY_CENTER, City.CITY_CENTER));
      target.set(position.x, 0, position.z);
      distance = overview ? 145 : 28;
      updateCamera();
      if (!overview) setSelected(id);
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
