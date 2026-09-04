(function bootstrapLifeBoardSystem(global) {
  "use strict";

  const VERSION = 1;
  const BOARD_SIZE = 1000;
  const REGION_SIZE = 100;
  const MAX_HISTORY = 600;
  const MAX_PROCESSED_OPENS = 6000;
  const STARTING_CASH = 300000;
  const SERVER_TICK_MS = 6 * 60 * 60 * 1000;

  const PLAYERS = Object.freeze([
    { id: "tofu", name: "おいしいとうふ", color: "#e8e5dc", accent: "#8fc66c", strategy: "steady", specialty: "housing" },
    { id: "eda", name: "えだ", color: "#e74352", accent: "#4aa3ff", strategy: "aggressive", specialty: "career" },
    { id: "jan", name: "ジャン", color: "#ffd339", accent: "#fff3a3", strategy: "chaos", specialty: "chance" },
    { id: "rima", name: "リーマ", color: "#ff7043", accent: "#70e7ff", strategy: "balanced", specialty: "investment" },
    { id: "kento", name: "Kento", color: "#b65cff", accent: "#73e0ff", strategy: "growth", specialty: "technology" },
    { id: "lickey", name: "Lickey", color: "#3287ff", accent: "#f3cc55", strategy: "wealth", specialty: "property" }
  ]);
  const PLAYER_BY_ID = Object.freeze(Object.fromEntries(PLAYERS.map((player) => [player.id, player])));

  const REGIONS = Object.freeze([
    { id: "beginning-town", name: "はじまりの町", theme: "town", color: "#77c96f" },
    { id: "youth-campus", name: "学園・青春街", theme: "campus", color: "#55b9df" },
    { id: "career-city", name: "就職都市", theme: "business", color: "#728ca9" },
    { id: "metropolis", name: "大都会", theme: "metro", color: "#d26988" },
    { id: "resort-coast", name: "リゾート海岸", theme: "coast", color: "#40c7bb" },
    { id: "mountain-frontier", name: "山岳開拓地", theme: "mountain", color: "#a68559" },
    { id: "technology-city", name: "テクノロジー都市", theme: "technology", color: "#875de5" },
    { id: "royal-capital", name: "王国・城下町", theme: "kingdom", color: "#d8aa3c" },
    { id: "space-colony", name: "宇宙コロニー", theme: "space", color: "#526fd4" },
    { id: "six-kings-goal", name: "六王ゴールロード", theme: "finale", color: "#ef5c48" }
  ]);

  const CATEGORY_COUNTS = Object.freeze({
    money: 470,
    job: 100,
    property: 80,
    stock: 80,
    monster: 60,
    equipment: 50,
    city: 40,
    territory: 25,
    tower: 25,
    interaction: 30,
    risk: 30,
    checkpoint: 10
  });

  const STOCKS = Object.freeze([
    { id: "tofu-foods", name: "TOFU FOODS", price: 1200, volatility: 0.08 },
    { id: "jan-destiny", name: "JAN DESTINY", price: 980, volatility: 0.18 },
    { id: "eda-arms", name: "EDA ARMS", price: 1450, volatility: 0.13 },
    { id: "rima-energy", name: "RIMA ENERGY", price: 1100, volatility: 0.11 },
    { id: "kento-live", name: "KENTO LIVE", price: 1320, volatility: 0.16 },
    { id: "lickey-kingdom", name: "LICKEY KINGDOM", price: 1700, volatility: 0.1 }
  ]);

  const JOBS = Object.freeze([
    { id: "part-time", name: "街角アルバイト", salary: 45000, rank: 1 },
    { id: "office", name: "会社員", salary: 85000, rank: 2 },
    { id: "chef", name: "人気料理人", salary: 105000, rank: 3 },
    { id: "engineer", name: "未来エンジニア", salary: 130000, rank: 4 },
    { id: "streamer", name: "人気配信者", salary: 145000, rank: 4 },
    { id: "doctor", name: "名医", salary: 175000, rank: 5 },
    { id: "pro-gamer", name: "プロゲーマー", salary: 160000, rank: 5 },
    { id: "trainer", name: "モンスタートレーナー", salary: 150000, rank: 5 },
    { id: "knight", name: "王国騎士団長", salary: 190000, rank: 6 },
    { id: "investor", name: "伝説の投資家", salary: 230000, rank: 7 },
    { id: "mayor", name: "六王都市の市長", salary: 260000, rank: 8 },
    { id: "astronaut", name: "宇宙開拓士", salary: 300000, rank: 9 },
    { id: "unemployed", name: "自由すぎる無職", salary: 0, rank: 0 }
  ]);

  const PROPERTY_NAMES = Object.freeze([
    "はじまり荘", "青春シェアハウス", "駅前ワンルーム", "海辺のコテージ", "山岳ログハウス",
    "ネオンタワーレジデンス", "王都の庭園邸", "宇宙窓つき住居", "六王スカイマンション", "伝説の大豪邸"
  ]);

  const MONEY_EVENTS = Object.freeze([
    { title: "臨時ボーナス！", detail: "働きぶりが評価され、特別賞与を受け取りました。", min: 60000, max: 240000 },
    { title: "旅行で大散財", detail: "最高の思い出と引き換えに財布が軽くなりました。", min: -260000, max: -70000 },
    { title: "お祝いラッシュ", detail: "人生の節目をみんなが盛大に祝ってくれました。", min: 90000, max: 360000 },
    { title: "突然の修理費", detail: "家電も車も同じ日に壊れる奇跡が起きました。", min: -320000, max: -80000 },
    { title: "副業が大当たり", detail: "思いつきで始めた副業が思わぬ大ヒットです。", min: 120000, max: 520000 },
    { title: "税金の季節", detail: "現実から逃げ切れず、きっちり納めました。", min: -400000, max: -110000 },
    { title: "道端で大発見", detail: "価値のある品を見つけ、正当な謝礼を受け取りました。", min: 40000, max: 180000 },
    { title: "夢への大型投資", detail: "未来の自分へ、思い切った先行投資をしました。", min: -500000, max: -140000 }
  ]);

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

  function hash32(value) {
    let hash = 2166136261;
    const input = String(value || "");
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededUnit(seed) {
    let value = hash32(seed) || 1;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  }

  function seededInt(seed, min, max) {
    const low = Math.ceil(Math.min(min, max));
    const high = Math.floor(Math.max(min, max));
    return low + Math.floor(seededUnit(seed) * (high - low + 1));
  }

  function deterministicShuffle(values, seed) {
    const output = [...values];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swap = seededInt(`${seed}:${index}`, 0, index);
      [output[index], output[swap]] = [output[swap], output[index]];
    }
    return output;
  }

  function buildCategoryDeck() {
    const entries = [];
    Object.entries(CATEGORY_COUNTS).forEach(([category, count]) => {
      if (category === "checkpoint") return;
      for (let index = 0; index < count; index += 1) entries.push(category);
    });
    return deterministicShuffle(entries, "six-kings-life-board-v2");
  }

  function spaceTitle(category, number) {
    const titles = {
      money: ["人生イベント", "運命の収支", "暮らしの転機"],
      job: ["キャリアチャンス", "転職の扉", "仕事の転機"],
      property: ["マイホーム計画", "不動産チャンス", "夢の物件"],
      stock: ["マーケット変動", "株式ニュース", "投資チャンス"],
      monster: ["モンスターの縁", "育成ボーナス", "絆の出会い"],
      equipment: ["装備発見", "宝箱出現", "装備ガチャ券"],
      city: ["CITY連携", "都市投資", "街の依頼"],
      territory: ["領土戦支援", "六王援軍", "遠征補給"],
      tower: ["TOWER休息", "塔の加護", "登頂支援"],
      interaction: ["六王交流", "プレイヤーイベント", "運命の出会い"],
      risk: ["ハイリスク勝負", "一発逆転", "運命の大勝負"]
    };
    const options = titles[category] || ["人生イベント"];
    return options[number % options.length];
  }

  function generateBoard() {
    const categories = buildCategoryDeck();
    let cursor = 0;
    const spaces = [];
    for (let number = 1; number <= BOARD_SIZE; number += 1) {
      const regionIndex = Math.floor((number - 1) / REGION_SIZE);
      const checkpoint = number % REGION_SIZE === 0;
      const category = checkpoint ? "checkpoint" : categories[cursor++];
      spaces.push(Object.freeze({
        number,
        index: number - 1,
        regionIndex,
        regionId: REGIONS[regionIndex].id,
        category,
        title: checkpoint ? `${REGIONS[regionIndex].name} CHECKPOINT` : spaceTitle(category, number),
        checkpoint
      }));
    }
    return Object.freeze(spaces);
  }

  const BOARD = generateBoard();

  function emptyAssets() {
    return { homes: {}, stocks: {}, equipmentGacha: [], eventHistory: [] };
  }

  function createPlayerState(player, now) {
    return {
      id: player.id,
      name: player.name,
      color: player.color,
      position: 0,
      totalSpaces: 0,
      lap: 0,
      maxSpace: 0,
      rolls: 0,
      cash: STARTING_CASH,
      debt: 0,
      netWorth: STARTING_CASH,
      lifetimeIncome: 0,
      lifetimeExpense: 0,
      job: clone(JOBS[0]),
      paydays: 0,
      assets: emptyAssets(),
      integrationRewards: { monsterExp: 0, monsterBond: 0, cityMoney: 0, territoryRecovery: 0, towerRestMinutes: 0 },
      lastRoll: null,
      createdAt: Number(now),
      updatedAt: Number(now)
    };
  }

  function initialMarket(now) {
    return {
      cycle: 0,
      updatedAt: Number(now),
      stocks: Object.fromEntries(STOCKS.map((stock) => [stock.id, { ...stock, previousPrice: stock.price, change: 0 }]))
    };
  }

  function createInitialState(now = Date.now()) {
    const timestamp = Number(now) || Date.now();
    const tickStart = Math.floor(timestamp / SERVER_TICK_MS) * SERVER_TICK_MS;
    return {
      version: VERSION,
      boardRevision: 2,
      revision: 0,
      players: Object.fromEntries(PLAYERS.map((player) => [player.id, createPlayerState(player, timestamp)])),
      market: initialMarket(timestamp),
      rewardQueue: {},
      processedOpens: {},
      globalHistory: {},
      serverCycle: 0,
      lastServerTickAt: tickStart,
      nextServerTickAt: tickStart + SERVER_TICK_MS,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  function normalizeMap(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function trimMap(value, limit) {
    return Object.fromEntries(Object.entries(normalizeMap(value))
      .sort(([, a], [, b]) => Number(b?.createdAt ?? b) - Number(a?.createdAt ?? a))
      .slice(0, limit));
  }

  function normalizePlayerState(value, definition, now) {
    const initial = createPlayerState(definition, now);
    const player = { ...initial, ...normalizeMap(value) };
    player.id = definition.id;
    player.name = definition.name;
    player.color = definition.color;
    player.position = Math.max(0, Math.min(BOARD_SIZE - 1, Math.trunc(Number(player.position) || 0)));
    player.totalSpaces = Math.max(0, Math.trunc(Number(player.totalSpaces) || 0));
    player.lap = Math.max(0, Math.trunc(Number(player.lap) || Math.floor(player.totalSpaces / BOARD_SIZE)));
    player.maxSpace = Math.max(player.position, Math.trunc(Number(player.maxSpace) || 0));
    player.rolls = Math.max(0, Math.trunc(Number(player.rolls) || 0));
    player.cash = Math.max(0, Math.trunc(Number(player.cash) || 0));
    player.debt = Math.max(0, Math.trunc(Number(player.debt) || 0));
    player.lifetimeIncome = Math.max(0, Math.trunc(Number(player.lifetimeIncome) || 0));
    player.lifetimeExpense = Math.max(0, Math.trunc(Number(player.lifetimeExpense) || 0));
    player.job = JOBS.find((job) => job.id === player.job?.id) || clone(initial.job);
    player.paydays = Math.max(0, Math.trunc(Number(player.paydays) || 0));
    player.assets = { ...emptyAssets(), ...normalizeMap(player.assets) };
    player.assets.homes = normalizeMap(player.assets.homes);
    player.assets.stocks = normalizeMap(player.assets.stocks);
    player.assets.equipmentGacha = Array.isArray(player.assets.equipmentGacha) ? player.assets.equipmentGacha.slice(-100) : [];
    player.assets.eventHistory = Array.isArray(player.assets.eventHistory) ? player.assets.eventHistory.slice(-MAX_HISTORY) : [];
    player.integrationRewards = {
      monsterExp: Math.max(0, Number(player.integrationRewards?.monsterExp) || 0),
      monsterBond: Math.max(0, Number(player.integrationRewards?.monsterBond) || 0),
      cityMoney: Math.max(0, Number(player.integrationRewards?.cityMoney) || 0),
      territoryRecovery: Math.max(0, Number(player.integrationRewards?.territoryRecovery) || 0),
      towerRestMinutes: Math.max(0, Number(player.integrationRewards?.towerRestMinutes) || 0)
    };
    player.netWorth = player.cash - player.debt;
    player.updatedAt = Number(player.updatedAt) || Number(now);
    return player;
  }

  function normalizeState(value, now = Date.now()) {
    if (!value || typeof value !== "object") return createInitialState(now);
    const initial = createInitialState(now);
    const state = { ...initial, ...clone(value) };
    state.version = VERSION;
    state.boardRevision = 2;
    state.revision = Math.max(0, Math.trunc(Number(state.revision) || 0));
    state.players = normalizeMap(state.players);
    PLAYERS.forEach((player) => {
      state.players[player.id] = normalizePlayerState(state.players[player.id], player, now);
    });
    state.market = { ...initialMarket(now), ...normalizeMap(state.market) };
    state.market.stocks = Object.fromEntries(STOCKS.map((stock) => [stock.id, {
      ...initial.market.stocks[stock.id],
      ...normalizeMap(state.market.stocks?.[stock.id])
    }]));
    state.rewardQueue = trimMap(state.rewardQueue, 1000);
    state.processedOpens = trimMap(state.processedOpens, MAX_PROCESSED_OPENS);
    state.globalHistory = trimMap(state.globalHistory, MAX_HISTORY);
    state.serverCycle = Math.max(0, Math.trunc(Number(state.serverCycle) || 0));
    state.lastServerTickAt = Number(state.lastServerTickAt) || initial.lastServerTickAt;
    state.nextServerTickAt = Number(state.nextServerTickAt) || state.lastServerTickAt + SERVER_TICK_MS;
    state.createdAt = Number(state.createdAt) || Number(now);
    state.updatedAt = Number(state.updatedAt) || Number(now);
    PLAYERS.forEach((definition) => updateNetWorth(state.players[definition.id], state.market));
    return state;
  }

  function assetValue(player, market) {
    const propertyValue = Object.values(player?.assets?.homes || {}).reduce((sum, property) => sum + Math.max(0, Number(property?.value) || 0), 0);
    const stockValue = Object.values(player?.assets?.stocks || {}).reduce((sum, holding) => {
      const stock = market?.stocks?.[holding?.id];
      return sum + Math.max(0, Number(holding?.shares) || 0) * Math.max(0, Number(stock?.price) || 0);
    }, 0);
    return Math.round(propertyValue + stockValue);
  }

  function updateNetWorth(player, market) {
    player.netWorth = Math.round((Number(player.cash) || 0) - (Number(player.debt) || 0) + assetValue(player, market));
    return player.netWorth;
  }

  function applyMoney(player, amount) {
    const delta = Math.trunc(Number(amount) || 0);
    if (delta >= 0) {
      const repayment = Math.min(player.debt, delta);
      player.debt -= repayment;
      player.cash += delta - repayment;
      player.lifetimeIncome += delta;
    } else {
      const expense = Math.abs(delta);
      const paid = Math.min(player.cash, expense);
      player.cash -= paid;
      player.debt += expense - paid;
      player.lifetimeExpense += expense;
    }
    player.netWorth = player.cash - player.debt;
    return delta;
  }

  function moneyEvent(player, seed) {
    const definition = MONEY_EVENTS[seededInt(`${seed}:event`, 0, MONEY_EVENTS.length - 1)];
    const low = Math.min(definition.min, definition.max);
    const high = Math.max(definition.min, definition.max);
    let amount = seededInt(`${seed}:amount`, low, high);
    if (PLAYER_BY_ID[player.id]?.specialty === "chance") amount = Math.round(amount * 1.15);
    applyMoney(player, amount);
    return { type: "money", title: definition.title, detail: definition.detail, amount };
  }

  function chooseJob(player, space, seed) {
    const regionRank = Math.max(1, Math.min(9, space.regionIndex + 1));
    const specialtyBoost = PLAYER_BY_ID[player.id]?.specialty === "career" ? 1 : 0;
    const eligible = JOBS.filter((job) => job.rank <= regionRank + specialtyBoost && job.id !== "unemployed");
    if (seededUnit(`${seed}:unemployed`) < 0.04) return JOBS.find((job) => job.id === "unemployed");
    return eligible[seededInt(`${seed}:job`, 0, eligible.length - 1)] || JOBS[0];
  }

  function jobEvent(player, space, seed) {
    const previous = player.job;
    const offer = chooseJob(player, space, seed);
    const accepts = offer.rank >= previous.rank
      || PLAYER_BY_ID[player.id]?.strategy === "chaos"
      || seededUnit(`${seed}:accept`) < 0.22;
    if (accepts) player.job = clone(offer);
    const signingBonus = accepts && offer.rank > previous.rank ? offer.rank * 25000 : 0;
    if (signingBonus) applyMoney(player, signingBonus);
    return {
      type: "job",
      title: accepts ? `${offer.name}に${previous.id === offer.id ? "再任" : "転職"}！` : `${offer.name}からスカウト`,
      detail: accepts
        ? `給料は¥${offer.salary.toLocaleString("ja-JP")}。${signingBonus ? `契約金¥${signingBonus.toLocaleString("ja-JP")}も獲得！` : "新しい仕事が始まります。"}`
        : `${previous.name}を続ける決断をしました。`,
      amount: signingBonus,
      jobId: player.job.id
    };
  }

  function propertyDefinition(space, seed) {
    const tier = space.regionIndex + 1;
    const variation = seededInt(`${seed}:property`, 0, 3);
    const cost = Math.round((180000 + tier * 125000 + variation * 60000) / 10000) * 10000;
    return {
      id: `property-${space.number}-${variation}`,
      name: PROPERTY_NAMES[space.regionIndex],
      tier,
      purchasePrice: cost,
      value: cost,
      maintenance: Math.round(cost * 0.015),
      acquiredAtSpace: space.number
    };
  }

  function propertyEvent(player, space, seed) {
    const property = propertyDefinition(space, seed);
    const existing = player.assets.homes[property.id];
    if (existing) {
      const income = Math.round(existing.value * (0.05 + seededUnit(`${seed}:rent`) * 0.08));
      applyMoney(player, income);
      return { type: "property", title: `${existing.name}から臨時収入`, detail: `不動産収益として¥${income.toLocaleString("ja-JP")}を受け取りました。`, amount: income, propertyId: existing.id };
    }
    const wealthBias = PLAYER_BY_ID[player.id]?.specialty === "property" ? 1.25 : 1;
    const canBuy = player.cash >= property.purchasePrice / wealthBias;
    if (canBuy) {
      applyMoney(player, -property.purchasePrice);
      player.assets.homes[property.id] = property;
      return { type: "property", title: `${property.name}を購入！`, detail: `¥${property.purchasePrice.toLocaleString("ja-JP")}で新しい資産を手に入れました。`, amount: -property.purchasePrice, propertyId: property.id };
    }
    const viewingCost = Math.min(30000, Math.max(5000, Math.round(property.purchasePrice * 0.02)));
    applyMoney(player, -viewingCost);
    return { type: "property", title: `${property.name}を内見`, detail: `購入には届かず、諸費用¥${viewingCost.toLocaleString("ja-JP")}だけ支払いました。`, amount: -viewingCost, propertyId: property.id };
  }

  function updateMarket(state, seed, now) {
    state.market.cycle = (Number(state.market.cycle) || 0) + 1;
    Object.values(state.market.stocks).forEach((stock) => {
      const previous = Math.max(100, Number(stock.price) || 1000);
      const movement = (seededUnit(`${seed}:${stock.id}:market`) * 2 - 1) * (Number(stock.volatility) || 0.1);
      stock.previousPrice = previous;
      stock.price = Math.max(100, Math.round(previous * (1 + movement)));
      stock.change = (stock.price - previous) / previous;
    });
    state.market.updatedAt = Number(now);
  }

  function stockEvent(state, player, space, seed, now) {
    updateMarket(state, seed, now);
    const stocks = Object.values(state.market.stocks);
    const stock = stocks[seededInt(`${seed}:stock`, 0, stocks.length - 1)];
    const holding = player.assets.stocks[stock.id] || { id: stock.id, name: stock.name, shares: 0, invested: 0 };
    const strategy = PLAYER_BY_ID[player.id]?.strategy;
    const budgetRates = { steady: 0.08, aggressive: 0.25, chaos: 0.35, balanced: 0.14, growth: 0.2, wealth: 0.18 };
    const budget = Math.max(0, Math.floor(player.cash * (budgetRates[strategy] || 0.12)));
    if (stock.change < -0.045 && holding.shares > 0 && strategy !== "aggressive") {
      const shares = Math.max(1, Math.ceil(holding.shares / 2));
      const income = shares * stock.price;
      holding.shares -= shares;
      applyMoney(player, income);
      if (holding.shares) player.assets.stocks[stock.id] = holding;
      else delete player.assets.stocks[stock.id];
      return { type: "stock", title: `${stock.name}を売却`, detail: `${shares}株を売り、¥${income.toLocaleString("ja-JP")}を確保しました。`, amount: income, stockId: stock.id };
    }
    const shares = Math.floor(budget / stock.price);
    if (shares > 0) {
      const cost = shares * stock.price;
      holding.shares += shares;
      holding.invested += cost;
      player.assets.stocks[stock.id] = holding;
      applyMoney(player, -cost);
      return { type: "stock", title: `${stock.name}へ投資`, detail: `${shares}株を¥${cost.toLocaleString("ja-JP")}で購入。株価は${stock.change >= 0 ? "+" : ""}${Math.round(stock.change * 1000) / 10}%です。`, amount: -cost, stockId: stock.id };
    }
    return { type: "stock", title: `${stock.name}を観察`, detail: `株価は¥${stock.price.toLocaleString("ja-JP")}。今回は資金を温存しました。`, amount: 0, stockId: stock.id };
  }

  function integrationEvent(state, player, space, seed, now) {
    const amount = seededInt(`${seed}:integration`, 30, 120);
    const mapping = {
      monster: { key: "monsterExp", title: "モンスター特訓成功", detail: `手持ちモンスターへ経験値${amount}を予約しました。` },
      equipment: { key: "equipment", title: "装備ガチャ券発見", detail: "装備ガチャを1回獲得しました。" },
      city: { key: "cityMoney", title: "BINGO CITYへ投資", detail: `都市資金へ¥${(amount * 100).toLocaleString("ja-JP")}を送りました。` },
      territory: { key: "territoryRecovery", title: "領土戦へ補給隊到着", detail: `負傷待機を${amount}分短縮し、守備隊を回復します。` },
      tower: { key: "towerRestMinutes", title: "TOWERへ休息の加護", detail: `休養時間を${amount}分短縮し、登頂部隊を回復します。` }
    };
    const definition = mapping[space.category];
    const rewardId = `life-reward:${player.id}:${seed}:${space.number}`;
    if (space.category === "equipment") {
      state.rewardQueue[rewardId] = { id: rewardId, playerId: player.id, type: "equipment", count: 1, createdAt: Number(now) };
      player.assets.equipmentGacha.push({ id: rewardId, checkpoint: 0, count: 1, status: "pending", createdAt: Number(now) });
    } else {
      const value = space.category === "city" ? amount * 100 : amount;
      player.integrationRewards[definition.key] += value;
      state.rewardQueue[rewardId] = { id: rewardId, playerId: player.id, type: definition.key, amount: value, createdAt: Number(now) };
    }
    return { type: space.category, title: definition.title, detail: definition.detail, amount: 0, rewardId };
  }

  function interactionEvent(state, player, seed) {
    const targets = PLAYERS.filter((candidate) => candidate.id !== player.id);
    const targetDefinition = targets[seededInt(`${seed}:target`, 0, targets.length - 1)];
    const target = state.players[targetDefinition.id];
    const amount = seededInt(`${seed}:gift`, 40000, 180000);
    const win = seededUnit(`${seed}:direction`) >= 0.5;
    if (win) {
      applyMoney(target, -amount);
      applyMoney(player, amount);
    } else {
      applyMoney(player, -amount);
      applyMoney(target, amount);
    }
    target.updatedAt = Number(state.updatedAt) || Date.now();
    return {
      type: "interaction",
      title: win ? `${target.name}との勝負に勝利！` : `${target.name}へごちそう`,
      detail: win ? `人生ゲーム対決で¥${amount.toLocaleString("ja-JP")}を獲得しました。` : `豪快に¥${amount.toLocaleString("ja-JP")}を振る舞いました。`,
      amount: win ? amount : -amount,
      targetPlayerId: target.id
    };
  }

  function riskEvent(player, seed) {
    const stake = seededInt(`${seed}:stake`, 120000, 600000);
    const chance = PLAYER_BY_ID[player.id]?.specialty === "chance" ? 0.58 : 0.46;
    const won = seededUnit(`${seed}:result`) < chance;
    const amount = won ? Math.round(stake * 1.4) : -stake;
    applyMoney(player, amount);
    return {
      type: "risk",
      title: won ? "一発逆転、大成功！" : "大勝負に敗北…",
      detail: `${won ? "勝負を制して" : "勝負に敗れて"}¥${Math.abs(amount).toLocaleString("ja-JP")} ${won ? "獲得" : "損失"}しました。`,
      amount
    };
  }

  function placeholderEvent(player, space, seed) {
    const rewards = {
      job: [25000, 85000], property: [-90000, 140000], stock: [-120000, 180000],
      monster: [10000, 50000], equipment: [15000, 70000], city: [20000, 90000],
      territory: [20000, 90000], tower: [20000, 90000],
      interaction: [-50000, 90000], risk: [-350000, 500000]
    };
    const range = rewards[space.category] || [-20000, 40000];
    const amount = seededInt(`${seed}:${space.category}`, range[0], range[1]);
    applyMoney(player, amount);
    return {
      type: space.category,
      title: space.title,
      detail: `${REGIONS[space.regionIndex].name}で新しい人生イベントが発生しました。`,
      amount
    };
  }

  function resolveLandingEvent(state, player, space, seed, now) {
    if (space.category === "money") return moneyEvent(player, seed);
    if (space.category === "job") return jobEvent(player, space, seed);
    if (space.category === "property") return propertyEvent(player, space, seed);
    if (space.category === "stock") return stockEvent(state, player, space, seed, now);
    if (["monster", "equipment", "city", "territory", "tower"].includes(space.category)) return integrationEvent(state, player, space, seed, now);
    if (space.category === "interaction") return interactionEvent(state, player, seed);
    if (space.category === "risk") return riskEvent(player, seed);
    return placeholderEvent(player, space, seed);
  }

  function processPaydays(player, totalBefore, totalAfter) {
    const crossed = Math.floor(totalAfter / 25) - Math.floor(totalBefore / 25);
    if (crossed <= 0) return [];
    const events = [];
    for (let index = 0; index < crossed; index += 1) {
      const salary = Math.max(0, Number(player.job?.salary) || 0);
      player.paydays += 1;
      if (salary) applyMoney(player, salary);
      events.push({
        type: "payday",
        title: salary ? `${player.job.name} 給料日` : "自由すぎる給料日",
        detail: salary ? `給料¥${salary.toLocaleString("ja-JP")}を受け取りました。` : "収入はゼロ。でも時間はたっぷりあります。",
        amount: salary
      });
    }
    return events;
  }

  function runServerTick(state, at) {
    const cycle = (Number(state.serverCycle) || 0) + 1;
    updateMarket(state, `life-server:${cycle}:${at}`, at);
    PLAYERS.forEach((definition) => {
      const player = state.players[definition.id];
      const properties = Object.values(player.assets?.homes || {});
      const rent = properties.reduce((sum, property) => sum + Math.round((Number(property.value) || 0) * .002), 0);
      const upkeep = properties.reduce((sum, property) => sum + Math.round((Number(property.value) || 0) * .0005), 0);
      const interest = Math.round((Number(player.debt) || 0) * .0015);
      if (interest > 0) {
        player.debt += interest;
        player.lifetimeExpense += interest;
      }
      const propertyIncome = rent - upkeep;
      if (propertyIncome) applyMoney(player, propertyIncome);
      updateNetWorth(player, state.market);
      if (propertyIncome || interest) {
        const space = BOARD[Math.max(0, (Number(player.position) || 1) - 1)];
        addEvent(state, player, `server:${cycle}:${player.id}`, space, {
          type: "passive",
          title: "オフライン人生決算",
          detail: `不動産収支 ${propertyIncome >= 0 ? "+" : ""}¥${propertyIncome.toLocaleString("ja-JP")} / 借金利息 -¥${interest.toLocaleString("ja-JP")}`,
          amount: propertyIncome - interest
        }, at);
      }
      player.updatedAt = Number(at);
    });
    state.serverCycle = cycle;
    state.lastServerTickAt = Number(at);
    state.nextServerTickAt = Number(at) + SERVER_TICK_MS;
    state.globalHistory = trimMap(state.globalHistory, MAX_HISTORY);
    state.revision = (Number(state.revision) || 0) + 1;
    state.updatedAt = Number(at);
  }

  function advanceServerState(value, now = Date.now(), options = {}) {
    const state = normalizeState(value, now);
    const maxTicks = Math.max(1, Math.min(240, Math.trunc(Number(options.maxTicks) || 120)));
    let processed = 0;
    while (state.nextServerTickAt <= Number(now) && processed < maxTicks) {
      runServerTick(state, state.nextServerTickAt);
      processed += 1;
    }
    return { state, processed, caughtUp: state.nextServerTickAt > Number(now) };
  }

  function checkpointGachaCount(player) {
    const worth = player.cash - player.debt;
    if (worth < 0) return 1;
    if (worth < 500000) return 2;
    if (worth < 2000000) return 3;
    if (worth < 10000000) return 5;
    return 8;
  }

  function checkpointEvent(state, player, space, seed, now) {
    const count = checkpointGachaCount(player);
    const record = {
      id: `gacha-${seed}-${space.number}`,
      checkpoint: space.number,
      count,
      status: "pending",
      createdAt: Number(now)
    };
    player.assets.equipmentGacha.push(record);
    player.assets.equipmentGacha = player.assets.equipmentGacha.slice(-100);
    state.rewardQueue[record.id] = {
      id: record.id,
      playerId: player.id,
      type: "equipment",
      count,
      checkpoint: space.number,
      status: "pending",
      createdAt: Number(now)
    };
    return {
      type: "checkpoint",
      title: `${REGIONS[space.regionIndex].name} 到達！`,
      detail: `所持金ランクにより装備ガチャを${count}回獲得しました。`,
      amount: 0,
      equipmentDraws: count,
      rewardId: record.id
    };
  }

  function addEvent(state, player, rollId, space, event, now) {
    const id = `${rollId}:${space.number}:${event.type}`;
    const entry = {
      id,
      playerId: player.id,
      playerName: player.name,
      space: space.number,
      regionId: space.regionId,
      category: event.type,
      title: event.title,
      detail: event.detail,
      amount: Number(event.amount) || 0,
      equipmentDraws: Number(event.equipmentDraws) || 0,
      ...(event.jobId ? { jobId: event.jobId } : {}),
      ...(event.propertyId ? { propertyId: event.propertyId } : {}),
      ...(event.stockId ? { stockId: event.stockId } : {}),
      ...(event.rewardId ? { rewardId: event.rewardId } : {}),
      ...(event.targetPlayerId ? { targetPlayerId: event.targetPlayerId } : {}),
      createdAt: Number(now)
    };
    player.assets.eventHistory.push(entry);
    player.assets.eventHistory = player.assets.eventHistory.slice(-MAX_HISTORY);
    state.globalHistory[id] = entry;
    return entry;
  }

  function crossedCheckpoints(totalBefore, totalAfter) {
    const output = [];
    const first = Math.floor(totalBefore / REGION_SIZE) + 1;
    const last = Math.floor(totalAfter / REGION_SIZE);
    for (let checkpointIndex = first; checkpointIndex <= last; checkpointIndex += 1) {
      const boardNumber = ((checkpointIndex * REGION_SIZE - 1) % BOARD_SIZE) + 1;
      output.push(BOARD[boardNumber - 1]);
    }
    return output;
  }

  function applyOpenRoll(value, payload = {}, now = Date.now()) {
    const state = normalizeState(value, now);
    if (payload.testMode) return { state, applied: false, testMode: true };
    const openId = String(payload.id || "").trim();
    if (!openId) return { state, applied: false, error: "OPEN IDがありません。" };
    if (state.processedOpens[openId]) return { state, applied: false, duplicate: true };
    const definition = playerForName(payload.playerName);
    if (!definition) return { state, applied: false, ignored: true, error: "固定メンバーではありません。" };
    const player = state.players[definition.id];
    const die = seededInt(`${openId}:${definition.id}:die`, 1, 6);
    const totalBefore = player.totalSpaces;
    const totalAfter = totalBefore + die;
    const position = totalAfter % BOARD_SIZE;
    const landing = BOARD[position === 0 ? BOARD_SIZE - 1 : position - 1];
    const events = [];

    processPaydays(player, totalBefore, totalAfter).forEach((event, index) => {
      const paydaySpace = BOARD[Math.max(0, Math.min(BOARD_SIZE - 1, landing.index - index))];
      events.push(addEvent(state, player, openId, paydaySpace, event, now));
    });

    crossedCheckpoints(totalBefore, totalAfter).forEach((space) => {
      events.push(addEvent(state, player, openId, space, checkpointEvent(state, player, space, openId, now), now));
    });
    if (!landing.checkpoint) {
      const event = resolveLandingEvent(state, player, landing, `${openId}:${landing.number}`, now);
      events.push(addEvent(state, player, openId, landing, event, now));
    }

    player.totalSpaces = totalAfter;
    player.position = position;
    player.lap = Math.floor(totalAfter / BOARD_SIZE);
    player.maxSpace = Math.max(player.maxSpace, Math.min(BOARD_SIZE, totalAfter));
    player.rolls += 1;
    player.lastRoll = {
      id: openId,
      die,
      from: totalBefore % BOARD_SIZE,
      to: position,
      landingSpace: landing.number,
      matchId: String(payload.matchId || ""),
      characterId: Number(payload.characterId) || null,
      team: payload.team === "red" || payload.team === "blue" ? payload.team : "",
      createdAt: Number(now)
    };
    player.updatedAt = Number(now);
    PLAYERS.forEach((candidate) => updateNetWorth(state.players[candidate.id], state.market));
    state.processedOpens[openId] = { playerId: player.id, createdAt: Number(now) };
    state.processedOpens = trimMap(state.processedOpens, MAX_PROCESSED_OPENS);
    state.globalHistory = trimMap(state.globalHistory, MAX_HISTORY);
    state.revision += 1;
    state.updatedAt = Number(now);
    return { state, applied: true, playerId: player.id, die, landing, events };
  }

  function buildOpenId(payload = {}) {
    const matchId = String(payload.matchId || "").trim();
    const player = playerForName(payload.playerName);
    const team = payload.team === "red" || payload.team === "blue" ? payload.team : "team";
    const cellIndex = Number.isInteger(Number(payload.cellIndex)) ? Number(payload.cellIndex) : -1;
    if (!matchId || !player || cellIndex < 0) return "";
    return `life-open:${matchId}:${team}:${cellIndex}:${player.id}`;
  }

  function boardCategoryCounts(board = BOARD) {
    return board.reduce((counts, space) => {
      counts[space.category] = (counts[space.category] || 0) + 1;
      return counts;
    }, {});
  }

  const api = {
    VERSION, BOARD_SIZE, REGION_SIZE, MAX_HISTORY, MAX_PROCESSED_OPENS, STARTING_CASH, SERVER_TICK_MS,
    PLAYERS, PLAYER_BY_ID, REGIONS, CATEGORY_COUNTS, STOCKS, JOBS, PROPERTY_NAMES, MONEY_EVENTS, BOARD,
    clone, playerKey, playerForName, hash32, seededUnit, seededInt, deterministicShuffle,
    generateBoard, boardCategoryCounts, createInitialState, normalizeState, checkpointGachaCount,
    applyMoney, assetValue, updateNetWorth, chooseJob, propertyDefinition, updateMarket, processPaydays,
    advanceServerState, applyOpenRoll, buildOpenId
  };

  global.TeamBingoLifeBoardSystem = api;
})(typeof window !== "undefined" ? window : globalThis);
