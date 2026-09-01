(function bootstrapBingoCityMap3D(global) {
  "use strict";

  const TILE = .86;
  const HEIGHT_SCALE = 2.5;
  const WATER_HEIGHT = Object.freeze({ river: -.14, lake: -.2, sea: -.26 });

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
    let terrainCache = [];
    let mountainDepth = [];
    let cornerHeightMemo = [];
    let cornerNormalMemo = [];
    let cornerTerrainMixMemo = [];
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
        terrain: createTerrainMaterial(),
        grass: new THREE.MeshStandardMaterial({ color: 0xb9c78e, map: textures.grass, bumpMap: textures.grass, bumpScale: .02, roughness: .98 }),
        soil: new THREE.MeshStandardMaterial({ color: 0xc1a177, map: textures.soil, bumpMap: textures.soil, bumpScale: .035, roughness: 1 }),
        mountain: new THREE.MeshStandardMaterial({ color: 0xaeb4aa, map: textures.rock, bumpMap: textures.rock, bumpScale: .075, roughness: .92 }),
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

    function createTerrainMaterial() {
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.grass,
        roughness: .88,
        metalness: .025,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
      });
      material.onBeforeCompile = (shader) => {
        shader.uniforms.terrainSoil = { value: textures.soil };
        shader.uniforms.terrainRock = { value: textures.rock };
        shader.uniforms.terrainWater = { value: textures.water };
        shader.uniforms.terrainTime = { value: 0 };
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nattribute vec4 terrainMix;\nvarying vec4 vTerrainMix;")
          .replace("#include <uv_vertex>", "#include <uv_vertex>\nvTerrainMix = terrainMix;");
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform sampler2D terrainSoil;\nuniform sampler2D terrainRock;\nuniform sampler2D terrainWater;\nuniform float terrainTime;\nvarying vec4 vTerrainMix;")
          .replace("#include <map_fragment>", `
#ifdef USE_MAP
  vec4 terrainWeights = max(vTerrainMix, vec4(0.0));
  terrainWeights /= max(0.0001, dot(terrainWeights, vec4(1.0)));
  vec2 terrainUv = vMapUv;
  vec4 grassTexel = texture2D(map, terrainUv);
  vec4 soilTexel = texture2D(terrainSoil, terrainUv * 1.08 + vec2(0.17, 0.09));
  vec4 rockTexel = texture2D(terrainRock, terrainUv * 0.92 + vec2(0.31, 0.24));
  vec2 waterUv = terrainUv * 1.16 + vec2(terrainTime * 0.004, terrainTime * 0.002);
  vec4 waterTexel = texture2D(terrainWater, waterUv);
  grassTexel.rgb *= vec3(0.94, 1.02, 0.86);
  soilTexel.rgb *= vec3(1.02, 0.92, 0.78);
  rockTexel.rgb *= vec3(0.92, 0.96, 0.94);
  waterTexel.rgb *= vec3(0.35, 0.88, 1.12);
  diffuseColor *= grassTexel * terrainWeights.x
    + soilTexel * terrainWeights.y
    + rockTexel * terrainWeights.z
    + waterTexel * terrainWeights.w;
#endif
          `)
          .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.24, smoothstep(0.35, 0.9, vTerrainMix.w));")
          .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.08, smoothstep(0.45, 0.95, vTerrainMix.w));");
        material.userData.shader = shader;
      };
      material.customProgramCacheKey = () => "bingo-city-terrain-splat-v1";
      return material;
    }

    function createGeometry() {
      return {
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
        mountain: new THREE.DodecahedronGeometry(.5, 1),
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
      sun.shadow.camera.left = -78;
      sun.shadow.camera.right = 78;
      sun.shadow.camera.top = 78;
      sun.shadow.camera.bottom = -78;
      sun.shadow.camera.near = 3;
      sun.shadow.camera.far = 180;
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
      terrainCache = [];
      mountainDepth = [];
      cornerHeightMemo = [];
      cornerNormalMemo = [];
      cornerTerrainMixMemo = [];
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

    function terrainCenterHeight(terrain, x = -1, z = -1) {
      if (terrain?.water) return WATER_HEIGHT[terrain.type] ?? -.18;
      if (terrain?.type === "mountain" && x >= 0 && z >= 0) {
        const depth = Math.min(9, Number(mountainDepth[z * MAP_SIZE + x]) || 0);
        const ridgeA = Math.sin((x + 13) * .31) * Math.cos((z - 7) * .27);
        const ridgeB = Math.sin((x + z) * .17) * .55;
        const foothill = Math.pow(depth / 9, .72);
        return .08 + foothill * 3.9 + (ridgeA + ridgeB) * (.08 + foothill * .34);
      }
      const rolling = x >= 0 && z >= 0
        ? (Math.sin((x + 5) * .071) + Math.cos((z - 9) * .063) + Math.sin((x + z) * .037)) * .035
        : 0;
      return .015 + Math.max(0, Number(terrain?.height) || 0) * HEIGHT_SCALE + rolling;
    }

    function terrainAtPoint(x, z) {
      const px = Math.max(0, Math.min(MAP_SIZE - 1, x));
      const pz = Math.max(0, Math.min(MAP_SIZE - 1, z));
      return terrainCache[pz * MAP_SIZE + px] || City.terrainAt(city.id, px, pz);
    }

    function cornerSurfaceHeight(gridX, gridZ) {
      const cacheKey = gridZ * (MAP_SIZE + 1) + gridX;
      if (cornerHeightMemo[cacheKey] !== undefined) return cornerHeightMemo[cacheKey];
      const samples = [];
      for (let dz = -4; dz <= 3; dz += 1) {
        for (let dx = -4; dx <= 3; dx += 1) {
          const x = gridX + dx;
          const z = gridZ + dz;
          if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) continue;
          const terrain = terrainCache[z * MAP_SIZE + x] || City.terrainAt(city.id, x, z);
          const distance = Math.hypot(x + .5 - gridX, z + .5 - gridZ);
          const weight = Math.exp(-(distance * distance) / 7.5);
          samples.push([terrainCenterHeight(terrain, x, z), weight]);
        }
      }
      const height = samples.length
        ? samples.reduce((sum, [value, weight]) => sum + value * weight, 0) / samples.reduce((sum, [, weight]) => sum + weight, 0)
        : 0;
      cornerHeightMemo[cacheKey] = height;
      return height;
    }

    function terrainMixAtCorner(gridX, gridZ) {
      const cacheKey = gridZ * (MAP_SIZE + 1) + gridX;
      if (cornerTerrainMixMemo[cacheKey]) return cornerTerrainMixMemo[cacheKey];
      const weights = [0, 0, 0, 0];
      for (let dz = -4; dz <= 3; dz += 1) {
        for (let dx = -4; dx <= 3; dx += 1) {
          const x = gridX + dx;
          const z = gridZ + dz;
          if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) continue;
          const terrain = terrainAtPoint(x, z);
          const distance = Math.hypot(x + .5 - gridX, z + .5 - gridZ);
          const weight = Math.exp(-(distance * distance) / 6.2);
          const channel = terrain.water ? 3 : terrain.type === "mountain" ? 2 : terrain.type === "soil" ? 1 : 0;
          weights[channel] += weight;
        }
      }
      const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
      const normalized = weights.map((weight) => weight / total);
      cornerTerrainMixMemo[cacheKey] = normalized;
      return normalized;
    }

    function cornerSurfaceNormal(gridX, gridZ, flat = false) {
      if (flat) return [0, 1, 0];
      const cacheKey = gridZ * (MAP_SIZE + 1) + gridX;
      if (cornerNormalMemo[cacheKey]) return cornerNormalMemo[cacheKey];
      const left = cornerSurfaceHeight(Math.max(0, gridX - 1), gridZ);
      const right = cornerSurfaceHeight(Math.min(MAP_SIZE, gridX + 1), gridZ);
      const back = cornerSurfaceHeight(gridX, Math.max(0, gridZ - 1));
      const front = cornerSurfaceHeight(gridX, Math.min(MAP_SIZE, gridZ + 1));
      const normal = new THREE.Vector3(left - right, TILE * 2, back - front).normalize().toArray();
      cornerNormalMemo[cacheKey] = normal;
      return normal;
    }

    function tileSurfaceHeight(id) {
      const point = City.parseTileId(id);
      return (
        cornerSurfaceHeight(point.x, point.z)
        + cornerSurfaceHeight(point.x + 1, point.z)
        + cornerSurfaceHeight(point.x + 1, point.z + 1)
        + cornerSurfaceHeight(point.x, point.z + 1)
      ) / 4;
    }

    function pushTerrainVertex(positions, normals, uvs, terrainMixes, x, y, z, u, v, normal, terrainMix) {
      positions.push(x, y, z);
      normals.push(normal[0], normal[1], normal[2]);
      uvs.push(u, v);
      terrainMixes.push(terrainMix[0], terrainMix[1], terrainMix[2], terrainMix[3]);
    }

    function createTerrainSurface(entries) {
      if (!entries.length) return;
      const positions = [];
      const normals = [];
      const uvs = [];
      const terrainMixes = [];
      const faceTileIds = [];
      entries.forEach((entry) => {
        const id = City.tileId(entry.x, entry.z);
        const position = worldPosition(id);
        const x0 = position.x - TILE / 2;
        const x1 = position.x + TILE / 2;
        const z0 = position.z - TILE / 2;
        const z1 = position.z + TILE / 2;
        const y00 = cornerSurfaceHeight(entry.x, entry.z);
        const y10 = cornerSurfaceHeight(entry.x + 1, entry.z);
        const y11 = cornerSurfaceHeight(entry.x + 1, entry.z + 1);
        const y01 = cornerSurfaceHeight(entry.x, entry.z + 1);
        const u0 = entry.x * .23;
        const u1 = (entry.x + 1) * .23;
        const v0 = entry.z * .23;
        const v1 = (entry.z + 1) * .23;
        const n00 = cornerSurfaceNormal(entry.x, entry.z);
        const n10 = cornerSurfaceNormal(entry.x + 1, entry.z);
        const n11 = cornerSurfaceNormal(entry.x + 1, entry.z + 1);
        const n01 = cornerSurfaceNormal(entry.x, entry.z + 1);
        const m00 = terrainMixAtCorner(entry.x, entry.z);
        const m10 = terrainMixAtCorner(entry.x + 1, entry.z);
        const m11 = terrainMixAtCorner(entry.x + 1, entry.z + 1);
        const m01 = terrainMixAtCorner(entry.x, entry.z + 1);
        pushTerrainVertex(positions, normals, uvs, terrainMixes, x0, y00, z0, u0, v0, n00, m00);
        pushTerrainVertex(positions, normals, uvs, terrainMixes, x1, y11, z1, u1, v1, n11, m11);
        pushTerrainVertex(positions, normals, uvs, terrainMixes, x1, y10, z0, u1, v0, n10, m10);
        pushTerrainVertex(positions, normals, uvs, terrainMixes, x0, y00, z0, u0, v0, n00, m00);
        pushTerrainVertex(positions, normals, uvs, terrainMixes, x0, y01, z1, u0, v1, n01, m01);
        pushTerrainVertex(positions, normals, uvs, terrainMixes, x1, y11, z1, u1, v1, n11, m11);
        faceTileIds.push(id, id);
        if ((entry.terrain.type === "grass" || entry.terrain.type === "soil") && !city.tiles?.[id]) createNaturalDetail(position.x, position.z, id, entry.terrain.type, tileSurfaceHeight(id));
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute("terrainMix", new THREE.Float32BufferAttribute(terrainMixes, 4));
      geometry.computeBoundingSphere();
      dynamicResources.push(geometry);
      const surface = new THREE.Mesh(geometry, materials.terrain);
      surface.receiveShadow = true;
      surface.castShadow = true;
      surface.userData.faceTileIds = faceTileIds;
      surface.userData.terrainType = "blended";
      terrainRoot.add(surface);
      terrainTargets.push(surface);
    }

    function createTerrainGrid() {
      const positions = [];
      const addSegment = (x0, z0, x1, z1) => {
        const wx0 = (x0 - MAP_SIZE / 2) * TILE;
        const wz0 = (z0 - MAP_SIZE / 2) * TILE;
        const wx1 = (x1 - MAP_SIZE / 2) * TILE;
        const wz1 = (z1 - MAP_SIZE / 2) * TILE;
        positions.push(wx0, cornerSurfaceHeight(x0, z0) + .012, wz0, wx1, cornerSurfaceHeight(x1, z1) + .012, wz1);
      };
      for (let z = 0; z <= MAP_SIZE; z += 1) for (let x = 0; x < MAP_SIZE; x += 1) addSegment(x, z, x + 1, z);
      for (let x = 0; x <= MAP_SIZE; x += 1) for (let z = 0; z < MAP_SIZE; z += 1) addSegment(x, z, x, z + 1);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({ color: 0x24372e, transparent: true, opacity: .065, depthWrite: false });
      dynamicResources.push(geometry, material);
      const grid = new THREE.LineSegments(geometry, material);
      grid.renderOrder = 3;
      terrainRoot.add(grid);
    }

    function createTerrain() {
      const entries = [];
      for (let z = 0; z < MAP_SIZE; z += 1) {
        for (let x = 0; x < MAP_SIZE; x += 1) {
          const terrain = City.terrainAt(city.id, x, z);
          terrainCache[z * MAP_SIZE + x] = terrain;
          entries.push({ x, z, terrain });
        }
      }
      calculateMountainDepth();
      createTerrainSurface(entries);
      createTerrainGrid();
    }

    function calculateMountainDepth() {
      const size = MAP_SIZE * MAP_SIZE;
      const distances = new Int16Array(size);
      distances.fill(-1);
      const queue = new Int32Array(size);
      let head = 0;
      let tail = 0;
      terrainCache.forEach((terrain, index) => {
        if (terrain?.type === "mountain") return;
        distances[index] = 0;
        queue[tail++] = index;
      });
      while (head < tail) {
        const index = queue[head++];
        const x = index % MAP_SIZE;
        const z = Math.floor(index / MAP_SIZE);
        const nextDistance = distances[index] + 1;
        [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]].forEach(([nx, nz]) => {
          if (nx < 0 || nz < 0 || nx >= MAP_SIZE || nz >= MAP_SIZE) return;
          const nextIndex = nz * MAP_SIZE + nx;
          if (distances[nextIndex] !== -1) return;
          distances[nextIndex] = nextDistance;
          queue[tail++] = nextIndex;
        });
      }
      mountainDepth = distances;
    }

    function hashText(value) {
      let hash = 2166136261;
      for (const char of String(value || "")) {
        hash ^= char.codePointAt(0);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    }

    function createMountainDetail(x, z, surfaceY, seed) {
      const hash = hashText(`${city.id}-${seed}`);
      const scale = .32 + (hash % 100) / 260;
      const peak = mesh(shared.mountain, materials.mountain, [x, surfaceY + scale * .22, z], [scale * 1.2, scale * .62, scale], natureRoot);
      peak.rotation.y = (hash % 628) / 100;
      peak.rotation.z = ((hash >>> 3) % 15 - 7) * .012;
      peak.castShadow = false;
    }

    function createNaturalDetail(x, z, seed, type, surfaceY) {
      const hash = hashText(`${city.id}-${seed}`);
      if (hash % 211 === 0) addTree(natureRoot, x - .16, z + .12, .58 + (hash % 17) / 80, hash % 2, surfaceY);
      else if (hash % 149 === 0) {
        const rock = mesh(shared.mountain, type === "soil" ? materials.mountain : materials.concrete, [x + .16, surfaceY + .045, z - .18], [.12, .08, .1], natureRoot);
        rock.rotation.y = hash * .001;
        rock.castShadow = false;
      } else if (hash % 97 === 0) {
        const grass = mesh(shared.cone, materials.grassDetail, [x - .16, surfaceY + .055, z + .16], [.055, .11, .055], natureRoot);
        grass.rotation.z = .12;
        grass.castShadow = false;
      }
    }

    function createRoad(tile, definition) {
      const position = worldPosition(tile.id);
      const terrain = City.terrainAt(city.id, City.parseTileId(tile.id).x, City.parseTileId(tile.id).z);
      const surfaceY = tileSurfaceHeight(tile.id);
      const y = definition.bridge ? Math.max(.2, surfaceY + .16) : surfaceY + .04;
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
      if (definition.id === "avenue") addTree(terrainRoot, position.x + .31, position.z + .31, .38, point.x % 2, surfaceY);
      if (terrain.water && definition.bridge) {
        const waterY = terrainCenterHeight(terrain, point.x, point.z);
        const pillarHeight = Math.max(.2, y - waterY + .08);
        [-.3, .3].forEach((offset) => mesh(shared.cylinder12, materials.concrete, [position.x + offset, waterY + pillarHeight / 2, position.z], [.05, pillarHeight, .05], terrainRoot));
      }
    }

    function createBuilding(tile, definition, playerColor) {
      if (!definition) return;
      const position = worldPosition(tile.id);
      const group = new THREE.Group();
      group.position.set(position.x, tileSurfaceHeight(tile.id) + .035, position.z);
      group.userData.tileId = tile.id;
      buildingRoot.add(group);
      const level = Math.max(1, Math.min(3, Number(tile.level) || 1));
      const variant = Math.max(0, Number(definition.variant) || 0);
      const builders = { residential: buildResidential, commercial: buildCommercial, industrial: buildIndustrial, park: buildPark, power: buildPower, water: buildWater, civic: buildCivic, arena: buildArena };
      (builders[definition.model] || buildResidential)(group, level, playerColor, tile.id, variant);
      addDistrictIdentity(group, definition.model, level, playerColor, tile.id, variant);
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

    function addBlock(group, material, x, z, width, depth, height, baseY = .11) {
      return mesh(shared.cube, material, [x, baseY + height / 2, z], [width, height, depth], group);
    }

    function addCappedBlock(group, material, x, z, width, depth, height, capMaterial = materials.roof, baseY = .11) {
      addBlock(group, material, x, z, width, depth, height, baseY);
      return mesh(shared.cube, capMaterial, [x, baseY + height + .025, z], [width + .025, .05, depth + .025], group);
    }

    function addFacadeBand(group, material, x, y, z, width, depth = .025) {
      return mesh(shared.cube, material, [x, y, z], [width, .045, depth], group);
    }

    const DISTRICT_ACCENT_COLORS = [0xd6b44d, 0x55ccef, 0x73c96b, 0xee6d58, 0xa97be8, 0xf19ed0, 0x54d5ba, 0xf2a342, 0xd8e5ed, 0x6f91ff];

    function districtMaterial(theme, playerColor, glow = false) {
      const material = (glow ? materials.glow : materials.gold).clone();
      const themeColor = new THREE.Color(DISTRICT_ACCENT_COLORS[theme % DISTRICT_ACCENT_COLORS.length]);
      material.color = themeColor.lerp(new THREE.Color(playerColor), .22);
      if (glow) {
        material.emissive = material.color.clone();
        material.emissiveIntensity = 1.15;
      }
      dynamicResources.push(material);
      return material;
    }

    function addDistrictIdentity(group, model, level, playerColor, seed, variant) {
      const form = variant % 10;
      const theme = Math.floor(variant / 10) % 10;
      const edition = Math.floor(variant / 100);
      if (theme === 0 && edition === 0) return;
      const accent = districtMaterial(theme + edition * 4, playerColor, theme === 6 || theme === 9 || edition > 0);
      const top = .44 + (form % 3) * .1 + (level - 1) * .05;
      const phase = hashText(`${seed}:${variant}`) % 628 / 100;
      const post = (x, z, height = .38, material = accent) => mesh(shared.cylinder12, material, [x, .13 + height / 2, z], [.028, height, .028], group);
      const halo = (x, y, z, radius, material = accent) => {
        const ring = mesh(shared.torus, material, [x, y, z], [radius, radius, radius], group);
        ring.rotation.x = Math.PI / 2;
        return ring;
      };
      const panel = (x, y, z, width = .2, depth = .12) => {
        const item = addBlock(group, materials.glass, x, z, width, depth, .018, y);
        item.rotation.x = -.22;
        return item;
      };
      const cornerPosts = (height = .42, material = accent) => [-.29, .29].forEach((x) => [-.25, .25].forEach((z) => post(x, z, height, material)));

      if (edition > 0) {
        const signatureRadius = .29 + (form % 3) * .025;
        const signature = halo(0, .18 + (form % 2) * .04, 0, signatureRadius);
        signature.rotation.y = phase;
        [-.31, .31].forEach((x) => post(x, -.27 + (form % 2) * .54, .26 + (form % 3) * .05, accent));
      }

      if (model === "residential") {
        if (theme === 1) [-.2, 0, .2].forEach((x, index) => addTree(group, x, .27 - index * .03, .25, index % 2));
        else if (theme === 2) [-.19, .19].forEach((x) => panel(x, top, -.23, .27, .15));
        else if (theme === 3) [-.24, 0, .24].forEach((x) => [top, top + .2].forEach((y) => addFacadeBand(group, accent, x, y, .32, .14)));
        else if (theme === 4) mesh(shared.sphere, materials.glass, [0, top + .2, 0], [.25, .27, .25], group);
        else if (theme === 5) { cornerPosts(.34, materials.copper); mesh(shared.cylinder, accent, [0, top + .18, 0], [.2, .25, .2], group); }
        else if (theme === 6) { cornerPosts(.48); halo(0, top + .42, 0, .28); }
        else if (theme === 7) { [-.25, .25].forEach((x) => addBlock(group, materials.white, x, .05, .18, .5, .12, .13)); mesh(shared.cone, accent, [0, top + .36, 0], [.14, .42, .14], group); }
        else if (theme === 8) { [-.26, .26].forEach((z) => addBlock(group, materials.concrete, 0, z, .58, .1, .08, .13)); [-.2, .2].forEach((x) => addTree(group, x, .28, .22, x > 0)); }
        else { const ring = halo(0, top + .26, 0, .32); animated.push({ object: ring, type: "spin", speed: .35 }); }
      } else if (model === "commercial") {
        if (theme === 1) addFacadeBand(group, accent, 0, top + .1, .34, .54, .035);
        else if (theme === 2) { const ring = halo(0, top + .34, 0, .26); animated.push({ object: ring, type: "spin", speed: .45 }); }
        else if (theme === 3) { post(0, 0, .72, materials.darkMetal); mesh(shared.sphere, accent, [0, top + .52, 0], [.08, .08, .08], group); }
        else if (theme === 4) { addBlock(group, materials.glass, 0, .28, .66, .18, .06, .22); [-.28, .28].forEach((x) => post(x, .28, .3)); }
        else if (theme === 5) { [-.2, 0, .2].forEach((x) => mesh(shared.sphere, accent, [x, top + .15, 0], [.07, .07, .07], group)); }
        else if (theme === 6) [-.22, .22].forEach((x) => addBlock(group, accent, x, .31, .18, .025, .28, top));
        else if (theme === 7) mesh(shared.sphere, materials.glass, [0, top + .24, 0], [.3, .34, .3], group);
        else if (theme === 8) [-.2, .2].forEach((x) => mesh(shared.cone, accent, [x, top + .35, 0], [.1, .5, .1], group));
        else { mesh(shared.cylinder, materials.darkMetal, [0, top + .13, 0], [.34, .08, .34], group); addFacadeBand(group, accent, 0, top + .2, .35, .45); }
      } else if (model === "industrial") {
        if (theme === 1) [-.23, 0, .23].forEach((x) => mesh(shared.cylinder, materials.copper, [x, .42, .2], [.07, .5, .07], group));
        else if (theme === 2) [-.2, .2].forEach((x) => mesh(shared.cylinder, accent, [x, .34, 0], [.16, .42, .16], group));
        else if (theme === 3) { post(-.28, -.2, .8, materials.darkMetal); const boom = addBlock(group, accent, -.02, -.2, .52, .04, .04, .78); boom.rotation.z = -.18; }
        else if (theme === 4) { const ring = halo(0, .52, 0, .3, materials.copper); ring.rotation.y = Math.PI / 2; }
        else if (theme === 5) [-.25, .25].forEach((x) => mesh(shared.cone, materials.darkMetal, [x, .62, 0], [.11, .72, .11], group));
        else if (theme === 6) [-.2, .2].forEach((z) => { const ring = halo(0, .32, z, .17); ring.rotation.y = Math.PI / 2; });
        else if (theme === 7) { cornerPosts(.58, materials.darkMetal); addBlock(group, accent, 0, 0, .65, .06, .06, .68); }
        else if (theme === 8) [-.23, 0, .23].forEach((x) => addBlock(group, materials.copper, x, .27, .16, .18, .18, .16));
        else { mesh(shared.sphere, materials.glass, [0, .5, 0], [.24, .3, .24], group); const ring = halo(0, .5, 0, .34); animated.push({ object: ring, type: "spin", speed: .8 }); }
      } else if (model === "park") {
        if (theme === 1) { const pond = mesh(shared.cylinder, materials.lake, [0, .15, 0], [.28, .025, .2], group); animated.push({ object: pond, type: "water" }); }
        else if (theme === 2) { cornerPosts(.28, materials.white); mesh(shared.cone, accent, [0, .48, 0], [.35, .18, .35], group); }
        else if (theme === 3) [-.2, 0, .2].forEach((x, index) => mesh(index % 2 ? shared.cone : shared.sphere, accent, [x, .25 + index * .07, 0], [.08, .15, .08], group));
        else if (theme === 4) { [-.22, .22].forEach((x) => addBlock(group, materials.white, x, 0, .14, .5, .04, .14)); addBlock(group, materials.white, 0, 0, .5, .1, .04, .14); }
        else if (theme === 5) mesh(shared.sphere, materials.glass, [0, .38, 0], [.31, .45, .31], group);
        else if (theme === 6) { const ring = halo(0, .3, 0, .29); ring.rotation.y = Math.PI / 2; animated.push({ object: ring, type: "spin", speed: .3 }); }
        else if (theme === 7) [-.26, -.13, 0, .13, .26].forEach((z, index) => addBlock(group, accent, 0, z, .52 - Math.abs(index - 2) * .06, .04, .03 + index * .018, .13));
        else if (theme === 8) { [-.2, .2].forEach((x) => mesh(shared.cone, accent, [x, .32, 0], [.12, .32, .12], group)); halo(0, .48, 0, .25); }
        else { mesh(shared.cylinder12, materials.civic, [0, .52, 0], [.07, .72, .07], group); const ring = halo(0, .78, 0, .27); animated.push({ object: ring, type: "spin", speed: .6 }); }
      } else if (model === "power") {
        if (theme === 1) [-.22, 0, .22].forEach((x) => panel(x, .24, 0, .19, .3));
        else if (theme === 2) [-.24, 0, .24].forEach((x, index) => { const rotor = halo(x, .62, 0, .14); rotor.rotation.y = Math.PI / 2; animated.push({ object: rotor, type: "spin", speed: 1 + index * .2 }); });
        else if (theme === 3) { cornerPosts(.68, materials.darkMetal); halo(0, .72, 0, .31); }
        else if (theme === 4) mesh(shared.sphere, materials.glass, [0, .47, 0], [.32, .5, .32], group);
        else if (theme === 5) [-.25, 0, .25].forEach((x) => mesh(shared.cylinder, accent, [x, .38, 0], [.1, .55, .1], group));
        else if (theme === 6) { const ring = halo(0, .52, 0, .38); ring.rotation.y = phase; animated.push({ object: ring, type: "spin", speed: 1.2 }); }
        else if (theme === 7) [-.24, .24].forEach((x) => mesh(shared.cone, materials.copper, [x, .58, 0], [.1, .7, .1], group));
        else if (theme === 8) { addBlock(group, materials.darkMetal, 0, 0, .64, .54, .24, .12); [-.2, .2].forEach((x) => halo(x, .42, .28, .12)); }
        else { mesh(shared.cylinder12, materials.darkMetal, [0, .58, 0], [.13, .88, .13], group); [.3, .58, .86].forEach((y) => { const ring = halo(0, y, 0, .2 + y * .08); animated.push({ object: ring, type: "spin", speed: .8 + y }); }); }
      } else if (model === "water") {
        if (theme === 1) { const pool = mesh(shared.cylinder, materials.lake, [0, .16, 0], [.33, .03, .33], group); pool.scale.z = .66; animated.push({ object: pool, type: "water" }); }
        else if (theme === 2) { cornerPosts(.5, materials.darkMetal); mesh(shared.cylinder, materials.lake, [0, .62, 0], [.27, .26, .27], group); }
        else if (theme === 3) [-.22, 0, .22].forEach((x) => mesh(shared.cylinder, materials.glass, [x, .4, 0], [.13, .55, .13], group));
        else if (theme === 4) [-.24, .24].forEach((x) => halo(x, .38, 0, .16));
        else if (theme === 5) { addBlock(group, materials.civic, 0, 0, .62, .48, .26, .12); mesh(shared.sphere, materials.glass, [0, .58, 0], [.22, .28, .22], group); }
        else if (theme === 6) { const ring = halo(0, .4, 0, .31); ring.rotation.y = Math.PI / 2; animated.push({ object: ring, type: "spin", speed: .7 }); }
        else if (theme === 7) [-.26, -.13, 0, .13, .26].forEach((x) => addBlock(group, materials.lake, x, 0, .08, .56, .04, .13));
        else if (theme === 8) { mesh(shared.sphere, materials.glass, [0, .42, 0], [.34, .5, .34], group); halo(0, .62, 0, .37); }
        else { post(0, 0, .88, materials.darkMetal); [.34, .58, .82].forEach((y) => halo(0, y, 0, .18 + y * .08)); }
      } else if (model === "civic") {
        if (theme === 1) { cornerPosts(.46, materials.civic); mesh(shared.sphere, accent, [0, .75, 0], [.16, .1, .16], group); }
        else if (theme === 2) { addBlock(group, accent, 0, .31, .52, .03, .18, .42); post(0, 0, .88, materials.darkMetal); }
        else if (theme === 3) [-.25, 0, .25].forEach((x) => post(x, .28, .5, materials.civic));
        else if (theme === 4) mesh(shared.sphere, materials.glass, [0, .64, 0], [.32, .36, .32], group);
        else if (theme === 5) { halo(0, .65, 0, .31); mesh(shared.cone, accent, [0, 1.02, 0], [.12, .4, .12], group); }
        else if (theme === 6) { const ring = halo(0, .66, 0, .34); ring.rotation.y = Math.PI / 2; animated.push({ object: ring, type: "spin", speed: .35 }); }
        else if (theme === 7) [-.3, .3].forEach((x) => addBlock(group, materials.civic, x, 0, .16, .52, .34, .12));
        else if (theme === 8) { post(0, 0, 1.1, materials.glass); mesh(shared.sphere, accent, [0, 1.23, 0], [.1, .1, .1], group); }
        else { mesh(shared.cylinder, materials.glass, [0, .65, 0], [.24, .78, .24], group); const ring = halo(0, .9, 0, .33); animated.push({ object: ring, type: "spin", speed: .42 }); }
      } else if (model === "arena") {
        if (theme === 1) cornerPosts(.74, accent);
        else if (theme === 2) { [-.27, .27].forEach((x) => addBlock(group, materials.glass, x, 0, .08, .52, .48, .5)); }
        else if (theme === 3) { const ring = halo(0, .84, 0, .42); animated.push({ object: ring, type: "spin", speed: .45 }); }
        else if (theme === 4) [-.28, .28].forEach((x) => mesh(shared.cone, accent, [x, .88, 0], [.12, .62, .12], group));
        else if (theme === 5) mesh(shared.sphere, materials.glass, [0, .76, 0], [.46, .36, .4], group);
        else if (theme === 6) { post(0, 0, 1.15, materials.darkMetal); [.72, 1].forEach((y) => { const ring = halo(0, y, 0, .31); animated.push({ object: ring, type: "spin", speed: y }); }); }
        else if (theme === 7) [-.31, 0, .31].forEach((x) => addBlock(group, accent, x, .31, .14, .025, .34, .48));
        else if (theme === 8) { cornerPosts(.82, materials.gold); halo(0, .98, 0, .36, materials.gold); }
        else { const skyRing = halo(0, 1.06, 0, .45); skyRing.rotation.y = phase; animated.push({ object: skyRing, type: "spin", speed: .85 }); mesh(shared.sphere, materials.glass, [0, .78, 0], [.38, .26, .34], group); }
      }
    }

    function buildResidential(group, level, color, seed, variant) {
      addBase(group, color);
      const accent = accentMaterial(color);
      const heightScale = 1 + (level - 1) * .16;
      const styles = [
        [[0, 0, .58, .55, .9]],
        [[-.2, 0, .28, .56, 1.18], [.2, 0, .28, .56, .86]],
        [[-.25, -.14, .2, .48, .7], [.25, -.14, .2, .48, .7], [0, .23, .7, .18, .62]],
        [[-.2, .05, .3, .58, .72], [.2, -.02, .3, .5, 1.04]],
        [[0, .21, .62, .19, .45], [0, 0, .53, .2, .67], [0, -.21, .43, .2, .9]],
        [[0, .08, .65, .38, .35], [0, -.08, .34, .34, 1.28]],
        [[-.22, -.18, .26, .28, .58], [.22, -.18, .26, .28, .58], [-.22, .18, .26, .28, .58], [.22, .18, .26, .28, .58]],
        [[-.19, 0, .32, .58, .78], [.2, .08, .25, .42, 1.08]],
        [[-.24, -.15, .22, .26, .5], [0, .16, .22, .26, .62], [.24, -.15, .22, .26, .55]],
        [[0, 0, .45, .45, 1.48]]
      ];
      styles[variant % 10].forEach(([x, z, width, depth, height]) => {
        const scaledHeight = height * heightScale;
        addCappedBlock(group, materials.residential, x, z, width, depth, scaledHeight);
        addFacadeBand(group, accent, x, .25 + scaledHeight * .46, z + depth / 2 + .012, Math.max(.1, width * .68));
      });
      if (variant % 10 === 2) {
        mesh(shared.cylinder, materials.lake, [0, .13, -.04], [.13, .025, .13], group);
        [-.08, .08].forEach((x) => addTree(group, x, -.02, .22, x > 0));
      }
      if (variant % 10 === 8) [-.25, .25].forEach((x) => addTree(group, x, .2, .24, x > 0));
      if (variant % 10 === 9) mesh(shared.cylinder12, materials.glass, [0, 1.72 * heightScale, 0], [.055, .32, .055], group);
    }

    function buildCommercial(group, level, color, seed, variant) {
      addBase(group, color);
      const crown = accentMaterial(color, .2);
      crown.emissive = new THREE.Color(color);
      crown.emissiveIntensity = .32;
      const scale = 1 + (level - 1) * .14;
      const styles = [
        [[0, 0, .58, .52, 1.22]],
        [[0, 0, .68, .62, .42], [0, -.08, .46, .4, .36]],
        [[-.2, 0, .28, .48, 1.02], [.2, 0, .28, .48, 1.28]],
        [[0, .18, .68, .2, .35], [-.22, -.1, .2, .38, .52], [.22, -.1, .2, .38, .52]],
        [[0, 0, .62, .55, .54], [0, -.05, .38, .36, .55]],
        [[0, .08, .62, .4, .42], [0, -.12, .42, .34, 1.03]],
        [[-.18, 0, .3, .58, .45], [.18, 0, .3, .58, .45]],
        [[-.22, -.12, .24, .3, .68], [.22, -.12, .24, .3, .68], [0, .2, .32, .2, .86]],
        [[0, .07, .54, .5, .5], [0, -.07, .31, .31, 1.36]],
        [[0, 0, .68, .6, .82], [0, 0, .42, .42, .48]]
      ];
      styles[variant % 10].forEach(([x, z, width, depth, height]) => addCappedBlock(group, materials.commercial, x, z, width, depth, height * scale, crown));
      if ([1, 3, 6].includes(variant % 10)) [-.22, 0, .22].forEach((x) => addFacadeBand(group, crown, x, .28, .325, .14));
      if ([2, 8, 9].includes(variant % 10)) {
        const spire = mesh(shared.cone, crown, [0, 1.62 * scale, 0], [.055, .42, .055], group);
        spire.rotation.y = variant;
      }
      if (variant % 10 === 4) {
        const screen = addBlock(group, crown, 0, .3, .3, .025, .18, .36);
        screen.rotation.x = -.08;
      }
    }

    function buildIndustrial(group, level, color, seed, variant) {
      addBase(group, 0x727a80);
      const style = variant % 10;
      const scale = 1 + (level - 1) * .12;
      const hall = (x, z, width, depth, height) => addCappedBlock(group, materials.industrial, x, z, width, depth, height * scale);
      if (style === 0) {
        hall(-.08, .04, .56, .58, .5);
        [-.24, 0, .24].forEach((x) => mesh(shared.cylinder12, materials.darkMetal, [x, .78 * scale, -.14], [.06, .55 * scale, .06], group));
      } else if (style === 1) {
        hall(0, 0, .68, .58, .34);
        [-.24, 0, .24].forEach((x) => addFacadeBand(group, materials.darkMetal, x, .24, .302, .16, .018));
      } else if (style === 2) {
        [-.2, .2].forEach((x) => mesh(shared.cylinder, materials.industrial, [x, .38 * scale, 0], [.18, .6 * scale, .18], group));
        hall(0, -.23, .62, .18, .28);
      } else if (style === 3) {
        hall(-.14, 0, .4, .58, .58);
        hall(.25, .04, .22, .34, .82);
      } else if (style === 4) {
        hall(0, -.17, .66, .24, .31);
        const ring = mesh(shared.torus, materials.copper, [0, .42, .12], [.29, .29, .29], group);
        ring.rotation.x = Math.PI / 2;
      } else if (style === 5) {
        [-.22, 0, .22].forEach((x) => hall(x, 0, .18, .58, .46));
        [-.22, 0, .22].forEach((x) => addFacadeBand(group, materials.glow, x, .44, .3, .12));
      } else if (style === 6) {
        hall(0, -.2, .62, .2, .32);
        [-.2, .2].forEach((x) => mesh(shared.sphere, materials.glass, [x, .38, .12], [.18, .27, .18], group));
      } else if (style === 7) {
        hall(-.15, 0, .38, .56, .42);
        mesh(shared.cylinder12, materials.darkMetal, [.25, .52, 0], [.13, .76, .13], group);
        mesh(shared.torus, materials.glow, [.25, .82, 0], [.15, .15, .15], group).rotation.x = Math.PI / 2;
      } else if (style === 8) {
        hall(-.1, .1, .48, .4, .3);
        const boom = addBlock(group, materials.copper, .14, -.18, .48, .055, .055, .72);
        boom.rotation.z = -.38;
        mesh(shared.cylinder12, materials.darkMetal, [-.22, .48, -.18], [.055, .7, .055], group);
      } else {
        hall(-.15, .08, .35, .52, .42);
        [.08, .28].forEach((x) => mesh(shared.cylinder, materials.darkMetal, [x, .33, -.05], [.12, .42, .12], group));
        mesh(shared.torus, materials.copper, [.17, .56, -.05], [.25, .25, .25], group).rotation.x = Math.PI / 2;
      }
    }

    function buildPark(group, level, color, seed, variant) {
      addBase(group, color);
      mesh(shared.cube, materials.grass, [0, .09, 0], [.7, .08, .7], group);
      const style = variant % 10;
      const treeCount = [4, 2, 3, 2, 7, 3, 3, 4, 2, 4][style] + level - 1;
      for (let index = 0; index < treeCount; index += 1) {
        const angle = index / treeCount * Math.PI * 2 + hashText(seed) * .0001;
        const radius = .22 + (index % 2) * .12;
        addTree(group, Math.cos(angle) * radius, Math.sin(angle) * radius, .56 + (index % 3) * .08, index % 2);
      }
      if (style === 0) {
        mesh(shared.cylinder, materials.concrete, [0, .14, 0], [.16, .08, .16], group);
        const water = mesh(shared.cylinder, materials.lake, [0, .19, 0], [.13, .025, .13], group);
        animated.push({ object: water, type: "water" });
      } else if (style === 1) {
        [[0, 0, .5, .12], [0, 0, .12, .5]].forEach(([x, z, w, d]) => addBlock(group, materials.concrete, x, z, w, d, .035, .13));
      } else if (style === 2) {
        [-.2, 0, .2].forEach((x, index) => mesh(shared.sphere, index % 2 ? materials.gold : materials.white, [x, .18, 0], [.08, .08, .08], group));
      } else if (style === 3) {
        addBlock(group, materials.soil, 0, 0, .48, .3, .025, .13);
        [-.2, .2].forEach((x) => mesh(shared.cube, materials.white, [x, .17, 0], [.018, .08, .32], group));
      } else if (style === 5) {
        const water = mesh(shared.cylinder, materials.lake, [0, .15, 0], [.28, .035, .28], group);
        water.scale.z = .65;
        animated.push({ object: water, type: "water" });
      } else if (style === 6) {
        mesh(shared.torus, materials.civic, [0, .24, 0], [.25, .25, .25], group).rotation.x = Math.PI / 2;
      } else if (style === 7) {
        const dome = mesh(shared.sphere, materials.glass, [0, .3, 0], [.29, .42, .29], group);
        dome.scale.y = .72;
      } else if (style === 8) {
        [-.24, -.12, 0, .12, .24].forEach((z, index) => addBlock(group, materials.civic, 0, z, .5 - Math.abs(index - 2) * .08, .055, .04 + index * .025, .12));
      } else if (style === 9) {
        mesh(shared.cone, materials.mountain, [0, .27, 0], [.3, .42, .3], group);
        mesh(shared.cylinder12, materials.civic, [0, .62, 0], [.035, .42, .035], group);
      }
    }

    function addTree(group, x, z, scale, variant, baseY = 0) {
      mesh(shared.cylinder12, materials.treeTrunk, [x, baseY + .19 * scale, z], [.045 * scale, .38 * scale, .045 * scale], group);
      const leaf = variant ? materials.treeLeafLight : materials.treeLeaf;
      [[0, .47, 0, .24], [-.12, .4, .03, .19], [.12, .42, -.02, .2]].forEach(([dx, y, dz, size], index) => {
        const crown = mesh(shared.treeCrown, leaf, [x + dx * scale, baseY + y * scale, z + dz * scale], [size * scale, size * 1.18 * scale, size * scale], group);
        crown.rotation.y = x * 3 + index;
        crown.castShadow = scale > .5;
      });
    }

    function buildPower(group, level, color, seed, variant) {
      addBase(group, 0x626d74);
      const style = variant % 10;
      const scale = 1 + (level - 1) * .12;
      if (style === 0) {
        addCappedBlock(group, materials.industrial, 0, 0, .62, .56, .42 * scale);
        [-.22, 0, .22].forEach((x) => mesh(shared.cylinder12, materials.darkMetal, [x, .77, -.13], [.06, .58 * scale, .06], group));
      } else if (style === 1) {
        [-.23, 0, .23].forEach((x) => [-.18, .18].forEach((z) => {
          const panel = addBlock(group, materials.glass, x, z, .19, .15, .02, .17);
          panel.rotation.x = -.24;
        }));
        mesh(shared.cylinder12, materials.glow, [0, .43, 0], [.07, .46, .07], group);
      } else if (style === 2) {
        [-.23, 0, .23].forEach((x, index) => {
          mesh(shared.cylinder12, materials.white, [x, .47, 0], [.035, .72, .035], group);
          const rotor = mesh(shared.torus, materials.glow, [x, .75, .03], [.16, .16, .16], group);
          animated.push({ object: rotor, type: "spin", speed: 1.2 + index * .14 });
        });
      } else if (style === 3) {
        addBlock(group, materials.concrete, 0, 0, .68, .54, .22, .11);
        [-.2, 0, .2].forEach((x) => {
          const wheel = mesh(shared.torus, materials.glow, [x, .4, .27], [.13, .13, .13], group);
          animated.push({ object: wheel, type: "spin", speed: 1.1 });
        });
      } else if (style === 4) {
        mesh(shared.cylinder, materials.industrial, [0, .34, 0], [.29, .48, .29], group);
        [-.18, .18].forEach((x) => mesh(shared.cylinder12, materials.copper, [x, .69, 0], [.055, .62, .055], group));
      } else if (style === 5) {
        [-.24, 0, .24].forEach((x) => [-.16, .16].forEach((z) => addCappedBlock(group, materials.darkMetal, x, z, .18, .24, .34, materials.glow)));
      } else if (style === 6) {
        mesh(shared.sphere, materials.glass, [0, .4, 0], [.32, .5, .32], group);
        mesh(shared.cylinder12, materials.copper, [0, .78, 0], [.055, .46, .055], group);
      } else if (style === 7) {
        [-.22, .22].forEach((x) => {
          const rotor = mesh(shared.torus, materials.glow, [x, .34, 0], [.23, .23, .23], group);
          rotor.rotation.y = Math.PI / 2;
          animated.push({ object: rotor, type: "spin", speed: 1.5 });
        });
      } else if (style === 8) {
        mesh(shared.sphere, materials.glass, [0, .45, 0], [.34, .52, .34], group);
        const halo = mesh(shared.torus, materials.glow, [0, .54, 0], [.4, .4, .4], group);
        halo.rotation.x = Math.PI / 2;
        animated.push({ object: halo, type: "pulse" });
      } else {
        mesh(shared.cylinder12, materials.darkMetal, [0, .58, 0], [.16, .92, .16], group);
        [.25, .52, .8].forEach((y) => {
          const ring = mesh(shared.torus, materials.glow, [0, y, 0], [.25 + y * .06, .25 + y * .06, .25 + y * .06], group);
          ring.rotation.x = Math.PI / 2;
          animated.push({ object: ring, type: "spin", speed: 1 + y });
        });
      }
    }

    function buildWater(group, level, color, seed, variant) {
      addBase(group, 0x718690);
      const style = variant % 10;
      const scale = 1 + (level - 1) * .1;
      const basin = (x, z, radius) => {
        mesh(shared.cylinder, materials.concrete, [x, .15, z], [radius, .08, radius], group);
        const water = mesh(shared.cylinder, materials.lake, [x, .2, z], [radius * .86, .025, radius * .86], group);
        animated.push({ object: water, type: "water" });
      };
      if (style === 0) [-.19, .19].forEach((x) => [-.18, .18].forEach((z) => basin(x, z, .15)));
      else if (style === 1) {
        [-.2, .2].forEach((x) => [-.2, .2].forEach((z) => mesh(shared.cylinder12, materials.darkMetal, [x, .39, z], [.035, .58, .035], group)));
        mesh(shared.cylinder, materials.lake, [0, .73 * scale, 0], [.31, .24, .31], group);
      } else if (style === 2) [-.22, 0, .22].forEach((x) => mesh(shared.cylinder, materials.glass, [x, .38, 0], [.15, .52, .15], group));
      else if (style === 3) {
        addCappedBlock(group, materials.industrial, 0, 0, .62, .5, .32);
        [-.22, 0, .22].forEach((x) => mesh(shared.torus, materials.glow, [x, .35, .26], [.11, .11, .11], group));
      } else if (style === 4) {
        [-.22, .22].forEach((x) => mesh(shared.cylinder, materials.darkMetal, [x, .4, 0], [.17, .58, .17], group));
        mesh(shared.torus, materials.copper, [0, .54, 0], [.28, .28, .28], group).rotation.x = Math.PI / 2;
      } else if (style === 5) {
        addCappedBlock(group, materials.commercial, 0, .08, .58, .43, .48);
        mesh(shared.sphere, materials.glass, [0, .71, -.1], [.24, .3, .24], group);
      } else if (style === 6) basin(0, 0, .34);
      else if (style === 7) {
        [-.23, 0, .23].forEach((x) => mesh(shared.cylinder, materials.glass, [x, .44, 0], [.12, .7, .12], group));
        mesh(shared.cylinder12, materials.glow, [0, .88, 0], [.035, .45, .035], group);
      } else if (style === 8) {
        addBlock(group, materials.lake, 0, 0, .68, .3, .035, .14);
        [-.28, 0, .28].forEach((x) => mesh(shared.cylinder12, materials.civic, [x, .36, 0], [.045, .45, .045], group));
      } else {
        basin(0, 0, .31);
        const dome = mesh(shared.sphere, materials.glass, [0, .38, 0], [.33, .44, .33], group);
        dome.scale.y = .75;
      }
    }

    function buildCivic(group, level, color, seed, variant) {
      addBase(group, color);
      const banner = accentMaterial(color, .05);
      banner.emissive = new THREE.Color(color);
      banner.emissiveIntensity = .28;
      const style = variant % 10;
      const scale = 1 + (level - 1) * .1;
      const hall = (x, z, w, d, h) => addCappedBlock(group, materials.civic, x, z, w, d, h * scale, banner);
      if (style === 0) {
        hall(0, 0, .66, .54, .72);
        mesh(shared.sphere, materials.gold, [0, .92 * scale, 0], [.19, .12, .19], group);
      } else if (style === 1) {
        hall(0, 0, .65, .52, .45);
        mesh(shared.cube, banner, [0, .52, .28], [.5, .16, .025], group);
        mesh(shared.cylinder12, materials.darkMetal, [.22, .74, 0], [.045, .55, .045], group);
      } else if (style === 2) {
        hall(-.14, 0, .38, .58, .6);
        hall(.25, .04, .2, .42, .9);
        mesh(shared.cylinder12, materials.glow, [.25, 1.05, .04], [.06, .25, .06], group);
      } else if (style === 3) {
        hall(0, .16, .68, .24, .42);
        [-.22, .22].forEach((x) => hall(x, -.12, .25, .38, .62));
      } else if (style === 4) {
        hall(0, -.05, .62, .52, .5);
        [-.24, 0, .24].forEach((x) => mesh(shared.cube, materials.civic, [x, .55, .26], [.08, .42, .08], group));
      } else if (style === 5) {
        hall(0, 0, .64, .54, .55);
        mesh(shared.cube, banner, [0, .57, .29], [.54, .13, .03], group);
        mesh(shared.cylinder12, materials.darkMetal, [0, .98, 0], [.04, .62, .04], group);
      } else if (style === 6) {
        hall(0, .12, .66, .32, .38);
        mesh(shared.sphere, materials.glass, [0, .52, -.12], [.3, .42, .3], group);
      } else if (style === 7) {
        hall(0, .12, .65, .35, .42);
        const arch = mesh(shared.torus, materials.gold, [0, .55, -.18], [.28, .28, .28], group);
        arch.rotation.y = Math.PI / 2;
      } else if (style === 8) {
        hall(0, 0, .68, .34, .3);
        mesh(shared.cylinder12, materials.glass, [0, .72, 0], [.1, .88, .1], group);
        mesh(shared.cone, materials.gold, [0, 1.22, 0], [.12, .25, .12], group);
      } else {
        hall(0, .08, .62, .35, .32);
        const tower = mesh(shared.cylinder, materials.glass, [0, .66, -.1], [.2, .72, .2], group);
        tower.scale.z = .65;
        [-.28, .28].forEach((x) => addBlock(group, materials.concrete, x, -.2, .08, .45, .08, .11));
      }
    }

    function buildArena(group, level, color, seed, variant) {
      addBase(group, color);
      const style = variant % 10;
      const bowl = mesh(shared.cylinder, style === 2 ? materials.darkMetal : materials.civic, [0, .28, 0], [.39, .42 + (style % 3) * .05, .39], group);
      bowl.scale.z = .72;
      const roof = mesh(shared.torus, materials.darkMetal, [0, .52 + (style % 3) * .05, 0], [.47, .47, .47], group);
      roof.rotation.x = Math.PI / 2;
      roof.scale.z = .72;
      const field = mesh(shared.cylinder, style === 2 ? materials.glow : materials.grass, [0, .54 + (style % 3) * .05, 0], [.3, .03, .3], group);
      field.scale.z = .68;
      const accent = accentMaterial(color, .1);
      accent.emissive = new THREE.Color(color);
      accent.emissiveIntensity = .8;
      const halo = mesh(shared.torus, accent, [0, .64 + level * .04, 0], [.51, .51, .51], group);
      halo.rotation.x = Math.PI / 2;
      halo.scale.z = .72;
      animated.push({ object: halo, type: "pulse" });
      if (style === 1) [-.3, .3].forEach((x) => mesh(shared.cylinder12, materials.gold, [x, .58, 0], [.04, .68, .04], group));
      else if (style === 2) mesh(shared.sphere, materials.glass, [0, .62, 0], [.45, .3, .36], group);
      else if (style === 3) [-.28, .28].forEach((x) => mesh(shared.cube, materials.glass, [x, .72, 0], [.08, .5, .38], group));
      else if (style === 4) {
        [-.24, .24].forEach((x) => mesh(shared.cone, materials.gold, [x, .86, 0], [.1, .55, .1], group));
        mesh(shared.torus, materials.copper, [0, .83, 0], [.32, .32, .32], group).rotation.x = Math.PI / 2;
      } else if (style === 5) mesh(shared.cube, materials.glass, [0, .95, 0], [.24, .52, .24], group);
      else if (style === 6) {
        mesh(shared.sphere, materials.gold, [0, .72, 0], [.21, .13, .21], group);
        [-.3, 0, .3].forEach((x) => mesh(shared.cylinder12, materials.civic, [x, .56, .28], [.035, .52, .035], group));
      } else if (style === 7) addBlock(group, materials.civic, 0, -.03, .62, .2, .52, .22);
      else if (style === 8) {
        mesh(shared.cylinder12, materials.glass, [0, .98, 0], [.14, .72, .14], group);
        const skyRing = mesh(shared.torus, materials.glow, [0, 1.12, 0], [.33, .33, .33], group);
        skyRing.rotation.x = Math.PI / 2;
        animated.push({ object: skyRing, type: "spin", speed: .75 });
      } else if (style === 9) {
        mesh(shared.sphere, materials.glass, [0, .68, 0], [.48, .36, .39], group);
        mesh(shared.cylinder12, materials.gold, [0, 1.18, 0], [.06, .56, .06], group);
      }
    }

    function createTraffic() {
      const roads = Object.values(city.tiles || {}).filter(City.isRoadTile);
      const roadIds = new Set(roads.map((tile) => tile.id));
      const routable = roads.filter((tile) => City.neighbors(tile.id).some((id) => roadIds.has(id)));
      const carCount = Math.min(18, Math.max(0, Math.floor(routable.length / 4)));
      for (let index = 0; index < carCount; index += 1) {
        const tile = routable[Math.floor(index * routable.length / carCount)];
        const candidates = City.neighbors(tile.id).filter((id) => roadIds.has(id));
        const nextId = candidates[index % candidates.length];
        const car = createVehicle(index);
        trafficRoot.add(car);
        const route = {
          object: car,
          type: "car",
          roadIds,
          currentId: tile.id,
          nextId,
          previousId: "",
          progress: (index % 4) * .18,
          speed: .13 + (index % 5) * .012,
          lane: index % 2 ? .105 : -.105,
          seed: hashText(`${city.id}-traffic-${index}`),
          steps: 0
        };
        updateTrafficCar(route, 0);
        animated.push(route);
      }
    }

    function chooseNextRoad(route) {
      const candidates = City.neighbors(route.currentId).filter((id) => route.roadIds.has(id));
      const forward = candidates.filter((id) => id !== route.previousId);
      const choices = forward.length ? forward : candidates;
      if (!choices.length) return route.previousId || route.currentId;
      const index = Math.abs(route.seed + route.steps * 17) % choices.length;
      return choices[index];
    }

    function updateTrafficCar(route, delta) {
      route.progress += delta * route.speed;
      while (route.progress >= 1) {
        route.progress -= 1;
        route.previousId = route.currentId;
        route.currentId = route.nextId;
        route.steps += 1;
        route.nextId = chooseNextRoad(route);
      }
      const start = worldPosition(route.currentId);
      const end = worldPosition(route.nextId);
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.max(.001, Math.hypot(dx, dz));
      const laneX = -dz / length * route.lane;
      const laneZ = dx / length * route.lane;
      route.object.position.set(
        start.x + dx * route.progress + laneX,
        tileSurfaceHeight(route.currentId) + (tileSurfaceHeight(route.nextId) - tileSurfaceHeight(route.currentId)) * route.progress + .085,
        start.z + dz * route.progress + laneZ
      );
      route.object.rotation.y = Math.atan2(-dz, dx);
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
      const color = buildMode ? 0x55e2ff : 0xffd45d;
      const selectionMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
      const beaconMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      selectionResources.push(selectionMaterial, beaconMaterial);
      const ring = new THREE.Mesh(shared.selection, selectionMaterial);
      ring.position.set(position.x, tileSurfaceHeight(selectedId) + .08, position.z);
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
      const id = hit?.object?.userData?.faceTileIds?.[hit.faceIndex];
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
      const delta = Math.min(.05, clock.getDelta());
      const elapsed = clock.elapsedTime;
      textures.water.offset.x = elapsed * .004;
      textures.water.offset.y = elapsed * .002;
      if (materials.terrain.userData.shader) materials.terrain.userData.shader.uniforms.terrainTime.value = elapsed;
      animated.forEach((item) => {
        if (item.type === "spin") item.object.rotation.z = elapsed * item.speed;
        else if (item.type === "water") item.object.scale.y = .95 + Math.sin(elapsed * 2.4) * .1;
        else if (item.type === "pulse") item.object.scale.x = item.object.scale.y = 1 + Math.sin(elapsed * 2.2) * .035;
        else if (item.type === "car") updateTrafficCar(item, delta);
        else if (item.type === "selection") {
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
