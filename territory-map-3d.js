(function bootstrapTerritoryMap3D(global) {
  "use strict";

  const THREE = global.THREE;
  if (!THREE) return;

  const HEX_RADIUS = 1.06;
  const HEX_SCALE = 1.04;
  const NEUTRAL_SURFACE_COLOR = 0x080a0e;
  const BUILDING_TEXTURE_ASSETS = Object.freeze({
    stone: "images/territory/textures/stone-wall.png",
    roof: "images/territory/textures/roof-tiles.png",
    wood: "images/territory/textures/aged-wood.png",
    ground: "images/territory/textures/terrain-ground-v2.png",
    basalt: "images/territory/textures/volcanic-basalt-v2.png",
    lava: "images/territory/textures/molten-lava-v2.png",
    foliage: "images/territory/textures/evergreen-foliage-v2.png",
    ancientStone: "images/territory/textures/ancient-stone-v2.png"
  });

  function hashText(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededValue(seed, offset = 0) {
    return ((hashText(`${seed}:${offset}`) % 10000) + 1) / 10001;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function colorValue(value, fallback = 0x657083) {
    try {
      return new THREE.Color(value || fallback);
    } catch {
      return new THREE.Color(fallback);
    }
  }

  function create(container, options = {}) {
    let active = false;
    let animationFrame = 0;
    let state = null;
    let selectedTileId = "0,0";
    let sceneSignature = "";
    let yaw = Math.PI * .23;
    let pitch = .72;
    let radius = 18.6;
    let viewTouched = false;
    let pointerDown = null;
    let hoveredTileId = "";
    let lastPointerSelectionAt = 0;
    const onSelect = typeof options.onSelect === "function" ? options.onSelect : () => {};
    const summarize = typeof options.summarize === "function" ? options.summarize : () => null;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.65));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.62;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "territory-map-canvas";
    renderer.domElement.setAttribute("aria-label", "六王領土戦 3Dマップ");
    renderer.domElement.setAttribute("role", "img");
    container.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x172131, .025);
    const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const tileRoot = new THREE.Group();
    const atmosphereRoot = new THREE.Group();
    const clickTargets = [];
    const animatedObjects = [];
    const dynamicMaterials = [];
    const dynamicGeometries = [];
    const dynamicTextures = [];
    const tileMeshes = new Map();
    scene.add(tileRoot, atmosphereRoot);

    const tooltip = document.createElement("div");
    tooltip.className = "territory-map-tooltip";
    tooltip.hidden = true;
    container.append(tooltip);

    const controls = document.createElement("div");
    controls.className = "territory-map-controls";
    controls.innerHTML = `
      <button type="button" data-map-zoom-in aria-label="拡大" title="拡大">＋</button>
      <button type="button" data-map-zoom-out aria-label="縮小" title="縮小">−</button>
      <button type="button" data-map-reset aria-label="視点を戻す" title="視点を戻す">↺</button>
    `;
    container.append(controls);

    const hemiLight = new THREE.HemisphereLight(0xe4f2ff, 0x4e5545, 3.5);
    scene.add(hemiLight);
    const ambientLight = new THREE.AmbientLight(0xfff8ea, .52);
    scene.add(ambientLight);
    const sunLight = new THREE.DirectionalLight(0xffe4ba, 4.8);
    sunLight.position.set(-9, 16, 11);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left = -13;
    sunLight.shadow.camera.right = 13;
    sunLight.shadow.camera.top = 13;
    sunLight.shadow.camera.bottom = -13;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 45;
    sunLight.shadow.bias = -.0007;
    scene.add(sunLight);
    const fillLight = new THREE.DirectionalLight(0xa8d2ff, 2.1);
    fillLight.position.set(10, 8, -9);
    scene.add(fillLight);
    const warmLight = new THREE.PointLight(0xff9165, 18, 28, 2);
    warmLight.position.set(-8, 6, -7);
    scene.add(warmLight);

    const shared = createSharedAssets();
    createAtmosphere();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    function createBeveledBox(width, height, depth, bevel = .025) {
      const shape = new THREE.Shape();
      shape.moveTo(-width / 2, -height / 2);
      shape.lineTo(width / 2, -height / 2);
      shape.lineTo(width / 2, height / 2);
      shape.lineTo(-width / 2, height / 2);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth,
        steps: 1,
        curveSegments: 4,
        bevelEnabled: true,
        bevelSegments: 3,
        bevelSize: bevel,
        bevelThickness: bevel
      });
      geometry.translate(0, 0, -depth / 2);
      geometry.computeVertexNormals();
      return geometry;
    }

    function createSharedAssets() {
      const textureLoader = new THREE.TextureLoader();
      const loadBuildingTexture = (url, repeatX, repeatY) => {
        const texture = textureLoader.load(url, renderOnce);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeatX, repeatY);
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        return texture;
      };
      const buildingTextures = {
        stone: loadBuildingTexture(BUILDING_TEXTURE_ASSETS.stone, 2.5, 2.5),
        roof: loadBuildingTexture(BUILDING_TEXTURE_ASSETS.roof, 2, 2),
        wood: loadBuildingTexture(BUILDING_TEXTURE_ASSETS.wood, 1.5, 1.5),
        ground: loadBuildingTexture(BUILDING_TEXTURE_ASSETS.ground, 1.35, 1.35),
        basalt: loadBuildingTexture(BUILDING_TEXTURE_ASSETS.basalt, 1.7, 1.7),
        lava: loadBuildingTexture(BUILDING_TEXTURE_ASSETS.lava, 1.4, 1.4),
        foliage: loadBuildingTexture(BUILDING_TEXTURE_ASSETS.foliage, 1.25, 1.25),
        ancientStone: loadBuildingTexture(BUILDING_TEXTURE_ASSETS.ancientStone, 1.8, 1.8)
      };
      const geometries = {
        treeTrunk: new THREE.CylinderGeometry(.055, .075, .38, 14, 3),
        treeCrown: new THREE.ConeGeometry(.24, .62, 18, 4),
        grassTuft: new THREE.ConeGeometry(.052, .11, 7, 3),
        rock: new THREE.DodecahedronGeometry(.24, 1),
        mountain: new THREE.ConeGeometry(.42, 1.05, 20, 7),
        volcano: new THREE.CylinderGeometry(.16, .62, .72, 36, 8),
        crater: new THREE.TorusGeometry(.18, .075, 16, 48),
        lavaPool: new THREE.CylinderGeometry(.15, .18, .028, 36, 2),
        lavaStream: new THREE.CylinderGeometry(.018, .04, .5, 16, 4),
        tower: new THREE.CylinderGeometry(.17, .2, .72, 24, 4),
        roof: new THREE.ConeGeometry(.24, .32, 24, 4),
        squareRoof: new THREE.ConeGeometry(.4, .3, 4, 4),
        wall: createBeveledBox(.72, .34, .18, .018),
        keep: createBeveledBox(.46, .62, .46, .026),
        house: createBeveledBox(.34, .32, .3, .022),
        foundation: new THREE.CylinderGeometry(.78, .84, .13, 24, 3),
        battlement: createBeveledBox(.09, .1, .09, .008),
        column: new THREE.CylinderGeometry(.055, .07, .48, 20, 4),
        slab: createBeveledBox(.5, .09, .2, .012),
        window: createBeveledBox(.055, .12, .012, .005),
        gate: createBeveledBox(.22, .28, .025, .012),
        crystal: new THREE.OctahedronGeometry(.22, 0),
        banner: new THREE.PlaneGeometry(.28, .2),
        pole: new THREE.CylinderGeometry(.018, .018, .7, 12, 2),
        ripple: new THREE.TorusGeometry(.38, .022, 12, 48),
        crown: new THREE.TorusKnotGeometry(.15, .045, 96, 16),
        selectionAura: new THREE.CylinderGeometry(.78, 1.03, 2.55, 6, 5, true),
        selectionRing: new THREE.TorusGeometry(.84, .035, 12, 72)
      };
      const materials = {
        trunk: new THREE.MeshStandardMaterial({
          color: 0x80604a,
          map: buildingTextures.wood,
          bumpMap: buildingTextures.wood,
          bumpScale: .025,
          roughness: 1
        }),
        pine: new THREE.MeshStandardMaterial({
          color: 0x2c6d45,
          map: buildingTextures.foliage,
          bumpMap: buildingTextures.foliage,
          bumpScale: .04,
          roughness: .9
        }),
        pineLight: new THREE.MeshStandardMaterial({
          color: 0x57935a,
          map: buildingTextures.foliage,
          bumpMap: buildingTextures.foliage,
          bumpScale: .035,
          roughness: .88
        }),
        grass: new THREE.MeshStandardMaterial({
          color: 0x78a64d,
          map: buildingTextures.foliage,
          emissive: 0x16310e,
          emissiveIntensity: .24,
          roughness: .94
        }),
        rock: new THREE.MeshStandardMaterial({
          color: 0xaaa69c,
          map: buildingTextures.ancientStone,
          bumpMap: buildingTextures.ancientStone,
          bumpScale: .05,
          roughness: .96
        }),
        mountain: new THREE.MeshStandardMaterial({
          color: 0x8f8c85,
          map: buildingTextures.ancientStone,
          bumpMap: buildingTextures.ancientStone,
          bumpScale: .065,
          roughness: .94
        }),
        volcanicRock: new THREE.MeshStandardMaterial({
          color: 0xb1a4a0,
          map: buildingTextures.basalt,
          bumpMap: buildingTextures.basalt,
          bumpScale: .11,
          roughness: .98
        }),
        snow: new THREE.MeshStandardMaterial({ color: 0xd9e1e7, roughness: .8 }),
        stone: new THREE.MeshStandardMaterial({
          color: 0xd2d0c8,
          map: buildingTextures.ancientStone,
          bumpMap: buildingTextures.ancientStone,
          bumpScale: .045,
          roughness: .88,
          metalness: .04
        }),
        stoneDark: new THREE.MeshStandardMaterial({
          color: 0x8a8792,
          map: buildingTextures.basalt,
          bumpMap: buildingTextures.basalt,
          bumpScale: .075,
          roughness: .86,
          metalness: .12
        }),
        roof: new THREE.MeshStandardMaterial({
          color: 0xe1e7ef,
          map: buildingTextures.roof,
          bumpMap: buildingTextures.roof,
          bumpScale: .035,
          roughness: .74,
          metalness: .16
        }),
        cottageWall: new THREE.MeshStandardMaterial({
          color: 0xc9b091,
          map: buildingTextures.stone,
          bumpMap: buildingTextures.stone,
          bumpScale: .035,
          roughness: .92
        }),
        cottageRoof: new THREE.MeshStandardMaterial({
          color: 0x9b5542,
          map: buildingTextures.roof,
          bumpMap: buildingTextures.roof,
          bumpScale: .03,
          roughness: .82
        }),
        wood: new THREE.MeshStandardMaterial({
          color: 0x9a745a,
          map: buildingTextures.wood,
          bumpMap: buildingTextures.wood,
          bumpScale: .03,
          roughness: .9
        }),
        gold: new THREE.MeshStandardMaterial({ color: 0xc9a13e, roughness: .36, metalness: .68 }),
        water: new THREE.MeshPhysicalMaterial({
          color: 0x2c8ca8,
          transparent: true,
          opacity: .74,
          roughness: .18,
          metalness: .12,
          clearcoat: 1
        }),
        lava: new THREE.MeshStandardMaterial({
          color: 0xffa45a,
          map: buildingTextures.lava,
          emissive: 0xff2808,
          emissiveMap: buildingTextures.lava,
          emissiveIntensity: 2.55,
          roughness: .55
        }),
        dark: new THREE.MeshStandardMaterial({ color: 0x2e2936, roughness: .8, metalness: .2 }),
        windowGlow: new THREE.MeshStandardMaterial({
          color: 0xffd069,
          emissive: 0xff8d24,
          emissiveIntensity: 2.1,
          roughness: .4
        }),
        stormGlow: new THREE.MeshStandardMaterial({
          color: 0xb7e8ff,
          emissive: 0x5b9dff,
          emissiveIntensity: 2.7,
          roughness: .16,
          metalness: .3
        }),
        darkGlow: new THREE.MeshStandardMaterial({
          color: 0xff657e,
          emissive: 0xd31d55,
          emissiveIntensity: 2.4,
          roughness: .24
        }),
        lightGlow: new THREE.MeshStandardMaterial({
          color: 0xfff1a6,
          emissive: 0xffc84c,
          emissiveIntensity: 2.8,
          roughness: .2,
          metalness: .22
        })
      };
      return { geometries, materials, buildingTextures };
    }

    function createAtmosphere() {
      const particleGeometry = new THREE.BufferGeometry();
      const positions = [];
      for (let index = 0; index < 220; index += 1) {
        const angle = seededValue("mist", index) * Math.PI * 2;
        const distance = 6 + seededValue("mist-distance", index) * 11;
        positions.push(
          Math.cos(angle) * distance,
          .4 + seededValue("mist-height", index) * 6,
          Math.sin(angle) * distance
        );
      }
      particleGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const particles = new THREE.Points(
        particleGeometry,
        new THREE.PointsMaterial({
          color: 0xdce8f4,
          size: .045,
          transparent: true,
          opacity: .35,
          depthWrite: false
        })
      );
      atmosphereRoot.add(particles);
      animatedObjects.push({ object: particles, type: "mist" });
    }

    function axialPosition(tile) {
      return {
        x: Math.sqrt(3) * (Number(tile.q) + Number(tile.r) / 2) * HEX_SCALE,
        z: 1.5 * Number(tile.r) * HEX_SCALE
      };
    }

    function tileElevation(tile) {
      const base = {
        water: .07,
        wind: .11,
        earth: .15,
        fire: .17,
        lightning: .13,
        light: .14,
        dark: .12
      }[tile.terrain] || .11;
      return base + seededValue(tile.id, "elevation") * .035;
    }

    function createTile(tile) {
      const position = axialPosition(tile);
      const height = tileElevation(tile);
      const ownerDefinition = options.playerById?.[tile.ownerId];
      const ownerColor = ownerDefinition?.color || "#657083";
      const sourceTexture = shared.buildingTextures.ground;
      const terrainTexture = sourceTexture.clone();
      terrainTexture.center.set(.5, .5);
      terrainTexture.rotation = seededValue(tile.id, "texture-rotation") * Math.PI * 2;
      terrainTexture.repeat.set(1.18, 1.18);
      terrainTexture.needsUpdate = true;
      dynamicTextures.push(terrainTexture);
      const surfaceColor = tile.ownerId
        ? colorValue(ownerColor).lerp(new THREE.Color(0xffffff), .17)
        : new THREE.Color(NEUTRAL_SURFACE_COLOR);
      const surfaceEmissive = tile.ownerId ? colorValue(ownerColor) : new THREE.Color(0x000000);
      const tileMaterial = new THREE.MeshPhysicalMaterial({
        color: surfaceColor,
        map: terrainTexture,
        bumpMap: terrainTexture,
        bumpScale: .065,
        emissive: surfaceEmissive,
        emissiveIntensity: tile.ownerId ? .22 : 0,
        roughness: .92,
        metalness: .01,
        clearcoat: .04,
        clearcoatRoughness: .78
      });
      dynamicMaterials.push(tileMaterial);
      const geometry = new THREE.CylinderGeometry(HEX_RADIUS * 1.012, HEX_RADIUS * 1.02, height, 6, 1);
      dynamicGeometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, tileMaterial);
      mesh.position.set(position.x, height / 2, position.z);
      mesh.rotation.y = Math.PI / 6;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.userData.tileId = tile.id;
      mesh.userData.ownerId = tile.ownerId || "";
      mesh.userData.ownerColor = tile.ownerId ? colorValue(ownerColor) : null;
      mesh.userData.surfaceEmissive = surfaceEmissive;
      mesh.userData.surfaceEmissiveIntensity = tile.ownerId ? .22 : 0;
      clickTargets.push(mesh);
      tileMeshes.set(tile.id, mesh);
      tileRoot.add(mesh);

      if (tile.ownerId) createTerritoryBoundary(tile, position, height, ownerColor, mesh);
      createSelectionAura(tile, position, height, ownerColor, mesh);

      const detail = new THREE.Group();
      detail.position.set(position.x, height, position.z);
      detail.userData.tileId = tile.id;
      if (tile.kind === "base" || tile.kind === "outpost" || tile.kind === "throne") {
        addFortress(detail, tile, ownerColor);
      } else {
        addTerrainObjects(detail, tile);
      }
      tileRoot.add(detail);
    }

    function createTerritoryBoundary(tile, position, height, ownerColor, tileMesh) {
      const color = colorValue(ownerColor);
      const points = [];
      for (let index = 0; index < 6; index += 1) {
        const angle = Math.PI / 6 + index * Math.PI / 3;
        points.push(new THREE.Vector3(Math.cos(angle) * 1.035, .025, Math.sin(angle) * 1.035));
      }
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const lineMaterial = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: .94,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      dynamicGeometries.push(lineGeometry);
      dynamicMaterials.push(lineMaterial);
      const line = new THREE.LineLoop(lineGeometry, lineMaterial);
      line.position.set(position.x, height, position.z);
      line.renderOrder = 5;
      tileRoot.add(line);

      const auraHeight = .26;
      const positions = [];
      const uvs = [];
      const indices = [];
      for (let edge = 0; edge < 6; edge += 1) {
        const next = (edge + 1) % 6;
        const base = positions.length / 3;
        positions.push(
          points[edge].x, 0, points[edge].z,
          points[next].x, 0, points[next].z,
          points[next].x, auraHeight, points[next].z,
          points[edge].x, auraHeight, points[edge].z
        );
        uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      const auraGeometry = new THREE.BufferGeometry();
      auraGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      auraGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      auraGeometry.setIndex(indices);
      const auraMaterial = new THREE.ShaderMaterial({
        uniforms: {
          auraColor: { value: color },
          time: { value: seededValue(tile.id, "aura") * 8 },
          strength: { value: .24 }
        },
        vertexShader: `
          varying float vHeight;
          varying float vEdge;
          void main() {
            vHeight = uv.y;
            vEdge = uv.x;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 auraColor;
          uniform float time;
          uniform float strength;
          varying float vHeight;
          varying float vEdge;
          void main() {
            float verticalFade = pow(max(0.0, 1.0 - vHeight), 1.55);
            float shimmer = 0.72 + 0.28 * sin(time * 1.7 + vHeight * 12.0 + vEdge * 4.0);
            float edgeGlow = 0.72 + 0.28 * sin(vEdge * 3.14159);
            gl_FragColor = vec4(auraColor, verticalFade * shimmer * edgeGlow * strength);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      dynamicGeometries.push(auraGeometry);
      dynamicMaterials.push(auraMaterial);
      const aura = new THREE.Mesh(auraGeometry, auraMaterial);
      aura.position.set(position.x, height + .01, position.z);
      aura.renderOrder = 4;
      tileRoot.add(aura);
      animatedObjects.push({ object: aura, type: "territoryAura", material: auraMaterial });
      tileMesh.userData.boundaryLine = lineMaterial;
      tileMesh.userData.boundaryAura = auraMaterial;
    }

    function createSelectionAura(tile, position, height, ownerColor, tileMesh) {
      const auraColor = tile.ownerId === "tofu"
        ? new THREE.Color(0x9aa0a8)
        : (tile.ownerId
          ? colorValue(ownerColor).lerp(new THREE.Color(0xffffff), .32)
          : new THREE.Color(0xf2efe6));
      const auraMaterial = new THREE.ShaderMaterial({
        uniforms: {
          auraColor: { value: auraColor },
          time: { value: seededValue(tile.id, "selection-aura") * 8 },
          strength: { value: 0 }
        },
        vertexShader: `
          varying float vHeight;
          varying float vEdge;
          void main() {
            vHeight = uv.y;
            vEdge = uv.x;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 auraColor;
          uniform float time;
          uniform float strength;
          varying float vHeight;
          varying float vEdge;
          void main() {
            float baseGlow = pow(max(0.0, 1.0 - vHeight), 0.64);
            float verticalBand = 0.58 + 0.42 * sin(vHeight * 25.0 - time * 4.4);
            float edgeBand = 0.68 + 0.32 * sin(vEdge * 37.699 + time * 1.8);
            float alpha = strength * baseGlow * (0.46 + verticalBand * 0.54) * edgeBand;
            gl_FragColor = vec4(auraColor, alpha);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: auraColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      dynamicMaterials.push(auraMaterial, ringMaterial);

      const aura = new THREE.Mesh(shared.geometries.selectionAura, auraMaterial);
      aura.position.set(position.x, height + 1.275, position.z);
      aura.rotation.y = Math.PI / 6;
      aura.visible = false;
      aura.renderOrder = 7;
      tileRoot.add(aura);

      const ring = new THREE.Mesh(shared.geometries.selectionRing, ringMaterial);
      ring.position.set(position.x, height + .08, position.z);
      ring.rotation.x = Math.PI / 2;
      ring.visible = false;
      ring.renderOrder = 8;
      tileRoot.add(ring);

      tileMesh.userData.selectionAura = aura;
      tileMesh.userData.selectionAuraMaterial = auraMaterial;
      tileMesh.userData.selectionRing = ring;
      tileMesh.userData.selectionRingMaterial = ringMaterial;
      animatedObjects.push(
        { object: aura, type: "selectionAura", material: auraMaterial },
        { object: ring, type: "selectionRing", material: ringMaterial, phase: seededValue(tile.id, "selection-ring") * 6 }
      );
    }

    function addTerrainObjects(group, tile) {
      const seed = tile.id;
      if (tile.terrain === "wind") {
        addForest3D(group, seed);
      } else if (tile.terrain === "earth") {
        addPlainLandDetails(group, seed);
      } else if (tile.terrain === "fire") {
        addVolcano3D(group, seed);
      } else if (tile.terrain === "water") {
        addWaterRuins3D(group, seed);
        const rippleMaterial = new THREE.MeshBasicMaterial({
          color: 0xa9efff,
          transparent: true,
          opacity: .28
        });
        dynamicMaterials.push(rippleMaterial);
        const ripple = new THREE.Mesh(shared.geometries.ripple, rippleMaterial);
        ripple.rotation.x = Math.PI / 2;
        ripple.position.y = .085;
        group.add(ripple);
        animatedObjects.push({ object: ripple, type: "ripple", phase: seededValue(seed, 5) * 6 });
      } else if (tile.terrain === "lightning") {
        addStormSpire3D(group, seed);
      } else if (tile.terrain === "light") {
        addLightSanctuary3D(group, seed);
      } else if (tile.terrain === "dark") {
        addDarkCitadel3D(group, seed);
      }
    }

    function addForest3D(group, seed) {
      const forest = new THREE.Group();
      forest.rotation.y = seededValue(seed, "forest-rotation") * Math.PI;
      const treeCount = 5 + Math.floor(seededValue(seed, "forest-count") * 3);
      for (let index = 0; index < treeCount; index += 1) addTree(forest, seed, index);
      addRock(forest, seed, 31, .55);
      addRock(forest, seed, 32, .42);
      group.add(forest);
    }

    function addPlainLandDetails(group, seed) {
      const details = new THREE.Group();
      details.rotation.y = seededValue(seed, "plain-detail-rotation") * Math.PI * 2;
      const tuftCount = 3 + Math.floor(seededValue(seed, "plain-grass-count") * 3);
      const grass = new THREE.InstancedMesh(shared.geometries.grassTuft, shared.materials.grass, tuftCount);
      const transform = new THREE.Object3D();
      for (let index = 0; index < tuftCount; index += 1) {
        const angle = seededValue(seed, `plain-grass-angle-${index}`) * Math.PI * 2;
        const distance = .2 + seededValue(seed, `plain-grass-distance-${index}`) * .52;
        const scale = .58 + seededValue(seed, `plain-grass-scale-${index}`) * .58;
        transform.position.set(Math.cos(angle) * distance, .052 * scale, Math.sin(angle) * distance);
        transform.rotation.set(
          (seededValue(seed, `plain-grass-lean-x-${index}`) - .5) * .24,
          seededValue(seed, `plain-grass-yaw-${index}`) * Math.PI,
          (seededValue(seed, `plain-grass-lean-z-${index}`) - .5) * .24
        );
        transform.scale.set(scale, scale, scale);
        transform.updateMatrix();
        grass.setMatrixAt(index, transform.matrix);
      }
      grass.instanceMatrix.needsUpdate = true;
      grass.receiveShadow = true;
      details.add(grass);

      const rockCount = 1 + Math.floor(seededValue(seed, "plain-rock-count") * 2);
      for (let index = 0; index < rockCount; index += 1) {
        addGroundRock(details, seed, index);
      }
      group.add(details);
    }

    function addGroundRock(group, seed, index) {
      const angle = seededValue(seed, `ground-rock-angle-${index}`) * Math.PI * 2;
      const distance = .3 + seededValue(seed, `ground-rock-distance-${index}`) * .42;
      const scale = .14 + seededValue(seed, `ground-rock-scale-${index}`) * .1;
      const rock = new THREE.Mesh(shared.geometries.rock, shared.materials.rock);
      rock.position.set(Math.cos(angle) * distance, .035, Math.sin(angle) * distance);
      rock.scale.set(scale * 1.2, scale * .78, scale);
      rock.rotation.set(
        seededValue(seed, `ground-rock-x-${index}`),
        seededValue(seed, `ground-rock-y-${index}`) * Math.PI,
        seededValue(seed, `ground-rock-z-${index}`)
      );
      rock.castShadow = true;
      rock.receiveShadow = true;
      group.add(rock);
    }

    function addMountainPeak(group, x, z, scale, rotation) {
      const mountain = addModelMesh(
        group,
        shared.geometries.mountain,
        shared.materials.mountain,
        [x, .525 * scale, z],
        [.92 * scale, scale, .92 * scale],
        rotation
      );
      mountain.rotation.z = (scale - .75) * .08;
      const snow = addModelMesh(
        group,
        shared.geometries.mountain,
        shared.materials.snow,
        [x, .89 * scale, z],
        [.4 * scale, .32 * scale, .4 * scale],
        rotation
      );
      snow.rotation.z = mountain.rotation.z;
    }

    function addMountainRange3D(group, seed) {
      const range = new THREE.Group();
      range.rotation.y = (seededValue(seed, "range-rotation") - .5) * .55;
      addMountainPeak(range, -.26, .06, .92, seededValue(seed, "peak-a") * Math.PI);
      addMountainPeak(range, .25, .11, .72, seededValue(seed, "peak-b") * Math.PI);
      addMountainPeak(range, .02, -.27, .58, seededValue(seed, "peak-c") * Math.PI);
      addRock(range, seed, 41, .6);
      addRock(range, seed, 42, .48);
      group.add(range);
    }

    function addVolcano3D(group, seed) {
      const volcano = new THREE.Group();
      volcano.rotation.y = seededValue(seed, "volcano-rotation") * Math.PI;
      const body = addModelMesh(
        volcano,
        shared.geometries.volcano,
        shared.materials.volcanicRock,
        [0, .36, 0],
        [1, .96, 1]
      );
      body.rotation.z = (seededValue(seed, "volcano-lean") - .5) * .05;
      const crater = addModelMesh(volcano, shared.geometries.crater, shared.materials.volcanicRock, [0, .716, 0]);
      crater.rotation.x = Math.PI / 2;
      const lava = addModelMesh(volcano, shared.geometries.lavaPool, shared.materials.lava, [0, .711, 0]);
      animatedObjects.push({ object: lava, type: "lava", phase: seededValue(seed, "lava") * 6 });
      [0, Math.PI * .68, Math.PI * 1.34].forEach((angle, index) => {
        const distance = .25 + index * .025;
        const stream = addModelMesh(
          volcano,
          shared.geometries.lavaStream,
          shared.materials.lava,
          [Math.cos(angle) * distance, .38, Math.sin(angle) * distance],
          [1, .84 + index * .08, 1],
          angle
        );
        stream.rotation.z = .66;
      });
      for (let index = 0; index < 4; index += 1) addRock(volcano, seed, 70 + index, .48 + index * .04);
      group.add(volcano);
    }

    function addModelMesh(group, geometry, material, position, scale = [1, 1, 1], rotationY = 0) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position[0], position[1], position[2]);
      mesh.scale.set(scale[0], scale[1], scale[2]);
      mesh.rotation.y = rotationY;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    }

    function addHouse3D(
      group,
      x,
      z,
      scale,
      rotation,
      wallMaterial = shared.materials.stone,
      roofMaterial = shared.materials.roof
    ) {
      const house = new THREE.Group();
      house.position.set(x, 0, z);
      house.rotation.y = rotation;
      house.scale.setScalar(scale);
      addModelMesh(house, shared.geometries.house, wallMaterial, [0, .16, 0]);
      addModelMesh(house, shared.geometries.squareRoof, roofMaterial, [0, .41, 0], [.72, .72, .72], Math.PI / 4);
      addModelMesh(house, shared.geometries.gate, shared.materials.wood, [0, .14, .157], [.56, .72, 1]);
      addModelMesh(house, shared.geometries.window, shared.materials.windowGlow, [-.1, .22, .158]);
      addModelMesh(house, shared.geometries.window, shared.materials.windowGlow, [.1, .22, .158]);
      group.add(house);
    }

    function addVillage3D(group, seed) {
      const village = new THREE.Group();
      village.rotation.y = (seededValue(seed, "village-rotation") - .5) * .65;
      addHouse3D(village, -.29, -.06, .9, -.12);
      addHouse3D(village, .27, -.16, .76, .18);
      addHouse3D(village, .03, .31, .68, Math.PI + .08);
      const well = addModelMesh(village, shared.geometries.tower, shared.materials.stone, [0, .08, .03], [.44, .22, .44]);
      well.rotation.y = seededValue(seed, "well") * Math.PI;
      group.add(village);
    }

    function addWaterRuins3D(group, seed) {
      const ruins = new THREE.Group();
      ruins.rotation.y = seededValue(seed, "ruins-rotation") * Math.PI;
      addModelMesh(ruins, shared.geometries.foundation, shared.materials.stone, [0, .035, 0], [.82, .54, .82]);
      [[-.34, -.25], [.34, -.25], [-.34, .25], [.34, .25]].forEach(([x, z], index) => {
        const height = index === 3 ? .54 : (.38 + seededValue(seed, `column-${index}`) * .18);
        addModelMesh(ruins, shared.geometries.column, shared.materials.stone, [x, height / 2, z], [1, height / .48, 1]);
      });
      addModelMesh(ruins, shared.geometries.slab, shared.materials.stone, [0, .12, 0], [1.35, .75, 1.3], Math.PI / 2);
      addModelMesh(ruins, shared.geometries.slab, shared.materials.stoneDark, [0, .04, 0], [1.6, .45, 1.65]);
      group.add(ruins);
    }

    function addStormSpire3D(group, seed) {
      const spire = new THREE.Group();
      spire.rotation.y = seededValue(seed, "spire-rotation") * Math.PI;
      addModelMesh(spire, shared.geometries.foundation, shared.materials.stoneDark, [0, .045, 0], [.62, .7, .62]);
      addModelMesh(spire, shared.geometries.tower, shared.materials.stoneDark, [0, .42, 0], [.66, 1.1, .66]);
      addModelMesh(spire, shared.geometries.roof, shared.materials.roof, [0, .88, 0], [.78, 1.45, .78]);
      const crystal = addModelMesh(spire, shared.geometries.crystal, shared.materials.stormGlow, [0, 1.18, 0], [.82, 1.2, .82]);
      animatedObjects.push({ object: crystal, type: "rotate", phase: seededValue(seed, "crystal") * 6 });
      const crown = addModelMesh(spire, shared.geometries.crown, shared.materials.stormGlow, [0, .72, 0], [.78, .78, .78], Math.PI / 2);
      crown.rotation.x = Math.PI / 2;
      animatedObjects.push({ object: crown, type: "rotate", phase: seededValue(seed, "crown") * 6 });
      group.add(spire);
    }

    function addLightSanctuary3D(group, seed) {
      const sanctuary = new THREE.Group();
      sanctuary.rotation.y = seededValue(seed, "sanctuary-rotation") * Math.PI;
      addModelMesh(sanctuary, shared.geometries.foundation, shared.materials.stone, [0, .045, 0], [.82, .72, .82]);
      [[-.32, -.25], [.32, -.25], [-.32, .25], [.32, .25]].forEach(([x, z]) => {
        addModelMesh(sanctuary, shared.geometries.column, shared.materials.stone, [x, .28, z], [1.18, 1.15, 1.18]);
      });
      addModelMesh(sanctuary, shared.geometries.slab, shared.materials.gold, [0, .14, 0], [1.28, .72, 1.25], Math.PI / 2);
      const crystal = addModelMesh(sanctuary, shared.geometries.crystal, shared.materials.lightGlow, [0, .52, 0], [.92, 1.3, .92]);
      const crown = addModelMesh(sanctuary, shared.geometries.crown, shared.materials.lightGlow, [0, .51, 0], [1.05, 1.05, 1.05], Math.PI / 2);
      crown.rotation.x = Math.PI / 2;
      animatedObjects.push(
        { object: crystal, type: "rotate", phase: seededValue(seed, "sanctuary-crystal") * 6 },
        { object: crown, type: "rotate", phase: seededValue(seed, "sanctuary-crown") * 6 }
      );
      group.add(sanctuary);
    }

    function addDarkCitadel3D(group, seed) {
      const citadel = new THREE.Group();
      citadel.rotation.y = (seededValue(seed, "citadel-rotation") - .5) * .35;
      addModelMesh(citadel, shared.geometries.foundation, shared.materials.stoneDark, [0, .045, 0], [.82, .72, .82]);
      addModelMesh(citadel, shared.geometries.keep, shared.materials.stoneDark, [0, .37, 0], [.94, 1.16, .94]);
      addModelMesh(citadel, shared.geometries.squareRoof, shared.materials.roof, [0, .81, 0], [.7, 1.5, .7], Math.PI / 4);
      [[-.34, -.28], [.34, -.28], [-.34, .28], [.34, .28]].forEach(([x, z], index) => {
        const tower = addModelMesh(citadel, shared.geometries.tower, shared.materials.stoneDark, [x, .3, z], [.7, .78 + index * .05, .7]);
        tower.rotation.y = seededValue(seed, `dark-tower-${index}`) * Math.PI;
        addModelMesh(citadel, shared.geometries.roof, shared.materials.roof, [x, .67 + index * .018, z], [.68, 1.32, .68]);
      });
      addModelMesh(citadel, shared.geometries.window, shared.materials.darkGlow, [-.13, .43, .235], [1.1, 1.15, 1]);
      addModelMesh(citadel, shared.geometries.window, shared.materials.darkGlow, [.13, .43, .235], [1.1, 1.15, 1]);
      group.add(citadel);
    }

    function addTree(group, seed, index) {
      const angle = seededValue(seed, index) * Math.PI * 2;
      const distance = .25 + seededValue(seed, index + 9) * .38;
      const tree = new THREE.Group();
      tree.position.set(Math.cos(angle) * distance, .19, Math.sin(angle) * distance);
      const trunk = new THREE.Mesh(shared.geometries.treeTrunk, shared.materials.trunk);
      const crown = new THREE.Mesh(
        shared.geometries.treeCrown,
        index % 2 ? shared.materials.pine : shared.materials.pineLight
      );
      crown.position.y = .3;
      crown.scale.set(1.08, .9, 1.08);
      const middleCrown = crown.clone();
      middleCrown.position.y = .49;
      middleCrown.scale.set(.82, .76, .82);
      middleCrown.rotation.y = .38;
      const topCrown = crown.clone();
      topCrown.position.y = .64;
      topCrown.scale.set(.56, .58, .56);
      topCrown.rotation.y = -.27;
      crown.castShadow = true;
      middleCrown.castShadow = true;
      topCrown.castShadow = true;
      tree.add(trunk, crown, middleCrown, topCrown);
      tree.scale.setScalar(.72 + seededValue(seed, index + 15) * .34);
      group.add(tree);
    }

    function addRock(group, seed, index, scale = 1) {
      const rock = new THREE.Mesh(shared.geometries.rock, shared.materials.rock);
      rock.scale.set(
        (.65 + seededValue(seed, index) * .5) * scale,
        (.55 + seededValue(seed, index + 4) * .7) * scale,
        (.65 + seededValue(seed, index + 7) * .5) * scale
      );
      rock.position.set(
        (seededValue(seed, index + 10) - .5) * 1.05,
        .12,
        (seededValue(seed, index + 20) - .5) * 1.05
      );
      rock.rotation.set(
        seededValue(seed, index + 30),
        seededValue(seed, index + 40) * Math.PI,
        seededValue(seed, index + 50)
      );
      rock.castShadow = true;
      group.add(rock);
    }

    function addBanner(group, ownerColor, height = .72) {
      const pole = new THREE.Mesh(shared.geometries.pole, shared.materials.gold);
      pole.position.y = height / 2;
      pole.scale.y = height / .7;
      const bannerMaterial = new THREE.MeshStandardMaterial({
        color: colorValue(ownerColor),
        roughness: .66,
        side: THREE.DoubleSide
      });
      dynamicMaterials.push(bannerMaterial);
      const banner = new THREE.Mesh(shared.geometries.banner, bannerMaterial);
      banner.position.set(.14, height - .16, 0);
      banner.rotation.y = Math.PI / 2;
      banner.userData.baseRotation = banner.rotation.z;
      group.add(pole, banner);
      animatedObjects.push({ object: banner, type: "banner", phase: seededValue(ownerColor, height) * 6 });
    }

    function addFortress(group, tile, ownerColor) {
      const scale = tile.kind === "throne" ? 1.08 : (tile.kind === "base" ? .94 : .76);
      const fortress = new THREE.Group();
      fortress.scale.setScalar(scale);
      fortress.rotation.y = (seededValue(tile.id, "fortress-rotation") - .5) * .18;
      const accent = new THREE.MeshStandardMaterial({
        color: colorValue(ownerColor).lerp(new THREE.Color(0xffffff), .08),
        emissive: colorValue(ownerColor),
        emissiveIntensity: .16,
        roughness: .44,
        metalness: .48
      });
      dynamicMaterials.push(accent);
      addModelMesh(fortress, shared.geometries.foundation, shared.materials.stoneDark, [0, .055, 0]);
      addModelMesh(fortress, shared.geometries.keep, shared.materials.stone, [0, .42, 0], [.96, 1.24, .96]);
      addModelMesh(fortress, shared.geometries.squareRoof, shared.materials.roof, [0, .91, 0], [.72, 1.15, .72], Math.PI / 4);

      const wallData = [
        [0, .25, -.51, 1.42, 1.18, 1, 0],
        [0, .25, .51, 1.42, 1.18, 1, 0],
        [-.51, .25, 0, 1.42, 1.18, 1, Math.PI / 2],
        [.51, .25, 0, 1.42, 1.18, 1, Math.PI / 2]
      ];
      wallData.forEach(([x, y, z, sx, sy, sz, rotation]) => {
        addModelMesh(fortress, shared.geometries.wall, shared.materials.stone, [x, y, z], [sx, sy, sz], rotation);
      });

      [[-.48, -.48], [.48, -.48], [-.48, .48], [.48, .48]].forEach(([x, z], index) => {
        addModelMesh(fortress, shared.geometries.tower, shared.materials.stone, [x, .38, z], [.92, 1.05, .92]);
        addModelMesh(fortress, shared.geometries.roof, shared.materials.roof, [x, .83, z], [.88, 1.12, .88], index * .2);
      });

      [-.27, -.09, .09, .27].forEach((offset) => {
        addModelMesh(fortress, shared.geometries.battlement, shared.materials.stone, [offset, .47, .61]);
        addModelMesh(fortress, shared.geometries.battlement, shared.materials.stone, [offset, .47, -.61]);
        addModelMesh(fortress, shared.geometries.battlement, shared.materials.stone, [.61, .47, offset]);
        addModelMesh(fortress, shared.geometries.battlement, shared.materials.stone, [-.61, .47, offset]);
      });

      addModelMesh(fortress, shared.geometries.gate, shared.materials.wood, [0, .2, .605], [1.1, 1.38, 1]);
      addModelMesh(fortress, shared.geometries.slab, accent, [0, .52, .615], [.54, .28, .22]);
      addModelMesh(fortress, shared.geometries.window, shared.materials.windowGlow, [-.13, .49, .235]);
      addModelMesh(fortress, shared.geometries.window, shared.materials.windowGlow, [.13, .49, .235]);
      addBanner(fortress, ownerColor, 1.22);
      group.add(fortress);
      addFortressOutskirts(group, tile);
    }

    function addFortressOutskirts(group, tile) {
      const outskirts = new THREE.Group();
      const buildingCount = tile.kind === "throne" ? 4 : (tile.kind === "base" ? 3 : 2);
      const startAngle = seededValue(tile.id, "outskirts-angle") * Math.PI * 2;
      for (let index = 0; index < buildingCount; index += 1) {
        const angle = startAngle + index * Math.PI * 2 / buildingCount;
        const radius = .83 + seededValue(tile.id, `outskirts-radius-${index}`) * .07;
        const scale = .35 + seededValue(tile.id, `outskirts-scale-${index}`) * .08;
        addHouse3D(
          outskirts,
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          scale,
          -angle + Math.PI / 2,
          shared.materials.cottageWall,
          shared.materials.cottageRoof
        );
      }
      addGroundRock(outskirts, `${tile.id}:outskirts`, 0);
      group.add(outskirts);
    }

    function clearTiles() {
      while (tileRoot.children.length) {
        tileRoot.remove(tileRoot.children[0]);
      }
      clickTargets.length = 0;
      tileMeshes.clear();
      dynamicMaterials.splice(0).forEach((material) => material.dispose());
      dynamicGeometries.splice(0).forEach((geometry) => geometry.dispose());
      dynamicTextures.splice(0).forEach((texture) => texture.dispose());
      for (let index = animatedObjects.length - 1; index >= 0; index -= 1) {
        if (animatedObjects[index].type !== "mist") animatedObjects.splice(index, 1);
      }
    }

    function buildSignature(nextState) {
      return Object.values(nextState?.tiles || {})
        .map((tile) => `${tile.id}:${tile.ownerId}:${tile.eventId}:${Math.round(Number(tile.garrison?.hype) || 0)}`)
        .join("|");
    }

    function update(nextState, nextSelectedTileId) {
      state = nextState;
      selectedTileId = nextSelectedTileId || selectedTileId;
      const signature = buildSignature(nextState);
      if (signature !== sceneSignature) {
        sceneSignature = signature;
        clearTiles();
        Object.values(nextState?.tiles || {})
          .sort((a, b) => a.id.localeCompare(b.id))
          .forEach(createTile);
      }
      updateSelection();
      renderOnce();
    }

    function updateSelection() {
      container.dataset.selectedTile = selectedTileId;
      tileMeshes.forEach((mesh, tileId) => {
        const selected = tileId === selectedTileId;
        mesh.scale.set(1, 1, 1);
        if (selected) {
          mesh.material.emissive.setHex(mesh.userData.ownerId === "tofu" ? 0x4d535a : 0x6b4b18);
          mesh.material.emissiveIntensity = .48;
        } else {
          mesh.material.emissive.copy(mesh.userData.surfaceEmissive);
          mesh.material.emissiveIntensity = mesh.userData.surfaceEmissiveIntensity;
        }
        if (mesh.userData.boundaryLine) {
          mesh.userData.boundaryLine.opacity = selected ? 1 : .86;
        }
        if (mesh.userData.boundaryAura) {
          mesh.userData.boundaryAura.uniforms.strength.value = selected ? .34 : .24;
        }
        if (mesh.userData.selectionAura) {
          mesh.userData.selectionAura.visible = selected;
          mesh.userData.selectionAuraMaterial.uniforms.strength.value = selected ? .72 : 0;
        }
        if (mesh.userData.selectionRing) {
          mesh.userData.selectionRing.visible = selected;
          mesh.userData.selectionRingMaterial.opacity = selected ? .92 : 0;
        }
      });
    }

    function cameraPosition() {
      const horizontal = Math.cos(pitch) * radius;
      camera.position.set(
        Math.sin(yaw) * horizontal,
        Math.sin(pitch) * radius,
        Math.cos(yaw) * horizontal
      );
      camera.lookAt(0, 0, 0);
    }

    function resize() {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      if (!viewTouched) radius = camera.aspect < .85 ? 21.5 : 18.6;
      camera.updateProjectionMatrix();
      renderOnce();
    }

    function renderOnce() {
      if (!container.clientWidth || !container.clientHeight) return;
      cameraPosition();
      renderer.render(scene, camera);
    }

    function animate(time) {
      if (!active) return;
      const seconds = time * .001;
      animatedObjects.forEach((entry) => {
        if (entry.type === "mist") {
          entry.object.rotation.y = seconds * .012;
        } else if (entry.type === "rotate") {
          entry.object.rotation.y = seconds * .65 + entry.phase;
        } else if (entry.type === "pulse") {
          const scale = 1 + Math.sin(seconds * 2.8 + entry.phase) * .18;
          entry.object.scale.setScalar(scale);
        } else if (entry.type === "ripple") {
          const cycle = (seconds * .33 + entry.phase) % 1;
          entry.object.scale.setScalar(.7 + cycle * .75);
          entry.object.material.opacity = (1 - cycle) * .5;
        } else if (entry.type === "lava") {
          const pulse = 1 + Math.sin(seconds * 2.6 + entry.phase) * .045;
          entry.object.scale.set(pulse, 1, pulse);
          entry.object.material.emissiveIntensity = 2.15 + Math.sin(seconds * 3.1 + entry.phase) * .35;
        } else if (entry.type === "banner") {
          entry.object.rotation.z = Math.sin(seconds * 2.1 + entry.phase) * .07;
        } else if (entry.type === "territoryAura") {
          entry.material.uniforms.time.value = seconds;
        } else if (entry.type === "selectionAura") {
          entry.material.uniforms.time.value = seconds;
        } else if (entry.type === "selectionRing") {
          const pulse = 1 + Math.sin(seconds * 2.7 + entry.phase) * .09;
          entry.object.scale.setScalar(pulse);
          entry.material.opacity = .76 + Math.sin(seconds * 3.2 + entry.phase) * .16;
        }
      });
      cameraPosition();
      renderer.render(scene, camera);
      animationFrame = global.requestAnimationFrame(animate);
    }

    function setActive(nextActive) {
      const shouldRun = Boolean(nextActive);
      if (shouldRun === active) {
        if (active) resize();
        return;
      }
      active = shouldRun;
      global.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      if (active) {
        resize();
        animationFrame = global.requestAnimationFrame(animate);
      } else {
        tooltip.hidden = true;
      }
    }

    function resetView() {
      yaw = Math.PI * .23;
      pitch = .72;
      viewTouched = false;
      radius = camera.aspect < .85 ? 21.5 : 18.6;
      renderOnce();
    }

    function raycast(clientX, clientY) {
      const bounds = renderer.domElement.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return null;
      pointer.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(clickTargets, false)[0]?.object || null;
    }

    function showTooltip(tileId, clientX, clientY) {
      const summary = summarize(state, tileId);
      if (!summary) {
        tooltip.hidden = true;
        return;
      }
      const eventName = summary.event?.name ? `<span>${summary.event.name}</span>` : "";
      tooltip.innerHTML = `<strong>${summary.terrainName}</strong><span>${summary.ownerName}</span>${eventName}`;
      tooltip.hidden = false;
      const bounds = container.getBoundingClientRect();
      tooltip.style.left = `${clamp(clientX - bounds.left + 14, 8, Math.max(8, bounds.width - 160))}px`;
      tooltip.style.top = `${clamp(clientY - bounds.top + 14, 8, Math.max(8, bounds.height - 74))}px`;
    }

    function selectAt(clientX, clientY) {
      const hit = raycast(clientX, clientY);
      const tileId = hit?.userData?.tileId;
      container.dataset.lastPointer = `${Math.round(clientX)},${Math.round(clientY)}`;
      container.dataset.lastHit = tileId || "";
      if (!tileId) return false;
      selectedTileId = tileId;
      updateSelection();
      onSelect(tileId);
      return true;
    }

    renderer.domElement.addEventListener("pointerdown", (event) => {
      pointerDown = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false
      };
      renderer.domElement.setPointerCapture?.(event.pointerId);
    });

    renderer.domElement.addEventListener("pointermove", (event) => {
      if (pointerDown?.id === event.pointerId) {
        const dx = event.clientX - pointerDown.lastX;
        const dy = event.clientY - pointerDown.lastY;
        if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) {
          pointerDown.moved = true;
        }
        if (pointerDown.moved) {
          viewTouched = true;
          yaw -= dx * .0065;
          pitch = clamp(pitch + dy * .0045, .36, 1.18);
          tooltip.hidden = true;
          renderOnce();
        }
        pointerDown.lastX = event.clientX;
        pointerDown.lastY = event.clientY;
        return;
      }
      const hit = raycast(event.clientX, event.clientY);
      const tileId = hit?.userData?.tileId || "";
      if (tileId !== hoveredTileId) {
        hoveredTileId = tileId;
        renderer.domElement.style.cursor = tileId ? "pointer" : "grab";
      }
      if (tileId) showTooltip(tileId, event.clientX, event.clientY);
      else tooltip.hidden = true;
    });

    renderer.domElement.addEventListener("pointerup", (event) => {
      if (!pointerDown || pointerDown.id !== event.pointerId) return;
      const wasMoved = pointerDown.moved;
      pointerDown = null;
      if (wasMoved) return;
      if (selectAt(event.clientX, event.clientY)) lastPointerSelectionAt = performance.now();
    });

    renderer.domElement.addEventListener("click", (event) => {
      if (performance.now() - lastPointerSelectionAt < 180) return;
      selectAt(event.clientX, event.clientY);
    });

    renderer.domElement.addEventListener("pointerleave", () => {
      pointerDown = null;
      hoveredTileId = "";
      tooltip.hidden = true;
    });

    renderer.domElement.addEventListener("wheel", (event) => {
      event.preventDefault();
      viewTouched = true;
      radius = clamp(radius + Math.sign(event.deltaY) * 1.25, 13, 30);
      renderOnce();
    }, { passive: false });

    controls.addEventListener("click", (event) => {
      event.stopPropagation();
      if (event.target.closest("[data-map-zoom-in]")) {
        viewTouched = true;
        radius = clamp(radius - 1.8, 13, 30);
      }
      if (event.target.closest("[data-map-zoom-out]")) {
        viewTouched = true;
        radius = clamp(radius + 1.8, 13, 30);
      }
      if (event.target.closest("[data-map-reset]")) {
        resetView();
        return;
      }
      renderOnce();
    });

    resize();
    return Object.freeze({
      update,
      resize,
      setActive,
      resetView,
      canvas: renderer.domElement
    });
  }

  global.TeamBingoTerritoryMap3D = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
