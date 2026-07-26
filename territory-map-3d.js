(function bootstrapTerritoryMap3D(global) {
  "use strict";

  const THREE = global.THREE;
  if (!THREE) return;

  const HEX_RADIUS = 1.06;
  const HEX_SCALE = 1.04;
  const TERRAIN_COLORS = Object.freeze({
    fire: 0x5f3025,
    water: 0x245a6f,
    earth: 0x6c6044,
    wind: 0x3d6b46,
    lightning: 0x56547a,
    light: 0x857652,
    dark: 0x302d3e
  });
  const LANDMARK_ASSETS = Object.freeze({
    forest: "images/territory/realistic/forest.png",
    mountains: "images/territory/realistic/mountains.png",
    volcano: "images/territory/realistic/volcano.png"
  });
  const BUILDING_TEXTURE_ASSETS = Object.freeze({
    stone: "images/territory/textures/stone-wall.png",
    roof: "images/territory/textures/roof-tiles.png",
    wood: "images/territory/textures/aged-wood.png"
  });
  const TERRAIN_TEXTURE_PALETTES = Object.freeze({
    fire: ["#3b2822", "#70402b", "#1d1918"],
    water: ["#236579", "#318da0", "#143d51"],
    earth: ["#756a4d", "#918467", "#4f4939"],
    wind: ["#355b38", "#547549", "#243d2c"],
    lightning: ["#494c68", "#75789a", "#313448"],
    light: ["#847a5a", "#ada071", "#5f583f"],
    dark: ["#302f3d", "#4a465a", "#211f2b"]
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
    renderer.toneMappingExposure = 1.32;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "territory-map-canvas";
    renderer.domElement.setAttribute("aria-label", "六王領土戦 3Dマップ");
    renderer.domElement.setAttribute("role", "img");
    container.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x111824, .034);
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

    const hemiLight = new THREE.HemisphereLight(0xcce3ff, 0x35412e, 2.6);
    scene.add(hemiLight);
    const sunLight = new THREE.DirectionalLight(0xffdfaa, 3.4);
    sunLight.position.set(-9, 16, 11);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.left = -13;
    sunLight.shadow.camera.right = 13;
    sunLight.shadow.camera.top = 13;
    sunLight.shadow.camera.bottom = -13;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 45;
    sunLight.shadow.bias = -.0007;
    scene.add(sunLight);
    const warmLight = new THREE.PointLight(0xff7b4c, 16, 26, 2);
    warmLight.position.set(-8, 6, -7);
    scene.add(warmLight);

    const shared = createSharedAssets();
    createAtmosphere();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

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
        wood: loadBuildingTexture(BUILDING_TEXTURE_ASSETS.wood, 1.5, 1.5)
      };
      const geometries = {
        treeTrunk: new THREE.CylinderGeometry(.055, .075, .38, 7),
        treeCrown: new THREE.ConeGeometry(.24, .62, 8),
        rock: new THREE.DodecahedronGeometry(.24, 0),
        mountain: new THREE.ConeGeometry(.42, 1.05, 7),
        tower: new THREE.CylinderGeometry(.17, .2, .72, 12),
        roof: new THREE.ConeGeometry(.24, .32, 12),
        squareRoof: new THREE.ConeGeometry(.4, .3, 4),
        wall: new THREE.BoxGeometry(.72, .34, .18),
        keep: new THREE.BoxGeometry(.46, .62, .46),
        house: new THREE.BoxGeometry(.34, .32, .3),
        foundation: new THREE.CylinderGeometry(.78, .84, .13, 12),
        battlement: new THREE.BoxGeometry(.09, .1, .09),
        column: new THREE.CylinderGeometry(.055, .07, .48, 10),
        slab: new THREE.BoxGeometry(.5, .09, .2),
        window: new THREE.BoxGeometry(.055, .12, .012),
        gate: new THREE.BoxGeometry(.22, .28, .025),
        crystal: new THREE.OctahedronGeometry(.22, 0),
        banner: new THREE.PlaneGeometry(.28, .2),
        pole: new THREE.CylinderGeometry(.018, .018, .7, 6),
        ripple: new THREE.TorusGeometry(.38, .022, 6, 24),
        crown: new THREE.TorusKnotGeometry(.15, .045, 48, 8)
      };
      const materials = {
        trunk: new THREE.MeshStandardMaterial({ color: 0x392c20, roughness: 1 }),
        pine: new THREE.MeshStandardMaterial({ color: 0x173f2b, roughness: .88 }),
        pineLight: new THREE.MeshStandardMaterial({ color: 0x315c38, roughness: .88 }),
        rock: new THREE.MeshStandardMaterial({ color: 0x625e58, roughness: .96 }),
        mountain: new THREE.MeshStandardMaterial({ color: 0x4e4c48, roughness: .94 }),
        snow: new THREE.MeshStandardMaterial({ color: 0xd9e1e7, roughness: .8 }),
        stone: new THREE.MeshStandardMaterial({
          color: 0xb8b5ac,
          map: buildingTextures.stone,
          bumpMap: buildingTextures.stone,
          bumpScale: .045,
          roughness: .88,
          metalness: .04
        }),
        stoneDark: new THREE.MeshStandardMaterial({
          color: 0xa0a8b6,
          map: buildingTextures.stone,
          bumpMap: buildingTextures.stone,
          bumpScale: .055,
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
          color: 0xff5a24,
          emissive: 0xff2808,
          emissiveIntensity: 2.2,
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
        })
      };
      const terrainTextures = Object.fromEntries(
        Object.keys(TERRAIN_TEXTURE_PALETTES).map((terrain) => [terrain, createTerrainTexture(terrain)])
      );
      const landmarkMaterials = {};
      Object.entries(LANDMARK_ASSETS).forEach(([key, url]) => {
        const texture = textureLoader.load(url, renderOnce);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        landmarkMaterials[key] = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          alphaTest: .025,
          depthTest: true,
          depthWrite: false,
          toneMapped: false
        });
      });
      return { geometries, materials, terrainTextures, landmarkMaterials, buildingTextures };
    }

    function createTerrainTexture(terrain) {
      const [base, accent, shadow] = TERRAIN_TEXTURE_PALETTES[terrain];
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext("2d");
      context.fillStyle = base;
      context.fillRect(0, 0, 256, 256);
      for (let index = 0; index < 900; index += 1) {
        const x = seededValue(terrain, index) * 256;
        const y = seededValue(terrain, index + 1300) * 256;
        const radius = 1 + seededValue(terrain, index + 2600) * 11;
        context.globalAlpha = .025 + seededValue(terrain, index + 3900) * .09;
        context.fillStyle = index % 3 ? accent : shadow;
        context.beginPath();
        context.ellipse(x, y, radius * 1.7, radius, seededValue(terrain, index + 5200) * Math.PI, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = terrain === "water" ? .26 : .1;
      context.strokeStyle = terrain === "water" ? "#b6eff6" : "#d7cda5";
      context.lineWidth = terrain === "water" ? 1.2 : .65;
      for (let line = 0; line < 18; line += 1) {
        const startY = seededValue(`${terrain}:line`, line) * 256;
        context.beginPath();
        context.moveTo(-20, startY);
        context.bezierCurveTo(58, startY - 18, 174, startY + 22, 276, startY - 5);
        context.stroke();
      }
      if (terrain === "earth" || terrain === "light") {
        for (let patch = 0; patch < 22; patch += 1) {
          const x = seededValue(`${terrain}:field-x`, patch) * 256;
          const y = seededValue(`${terrain}:field-y`, patch) * 256;
          const width = 18 + seededValue(`${terrain}:field-w`, patch) * 46;
          const height = 12 + seededValue(`${terrain}:field-h`, patch) * 34;
          context.save();
          context.translate(x, y);
          context.rotate((seededValue(`${terrain}:field-r`, patch) - .5) * .7);
          context.globalAlpha = .11 + seededValue(`${terrain}:field-a`, patch) * .12;
          context.fillStyle = patch % 3 === 0 ? "#d1bd72" : (patch % 2 ? "#53643b" : "#9c7443");
          context.fillRect(-width / 2, -height / 2, width, height);
          context.restore();
        }
      } else if (terrain === "wind") {
        context.globalAlpha = .44;
        context.strokeStyle = "#5b452b";
        context.lineWidth = 8;
        context.beginPath();
        context.moveTo(-15, 220);
        context.bezierCurveTo(72, 194, 78, 68, 276, 34);
        context.stroke();
        context.globalAlpha = .48;
        context.strokeStyle = "#baa36e";
        context.lineWidth = 2.5;
        context.stroke();
      } else if (terrain === "fire" || terrain === "lightning" || terrain === "dark") {
        const fissure = terrain === "fire" ? "#ff6a1a" : (terrain === "lightning" ? "#a69cff" : "#5f507f");
        context.strokeStyle = fissure;
        context.lineWidth = terrain === "fire" ? 2.2 : 1.35;
        context.globalAlpha = terrain === "dark" ? .3 : .48;
        for (let crack = 0; crack < 34; crack += 1) {
          let x = seededValue(`${terrain}:crack-x`, crack) * 256;
          let y = seededValue(`${terrain}:crack-y`, crack) * 256;
          context.beginPath();
          context.moveTo(x, y);
          for (let segment = 0; segment < 4; segment += 1) {
            x += (seededValue(`${terrain}:${crack}:dx`, segment) - .5) * 34;
            y += 8 + seededValue(`${terrain}:${crack}:dy`, segment) * 20;
            context.lineTo(x, y);
          }
          context.stroke();
        }
      }
      context.globalAlpha = 1;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return texture;
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
      const surfaceColor = tile.ownerId
        ? colorValue(ownerColor).lerp(new THREE.Color(0xffffff), .2)
        : colorValue(TERRAIN_COLORS[tile.terrain], 0x657083).lerp(new THREE.Color(0xffffff), .16);
      const sourceTexture = shared.terrainTextures[tile.terrain] || shared.terrainTextures.earth;
      const terrainTexture = sourceTexture.clone();
      terrainTexture.center.set(.5, .5);
      terrainTexture.rotation = seededValue(tile.id, "texture-rotation") * Math.PI * 2;
      terrainTexture.repeat.set(1.18, 1.18);
      terrainTexture.needsUpdate = true;
      dynamicTextures.push(terrainTexture);
      const tileMaterial = new THREE.MeshPhysicalMaterial({
        color: surfaceColor,
        map: terrainTexture,
        bumpMap: terrainTexture,
        bumpScale: tile.terrain === "water" ? .018 : .045,
        roughness: tile.terrain === "water" ? .3 : .91,
        metalness: tile.terrain === "water" ? .16 : .02,
        clearcoat: tile.terrain === "water" ? .75 : .08,
        clearcoatRoughness: tile.terrain === "water" ? .18 : .7,
        transparent: tile.terrain === "water",
        opacity: tile.terrain === "water" ? .94 : 1
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
      mesh.userData.ownerColor = tile.ownerId ? colorValue(ownerColor) : null;
      clickTargets.push(mesh);
      tileMeshes.set(tile.id, mesh);
      tileRoot.add(mesh);

      if (tile.ownerId) createTerritoryBoundary(tile, position, height, ownerColor, mesh);

      const detail = new THREE.Group();
      detail.position.set(position.x, height, position.z);
      detail.userData.tileId = tile.id;
      if (tile.kind === "base" || tile.kind === "outpost" || tile.kind === "throne") {
        addFortress(detail, tile, ownerColor);
      } else {
        addTerrainObjects(detail, tile);
        if (tile.ownerId) addBanner(detail, ownerColor, .54);
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

    function addTerrainObjects(group, tile) {
      const seed = tile.id;
      if (tile.terrain === "wind") {
        addLandmarkSprite(group, "forest", 1.62, 1.2, .03, seed);
      } else if (tile.terrain === "earth") {
        if (seededValue(seed, "earth-landmark") > .48) {
          addVillage3D(group, seed);
        } else {
          addLandmarkSprite(group, "mountains", 1.55, 1.25, .02, seed);
        }
      } else if (tile.terrain === "fire") {
        addLandmarkSprite(group, "volcano", 1.64, 1.22, .02, seed);
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
        if (seededValue(seed, "light-landmark") > .46) {
          addVillage3D(group, seed);
        } else {
          addWaterRuins3D(group, seed);
        }
      } else if (tile.terrain === "dark") {
        addDarkCitadel3D(group, seed);
      }
    }

    function addLandmarkSprite(group, assetName, width, height, y, seed, opacity = 1) {
      const baseMaterial = shared.landmarkMaterials[assetName];
      if (!baseMaterial) return;
      const material = opacity === 1 ? baseMaterial : baseMaterial.clone();
      if (material !== baseMaterial) {
        material.opacity = opacity;
        dynamicMaterials.push(material);
      }
      const sprite = new THREE.Sprite(material);
      sprite.center.set(.5, 0);
      const sizeVariation = .86 + seededValue(seed, "landmark-size") * .24;
      const mirror = seededValue(seed, "landmark-mirror") > .5 ? 1 : -1;
      sprite.scale.set(width * sizeVariation * mirror, height * sizeVariation, 1);
      sprite.position.set(
        (seededValue(seed, "landmark-x") - .5) * .14,
        Math.max(.005, y),
        (seededValue(seed, "landmark-z") - .5) * .1
      );
      sprite.renderOrder = 3;
      group.add(sprite);
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

    function addHouse3D(group, x, z, scale, rotation) {
      const house = new THREE.Group();
      house.position.set(x, 0, z);
      house.rotation.y = rotation;
      house.scale.setScalar(scale);
      addModelMesh(house, shared.geometries.house, shared.materials.stone, [0, .16, 0]);
      addModelMesh(house, shared.geometries.squareRoof, shared.materials.roof, [0, .41, 0], [.72, .72, .72], Math.PI / 4);
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
      crown.position.y = .38;
      crown.castShadow = true;
      tree.add(trunk, crown);
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

    function addMountain(group, seed, index, scale = 1) {
      const mountain = new THREE.Mesh(shared.geometries.mountain, shared.materials.mountain);
      mountain.scale.set(.9 * scale, 1.05 * scale, .9 * scale);
      mountain.position.set(-.08, .47 * scale, .02);
      mountain.rotation.y = seededValue(seed, index) * Math.PI;
      mountain.castShadow = true;
      group.add(mountain);
      const snow = new THREE.Mesh(shared.geometries.mountain, shared.materials.snow);
      snow.scale.set(.42 * scale, .36 * scale, .42 * scale);
      snow.position.set(-.08, .92 * scale, .02);
      snow.rotation.y = mountain.rotation.y;
      group.add(snow);
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
          mesh.material.emissive.setHex(0x6b4b18);
          mesh.material.emissiveIntensity = .48;
        } else if (mesh.userData.ownerColor) {
          mesh.material.emissive.copy(mesh.userData.ownerColor);
          mesh.material.emissiveIntensity = .075;
        } else {
          mesh.material.emissive.setHex(0x000000);
          mesh.material.emissiveIntensity = 0;
        }
        if (mesh.userData.boundaryLine) {
          mesh.userData.boundaryLine.opacity = selected ? 1 : .86;
        }
        if (mesh.userData.boundaryAura) {
          mesh.userData.boundaryAura.uniforms.strength.value = selected ? .34 : .24;
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
        } else if (entry.type === "banner") {
          entry.object.rotation.z = Math.sin(seconds * 2.1 + entry.phase) * .07;
        } else if (entry.type === "territoryAura") {
          entry.material.uniforms.time.value = seconds;
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
