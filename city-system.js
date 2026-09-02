(function bootstrapBingoCitySystem(global) {
  "use strict";

  const VERSION = 1;
  const MAP_SCHEMA = 4;
  const TERRAIN_REVISION = 2;
  const GRID_SIZE = 160;
  const CITY_CENTER = Math.floor(GRID_SIZE / 2);
  const TICK_MINUTES = 10;
  const TICK_MS = TICK_MINUTES * 60 * 1000;
  const AUTO_BUILD_THRESHOLD = 10000;
  const MAX_HISTORY = 240;
  const MAX_PROCESSED = 1000;

  const PLAYERS = Object.freeze([
    { id: "tofu", name: "おいしいとうふ", color: "#e8e5dc", accent: "#90c36a", cityName: "とうふ未来市", terrainPreset: "coast" },
    { id: "eda", name: "えだ", color: "#e54152", accent: "#3e8eff", cityName: "三刃中央市", terrainPreset: "river-valley" },
    { id: "jan", name: "ジャン", color: "#ffd32a", accent: "#fff19a", cityName: "運命改都", terrainPreset: "highland" },
    { id: "rima", name: "リーマ", color: "#ff7139", accent: "#b3ef52", cityName: "深夜補給市", terrainPreset: "dry-basin" },
    { id: "kento", name: "Kento", color: "#9f61ff", accent: "#e3c9ff", cityName: "紫電配信都市", terrainPreset: "lake-district" },
    { id: "lickey", name: "Lickey", color: "#35baff", accent: "#f5c84c", cityName: "Lickey王都", terrainPreset: "peninsula" }
  ]);
  const PLAYER_BY_ID = Object.freeze(Object.fromEntries(PLAYERS.map((player) => [player.id, player])));
  const AUTO_CITY_PERSONALITIES = Object.freeze({
    tofu: [["residential", "park", "commercial", "park"], ["residential", "civic", "park", "commercial"], ["park", "residential", "water", "commercial"]],
    eda: [["industrial", "commercial", "civic", "residential"], ["commercial", "industrial", "arena", "park"], ["civic", "residential", "industrial", "commercial"]],
    jan: [["commercial", "arena", "residential", "park"], ["residential", "commercial", "civic", "arena"], ["arena", "park", "commercial", "residential"]],
    rima: [["industrial", "commercial", "residential", "power"], ["commercial", "residential", "park", "industrial"], ["residential", "industrial", "civic", "commercial"]],
    kento: [["commercial", "civic", "park", "residential"], ["arena", "commercial", "residential", "power"], ["park", "commercial", "civic", "residential"]],
    lickey: [["civic", "commercial", "residential", "arena"], ["residential", "park", "commercial", "civic"], ["arena", "civic", "commercial", "residential"]]
  });

  const TERRAIN = Object.freeze({
    grass: { id: "grass", name: "草地", buildable: true },
    meadow: { id: "meadow", name: "草原", buildable: true },
    flower: { id: "flower", name: "花草原", buildable: true },
    forest: { id: "forest", name: "森林", buildable: true },
    scrub: { id: "scrub", name: "灌木地", buildable: true },
    soil: { id: "soil", name: "土", buildable: true },
    sand: { id: "sand", name: "砂浜", buildable: true },
    wetland: { id: "wetland", name: "湿地", buildable: false },
    badlands: { id: "badlands", name: "乾燥台地", buildable: true },
    volcanic: { id: "volcanic", name: "火山岩地", buildable: false },
    cliff: { id: "cliff", name: "断崖", buildable: false, elevated: true },
    mountain: { id: "mountain", name: "山岳", buildable: false, elevated: true },
    snow: { id: "snow", name: "雪稜", buildable: false, elevated: true },
    river: { id: "river", name: "川", buildable: false, water: true },
    lake: { id: "lake", name: "湖", buildable: false, water: true },
    lagoon: { id: "lagoon", name: "潟湖", buildable: false, water: true },
    sea: { id: "sea", name: "海", buildable: false, water: true }
  });

  const BASE_MODELS = Object.freeze({
    residential: { category: "residential", baseCost: 520, upkeep: 3, stats: { populationCapacity: 180, powerDemand: 4, waterDemand: 4, happiness: 1, tax: 28 } },
    commercial: { category: "commercial", baseCost: 760, upkeep: 5, stats: { jobs: 82, powerDemand: 7, waterDemand: 3, happiness: 1, tourism: 3, tax: 62 } },
    industrial: { category: "industrial", baseCost: 900, upkeep: 6, stats: { jobs: 112, powerDemand: 9, waterDemand: 6, pollution: 6, tax: 72 } },
    park: { category: "public", baseCost: 430, upkeep: 4, stats: { happiness: 7, environment: 10, tourism: 2 } },
    power: { category: "infrastructure", baseCost: 1480, upkeep: 10, stats: { powerSupply: 105, pollution: 4, jobs: 16 } },
    water: { category: "infrastructure", baseCost: 1300, upkeep: 9, stats: { waterSupply: 105, environment: 2, jobs: 13 } },
    civic: { category: "landmark", baseCost: 1400, upkeep: 8, stats: { jobs: 38, happiness: 5, safety: 8, tourism: 7 } },
    arena: { category: "landmark", baseCost: 2400, upkeep: 14, stats: { jobs: 58, happiness: 7, tourism: 16, tax: 30 } }
  });

  const BASE_CATALOG = Object.freeze({
    residential: ["集合住宅", "低層レジデンス", "中庭アパート", "ウォーターフロント住宅", "丘陵テラス", "都市型マンション", "ファミリー団地", "学生レジデンス", "スマートハウス街", "高層レジデンス", "庭園住宅区", "リバーサイド住宅", "エコタウン", "スカイコンドミニアム", "王都迎賓住宅"],
    commercial: ["商業タワー", "駅前モール", "オフィスセンター", "市場通り", "シネマコンプレックス", "ホテルスクエア", "フードホール", "デジタル商店街", "金融センター", "百貨店", "観光マーケット", "メディアタワー", "国際会議場", "ラグジュアリーモール", "天空展望ホテル"],
    industrial: ["先端工業区", "物流センター", "食品工場", "精密機械工場", "リサイクルプラント", "データセンター", "バイオ研究工場", "ロボット工場", "造船ドック", "資材精製所", "自動車工場", "航空開発区", "宇宙技術工場", "巨大物流港", "未来生産都市"],
    park: ["中央公園", "街角広場", "花の庭園", "スポーツパーク", "森林公園", "親水公園", "動物ふれあい園", "植物園", "文化公園", "丘の展望台", "自然保護区", "湖畔公園", "都市農園", "巨大遊園地", "王立大庭園"],
    power: ["都市発電所", "太陽光発電区", "風力発電区", "水力発電所", "地熱発電所", "蓄電センター", "バイオマス発電所", "潮力発電所", "核融合エネルギー塔", "量子電力ハブ"],
    water: ["浄水センター", "給水塔", "雨水再生施設", "地下水管理所", "淡水化プラント", "水質研究所", "広域貯水池", "超純水センター", "運河制御局", "水環境ドーム"],
    civic: ["市庁舎", "消防本部", "総合病院", "市立大学", "中央図書館", "警察本部", "科学博物館", "美術館", "中央駅", "国際空港"],
    arena: ["ビンゴアリーナ", "市民スタジアム", "eスポーツドーム", "ライブアリーナ", "モンスター競技場", "世界大会記念館", "六王ホール", "勝利の大劇場", "天空闘技場", "チャンピオンシップドーム"]
  });

  const CATALOG_WORDS = Object.freeze({
    residential: {
      prefixes: ["朝凪", "星見", "白樺", "蒼波", "陽だまり", "月影", "銀嶺", "風花", "珊瑚", "虹空"],
      cores: ["ガーデンハウス", "コートレジデンス", "タワーヴィラ", "中庭長屋", "水上住宅区", "空中テラス", "森のコモンズ", "アトリエ街区", "ドームハビタット", "未来集合邸", "段丘住居群", "運河ロフト", "光庭ホームズ", "共生ハビタット", "丘上メゾネット"]
    },
    commercial: {
      prefixes: ["暁光", "流星", "翠風", "白金", "蒼海", "花灯", "雷鳴", "雪月", "琥珀", "極彩"],
      cores: ["マーケット", "バザール", "ギャラリア", "ビジネスハブ", "メディア街区", "グルメ横丁", "空中モール", "クリエイター街", "ネオンプラザ", "交易センター", "クラフトアーケード", "シアター街", "展望スクエア", "夜市回廊", "デザイン港"]
    },
    industrial: {
      prefixes: ["黒鉄", "蒼炉", "紅蓮", "白磁", "雷光", "深海", "天空", "極地", "翠環", "星核"],
      cores: ["ギガファクトリー", "精密工房群", "物流スパイン", "ロボット造船所", "循環精製区", "バイオラボ", "航空組立港", "量子製造所", "地下生産区", "宇宙開発ヤード", "ナノ素材炉", "自律搬送基地", "巨大鋳造棟", "メカニカル港", "高密度加工区"]
    },
    park: {
      prefixes: ["木漏れ日", "星降る", "風渡る", "花霞", "水鏡", "鳥歌", "月灯り", "虹架け", "雲上", "四季彩"],
      cores: ["ボタニカルガーデン", "冒険広場", "水辺回廊", "彫刻の森", "空中庭園", "生態観察園", "音楽公園", "スポーツ緑地", "光の丘", "都市サファリ", "迷路庭園", "野外劇場", "温室パーク", "妖精の森", "風車草原"]
    },
    power: {
      prefixes: ["雷神", "日輪", "月潮", "火山", "蒼天", "風王", "深層", "星間", "翠環", "白光"],
      cores: ["エネルギースパイア", "発電リング", "蓄電要塞", "タービン群", "プラズマ炉", "太陽帆区", "潮力心臓部", "地熱コア", "量子変電所", "ゼロ排出ハブ"]
    },
    water: {
      prefixes: ["青環", "水晶", "白波", "深蒼", "虹泉", "雪解", "翠流", "月雫", "海鳴", "天水"],
      cores: ["アクアリザーバー", "浄化回廊", "給水スパイア", "雨庭センター", "淡水化ドーム", "水質ラボ", "地下水庫", "運河ゲート", "循環ポンプ群", "雲水採取塔"]
    },
    civic: {
      prefixes: ["六王", "白亜", "蒼穹", "朝陽", "月桂", "星冠", "風雅", "大樹", "未来", "王都"],
      cores: ["行政宮殿", "市民フォーラム", "文化殿堂", "総合医療城", "学術院", "中央アーカイブ", "防災司令塔", "交通ターミナル", "科学芸術館", "国際交流門"]
    },
    arena: {
      prefixes: ["轟炎", "蒼雷", "黄金", "白銀", "星天", "深紅", "極光", "六王", "夢幻", "覇者"],
      cores: ["グランドアリーナ", "バトルコロシアム", "ライブドーム", "スカイスタジアム", "モンスターリング", "チャンピオンホール", "フェスティバルパーク", "勝利劇場", "ワールドサーキット", "伝説闘技殿"]
    }
  });

  function expandCatalog(model, names, target = names.length * 10) {
    const output = [...names];
    const known = new Set(output);
    const words = CATALOG_WORDS[model];
    words.prefixes.forEach((prefix) => words.cores.forEach((core) => {
      const name = `${prefix}${core}`;
      if (output.length < target && !known.has(name)) {
        known.add(name);
        output.push(name);
      }
    }));
    return Object.freeze(output.slice(0, target));
  }

  const CATALOG = Object.freeze(Object.fromEntries(
    Object.entries(BASE_CATALOG).map(([model, names]) => [model, expandCatalog(model, names)])
  ));

  function makeDefinition(model, name, index) {
    const base = BASE_MODELS[model];
    const visualForm = index % 10;
    const visualTheme = Math.floor(index / 10) % 10;
    const visualEdition = Math.floor(index / 100);
    const tier = Math.min(6, Math.floor(index / 18));
    const multiplier = 1 + Math.min(index, 24) * .12 + visualTheme * .08;
    const definition = {
      id: `${model}-${String(index + 1).padStart(2, "0")}`,
      name,
      model,
      variant: index,
      visualForm,
      visualTheme,
      visualEdition,
      visualSignature: `${model}:${visualForm}:${visualTheme}:${visualEdition}`,
      category: base.category,
      cost: Math.round(base.baseCost * multiplier / 10) * 10,
      upkeep: Math.max(1, Math.round(base.upkeep * (1 + index * .09))),
      description: `${name}。${visualTheme >= 7 ? "都市の象徴となる独創的な" : visualTheme >= 3 ? "街の個性を広げる発展型の" : index >= 5 ? "発展した街区向けの" : "地域に根ざした"}${base.category === "residential" ? "居住施設です。" : base.category === "commercial" ? "商業・雇用施設です。" : base.category === "industrial" ? "生産・物流施設です。" : base.category === "public" ? "公共空間です。" : base.category === "infrastructure" ? "都市基盤施設です。" : "都市の中核施設です。"}`
    };
    Object.entries(base.stats).forEach(([field, value]) => {
      definition[field] = Math.max(1, Math.round(value * (1 + tier * .22)));
    });
    if ((model === "civic" || model === "arena") && index >= 5) definition.unique = true;
    return definition;
  }

  const BUILDINGS = (() => {
    const entries = {
      road: { id: "road", name: "都市道路", model: "road", category: "transport", cost: 120, upkeep: 1, road: true, description: "街を接続する標準道路。" },
      avenue: { id: "avenue", name: "並木大通り", model: "road", category: "transport", cost: 260, upkeep: 2, road: true, happiness: 1, description: "街路樹と歩道を備えた大通り。" },
      boulevard: { id: "boulevard", name: "都市環状道路", model: "road", category: "transport", cost: 420, upkeep: 2, road: true, description: "交通量の多い地区を結ぶ幹線道路。" },
      bridge: { id: "bridge", name: "河川ブリッジ", model: "road", category: "transport", cost: 680, upkeep: 3, road: true, bridge: true, description: "川や湖を越えて街を接続する橋。" },
      civic: { id: "civic", name: "市庁舎", model: "civic", variant: 0, visualForm: 0, visualTheme: 0, visualEdition: 0, visualSignature: "civic:0:0:0", category: "landmark", cost: 0, upkeep: 8, jobs: 40, happiness: 5, safety: 8, tourism: 8, unique: true, description: "都市運営の中心。" }
    };
    Object.entries(CATALOG).forEach(([model, names]) => names.forEach((name, index) => {
      const definition = makeDefinition(model, name, index);
      const legacyId = { 市庁舎: "civic", 集合住宅: "residential", 商業タワー: "commercial", 先端工業区: "industrial", 中央公園: "park", 都市発電所: "power", 浄水センター: "water", ビンゴアリーナ: "arena" }[definition.name];
      if (legacyId === "civic") return;
      if (legacyId) definition.id = legacyId;
      entries[definition.id] = definition;
    }));
    return Object.freeze(entries);
  })();
  const BUILDING_IDS = Object.freeze(Object.keys(BUILDINGS));
  const BUILDINGS_BY_MODEL = Object.freeze(Object.fromEntries(Object.keys(BASE_MODELS).map((model) => [
    model,
    Object.freeze(Object.values(BUILDINGS).filter((definition) => definition.model === model))
  ])));
  const AUTO_BUILDINGS = Object.freeze(Object.values(BUILDINGS).filter((definition) => !isRoadDefinition(definition) && !definition.unique));

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function playerKey(name) {
    return String(name || "").trim().toLocaleLowerCase("ja-JP").replace(/\s+/g, "");
  }

  function playerForName(name) {
    const key = playerKey(name);
    return PLAYERS.find((player) => playerKey(player.name) === key) || null;
  }

  function tileId(x, z) {
    return `${Math.trunc(Number(x) || 0)},${Math.trunc(Number(z) || 0)}`;
  }

  function parseTileId(id) {
    const [x, z] = String(id || "").split(",").map(Number);
    return { x: Number.isFinite(x) ? x : -1, z: Number.isFinite(z) ? z : -1 };
  }

  function insideGrid(x, z) {
    return x >= 0 && z >= 0 && x < GRID_SIZE && z < GRID_SIZE;
  }

  function neighbors(id) {
    const { x, z } = parseTileId(id);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => tileId(x + dx, z + dz)).filter((next) => {
      const point = parseTileId(next);
      return insideGrid(point.x, point.z);
    });
  }

  function hash2(seed, x, z) {
    let hash = 2166136261;
    for (const char of `${seed}:${x}:${z}`) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function smoothstep(value) {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  }

  function valueNoise(seed, x, z, scale) {
    const sx = x / scale;
    const sz = z / scale;
    const x0 = Math.floor(sx);
    const z0 = Math.floor(sz);
    const tx = smoothstep(sx - x0);
    const tz = smoothstep(sz - z0);
    const a = hash2(seed, x0, z0);
    const b = hash2(seed, x0 + 1, z0);
    const c = hash2(seed, x0, z0 + 1);
    const d = hash2(seed, x0 + 1, z0 + 1);
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
  }

  function terrainAt(playerId, x, z) {
    const player = PLAYER_BY_ID[playerId] || PLAYERS[0];
    const px = Math.trunc(Number(x));
    const pz = Math.trunc(Number(z));
    if (!insideGrid(px, pz)) return { type: "sea", height: -1.2, buildable: false };
    const dx = px - CITY_CENTER;
    const dz = pz - CITY_CENTER;
    const distance = Math.hypot(dx, dz);
    if (distance < 15) {
      const type = hash2(`${player.id}-center`, px, pz) > .82 ? "soil" : "grass";
      return { type, height: .02, buildable: true };
    }
    const broad = valueNoise(`${player.id}-broad`, px, pz, 29);
    const detail = valueNoise(`${player.id}-detail`, px, pz, 9);
    const biome = valueNoise(`${player.id}-biome`, px - 37, pz + 61, 17);
    const ridge = valueNoise(`${player.id}-ridge`, px + 41, pz - 23, 18);
    let type = detail < .16 ? "soil" : detail > .82 ? "forest" : biome > .78 ? "flower" : biome > .58 ? "meadow" : biome < .2 ? "scrub" : "grass";
    let height = Math.max(0, (broad - .35) * .28);
    const edge = Math.min(px, pz, GRID_SIZE - 1 - px, GRID_SIZE - 1 - pz);
    const nx = px / (GRID_SIZE - 1);
    const nz = pz / (GRID_SIZE - 1);
    if (player.terrainPreset === "coast") {
      const shoreline = 126 + Math.sin(pz * .075) * 10 + (broad - .5) * 18;
      const lakeDistance = Math.hypot(px - 105, pz - 43);
      if (px > shoreline + 5) type = "sea";
      else if (px > shoreline) type = "lagoon";
      else if (px > shoreline - 5) type = "sand";
      else if (ridge > .88 && px < 52) type = "snow";
      else if (ridge > .79 && px < 56) type = "mountain";
      else if (ridge > .71 && px < 61) type = "cliff";
      else if (lakeDistance < 9 + broad * 3) type = "lake";
      else if (lakeDistance < 14 + broad * 3) type = "wetland";
      else if (biome > .7 && px < 75) type = "forest";
    } else if (player.terrainPreset === "river-valley") {
      const river = 46 + px * .43 + Math.sin(px * .09) * 8;
      const riverDistance = Math.abs(pz - river);
      if (riverDistance < 2.4 + broad * 1.7) type = "river";
      else if (riverDistance < 5.2 + broad * 2) type = "wetland";
      else if ((ridge > .86 && (px < 42 || pz > 122))) type = "snow";
      else if ((ridge > .75 && (px < 45 || pz > 119)) || edge < 3) type = "mountain";
      else if (ridge > .66 && (px < 48 || pz > 116)) type = "cliff";
      else if (biome > .7) type = "forest";
      else if (biome > .5) type = "meadow";
    } else if (player.terrainPreset === "highland") {
      if (edge < 8 && broad < .55) type = "sea";
      else if (edge < 12 && broad < .6) type = "sand";
      else if (ridge > .85 || (nx < .2 && nz < .3)) type = "snow";
      else if (ridge > .7 || (nx < .3 && nz < .42)) type = "mountain";
      else if (ridge > .6 || (nx < .35 && nz < .46)) type = "cliff";
      else if (Math.hypot(px - 112, pz - 112) < 10 + detail * 3) type = "lake";
      else if (ridge > .52) type = "meadow";
      else if (biome > .78) type = "flower";
    } else if (player.terrainPreset === "dry-basin") {
      type = detail < .22 ? "volcanic" : detail < .58 ? "badlands" : biome < .48 ? "scrub" : "grass";
      const river = 112 - px * .27 + Math.sin(px * .08) * 5;
      const riverDistance = Math.abs(pz - river);
      if (riverDistance < 2) type = "river";
      else if (riverDistance < 4.8) type = "wetland";
      else if (ridge > .88 && distance > 43) type = "volcanic";
      else if (edge < 6 || (ridge > .76 && distance > 43)) type = "mountain";
      else if (ridge > .67 && distance > 38) type = "cliff";
    } else if (player.terrainPreset === "lake-district") {
      const lakeDistanceA = Math.hypot(px - 43, pz - 52) - (13 + broad * 4);
      const lakeDistanceB = Math.hypot(px - 119, pz - 103) - (16 + detail * 3);
      const waterway = Math.abs(pz - (80 + Math.sin(px * .07) * 17)) < 1.8;
      if (lakeDistanceA < 0 || lakeDistanceB < 0) type = "lake";
      else if (lakeDistanceA < 5 || lakeDistanceB < 5) type = "wetland";
      else if (waterway && px > 49 && px < 112) type = "river";
      else if (ridge > .87 && pz < 38) type = "snow";
      else if (ridge > .76 && pz < 42) type = "mountain";
      else if (ridge > .67 && pz < 46) type = "cliff";
      else if (biome > .72) type = "forest";
      else if (biome > .55) type = "flower";
    } else if (player.terrainPreset === "peninsula") {
      const westCoast = 18 + Math.sin(pz * .08) * 8;
      const southCoast = 139 + Math.sin(px * .065) * 8;
      const coastDistance = Math.min(px - westCoast, southCoast - pz);
      if (coastDistance < -4 || (edge < 4 && broad < .58)) type = "sea";
      else if (coastDistance < 0) type = "lagoon";
      else if (coastDistance < 5) type = "sand";
      else if (ridge > .87 && px > 108) type = "snow";
      else if (ridge > .77 && px > 105) type = "mountain";
      else if (ridge > .68 && px > 102) type = "cliff";
      else if (Math.hypot(px - 48, pz - 112) < 11 + detail * 3) type = "lake";
      else if (biome > .73) type = "forest";
      else if (biome > .56) type = "meadow";
    }
    if (type === "cliff") height = .34 + ridge * 1.25;
    if (type === "mountain") height = .5 + ridge * 1.8;
    if (type === "snow") height = .66 + ridge * 2.05;
    if (type === "volcanic") height = .18 + ridge * .75;
    if (type === "badlands") height = .08 + broad * .3;
    if (type === "sand") height = .01;
    if (type === "wetland") height = -.04;
    if (type === "river") height = -.3;
    if (type === "lake") height = -.5;
    if (type === "lagoon") height = -.38;
    if (type === "sea") height = -1;
    return { type, height, buildable: TERRAIN[type].buildable, water: Boolean(TERRAIN[type].water), elevated: Boolean(TERRAIN[type].elevated) };
  }

  function initialTiles() {
    const tiles = {};
    for (let n = CITY_CENTER - 5; n <= CITY_CENTER + 5; n += 1) {
      tiles[tileId(CITY_CENTER, n)] = { id: tileId(CITY_CENTER, n), kind: "road", buildingId: "road", level: 1 };
      tiles[tileId(n, CITY_CENTER)] = { id: tileId(n, CITY_CENTER), kind: "road", buildingId: "road", level: 1 };
    }
    [[-1, -1, "civic"], [-1, 1, "residential"], [1, -1, "commercial"], [1, 1, "park"], [-2, -1, "residential"], [2, 1, "industrial"], [-2, 1, "power"], [2, -1, "water"]].forEach(([dx, dz, buildingId]) => {
      const id = tileId(CITY_CENTER + dx, CITY_CENTER + dz);
      tiles[id] = { id, kind: "building", buildingId, level: 1 };
    });
    return tiles;
  }

  function emptyMetrics() {
    return { population: 180, capacity: 0, happiness: 70, jobs: 0, safety: 55, education: 45, health: 55, tourism: 0, environment: 70, pollution: 0, powerDemand: 0, powerSupply: 0, waterDemand: 0, waterSupply: 0, employmentRate: 100, powerCoverage: 100, waterCoverage: 100, cityScore: 0 };
  }

  function allUnlocks() {
    return Object.fromEntries(BUILDING_IDS.map((id) => [id, true]));
  }

  function createPlayerCity(player, now) {
    const city = {
      id: player.id, name: player.cityName, ownerName: player.name, color: player.color, accent: player.accent,
      terrainPreset: player.terrainPreset, mapSchema: MAP_SCHEMA, terrainRevision: TERRAIN_REVISION, level: 1,
      resources: { money: AUTO_BUILD_THRESHOLD },
      metrics: emptyMetrics(), economy: { taxRate: 10, lastIncome: 0, lastExpense: 0, balance: 0 },
      autoDevelopment: { enabled: true, threshold: AUTO_BUILD_THRESHOLD, placed: 0, cursor: 0 },
      tiles: initialTiles(), unlocks: allUnlocks(), inbox: {}, history: {}, createdAt: now, updatedAt: now
    };
    city.metrics = calculateMetrics(city);
    return city;
  }

  function createInitialState(now = Date.now()) {
    const timestamp = Number(now) || Date.now();
    return { version: VERSION, mapSchema: MAP_SCHEMA, terrainRevision: TERRAIN_REVISION, revision: 0, players: Object.fromEntries(PLAYERS.map((player) => [player.id, createPlayerCity(player, timestamp)])), processedRewards: {}, processedCommands: {}, lastTickAt: timestamp, nextTickAt: timestamp + TICK_MS, updatedAt: timestamp };
  }

  function normalizeState(value, now = Date.now()) {
    if (!value || Number(value.version) !== VERSION) return createInitialState(now);
    const state = clone(value);
    state.players ||= {};
    PLAYERS.forEach((player) => {
      if (!state.players[player.id]) {
        state.players[player.id] = createPlayerCity(player, now);
        return;
      }
      const city = state.players[player.id];
      if (Number(city.mapSchema) < 2) {
        const shift = CITY_CENTER - 8;
        city.tiles = Object.fromEntries(Object.values(city.tiles || {}).map((tile) => {
          const point = parseTileId(tile.id);
          const id = tileId(point.x + shift, point.z + shift);
          return [id, { ...tile, id }];
        }));
      }
      city.mapSchema = MAP_SCHEMA;
      city.terrainRevision = TERRAIN_REVISION;
      city.terrainPreset = player.terrainPreset;
      city.resources = { money: Math.max(0, Number(city.resources?.money) || 0) };
      city.unlocks = { ...allUnlocks(), ...(city.unlocks || {}) };
      city.autoDevelopment = { enabled: true, threshold: AUTO_BUILD_THRESHOLD, placed: 0, cursor: 0, ...(city.autoDevelopment || {}) };
      city.metrics = calculateMetrics(city);
    });
    state.mapSchema = MAP_SCHEMA;
    state.terrainRevision = TERRAIN_REVISION;
    state.processedCommands ||= {};
    state.processedRewards ||= {};
    return state;
  }

  function buildingScale(tile) {
    return Math.max(1, Math.min(3, Number(tile?.level) || 1));
  }

  function calculateMetrics(city) {
    const previous = city?.metrics || emptyMetrics();
    const totals = { populationCapacity: 0, jobs: 0, happiness: 0, safety: 0, education: 0, health: 0, tourism: 0, environment: 0, pollution: 0, powerDemand: 0, powerSupply: 0, waterDemand: 0, waterSupply: 0, tax: 0, upkeep: 0 };
    Object.values(city?.tiles || {}).forEach((tile) => {
      const definition = BUILDINGS[tile?.buildingId];
      if (!definition) return;
      const scale = buildingScale(tile);
      Object.keys(totals).forEach((field) => { if (definition[field]) totals[field] += Number(definition[field]) * scale; });
    });
    const population = Math.max(0, Math.min(Number(previous.population) || 0, Math.max(180, totals.populationCapacity)));
    const powerCoverage = totals.powerDemand ? Math.min(100, Math.round(totals.powerSupply / totals.powerDemand * 100)) : 100;
    const waterCoverage = totals.waterDemand ? Math.min(100, Math.round(totals.waterSupply / totals.waterDemand * 100)) : 100;
    const employmentRate = population ? Math.min(100, Math.round(totals.jobs / Math.max(1, population * .48) * 100)) : 100;
    const infrastructurePenalty = Math.round((100 - Math.min(powerCoverage, waterCoverage)) * .38);
    const happiness = Math.max(0, Math.min(100, 62 + totals.happiness + Math.round(totals.environment * .35) - Math.round(totals.pollution * .75) - infrastructurePenalty));
    const environment = Math.max(0, Math.min(100, 68 + totals.environment - totals.pollution));
    const cityScore = Math.round(population * .55 + happiness * 14 + totals.jobs * 1.8 + totals.tourism * 20 + environment * 8 + Math.min(powerCoverage, waterCoverage) * 6 + Object.keys(city?.tiles || {}).length * 3);
    return { ...previous, population, capacity: totals.populationCapacity, happiness, jobs: totals.jobs, safety: Math.min(100, 52 + totals.safety), education: Math.min(100, 45 + totals.education), health: Math.min(100, 52 + totals.health), tourism: totals.tourism, environment, pollution: totals.pollution, powerDemand: totals.powerDemand, powerSupply: totals.powerSupply, waterDemand: totals.waterDemand, waterSupply: totals.waterSupply, employmentRate, powerCoverage, waterCoverage, cityScore, taxPotential: totals.tax, upkeep: totals.upkeep };
  }

  function isRoadDefinition(definition) {
    return Boolean(definition?.road || definition?.model === "road");
  }

  function isRoadTile(tile) {
    return isRoadDefinition(BUILDINGS[tile?.buildingId]);
  }

  function adjacentToRoad(city, id) {
    return neighbors(id).some((nextId) => isRoadTile(city.tiles?.[nextId]));
  }

  function connectedRoad(city, id) {
    const roads = Object.values(city.tiles || {}).filter(isRoadTile);
    return !roads.length || neighbors(id).some((nextId) => isRoadTile(city.tiles?.[nextId]));
  }

  function canBuild(city, id, buildingId, options = {}) {
    const definition = BUILDINGS[buildingId];
    const point = parseTileId(id);
    if (!definition || !insideGrid(point.x, point.z)) return { ok: false, reason: "建設できない場所です。" };
    if (city.tiles?.[id]) return { ok: false, reason: "すでに道路か建物があります。" };
    if (!city.unlocks?.[buildingId]) return { ok: false, reason: "まだ解放されていない施設です。" };
    const terrain = terrainAt(city.id, point.x, point.z);
    if (definition.bridge) {
      if (terrain.type !== "river" && terrain.type !== "lake") return { ok: false, reason: "橋は川か湖に建設してください。" };
    } else if (!terrain.buildable) return { ok: false, reason: `${TERRAIN[terrain.type].name}にはこの施設を建設できません。` };
    if (definition.unique && Object.values(city.tiles || {}).some((tile) => tile.buildingId === buildingId)) return { ok: false, reason: "この施設は都市に一つだけ建設できます。" };
    if (isRoadDefinition(definition) ? !connectedRoad(city, id) : !adjacentToRoad(city, id)) return { ok: false, reason: isRoadDefinition(definition) ? "既存の道路へ接続してください。" : "道路に接する場所を選んでください。" };
    const reserve = Math.max(0, Number(options.reserveMoney) || 0);
    if ((Number(city.resources?.money) || 0) - definition.cost < reserve) return { ok: false, reason: "資金が足りません。" };
    return { ok: true, definition, terrain };
  }

  function trimMap(source, keep) {
    return Object.fromEntries(Object.entries(source || {}).sort(([, a], [, b]) => (Number(b?.createdAt || b) || 0) - (Number(a?.createdAt || a) || 0)).slice(0, keep));
  }

  function addHistory(city, type, title, detail, now, extra = {}) {
    const id = `${Number(now)}-${type}-${Object.keys(city.history || {}).length}`;
    city.history ||= {};
    city.history[id] = { id, type, title, detail, createdAt: Number(now), ...extra };
    city.history = trimMap(city.history, MAX_HISTORY);
  }

  function placeBuilding(city, id, definition) {
    city.resources.money -= definition.cost;
    city.tiles[id] = { id, kind: isRoadDefinition(definition) ? "road" : "building", buildingId: definition.id, level: 1 };
  }

  function applyCommand(value, command = {}, now = Date.now()) {
    const state = normalizeState(value, now);
    const commandId = String(command.id || "");
    if (!commandId) return { state, applied: false, error: "操作IDがありません。" };
    if (state.processedCommands[commandId]) return { state, applied: false, duplicate: true };
    const city = state.players?.[command.playerId];
    if (!city) return { state, applied: false, error: "都市が見つかりません。" };
    const id = String(command.tileId || "");
    if (command.type === "build") {
      const result = canBuild(city, id, String(command.buildingId || ""));
      if (!result.ok) return { state, applied: false, error: result.reason };
      placeBuilding(city, id, result.definition);
      addHistory(city, "build", `${result.definition.name} 建設`, `${id} に新しい施設が完成しました。`, now, { tileId: id, buildingId: result.definition.id });
    } else if (command.type === "upgrade") {
      const tile = city.tiles?.[id];
      const definition = BUILDINGS[tile?.buildingId];
      if (!tile || !definition || isRoadDefinition(definition)) return { state, applied: false, error: "強化できる建物を選んでください。" };
      if ((Number(tile.level) || 1) >= 3) return { state, applied: false, error: "この建物は最大レベルです。" };
      const nextLevel = (Number(tile.level) || 1) + 1;
      const money = Math.round(definition.cost * (.75 + nextLevel * .25));
      if (city.resources.money < money) return { state, applied: false, error: "強化に必要な資金が足りません。" };
      city.resources.money -= money;
      tile.level = nextLevel;
      addHistory(city, "upgrade", `${definition.name} LEVEL ${nextLevel}`, "建物の性能と外観が向上しました。", now, { tileId: id, buildingId: definition.id });
    } else if (command.type === "demolish") {
      const tile = city.tiles?.[id];
      const definition = BUILDINGS[tile?.buildingId];
      if (!tile || !definition || definition.id === "civic") return { state, applied: false, error: "撤去できない場所です。" };
      city.resources.money += Math.round(definition.cost * .2);
      delete city.tiles[id];
      addHistory(city, "demolish", `${definition.name} 撤去`, "跡地を更地へ戻しました。", now, { tileId: id });
    } else return { state, applied: false, error: "未対応の都市操作です。" };
    city.metrics = calculateMetrics(city);
    city.updatedAt = Number(now);
    state.processedCommands[commandId] = Number(now);
    state.processedCommands = trimMap(state.processedCommands, MAX_PROCESSED);
    state.revision = (Number(state.revision) || 0) + 1;
    state.updatedAt = Number(now);
    return { state, applied: true };
  }

  function autoCandidateIds(city) {
    const ids = new Set();
    Object.values(city.tiles || {}).filter(isRoadTile).forEach((road) => neighbors(road.id).forEach((id) => { if (!city.tiles[id]) ids.add(id); }));
    return [...ids].sort((a, b) => {
      const pa = parseTileId(a);
      const pb = parseTileId(b);
      return Math.hypot(pa.x - CITY_CENTER, pa.z - CITY_CENTER) - Math.hypot(pb.x - CITY_CENTER, pb.z - CITY_CENTER) || a.localeCompare(b);
    });
  }

  function autoDistrictModels(city, now) {
    const cursor = Math.max(0, Number(city.autoDevelopment?.cursor) || 0);
    const profiles = AUTO_CITY_PERSONALITIES[city.id] || AUTO_CITY_PERSONALITIES.tofu;
    const cycle = Math.floor(cursor / 7 + Math.floor(Number(now) / (TICK_MS * 6))) % profiles.length;
    const profile = profiles[cycle];
    const offset = cursor % profile.length;
    return [...profile.slice(offset), ...profile.slice(0, offset)];
  }

  function chooseAutoBuilding(city, now, reserveMoney) {
    const metrics = calculateMetrics(city);
    const surplus = Math.max(0, Number(city.resources?.money) - Number(reserveMoney));
    const needs = [];
    if (metrics.powerCoverage < 95) needs.push("power");
    if (metrics.waterCoverage < 95) needs.push("water");
    if (metrics.capacity - metrics.population < 260) needs.push("residential");
    if (metrics.jobs < metrics.population * .58) needs.push(Number(city.autoDevelopment.cursor) % 3 === 0 ? "industrial" : "commercial");
    if (metrics.happiness < 82) needs.push("park");
    const models = [...new Set([...needs, ...autoDistrictModels(city, now), "residential", "commercial", "industrial", "park", "civic", "arena", "power", "water"] )];
    const cursor = Math.max(0, Number(city.autoDevelopment?.cursor) || 0);
    for (const model of models) {
      const choices = (BUILDINGS_BY_MODEL[model] || []).filter((definition) => !definition.unique && definition.cost <= surplus);
      if (choices.length) return choices[(cursor + Math.floor(Number(now) / TICK_MS)) % choices.length];
    }
    return null;
  }

  function autoPlotScore(city, id, definition, now) {
    const point = parseTileId(id);
    const dx = point.x - CITY_CENTER;
    const dz = point.z - CITY_CENTER;
    const distance = Math.hypot(dx, dz);
    const cursor = Math.max(0, Number(city.autoDevelopment?.cursor) || 0);
    const style = (hash2(`${city.id}:layout`, Math.floor(cursor / 9), Math.floor(Number(now) / (TICK_MS * 12))) * 4) | 0;
    const sameNeighbors = neighbors(id).filter((neighborId) => BUILDINGS[city.tiles?.[neighborId]?.buildingId]?.model === definition.model).length;
    const waterEdges = neighbors(id).filter((neighborId) => {
      const neighbor = parseTileId(neighborId);
      return terrainAt(city.id, neighbor.x, neighbor.z).water;
    }).length;
    let shape = -distance;
    if (style === 1) shape = -Math.abs(dx) * 1.8 - Math.abs(dz) * .35;
    else if (style === 2) shape = -Math.abs(distance - (9 + Math.floor(cursor / 12) * 2)) * 2;
    else if (style === 3) shape = sameNeighbors * 15 - distance * .45;
    const waterfront = ["commercial", "park", "civic", "arena"].includes(definition.model) ? waterEdges * 9 : 0;
    return shape + sameNeighbors * 7 + waterfront + hash2(`${city.id}:${definition.id}:${cursor}`, point.x, point.z) * 8;
  }

  function findAutoBuildingPlot(city, definition, reserveMoney, now) {
    return autoCandidateIds(city)
      .filter((id) => canBuild(city, id, definition.id, { reserveMoney }).ok)
      .sort((a, b) => autoPlotScore(city, b, definition, now) - autoPlotScore(city, a, definition, now) || a.localeCompare(b))[0] || "";
  }

  function findAutoRoadPlot(city, definition, reserveMoney, now) {
    return autoCandidateIds(city)
      .filter((id) => canBuild(city, id, definition.id, { reserveMoney }).ok)
      .sort((a, b) => {
        const pa = parseTileId(a);
        const pb = parseTileId(b);
        const roadLinksA = neighbors(a).filter((id) => isRoadTile(city.tiles?.[id])).length;
        const roadLinksB = neighbors(b).filter((id) => isRoadTile(city.tiles?.[id])).length;
        const distanceA = Math.hypot(pa.x - CITY_CENTER, pa.z - CITY_CENTER);
        const distanceB = Math.hypot(pb.x - CITY_CENTER, pb.z - CITY_CENTER);
        return roadLinksA - roadLinksB || distanceB - distanceA || hash2(`${city.id}:road:${now}`, pb.x, pb.z) - hash2(`${city.id}:road:${now}`, pa.x, pa.z);
      })[0] || "";
  }

  function autoDevelopCity(city, now, limit = 8) {
    city.autoDevelopment ||= { enabled: true, threshold: AUTO_BUILD_THRESHOLD, placed: 0, cursor: 0 };
    if (city.autoDevelopment.enabled === false) return 0;
    const threshold = Math.max(AUTO_BUILD_THRESHOLD, Number(city.autoDevelopment.threshold) || AUTO_BUILD_THRESHOLD);
    let placed = 0;
    while (city.resources.money > threshold && placed < limit) {
      let selected = chooseAutoBuilding(city, now, threshold);
      if (!selected) break;
      let id = findAutoBuildingPlot(city, selected, threshold, now);
      if (!id) {
        const surplus = Math.max(0, Number(city.resources.money) - threshold);
        const alternatives = AUTO_BUILDINGS
          .filter((definition) => definition.cost <= surplus)
          .sort((a, b) => autoPlotScore(city, autoCandidateIds(city)[0] || tileId(CITY_CENTER, CITY_CENTER), b, now) - autoPlotScore(city, autoCandidateIds(city)[0] || tileId(CITY_CENTER, CITY_CENTER), a, now));
        for (const alternative of alternatives) {
          id = findAutoBuildingPlot(city, alternative, threshold, now);
          if (id) { selected = alternative; break; }
        }
      }
      if (!id) {
        const roadChoices = [BUILDINGS.avenue, BUILDINGS.road, BUILDINGS.boulevard].filter((definition) => definition.cost <= city.resources.money - threshold);
        selected = roadChoices[(Number(city.autoDevelopment.cursor) || 0) % Math.max(1, roadChoices.length)] || BUILDINGS.road;
        id = findAutoRoadPlot(city, selected, threshold, now);
      }
      if (!id) break;
      placeBuilding(city, id, selected);
      city.autoDevelopment.cursor = (Number(city.autoDevelopment.cursor) || 0) + 1;
      city.autoDevelopment.placed = (Number(city.autoDevelopment.placed) || 0) + 1;
      placed += 1;
    }
    if (placed) addHistory(city, "auto-build", "自動都市開発", `${placed}区画を自動配置しました。`, now, { count: placed });
    city.metrics = calculateMetrics(city);
    return placed;
  }

  function cityLevel(population) {
    if (population >= 100000) return 6;
    if (population >= 30000) return 5;
    if (population >= 10000) return 4;
    if (population >= 2500) return 3;
    if (population >= 500) return 2;
    return 1;
  }

  function advanceCity(city, now) {
    const metrics = calculateMetrics(city);
    const infrastructure = Math.min(metrics.powerCoverage, metrics.waterCoverage) / 100;
    const jobsLimit = Math.max(180, Math.round(metrics.jobs / .44));
    const target = Math.min(metrics.capacity || 180, jobsLimit);
    const growthFactor = Math.max(0, (metrics.happiness - 42) / 58) * infrastructure;
    const gap = target - metrics.population;
    const growth = gap > 0 ? Math.max(0, Math.min(Math.ceil(gap * .035 * growthFactor), 24)) : Math.max(-12, Math.ceil(gap * .02));
    metrics.population = Math.max(0, metrics.population + growth);
    const income = Math.max(0, Math.round(metrics.population * .018 * (city.economy.taxRate / 10) + metrics.taxPotential));
    const expense = Math.max(0, Math.round(metrics.upkeep));
    city.resources.money = Math.max(0, Math.round((Number(city.resources.money) || 0) + income - expense));
    city.economy = { ...city.economy, lastIncome: income, lastExpense: expense, balance: income - expense };
    city.metrics = calculateMetrics({ ...city, metrics });
    city.level = cityLevel(city.metrics.population);
    autoDevelopCity(city, now);
    city.updatedAt = Number(now);
  }

  function advanceState(value, now = Date.now(), options = {}) {
    const originalSchema = Number(value?.mapSchema) || 0;
    const originalTerrainRevision = Number(value?.terrainRevision) || 0;
    const migrated = originalSchema < MAP_SCHEMA || originalTerrainRevision < TERRAIN_REVISION;
    const state = normalizeState(value, now);
    const maximum = Math.max(1, Number(options.maxTicks) || 144);
    let processed = 0;
    let cursor = Number(state.nextTickAt) || (Number(state.lastTickAt) || Number(now)) + TICK_MS;
    while (cursor <= Number(now) && processed < maximum) {
      Object.values(state.players || {}).forEach((city) => advanceCity(city, cursor));
      state.lastTickAt = cursor;
      cursor += TICK_MS;
      processed += 1;
    }
    state.nextTickAt = cursor;
    if (processed || migrated) {
      state.revision = (Number(state.revision) || 0) + Math.max(1, processed);
      state.updatedAt = Number(now);
    }
    return { state, processed, caughtUp: cursor > Number(now), migrated };
  }

  function rewardForPlayer(entry = {}) {
    const opens = Math.max(0, Number(entry.opens) || 0);
    const bingoLines = Math.max(0, Number(entry.bingoLines) || 0);
    const won = Boolean(entry.won);
    return { money: opens * 100 + bingoLines * 500 + (won ? 1500 : 300) };
  }

  function applyMatchReward(value, payload = {}, now = Date.now()) {
    const state = normalizeState(value, now);
    const rewardId = String(payload.id || "");
    if (!rewardId) return { state, applied: false, error: "報酬IDがありません。" };
    if (state.processedRewards[rewardId]) return { state, applied: false, duplicate: true };
    const rewards = {};
    (Array.isArray(payload.players) ? payload.players : []).forEach((entry) => {
      const player = playerForName(entry?.name);
      const city = player ? state.players?.[player.id] : null;
      if (!city) return;
      const reward = rewardForPlayer(entry);
      Object.entries(reward).forEach(([field, amount]) => { city.resources[field] = Math.max(0, (Number(city.resources[field]) || 0) + Number(amount || 0)); });
      city.inbox ||= {};
      city.inbox[rewardId] = { id: rewardId, matchId: payload.matchId || rewardId, reward, createdAt: Number(now), title: entry.won ? "BINGO VICTORY REWARD" : "BINGO MATCH REWARD" };
      city.inbox = trimMap(city.inbox, 30);
      addHistory(city, "bingo", entry.won ? "ビンゴ勝利報酬" : "ビンゴ参加報酬", `資金 +${reward.money}`, now, { rewardId });
      autoDevelopCity(city, now, 5);
      city.updatedAt = Number(now);
      rewards[player.id] = reward;
    });
    state.processedRewards[rewardId] = Number(now);
    state.processedRewards = trimMap(state.processedRewards, MAX_PROCESSED);
    state.revision = (Number(state.revision) || 0) + 1;
    state.updatedAt = Number(now);
    return { state, applied: true, rewards };
  }

  function standings(state) {
    return PLAYERS.map((player) => {
      const city = state?.players?.[player.id] || createPlayerCity(player, Date.now());
      const metrics = calculateMetrics(city);
      return { id: player.id, name: player.name, cityName: city.name, color: player.color, level: city.level, ...metrics };
    }).sort((a, b) => b.cityScore - a.cityScore || b.population - a.population || a.name.localeCompare(b.name, "ja-JP"));
  }

  const api = {
    VERSION, MAP_SCHEMA, TERRAIN_REVISION, GRID_SIZE, CITY_CENTER, TICK_MINUTES, TICK_MS, AUTO_BUILD_THRESHOLD,
    PLAYERS, PLAYER_BY_ID, TERRAIN, BUILDINGS, BUILDING_IDS,
    clone, playerKey, playerForName, tileId, parseTileId, neighbors, terrainAt,
    createInitialState, normalizeState, calculateMetrics, canBuild, applyCommand, autoDevelopCity, advanceState,
    rewardForPlayer, applyMatchReward, standings, isRoadTile
  };

  global.TeamBingoCitySystem = api;
})(typeof window !== "undefined" ? window : globalThis);
