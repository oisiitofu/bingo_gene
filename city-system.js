(function bootstrapBingoCitySystem(global) {
  "use strict";

  const VERSION = 1;
  const MAP_SCHEMA = 4;
  const TERRAIN_REVISION = 2;
  const FEATURE_REVISION = 10;
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
  const CITY_IDENTITIES = Object.freeze({
    tofu: Object.freeze({ id: "garden-future", title: "白緑共生都市", focus: "住宅・公園・環境", description: "住み心地と緑地を優先し、穏やかな街区を連ねる都市です。", effects: { happiness: 4, environment: 6, tourism: 2 } }),
    eda: Object.freeze({ id: "trinity-fortress", title: "三刃要塞都市", focus: "工業・治安・雇用", description: "生産拠点と防災施設を集約し、力強い都市軸を形成します。", effects: { jobs: 45, safety: 8, tax: 18 } }),
    jan: Object.freeze({ id: "destiny-entertainment", title: "運命祝祭都市", focus: "商業・娯楽・観光", description: "人が集まる商業街とアリーナを中心に、にぎわいを拡張します。", effects: { happiness: 3, tourism: 9, tax: 12 } }),
    rima: Object.freeze({ id: "midnight-logistics", title: "深夜補給都市", focus: "物流・商業・インフラ", description: "夜間も止まらない物流網と補給拠点で都市経済を支えます。", effects: { jobs: 38, powerSupply: 12, tax: 20 } }),
    kento: Object.freeze({ id: "violet-media", title: "紫電配信都市", focus: "メディア・学術・商業", description: "配信・研究・高層商業を束ねた先進的な情報都市です。", effects: { education: 8, tourism: 7, jobs: 30 } }),
    lickey: Object.freeze({ id: "royal-capital", title: "蒼金王都", focus: "行政・観光・幸福", description: "城下町と公共施設を整え、格式と観光を両立する王都です。", effects: { safety: 5, happiness: 3, tourism: 10 } })
  });

  const CITY_POLICIES = Object.freeze({
    balanced: Object.freeze({ id: "balanced", name: "均衡都市", short: "均衡", description: "暮らし・産業・交通を偏りなく運営します。", effects: {} }),
    growth: Object.freeze({ id: "growth", name: "成長優先", short: "成長", description: "住宅と雇用を増やし、都市の拡大を加速します。", effects: { populationCapacity: 320, jobs: 55, happiness: -3, powerDemand: 8, waterDemand: 8 } }),
    green: Object.freeze({ id: "green", name: "環境共生", short: "環境", description: "緑と暮らしやすさを優先し、税収を少し抑えます。", effects: { environment: 13, happiness: 5, tax: -18 } }),
    tourism: Object.freeze({ id: "tourism", name: "観光振興", short: "観光", description: "来訪者と商業収入を増やし、街のにぎわいを高めます。", effects: { tourism: 16, tax: 24, pollution: 2 } }),
    industry: Object.freeze({ id: "industry", name: "産業強化", short: "産業", description: "雇用と税収を大きく伸ばす一方、環境負荷が増えます。", effects: { jobs: 85, tax: 46, pollution: 8, happiness: -3 } }),
    transit: Object.freeze({ id: "transit", name: "交通改革", short: "交通", description: "公共交通を優先し、混雑を抑えて都市活動を支えます。", effects: { jobs: 22, tourism: 5 }, traffic: { capacity: 140, efficiency: 12, congestion: -14 } })
  });

  const CITY_INTERACTIONS = Object.freeze({
    trade: Object.freeze({ id: "trade", name: "都市交易", short: "交易", description: "特産品を交換し、双方の都市経済を潤します。", sourceMoney: 450, targetMoney: 300, relation: 3 }),
    culture: Object.freeze({ id: "culture", name: "文化交流", short: "文化", description: "市民団を派遣し、長く続く友好関係を育てます。", sourceMoney: -250, targetMoney: 100, relation: 5 }),
    aid: Object.freeze({ id: "aid", name: "復興支援", short: "支援", description: "資金を届け、都市間の強い信頼を築きます。", sourceMoney: -1200, targetMoney: 1200, relation: 8 })
  });
  const INTERACTION_COOLDOWN_MS = 3 * 60 * 60 * 1000;

  const CITY_WEATHER = Object.freeze({
    clear: Object.freeze({ id: "clear", name: "晴れ", icon: "SUN", effects: { happiness: 2, tourism: 4 } }),
    cloudy: Object.freeze({ id: "cloudy", name: "曇り", icon: "CLOUD", effects: {} }),
    rain: Object.freeze({ id: "rain", name: "雨", icon: "RAIN", effects: { environment: 3, tourism: -3 } }),
    storm: Object.freeze({ id: "storm", name: "雷雨", icon: "STORM", effects: { safety: -4, tourism: -6, environment: 2 } }),
    fog: Object.freeze({ id: "fog", name: "霧", icon: "FOG", effects: { tourism: -2 } }),
    snow: Object.freeze({ id: "snow", name: "雪", icon: "SNOW", effects: { happiness: 2, tourism: 3, powerDemand: 4 } })
  });
  const CITY_DAY_PHASES = Object.freeze({
    dawn: Object.freeze({ id: "dawn", name: "朝", start: 5, end: 7 }),
    day: Object.freeze({ id: "day", name: "昼", start: 7, end: 17 }),
    dusk: Object.freeze({ id: "dusk", name: "夕", start: 17, end: 19 }),
    night: Object.freeze({ id: "night", name: "夜", start: 19, end: 29 })
  });

  function cityEnvironment(cityOrId, now = Date.now()) {
    const cityId = typeof cityOrId === "string" ? cityOrId : String(cityOrId?.id || "tofu");
    const timestamp = Number(now) || Date.now();
    const jst = new Date(timestamp + 9 * 60 * 60 * 1000);
    const hour = jst.getUTCHours() + jst.getUTCMinutes() / 60;
    const phase = hour < 5 ? CITY_DAY_PHASES.night : hour < 7 ? CITY_DAY_PHASES.dawn : hour < 17 ? CITY_DAY_PHASES.day : hour < 19 ? CITY_DAY_PHASES.dusk : CITY_DAY_PHASES.night;
    const block = Math.floor(timestamp / (3 * 60 * 60 * 1000));
    const roll = hash2(`${cityId}:weather`, block, 41);
    const weather = roll < .43 ? CITY_WEATHER.clear
      : roll < .65 ? CITY_WEATHER.cloudy
        : roll < .84 ? CITY_WEATHER.rain
          : roll < .9 ? CITY_WEATHER.storm
            : roll < .96 ? CITY_WEATHER.fog : CITY_WEATHER.snow;
    return { phase, weather, hour, block, nextWeatherAt: (block + 1) * 3 * 60 * 60 * 1000 };
  }

  const MISSION_POOLS = Object.freeze([
    Object.freeze([
      Object.freeze({ id: "open-3", title: "3マスを開ける", kind: "opens", target: 3, reward: 350 }),
      Object.freeze({ id: "open-5", title: "5マスを開ける", kind: "opens", target: 5, reward: 700 }),
      Object.freeze({ id: "open-7", title: "7マスを開ける", kind: "opens", target: 7, reward: 1100 })
    ]),
    Object.freeze([
      Object.freeze({ id: "line-1", title: "1ライン完成", kind: "bingoLines", target: 1, reward: 600 }),
      Object.freeze({ id: "line-2", title: "2ライン完成", kind: "bingoLines", target: 2, reward: 1000 }),
      Object.freeze({ id: "victory", title: "試合に勝利", kind: "won", target: 1, reward: 900 })
    ]),
    Object.freeze([
      Object.freeze({ id: "mvp", title: "MVPを獲得", kind: "mvp", target: 1, reward: 1200 }),
      Object.freeze({ id: "straight", title: "ストレート勝利", kind: "victoryKind", value: "straight", target: 1, reward: 1400 }),
      Object.freeze({ id: "comeback", title: "大逆転勝利", kind: "victoryKind", value: "comeback", target: 1, reward: 1400 })
    ])
  ]);

  const CITIZEN_CASTS = Object.freeze({
    tofu: Object.freeze([["白井こはく", "庭園技師"], ["若葉みのり", "豆腐料理人"], ["灰田つむぎ", "住宅設計士"], ["緑川なごみ", "環境調査員"], ["雪村ましろ", "市民記者"]]),
    eda: Object.freeze([["刃金レイ", "防災隊長"], ["赤城つばさ", "機械技師"], ["青峰ジン", "物流監督"], ["剣持カナタ", "警備士"], ["三枝ミナ", "市民記者"]]),
    jan: Object.freeze([["星野ヒカル", "舞台演出家"], ["金城キララ", "イベント企画員"], ["運野めぐる", "商店主"], ["天川スバル", "ドーム整備士"], ["日向アキ", "市民記者"]]),
    rima: Object.freeze([["麺谷すすむ", "深夜料理人"], ["橙野ライム", "物流運転士"], ["速水チャージ", "補給技師"], ["夜久ネル", "夜間警備員"], ["灯里レポ", "市民記者"]]),
    kento: Object.freeze([["紫藤ミライ", "配信技師"], ["初見わこ", "メディア学生"], ["雷門ルイ", "電波研究員"], ["月城ネオン", "映像作家"], ["桐生ライブ", "市民記者"]]),
    lickey: Object.freeze([["蒼井キング", "王城建築士"], ["金森クラウン", "観光案内人"], ["城戸レオン", "近衛隊員"], ["海原ミント", "港湾商人"], ["王都リポ", "市民記者"]])
  });

  const CITY_EVENTS = Object.freeze([
    Object.freeze({ id: "festival", title: "六王シティフェス", detail: "中心街に屋台とステージが並び、観光客が押し寄せています。", tone: "positive", durationTicks: 12, money: 1200, effects: { happiness: 7, tourism: 16, tax: 24 } }),
    Object.freeze({ id: "tech-expo", title: "未来技術博 開幕", detail: "研究者と企業が集まり、新技術の展示会が始まりました。", tone: "positive", durationTicks: 15, money: 900, effects: { education: 8, jobs: 32, tourism: 9 } }),
    Object.freeze({ id: "tour-boom", title: "観光動画が大拡散", detail: "街の映像が話題になり、観光需要が急上昇しています。", tone: "positive", durationTicks: 10, money: 1500, effects: { tourism: 22, happiness: 3 } }),
    Object.freeze({ id: "green-week", title: "都市緑化週間", detail: "市民参加の植樹活動で街路と公園が鮮やかになりました。", tone: "positive", durationTicks: 18, money: -300, effects: { environment: 10, happiness: 5 } }),
    Object.freeze({ id: "night-market", title: "ナイトマーケット盛況", detail: "夜の商業区に市民と観光客が集まっています。", tone: "positive", durationTicks: 9, money: 1000, effects: { tourism: 10, tax: 35 } }),
    Object.freeze({ id: "power-alert", title: "電力需給ひっ迫警報", detail: "使用電力が増加し、節電への協力が呼びかけられています。", tone: "warning", durationTicks: 8, money: -700, effects: { powerSupply: -18, happiness: -4 } }),
    Object.freeze({ id: "cloudburst", title: "局地的豪雨", detail: "道路の一部で冠水が発生し、復旧班が対応しています。", tone: "warning", durationTicks: 7, money: -1100, effects: { safety: -5, environment: -3 } }),
    Object.freeze({ id: "traffic-surge", title: "中心街で大渋滞", detail: "イベント来場車が集中し、公共交通の利用が推奨されています。", tone: "warning", durationTicks: 6, money: -500, effects: { jobs: -28, happiness: -5 } }),
    Object.freeze({ id: "factory-order", title: "大型生産契約を獲得", detail: "市内企業が大型案件を受注し、雇用と税収が伸びています。", tone: "positive", durationTicks: 14, money: 1800, effects: { jobs: 55, tax: 42, pollution: 2 } }),
    Object.freeze({ id: "volunteer", title: "市民ボランティア結集", detail: "市民が清掃と防災訓練に参加し、地域の連携が強まりました。", tone: "positive", durationTicks: 12, money: -200, effects: { safety: 7, environment: 5, happiness: 3 } }),
    Object.freeze({ id: "water-maintenance", title: "大規模水道メンテナンス", detail: "安定供給に向けた更新工事が市内各所で進んでいます。", tone: "neutral", durationTicks: 6, money: -900, effects: { waterSupply: -12, jobs: 18 } }),
    Object.freeze({ id: "championship", title: "ビンゴ選手権パブリックビューイング", detail: "勝負の行方を見守る市民で広場が埋め尽くされています。", tone: "positive", durationTicks: 10, money: 1300, effects: { happiness: 8, tourism: 12, tax: 18 } })
  ]);

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

  const CITY_STAGES = Object.freeze([
    Object.freeze({ level: 1, name: "集落", minPopulation: 0, minScore: 0 }),
    Object.freeze({ level: 2, name: "町", minPopulation: 500, minScore: 5000 }),
    Object.freeze({ level: 3, name: "地方都市", minPopulation: 2500, minScore: 14000 }),
    Object.freeze({ level: 4, name: "大都市", minPopulation: 10000, minScore: 40000 }),
    Object.freeze({ level: 5, name: "メトロポリス", minPopulation: 30000, minScore: 100000 }),
    Object.freeze({ level: 6, name: "世界都市", minPopulation: 100000, minScore: 280000 })
  ]);

  const DISTRICTS = Object.freeze({
    "green-neighborhood": Object.freeze({ id: "green-neighborhood", name: "緑住区", color: "#76d17c", priority: 90, models: ["residential", "park"], requirements: { residential: 2, park: 2 }, effects: { happiness: 5, environment: 8, tourism: 2 } }),
    "industrial-hub": Object.freeze({ id: "industrial-hub", name: "工業集積地", color: "#f3974f", priority: 85, models: ["industrial", "power"], requirements: { industrial: 3, power: 1 }, effects: { jobs: 55, tax: 35, pollution: 2 } }),
    "entertainment-quarter": Object.freeze({ id: "entertainment-quarter", name: "娯楽街", color: "#e66fd2", priority: 80, models: ["arena", "commercial"], requirements: { arena: 1, commercial: 2 }, effects: { happiness: 4, tourism: 12, tax: 18 } }),
    "civic-center": Object.freeze({ id: "civic-center", name: "行政中心地", color: "#f2cf66", priority: 75, models: ["civic", "commercial", "residential"], requirements: { civic: 2, commercial: 1 }, effects: { safety: 7, happiness: 3, tourism: 4 } }),
    "waterfront": Object.freeze({ id: "waterfront", name: "ウォーターフロント", color: "#5bc8ed", priority: 70, models: ["commercial", "park", "civic", "arena"], requirements: { commercial: 2, park: 1 }, waterEdges: 2, effects: { happiness: 3, tourism: 10, environment: 3 } }),
    "tourism-corridor": Object.freeze({ id: "tourism-corridor", name: "観光回廊", color: "#a8dc67", priority: 65, models: ["commercial", "park", "arena"], requirements: { commercial: 2, park: 2 }, effects: { tourism: 9, happiness: 3, tax: 12 } }),
    "commercial-core": Object.freeze({ id: "commercial-core", name: "商業中心地", color: "#58bdf2", priority: 40, models: ["commercial"], requirements: { commercial: 3 }, effects: { jobs: 35, tourism: 5, tax: 28 } }),
    "residential-quarter": Object.freeze({ id: "residential-quarter", name: "住宅街", color: "#d8bd8b", priority: 35, models: ["residential"], requirements: { residential: 3 }, effects: { happiness: 3, environment: 2 } })
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

  const SIGNATURE_LANDMARKS = Object.freeze({
    tofu: Object.freeze({ id: "signature-tofu", name: "白亜の豆腐宮殿", model: "signature-landmark", category: "landmark", ownerId: "tofu", signatureLandmark: true, unique: true, unlockLevel: 3, unlockDistricts: 2, cost: 48000, upkeep: 90, jobs: 160, happiness: 16, safety: 8, tourism: 55, environment: 8, tax: 120, description: "白磁と緑の庭園に包まれた、とうふ未来市の象徴です。" }),
    eda: Object.freeze({ id: "signature-eda", name: "三刃武装要塞", model: "signature-landmark", category: "landmark", ownerId: "eda", signatureLandmark: true, unique: true, unlockLevel: 3, unlockDistricts: 2, cost: 52000, upkeep: 105, jobs: 210, happiness: 8, safety: 24, tourism: 38, tax: 150, description: "剣・銃・格闘の三塔が都市を守る巨大要塞です。" }),
    jan: Object.freeze({ id: "signature-jan", name: "運命改変スタードーム", model: "signature-landmark", category: "landmark", ownerId: "jan", signatureLandmark: true, unique: true, unlockLevel: 3, unlockDistricts: 2, cost: 50000, upkeep: 96, jobs: 180, happiness: 18, tourism: 62, tax: 135, description: "黄金の星環が回転し続ける、運命改都の祝祭ドームです。" }),
    rima: Object.freeze({ id: "signature-rima", name: "深夜補給ラーメン塔", model: "signature-landmark", category: "landmark", ownerId: "rima", signatureLandmark: true, unique: true, unlockLevel: 3, unlockDistricts: 2, cost: 47000, upkeep: 88, jobs: 195, happiness: 14, tourism: 46, health: 5, tax: 145, description: "ラーメンとエナジーを24時間供給する補給都市の心臓部です。" }),
    kento: Object.freeze({ id: "signature-kento", name: "紫電配信スカイタワー", model: "signature-landmark", category: "landmark", ownerId: "kento", signatureLandmark: true, unique: true, unlockLevel: 3, unlockDistricts: 2, cost: 54000, upkeep: 110, jobs: 230, happiness: 12, education: 10, tourism: 58, tax: 165, description: "都市全域へ紫電のライブ映像を届ける超高層配信塔です。" }),
    lickey: Object.freeze({ id: "signature-lickey", name: "Lickey王国大城塞", model: "signature-landmark", category: "landmark", ownerId: "lickey", signatureLandmark: true, unique: true, unlockLevel: 3, unlockDistricts: 2, cost: 56000, upkeep: 112, jobs: 200, happiness: 13, safety: 18, tourism: 65, tax: 155, description: "城下町を見守る、青と金の王国最大の城塞です。" })
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
      "bus-terminal": { id: "bus-terminal", name: "都市バスセンター", model: "transit", variant: 12, visualForm: 2, visualTheme: 1, visualEdition: 0, visualSignature: "transit:2:1:0", category: "transport", cost: 3200, upkeep: 18, jobs: 32, publicTransit: 24, transportCapacity: 120, description: "各地区を結ぶバス交通の中心拠点。" },
      "metro-station": { id: "metro-station", name: "メトロ中央駅", model: "transit", variant: 18, visualForm: 8, visualTheme: 1, visualEdition: 0, visualSignature: "transit:8:1:0", category: "transport", cost: 7200, upkeep: 34, jobs: 55, publicTransit: 48, transportCapacity: 260, tourism: 5, description: "都市中心部の混雑を緩和する地下鉄駅。" },
      "grand-station": { id: "grand-station", name: "都市圏中央駅", model: "transit", variant: 28, visualForm: 8, visualTheme: 2, visualEdition: 0, visualSignature: "transit:8:2:0", category: "transport", cost: 16000, upkeep: 62, jobs: 110, publicTransit: 80, transportCapacity: 520, tourism: 12, unique: true, description: "鉄道・地下鉄・バスを束ねる大規模交通ターミナル。" },
      civic: { id: "civic", name: "市庁舎", model: "civic", variant: 0, visualForm: 0, visualTheme: 0, visualEdition: 0, visualSignature: "civic:0:0:0", category: "landmark", cost: 0, upkeep: 8, jobs: 40, happiness: 5, safety: 8, tourism: 8, unique: true, description: "都市運営の中心。" }
    };
    Object.entries(CATALOG).forEach(([model, names]) => names.forEach((name, index) => {
      const definition = makeDefinition(model, name, index);
      const legacyId = { 市庁舎: "civic", 集合住宅: "residential", 商業タワー: "commercial", 先端工業区: "industrial", 中央公園: "park", 都市発電所: "power", 浄水センター: "water", ビンゴアリーナ: "arena" }[definition.name];
      if (legacyId === "civic") return;
      if (legacyId) definition.id = legacyId;
      entries[definition.id] = definition;
    }));
    Object.values(SIGNATURE_LANDMARKS).forEach((definition) => { entries[definition.id] = definition; });
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

  function createCityLife(player, now) {
    const cast = CITIZEN_CASTS[player.id] || CITIZEN_CASTS.tofu;
    return {
      residents: Object.fromEntries(cast.map(([name, job], index) => [`resident-${index + 1}`, {
        id: `resident-${index + 1}`, name, job, satisfaction: 70, lastQuote: "この街がどう育つか、楽しみにしています。", lastSpokeAt: Number(now)
      }])),
      news: {
        [`${Number(now)}-founding`]: { id: `${Number(now)}-founding`, type: "founding", tone: "positive", title: `${player.cityName} 建設開始`, detail: "市民とともに新しい都市づくりが始まりました。", createdAt: Number(now) }
      },
      lastNewsAt: Number(now)
    };
  }

  function createCityEventState(playerId, now) {
    const jitter = Math.floor(hash2(`${playerId}:event-start`, 7, 19) * TICK_MS * 12);
    return { active: {}, history: {}, nextAt: Number(now) + TICK_MS * 24 + jitter };
  }

  function createPlayerCity(player, now) {
    const city = {
      id: player.id, name: player.cityName, ownerName: player.name, color: player.color, accent: player.accent,
      terrainPreset: player.terrainPreset, mapSchema: MAP_SCHEMA, terrainRevision: TERRAIN_REVISION, featureRevision: FEATURE_REVISION, level: 1,
      resources: { money: AUTO_BUILD_THRESHOLD },
      metrics: emptyMetrics(), economy: { taxRate: 10, lastIncome: 0, lastExpense: 0, balance: 0 },
      autoDevelopment: { enabled: true, threshold: AUTO_BUILD_THRESHOLD, placed: 0, cursor: 0 },
      tiles: initialTiles(), unlocks: allUnlocks(), inbox: {}, history: {},
      missions: { completed: 0, total: 0, earned: 0, recent: {} }, life: createCityLife(player, now), events: createCityEventState(player.id, now),
      policy: { id: "balanced", changedAt: Number(now) }, relations: {}, createdAt: now, updatedAt: now
    };
    city.metrics = calculateMetrics(city);
    city.level = cityLevel(city.metrics.population, city.metrics.cityScore);
    return city;
  }

  function createInitialState(now = Date.now()) {
    const timestamp = Number(now) || Date.now();
    return { version: VERSION, mapSchema: MAP_SCHEMA, terrainRevision: TERRAIN_REVISION, featureRevision: FEATURE_REVISION, revision: 0, players: Object.fromEntries(PLAYERS.map((player) => [player.id, createPlayerCity(player, timestamp)])), processedRewards: {}, processedCommands: {}, lastTickAt: timestamp, nextTickAt: timestamp + TICK_MS, updatedAt: timestamp };
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
      city.featureRevision = FEATURE_REVISION;
      city.terrainPreset = player.terrainPreset;
      city.resources = { money: Math.max(0, Number(city.resources?.money) || 0) };
      city.unlocks = { ...allUnlocks(), ...(city.unlocks || {}) };
      city.autoDevelopment = { enabled: true, threshold: AUTO_BUILD_THRESHOLD, placed: 0, cursor: 0, ...(city.autoDevelopment || {}) };
      city.missions = {
        completed: Math.max(0, Number(city.missions?.completed) || 0),
        total: Math.max(0, Number(city.missions?.total) || 0),
        earned: Math.max(0, Number(city.missions?.earned) || 0),
        recent: city.missions?.recent && typeof city.missions.recent === "object" ? city.missions.recent : {}
      };
      const initialLife = createCityLife(player, city.createdAt || now);
      city.life = {
        residents: city.life?.residents && typeof city.life.residents === "object" ? city.life.residents : initialLife.residents,
        news: city.life?.news && typeof city.life.news === "object" ? city.life.news : initialLife.news,
        lastNewsAt: Number(city.life?.lastNewsAt) || Number(city.createdAt) || Number(now)
      };
      const initialEvents = createCityEventState(player.id, city.createdAt || now);
      city.events = {
        active: city.events?.active && typeof city.events.active === "object" ? city.events.active : {},
        history: city.events?.history && typeof city.events.history === "object" ? city.events.history : {},
        nextAt: Number(city.events?.nextAt) || initialEvents.nextAt
      };
      city.policy = {
        id: CITY_POLICIES[city.policy?.id] ? city.policy.id : "balanced",
        changedAt: Number(city.policy?.changedAt) || Number(city.createdAt) || Number(now)
      };
      city.relations = city.relations && typeof city.relations === "object" ? city.relations : {};
      Object.entries(city.relations).forEach(([targetId, relation]) => {
        if (!PLAYER_BY_ID[targetId] || targetId === city.id) { delete city.relations[targetId]; return; }
        city.relations[targetId] = {
          score: Math.max(0, Math.min(100, Number(relation?.score) || 0)),
          interactions: Math.max(0, Number(relation?.interactions) || 0),
          trade: Math.max(0, Number(relation?.trade) || 0),
          culture: Math.max(0, Number(relation?.culture) || 0),
          aid: Math.max(0, Number(relation?.aid) || 0),
          lastAt: Math.max(0, Number(relation?.lastAt) || 0)
        };
      });
      city.metrics = calculateMetrics(city);
      city.level = cityLevel(city.metrics.population, city.metrics.cityScore);
    });
    state.mapSchema = MAP_SCHEMA;
    state.terrainRevision = TERRAIN_REVISION;
    state.featureRevision = FEATURE_REVISION;
    state.processedCommands ||= {};
    state.processedRewards ||= {};
    return state;
  }

  function buildingScale(tile) {
    return Math.max(1, Math.min(3, Number(tile?.level) || 1));
  }

  function districtNeighborhood(city, id, radius = 2) {
    const origin = parseTileId(id);
    const output = [];
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const tile = city?.tiles?.[tileId(origin.x + dx, origin.z + dz)];
        const definition = BUILDINGS[tile?.buildingId];
        if (tile && definition && !isRoadDefinition(definition)) output.push({ tile, definition });
      }
    }
    return output;
  }

  function districtWaterEdges(city, entries) {
    return entries.reduce((total, entry) => total + neighbors(entry.tile.id).filter((id) => {
      const point = parseTileId(id);
      return terrainAt(city.id, point.x, point.z).water;
    }).length, 0);
  }

  function matchesDistrict(city, definition, entries) {
    const counts = entries.reduce((output, entry) => {
      output[entry.definition.model] = (output[entry.definition.model] || 0) + 1;
      return output;
    }, {});
    if (Object.entries(definition.requirements).some(([model, count]) => (counts[model] || 0) < count)) return false;
    return !definition.waterEdges || districtWaterEdges(city, entries) >= definition.waterEdges;
  }

  function districtLinks(id) {
    const point = parseTileId(id);
    const output = [];
    for (let dz = -2; dz <= 2; dz += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        if ((!dx && !dz) || Math.abs(dx) + Math.abs(dz) > 2) continue;
        output.push(tileId(point.x + dx, point.z + dz));
      }
    }
    return output;
  }

  function analyzeDistricts(city) {
    const assignments = {};
    Object.values(city?.tiles || {}).forEach((tile) => {
      const building = BUILDINGS[tile?.buildingId];
      if (!building || isRoadDefinition(building)) return;
      const entries = districtNeighborhood(city, tile.id);
      const match = Object.values(DISTRICTS)
        .filter((district) => district.models.includes(building.model) && matchesDistrict(city, district, entries))
        .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0];
      if (match) assignments[tile.id] = match.id;
    });

    const visited = new Set();
    const groups = [];
    Object.keys(assignments).sort().forEach((startId) => {
      if (visited.has(startId)) return;
      const type = assignments[startId];
      const queue = [startId];
      const tileIds = [];
      visited.add(startId);
      while (queue.length) {
        const id = queue.shift();
        tileIds.push(id);
        districtLinks(id).forEach((nextId) => {
          if (!visited.has(nextId) && assignments[nextId] === type) {
            visited.add(nextId);
            queue.push(nextId);
          }
        });
      }
      const definition = DISTRICTS[type];
      groups.push({ id: `${type}-${groups.length + 1}`, type, name: definition.name, color: definition.color, tileIds: tileIds.sort(), effects: { ...definition.effects } });
    });

    const effects = {};
    const summaryMap = {};
    groups.forEach((group) => {
      const scale = Math.max(1, Math.min(3, Math.ceil(group.tileIds.length / 5)));
      Object.entries(group.effects).forEach(([field, value]) => { effects[field] = (effects[field] || 0) + Number(value) * scale; });
      summaryMap[group.type] ||= { id: group.type, name: group.name, color: group.color, groups: 0, tiles: 0 };
      summaryMap[group.type].groups += 1;
      summaryMap[group.type].tiles += group.tileIds.length;
    });
    return { tiles: assignments, groups, summary: Object.values(summaryMap).sort((a, b) => b.tiles - a.tiles || a.name.localeCompare(b.name, "ja-JP")), effects };
  }

  function analyzeTraffic(city, context = {}) {
    const roads = Object.values(city?.tiles || {}).filter(isRoadTile);
    const roadIds = new Set(roads.map((tile) => tile.id));
    const visited = new Set();
    let largestNetwork = 0;
    roads.forEach((road) => {
      if (visited.has(road.id)) return;
      const queue = [road.id];
      let size = 0;
      visited.add(road.id);
      while (queue.length) {
        const id = queue.shift();
        size += 1;
        neighbors(id).forEach((nextId) => {
          if (roadIds.has(nextId) && !visited.has(nextId)) { visited.add(nextId); queue.push(nextId); }
        });
      }
      largestNetwork = Math.max(largestNetwork, size);
    });
    const roadCapacity = roads.reduce((sum, tile) => sum + ({ road: 12, avenue: 19, boulevard: 27, bridge: 14 }[tile.buildingId] || 12), 0);
    const transitBuildings = Object.values(city?.tiles || {}).map((tile) => BUILDINGS[tile?.buildingId]).filter((definition) => Number(definition?.transportCapacity) > 0);
    const publicTransit = transitBuildings.reduce((sum, definition) => sum + (Number(definition.publicTransit) || 0), 0);
    const transitCapacity = transitBuildings.reduce((sum, definition) => sum + (Number(definition.transportCapacity) || 0), 0);
    const population = Math.max(0, Number(context.population ?? city?.metrics?.population) || 0);
    const jobs = Math.max(0, Number(context.jobs ?? city?.metrics?.jobs) || 0);
    const tourism = Math.max(0, Number(context.tourism ?? city?.metrics?.tourism) || 0);
    const demand = Math.max(1, Math.round(population * .16 + jobs * .11 + tourism * 1.8));
    const capacity = Math.max(1, Math.round(roadCapacity + transitCapacity));
    const connectivity = roads.length ? Math.round(largestNetwork / roads.length * 100) : 0;
    const rawLoad = demand / capacity * 100;
    const congestion = Math.max(0, Math.min(100, Math.round(rawLoad * (1.18 - connectivity / 500))));
    const efficiency = Math.max(0, Math.min(100, Math.round(connectivity * .64 + (100 - congestion) * .28 + Math.min(100, publicTransit) * .08)));
    return { roads: roads.length, connectedRoads: largestNetwork, connectivity, publicTransit: Math.min(100, publicTransit), demand, capacity, congestion, efficiency };
  }

  function activeEventEffects(city, now = Number(city?.updatedAt) || Date.now()) {
    const effects = {};
    Object.values(city?.events?.active || {}).forEach((entry) => {
      if ((Number(entry.expiresAt) || 0) <= Number(now)) return;
      Object.entries(entry.effects || {}).forEach(([field, value]) => { effects[field] = (effects[field] || 0) + (Number(value) || 0); });
    });
    return effects;
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
    const districts = analyzeDistricts(city);
    Object.entries(districts.effects).forEach(([field, value]) => { if (Object.hasOwn(totals, field)) totals[field] += Number(value) || 0; });
    const identity = CITY_IDENTITIES[city?.id];
    Object.entries(identity?.effects || {}).forEach(([field, value]) => { if (Object.hasOwn(totals, field)) totals[field] += Number(value) || 0; });
    const policy = CITY_POLICIES[city?.policy?.id] || CITY_POLICIES.balanced;
    Object.entries(policy.effects || {}).forEach(([field, value]) => { if (Object.hasOwn(totals, field)) totals[field] += Number(value) || 0; });
    const climate = cityEnvironment(city, Number(city?.updatedAt) || Date.now());
    Object.entries(climate.weather.effects || {}).forEach(([field, value]) => { if (Object.hasOwn(totals, field)) totals[field] += Number(value) || 0; });
    const relationScore = Object.values(city?.relations || {}).reduce((sum, relation) => sum + Math.max(0, Number(relation?.score) || 0), 0);
    totals.happiness += Math.min(5, Math.floor(relationScore / 18));
    totals.tourism += Math.min(12, Math.floor(relationScore / 9));
    totals.jobs += Math.min(50, Math.floor(relationScore / 3));
    Object.entries(activeEventEffects(city)).forEach(([field, value]) => { if (Object.hasOwn(totals, field)) totals[field] += Number(value) || 0; });
    const population = Math.max(0, Math.min(Number(previous.population) || 0, Math.max(180, totals.populationCapacity)));
    const powerCoverage = totals.powerDemand ? Math.min(100, Math.round(totals.powerSupply / totals.powerDemand * 100)) : 100;
    const waterCoverage = totals.waterDemand ? Math.min(100, Math.round(totals.waterSupply / totals.waterDemand * 100)) : 100;
    const employmentRate = population ? Math.min(100, Math.round(totals.jobs / Math.max(1, population * .48) * 100)) : 100;
    const infrastructurePenalty = Math.round((100 - Math.min(powerCoverage, waterCoverage)) * .38);
    const happiness = Math.max(0, Math.min(100, 62 + totals.happiness + Math.round(totals.environment * .35) - Math.round(totals.pollution * .75) - infrastructurePenalty));
    const environment = Math.max(0, Math.min(100, 68 + totals.environment - totals.pollution));
    const baseTraffic = analyzeTraffic(city, { population, jobs: totals.jobs, tourism: totals.tourism });
    const traffic = {
      ...baseTraffic,
      capacity: Math.max(1, baseTraffic.capacity + (Number(policy.traffic?.capacity) || 0)),
      congestion: Math.max(0, Math.min(100, baseTraffic.congestion + (Number(policy.traffic?.congestion) || 0))),
      efficiency: Math.max(0, Math.min(100, baseTraffic.efficiency + (Number(policy.traffic?.efficiency) || 0)))
    };
    const cityScore = Math.round(population * .55 + happiness * 14 + totals.jobs * 1.8 + totals.tourism * 20 + environment * 8 + Math.min(powerCoverage, waterCoverage) * 6 + Object.keys(city?.tiles || {}).length * 3 + districts.groups.length * 120 + traffic.efficiency * 6 - traffic.congestion * 3);
    return { ...previous, population, capacity: totals.populationCapacity, happiness, jobs: totals.jobs, safety: Math.min(100, 52 + totals.safety), education: Math.min(100, 45 + totals.education), health: Math.min(100, 52 + totals.health), tourism: totals.tourism, environment, pollution: totals.pollution, powerDemand: totals.powerDemand, powerSupply: totals.powerSupply, waterDemand: totals.waterDemand, waterSupply: totals.waterSupply, employmentRate, powerCoverage, waterCoverage, trafficCongestion: traffic.congestion, transportEfficiency: traffic.efficiency, roadConnectivity: traffic.connectivity, publicTransit: traffic.publicTransit, trafficDemand: traffic.demand, trafficCapacity: traffic.capacity, cityScore, districtCount: districts.groups.length, identityId: identity?.id || "", policyId: policy.id, weatherId: climate.weather.id, dayPhase: climate.phase.id, relationScore: Math.min(500, relationScore), taxPotential: totals.tax, upkeep: totals.upkeep };
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
    if (definition.ownerId && definition.ownerId !== city.id) return { ok: false, reason: "このランドマークは別の都市専用です。" };
    if (city.tiles?.[id]) return { ok: false, reason: "すでに道路か建物があります。" };
    if (!city.unlocks?.[buildingId]) return { ok: false, reason: "まだ解放されていない施設です。" };
    const terrain = terrainAt(city.id, point.x, point.z);
    if (definition.bridge) {
      if (terrain.type !== "river" && terrain.type !== "lake") return { ok: false, reason: "橋は川か湖に建設してください。" };
    } else if (!terrain.buildable) return { ok: false, reason: `${TERRAIN[terrain.type].name}にはこの施設を建設できません。` };
    if (definition.unique && Object.values(city.tiles || {}).some((tile) => tile.buildingId === buildingId)) return { ok: false, reason: "この施設は都市に一つだけ建設できます。" };
    const districtCount = analyzeDistricts(city).groups.length;
    if (definition.unlockLevel && Number(city.level) < definition.unlockLevel) return { ok: false, reason: `都市LEVEL ${definition.unlockLevel}で解放されます。` };
    if (definition.unlockDistricts && districtCount < definition.unlockDistricts) return { ok: false, reason: `${definition.unlockDistricts}地区の成立で解放されます。` };
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

  function publishCityNews(city, type, title, detail, now, tone = "neutral", extra = {}) {
    city.life ||= createCityLife(PLAYER_BY_ID[city.id] || PLAYERS[0], now);
    const id = `${Number(now)}-${type}-${Object.keys(city.life.news || {}).length}`;
    city.life.news ||= {};
    city.life.news[id] = { id, type, title, detail, tone, createdAt: Number(now), ...extra };
    city.life.news = trimMap(city.life.news, 36);
    city.life.lastNewsAt = Number(now);
    return city.life.news[id];
  }

  function cityPulse(city, now) {
    const metrics = calculateMetrics(city);
    const districts = analyzeDistricts(city);
    const residents = Object.values(city.life?.residents || {});
    if (!residents.length) return null;
    const speaker = residents[Math.min(residents.length - 1, Math.floor(hash2(`${city.id}:citizen`, Math.floor(Number(now) / (TICK_MS * 6)), residents.length) * residents.length))];
    let title = "街角から届いた声";
    let quote = "新しい建物が増えて、街を歩くのが毎日楽しみです。";
    let tone = "neutral";
    if (Math.min(metrics.powerCoverage, metrics.waterCoverage) < 90) {
      title = "都市インフラに改善要望"; quote = "電気と水道が安定すれば、もっと暮らしやすくなりそうです。"; tone = "warning";
    } else if (metrics.happiness >= 86) {
      title = "市民満足度が好調"; quote = "この街、かなり住み心地がいいですよ。友達にも自慢しています。"; tone = "positive";
    } else if (metrics.tourism >= 50) {
      title = "観光客で街がにぎわう"; quote = "遠くから来た人で通りがいっぱいです。街に活気がありますね。"; tone = "positive";
    } else if (metrics.trafficCongestion >= 65) {
      title = "交通混雑への対策が急務"; quote = "通勤時間の渋滞が気になります。駅や幹線道路がもっと欲しいですね。"; tone = "warning";
    } else if (districts.groups.length >= 2) {
      title = `${districts.groups.length}地区が都市を形成`; quote = "地区ごとの雰囲気が違って、歩くだけでも発見があります。"; tone = "positive";
    } else if (metrics.employmentRate < 75) {
      title = "雇用対策を求める声"; quote = "働ける場所がもう少し増えると、街全体が元気になると思います。"; tone = "warning";
    }
    speaker.satisfaction = Math.max(0, Math.min(100, Math.round((metrics.happiness + metrics.employmentRate + Math.min(metrics.powerCoverage, metrics.waterCoverage)) / 3)));
    speaker.lastQuote = quote;
    speaker.lastSpokeAt = Number(now);
    return publishCityNews(city, "citizen", title, `「${quote}」 ${speaker.name} / ${speaker.job}`, now, tone, { residentId: speaker.id });
  }

  function lifeStatus(city) {
    return {
      residents: Object.values(city?.life?.residents || {}).sort((a, b) => a.id.localeCompare(b.id)),
      news: Object.values(city?.life?.news || {}).sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)),
      lastNewsAt: Number(city?.life?.lastNewsAt) || 0
    };
  }

  function processCityEvents(city, now) {
    const eventState = city.events ||= createCityEventState(city.id, now);
    Object.entries(eventState.active || {}).forEach(([id, entry]) => {
      if ((Number(entry.expiresAt) || 0) <= Number(now)) delete eventState.active[id];
    });
    if (Number(now) < (Number(eventState.nextAt) || 0)) return null;
    const cycle = Math.floor(Number(now) / (TICK_MS * 6));
    const definition = CITY_EVENTS[Math.min(CITY_EVENTS.length - 1, Math.floor(hash2(`${city.id}:event`, cycle, Number(city.level) || 1) * CITY_EVENTS.length))];
    const id = `${definition.id}-${Number(now)}`;
    const scale = 1 + Math.max(0, (Number(city.level) || 1) - 1) * .16;
    const money = Math.round(definition.money * scale);
    const entry = { ...definition, id, money, startedAt: Number(now), expiresAt: Number(now) + definition.durationTicks * TICK_MS };
    eventState.active[id] = entry;
    eventState.history[id] = { ...entry, createdAt: Number(now) };
    eventState.history = trimMap(eventState.history, 48);
    eventState.nextAt = Number(now) + TICK_MS * (30 + Math.floor(hash2(`${city.id}:event-next`, cycle, 31) * 18));
    city.resources.money = Math.max(0, (Number(city.resources.money) || 0) + money);
    addHistory(city, "city-event", definition.title, `${definition.detail} / 資金 ${money >= 0 ? "+" : ""}${money}`, now, { eventId: id });
    publishCityNews(city, "city-event", definition.title, definition.detail, now, definition.tone, { eventId: id });
    return entry;
  }

  function eventStatus(city, now = Date.now()) {
    const active = Object.values(city?.events?.active || {}).filter((entry) => (Number(entry.expiresAt) || 0) > Number(now)).sort((a, b) => Number(a.expiresAt) - Number(b.expiresAt));
    const history = Object.values(city?.events?.history || {}).sort((a, b) => (Number(b.startedAt) || 0) - (Number(a.startedAt) || 0));
    return { active, history, nextAt: Number(city?.events?.nextAt) || 0 };
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
    if (command.type === "set-policy") {
      const policy = CITY_POLICIES[String(command.policyId || "")];
      if (!policy) return { state, applied: false, error: "都市方針を選び直してください。" };
      if (city.policy?.id === policy.id) return { state, applied: false, error: "すでに選択中の都市方針です。" };
      city.policy = { id: policy.id, changedAt: Number(now) };
      addHistory(city, "policy", `市長方針「${policy.name}」`, policy.description, now, { policyId: policy.id });
      publishCityNews(city, "policy", `新たな市長方針「${policy.name}」`, policy.description, now, "positive", { policyId: policy.id });
    } else if (command.type === "interact") {
      const interaction = CITY_INTERACTIONS[String(command.interactionId || "")];
      const target = state.players?.[String(command.targetPlayerId || "")];
      if (!interaction || !target || target.id === city.id) return { state, applied: false, error: "交流する都市と内容を選び直してください。" };
      const relation = city.relations?.[target.id] || {};
      const remaining = INTERACTION_COOLDOWN_MS - (Number(now) - (Number(relation.lastAt) || 0));
      if (remaining > 0) return { state, applied: false, error: `次の都市交流まであと${Math.ceil(remaining / 60000)}分です。` };
      if ((Number(city.resources.money) || 0) + interaction.sourceMoney < 0) return { state, applied: false, error: "交流に必要な資金が足りません。" };
      city.resources.money = Math.max(0, (Number(city.resources.money) || 0) + interaction.sourceMoney);
      target.resources.money = Math.max(0, (Number(target.resources.money) || 0) + interaction.targetMoney);
      const nextRelation = {
        score: Math.min(100, (Number(relation.score) || 0) + interaction.relation),
        interactions: (Number(relation.interactions) || 0) + 1,
        trade: Number(relation.trade) || 0,
        culture: Number(relation.culture) || 0,
        aid: Number(relation.aid) || 0,
        lastAt: Number(now)
      };
      nextRelation[interaction.id] += 1;
      city.relations[target.id] = nextRelation;
      const targetRelation = target.relations?.[city.id] || {};
      target.relations ||= {};
      target.relations[city.id] = {
        score: Math.min(100, (Number(targetRelation.score) || 0) + interaction.relation),
        interactions: (Number(targetRelation.interactions) || 0) + 1,
        trade: (Number(targetRelation.trade) || 0) + (interaction.id === "trade" ? 1 : 0),
        culture: (Number(targetRelation.culture) || 0) + (interaction.id === "culture" ? 1 : 0),
        aid: (Number(targetRelation.aid) || 0) + (interaction.id === "aid" ? 1 : 0),
        lastAt: Number(now)
      };
      addHistory(city, "interaction", `${target.name}と${interaction.name}`, interaction.description, now, { targetPlayerId: target.id, interactionId: interaction.id });
      addHistory(target, "interaction", `${city.name}から${interaction.name}`, interaction.description, now, { sourcePlayerId: city.id, interactionId: interaction.id });
      publishCityNews(city, "interaction", `${target.name}と${interaction.name}`, interaction.description, now, "positive", { targetPlayerId: target.id, interactionId: interaction.id });
      publishCityNews(target, "interaction", `${city.name}から${interaction.name}`, interaction.description, now, "positive", { sourcePlayerId: city.id, interactionId: interaction.id });
      target.metrics = calculateMetrics(target);
      target.updatedAt = Number(now);
    } else if (command.type === "build") {
      const result = canBuild(city, id, String(command.buildingId || ""));
      if (!result.ok) return { state, applied: false, error: result.reason };
      placeBuilding(city, id, result.definition);
      addHistory(city, "build", `${result.definition.name} 建設`, `${id} に新しい施設が完成しました。`, now, { tileId: id, buildingId: result.definition.id });
      publishCityNews(city, "build", `${result.definition.name} 完成`, `${id}で営業・運用を開始しました。`, now, "positive", { tileId: id, buildingId: result.definition.id });
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
      publishCityNews(city, "upgrade", `${definition.name} 拡張`, `LEVEL ${nextLevel}への改修が完了しました。`, now, "positive", { tileId: id, buildingId: definition.id });
    } else if (command.type === "demolish") {
      const tile = city.tiles?.[id];
      const definition = BUILDINGS[tile?.buildingId];
      if (!tile || !definition || definition.id === "civic") return { state, applied: false, error: "撤去できない場所です。" };
      city.resources.money += Math.round(definition.cost * .2);
      delete city.tiles[id];
      addHistory(city, "demolish", `${definition.name} 撤去`, "跡地を更地へ戻しました。", now, { tileId: id });
      publishCityNews(city, "demolish", `${definition.name} 撤去`, "都市再編のため区画が更地へ戻されました。", now, "neutral", { tileId: id });
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
    if (placed) {
      addHistory(city, "auto-build", "自動都市開発", `${placed}区画を自動配置しました。`, now, { count: placed });
      publishCityNews(city, "development", "都市開発プロジェクト進行", `${placed}区画で新しい施設が稼働しました。`, now, "positive", { count: placed });
    }
    city.metrics = calculateMetrics(city);
    return placed;
  }

  function cityLevel(population, cityScore = Number.POSITIVE_INFINITY) {
    return CITY_STAGES.filter((stage) => Number(population) >= stage.minPopulation && Number(cityScore) >= stage.minScore).at(-1)?.level || 1;
  }

  function cityStage(level) {
    return CITY_STAGES.find((stage) => stage.level === Math.max(1, Math.min(6, Number(level) || 1))) || CITY_STAGES[0];
  }

  function landmarkStatus(city) {
    const definition = SIGNATURE_LANDMARKS[city?.id] || null;
    if (!definition) return { definition: null, built: false, unlocked: false, districtCount: 0 };
    const districtCount = analyzeDistricts(city).groups.length;
    const built = Object.values(city?.tiles || {}).some((tile) => tile.buildingId === definition.id);
    const unlocked = Number(city?.level) >= definition.unlockLevel && districtCount >= definition.unlockDistricts;
    return { definition, built, unlocked, districtCount, requiredLevel: definition.unlockLevel, requiredDistricts: definition.unlockDistricts };
  }

  function advanceCity(city, now) {
    const previousLevel = Number(city.level) || 1;
    processCityEvents(city, now);
    const metrics = calculateMetrics(city);
    const infrastructure = Math.min(metrics.powerCoverage, metrics.waterCoverage) / 100;
    const jobsLimit = Math.max(180, Math.round(metrics.jobs / .44));
    const target = Math.min(metrics.capacity || 180, jobsLimit);
    const growthFactor = Math.max(0, (metrics.happiness - 42) / 58) * infrastructure;
    const gap = target - metrics.population;
    const growth = gap > 0 ? Math.max(0, Math.min(Math.ceil(gap * .035 * growthFactor), 24)) : Math.max(-12, Math.ceil(gap * .02));
    metrics.population = Math.max(0, metrics.population + growth);
    const trafficFactor = .84 + Math.max(0, Number(metrics.transportEfficiency) || 0) * .0016;
    const income = Math.max(0, Math.round((metrics.population * .018 * (city.economy.taxRate / 10) + metrics.taxPotential) * trafficFactor));
    const expense = Math.max(0, Math.round(metrics.upkeep));
    city.resources.money = Math.max(0, Math.round((Number(city.resources.money) || 0) + income - expense));
    city.economy = { ...city.economy, lastIncome: income, lastExpense: expense, balance: income - expense };
    city.metrics = calculateMetrics({ ...city, metrics });
    city.level = cityLevel(city.metrics.population, city.metrics.cityScore);
    autoDevelopCity(city, now);
    if (city.level > previousLevel) publishCityNews(city, "level-up", `${cityStage(city.level).name}へ発展`, `都市LEVEL ${city.level}に到達しました。`, now, "positive", { level: city.level });
    else if (Number(now) - (Number(city.life?.lastNewsAt) || 0) >= TICK_MS * 6) cityPulse(city, now);
    city.updatedAt = Number(now);
  }

  function advanceState(value, now = Date.now(), options = {}) {
    const originalSchema = Number(value?.mapSchema) || 0;
    const originalTerrainRevision = Number(value?.terrainRevision) || 0;
    const originalFeatureRevision = Number(value?.featureRevision) || 0;
    const migrated = originalSchema < MAP_SCHEMA || originalTerrainRevision < TERRAIN_REVISION || originalFeatureRevision < FEATURE_REVISION;
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

  function missionsForMatch(matchId, playerId) {
    const seed = `${String(matchId || "match")}:${String(playerId || "player")}`;
    return MISSION_POOLS.map((pool, index) => {
      const choice = Math.min(pool.length - 1, Math.floor(hash2(seed, index + 11, 47 + index * 13) * pool.length));
      return { ...pool[choice] };
    });
  }

  function resolveMission(mission, entry = {}) {
    let progress = 0;
    if (mission.kind === "opens") progress = Math.max(0, Number(entry.opens) || 0);
    if (mission.kind === "bingoLines") progress = Math.max(0, Number(entry.bingoLines) || 0);
    if (mission.kind === "won") progress = entry.won ? 1 : 0;
    if (mission.kind === "mvp") progress = entry.mvp ? 1 : 0;
    if (mission.kind === "victoryKind") progress = entry.won && entry.victoryKind === mission.value ? 1 : 0;
    const completed = progress >= mission.target;
    return { ...mission, progress, completed, earned: completed ? mission.reward : 0 };
  }

  function resolveMatchMissions(matchId, playerId, entry = {}) {
    const missions = missionsForMatch(matchId, playerId).map((mission) => resolveMission(mission, entry));
    return {
      missions,
      completed: missions.filter((mission) => mission.completed).length,
      earned: missions.reduce((sum, mission) => sum + mission.earned, 0)
    };
  }

  function missionStatus(city) {
    const recent = Object.values(city?.missions?.recent || {})
      .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))[0] || null;
    return {
      completed: Math.max(0, Number(city?.missions?.completed) || 0),
      total: Math.max(0, Number(city?.missions?.total) || 0),
      earned: Math.max(0, Number(city?.missions?.earned) || 0),
      recent
    };
  }

  function applyMatchReward(value, payload = {}, now = Date.now()) {
    const state = normalizeState(value, now);
    if (payload.testMode) return { state, applied: false, testMode: true };
    const rewardId = String(payload.id || "");
    if (!rewardId) return { state, applied: false, error: "報酬IDがありません。" };
    if (state.processedRewards[rewardId]) return { state, applied: false, duplicate: true };
    const rewards = {};
    (Array.isArray(payload.players) ? payload.players : []).forEach((entry) => {
      const player = playerForName(entry?.name);
      const city = player ? state.players?.[player.id] : null;
      if (!city) return;
      const baseReward = rewardForPlayer(entry);
      const missionResult = resolveMatchMissions(payload.matchId || rewardId, player.id, entry);
      const reward = { money: baseReward.money + missionResult.earned, baseMoney: baseReward.money, missionMoney: missionResult.earned };
      city.resources.money = Math.max(0, (Number(city.resources.money) || 0) + reward.money);
      city.missions.completed += missionResult.completed;
      city.missions.total += missionResult.missions.length;
      city.missions.earned += missionResult.earned;
      city.missions.recent[rewardId] = {
        id: rewardId, matchId: payload.matchId || rewardId, missions: missionResult.missions,
        completed: missionResult.completed, earned: missionResult.earned, createdAt: Number(now)
      };
      city.missions.recent = trimMap(city.missions.recent, 30);
      city.inbox ||= {};
      city.inbox[rewardId] = { id: rewardId, matchId: payload.matchId || rewardId, reward, missions: missionResult.missions, createdAt: Number(now), title: entry.won ? "BINGO VICTORY REWARD" : "BINGO MATCH REWARD" };
      city.inbox = trimMap(city.inbox, 30);
      addHistory(city, "bingo", entry.won ? "ビンゴ勝利報酬" : "ビンゴ参加報酬", `資金 +${reward.money} / ミッション ${missionResult.completed}/3`, now, { rewardId, missionCompleted: missionResult.completed });
      publishCityNews(city, "bingo", entry.won ? "ビンゴ勝利で都市が沸く" : "ビンゴ遠征隊が帰還", `ミッションを${missionResult.completed}件達成し、資金¥${reward.money}を獲得しました。`, now, entry.won ? "positive" : "neutral", { rewardId });
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
    VERSION, MAP_SCHEMA, TERRAIN_REVISION, FEATURE_REVISION, GRID_SIZE, CITY_CENTER, TICK_MINUTES, TICK_MS, AUTO_BUILD_THRESHOLD,
    PLAYERS, PLAYER_BY_ID, CITY_IDENTITIES, CITY_POLICIES, CITY_INTERACTIONS, INTERACTION_COOLDOWN_MS, CITY_WEATHER, CITY_DAY_PHASES, MISSION_POOLS, CITIZEN_CASTS, CITY_EVENTS, TERRAIN, CITY_STAGES, DISTRICTS, SIGNATURE_LANDMARKS, BUILDINGS, BUILDING_IDS,
    clone, playerKey, playerForName, tileId, parseTileId, neighbors, terrainAt,
    createInitialState, normalizeState, analyzeDistricts, analyzeTraffic, cityEnvironment, cityLevel, cityStage, landmarkStatus, calculateMetrics, canBuild, applyCommand, autoDevelopCity, advanceState,
    rewardForPlayer, missionsForMatch, resolveMatchMissions, missionStatus, lifeStatus, cityPulse, processCityEvents, eventStatus, applyMatchReward, standings, isRoadTile
  };

  global.TeamBingoCitySystem = api;
})(typeof window !== "undefined" ? window : globalThis);
