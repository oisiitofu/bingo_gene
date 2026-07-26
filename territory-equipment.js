(function bootstrapTerritoryEquipment(global) {
  "use strict";

  const SLOTS = Object.freeze([
    { id: "weapon", name: "武器", mark: "剣" },
    { id: "armor", name: "防具", mark: "盾" },
    { id: "accessory", name: "アクセサリー", mark: "宝" }
  ]);

  const RARITIES = Object.freeze([
    { id: "common", name: "コモン", color: "#aeb8c5", rank: 1, chance: .67, prefix: "旅人の", power: 10, conditionalPercent: 1 },
    { id: "rare", name: "レア", color: "#45a7ff", rank: 2, chance: .219, prefix: "蒼紋の", power: 25, conditionalPercent: 2 },
    { id: "epic", name: "エピック", color: "#c86cff", rank: 3, chance: .08, prefix: "王家の", power: 50, conditionalPercent: 3 },
    { id: "mythic", name: "ミシック", color: "#ff5b87", rank: 4, chance: .03, prefix: "覇王の", power: 90, conditionalPercent: 5 },
    { id: "legendary", name: "レジェンダリー", color: "#ffcf3d", rank: 5, chance: .001, prefix: "神話の", power: 240, conditionalPercent: 12 }
  ]);

  const SLOT_BY_ID = Object.freeze(Object.fromEntries(SLOTS.map((slot) => [slot.id, slot])));
  const RARITY_BY_ID = Object.freeze(Object.fromEntries(RARITIES.map((rarity) => [rarity.id, rarity])));
  const ROLE_NAMES = Object.freeze({
    guardian: "守護",
    striker: "強襲",
    mystic: "魔導",
    speedster: "疾走",
    support: "支援"
  });
  const ELEMENT_NAMES = Object.freeze({
    fire: "炎",
    water: "水",
    lightning: "雷",
    ice: "氷",
    earth: "地",
    wind: "風",
    light: "光",
    dark: "闇"
  });
  const STAT_NAMES = Object.freeze({
    hp: "HP",
    attack: "攻撃",
    defense: "防御",
    magic: "魔力",
    magicDefense: "魔防",
    speed: "素早さ"
  });

  const ITEM_ARCHETYPES = Object.freeze({
    weapon: [
      { id: "blade", name: "闘志の剣", stats: { attack: 1 }, role: "striker" },
      { id: "staff", name: "星読みの杖", stats: { magic: 1 }, role: "mystic" },
      { id: "bow", name: "疾風の弓", stats: { speed: 1, attack: 1 }, role: "speedster" },
      { id: "hammer", name: "城壁の槌", stats: { attack: 1, defense: 1 }, role: "guardian" },
      { id: "scepter", name: "祈願の錫杖", stats: { magic: 1, magicDefense: 1 }, role: "support" },
      { id: "element-edge", name: "精霊の刃", stats: { attack: 1, magic: 1 }, element: "fire" }
    ],
    armor: [
      { id: "plate", name: "重騎士鎧", stats: { defense: 1, hp: 2 }, role: "guardian" },
      { id: "robe", name: "月影の法衣", stats: { magicDefense: 1, magic: 1 }, role: "mystic" },
      { id: "coat", name: "先陣の外套", stats: { speed: 1, defense: 1 }, role: "speedster" },
      { id: "mail", name: "猛攻の鎖帷子", stats: { defense: 1, attack: 1 }, role: "striker" },
      { id: "vestment", name: "癒し手の聖衣", stats: { magicDefense: 1, hp: 2 }, role: "support" },
      { id: "ward", name: "精霊結界衣", stats: { defense: 1, magicDefense: 1 }, element: "water" }
    ],
    accessory: [
      { id: "fang", name: "勇猛の牙飾り", stats: { attack: 1 }, role: "striker" },
      { id: "orb", name: "叡智の宝珠", stats: { magic: 1 }, role: "mystic" },
      { id: "feather", name: "瞬脚の羽根", stats: { speed: 1 }, role: "speedster" },
      { id: "crest", name: "不落の紋章", stats: { defense: 1 }, role: "guardian" },
      { id: "bell", name: "祝福の鈴", stats: { hp: 2, magicDefense: 1 }, role: "support" },
      { id: "prism", name: "八彩のプリズム", stats: { speed: 1, magic: 1 }, element: "light" }
    ]
  });

  const LEGENDARY_NAMES = Object.freeze({
    "weapon-blade": "天剣アマツカゼ",
    "weapon-staff": "星葬杖ルミナリア",
    "weapon-bow": "神速弓トワノツバサ",
    "weapon-hammer": "覇城槌グランバルト",
    "weapon-scepter": "聖王錫エリュシオン",
    "weapon-element-edge": "八竜刃インフィニティ",
    "armor-plate": "神塞鎧アイギス",
    "armor-robe": "星海法衣アストレア",
    "armor-coat": "時渡りの外套",
    "armor-mail": "覇軍鎖装ヴァリアント",
    "armor-vestment": "生命樹の聖衣",
    "armor-ward": "八精霊の結界衣",
    "accessory-fang": "竜王の牙",
    "accessory-orb": "万象の宝珠",
    "accessory-feather": "刻越えの神羽",
    "accessory-crest": "六王の紋章",
    "accessory-bell": "創世の祝福鈴",
    "accessory-prism": "虹界のプリズム"
  });
  const ITEM_ORIGINS = Object.freeze([
    "暁", "黄昏", "星海", "深森", "紅蓮", "蒼天", "雷鳴", "氷晶", "大地", "月影",
    "陽光", "冥府", "古代", "未来", "王都", "辺境", "天空", "深淵", "夢幻", "六王"
  ]);
  const ITEM_EPITHETS = Object.freeze([
    "零式", "改", "真打", "守護式", "強襲式", "魔導式", "疾走式", "支援式", "共鳴型", "覚醒型",
    "天穿", "地砕", "海割", "風断", "光臨", "常闇", "不滅", "無双", "継承", "極"
  ]);
  const ELEMENT_IDS = Object.freeze(Object.keys(ELEMENT_NAMES));
  const SECONDARY_STATS = Object.freeze(["hp", "attack", "defense", "magic", "magicDefense", "speed"]);
  const ITEMS_PER_RARITY = 200;
  const MANUAL_SEPARATOR = "|";

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function hashText(value) {
    let hash = 2166136261;
    for (const char of String(value || "")) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let value = hashText(seed) || 1;
    return () => {
      value += 0x6D2B79F5;
      let mixed = value;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  function scaledStats(source, rarityRank, slot, variant = 0) {
    const result = {};
    const rankBonus = [0, 0, 1, 2, 4, 12][rarityRank] || 0;
    Object.entries(source || {}).forEach(([stat, base]) => {
      const scale = stat === "hp" ? 2 : 1;
      result[stat] = Math.max(1, Math.round(Number(base) * scale + rankBonus * (stat === "hp" ? 2 : 1)));
    });
    if (!Object.keys(result).length) {
      result[slot === "weapon" ? "attack" : (slot === "armor" ? "defense" : "speed")] = Math.max(1, rankBonus);
    }
    if (variant > 0 && variant % 3 === 0) {
      const secondary = SECONDARY_STATS[(variant + rarityRank) % SECONDARY_STATS.length];
      const amount = rarityRank === 5 ? (secondary === "hp" ? 10 : 5) : (secondary === "hp" ? 2 : 1);
      result[secondary] = (Number(result[secondary]) || 0) + amount;
    }
    return result;
  }

  function describeItem(item) {
    const stats = Object.entries(item.stats)
      .map(([stat, value]) => `${STAT_NAMES[stat] || stat}+${value}`)
      .join(" / ");
    const condition = item.attackType
      ? `${item.attackType === "magic" ? "魔法" : "物理"}タイプなら戦力+${item.conditionalPercent}%`
      : (item.role
        ? `${ROLE_NAMES[item.role] || item.role}型なら戦力+${item.conditionalPercent}%`
        : `${ELEMENT_NAMES[item.element] || item.element}属性なら戦力+${item.conditionalPercent}%`);
    return `${stats}。${condition}`;
  }

  function createCatalog() {
    const items = [];
    const usedNames = new Set();
    RARITIES.forEach((rarity) => {
      for (let itemIndex = 0; itemIndex < ITEMS_PER_RARITY; itemIndex += 1) {
        const legacy = itemIndex < 18;
        const variant = legacy ? 0 : itemIndex - 17;
        const slot = legacy
          ? SLOTS[Math.floor(itemIndex / 6)]
          : SLOTS[(itemIndex - 18) % SLOTS.length];
        const archetypes = ITEM_ARCHETYPES[slot.id];
        const archetypeIndex = legacy
          ? itemIndex % 6
          : (Math.floor((itemIndex - 18) / SLOTS.length) + rarity.rank) % archetypes.length;
        const archetype = archetypes[archetypeIndex];
        const id = legacy
          ? `${rarity.id}-${slot.id}-${archetype.id}`
          : `${rarity.id}-${slot.id}-${archetype.id}-v${String(variant).padStart(3, "0")}`;
        const origin = ITEM_ORIGINS[(variant + rarity.rank * 3 + archetypeIndex) % ITEM_ORIGINS.length];
        const epithet = ITEM_EPITHETS[(variant * 3 + rarity.rank + archetypeIndex) % ITEM_EPITHETS.length];
        const legendaryName = LEGENDARY_NAMES[`${slot.id}-${archetype.id}`];
        const conditionMode = (variant + archetypeIndex) % 5;
        const roleCondition = conditionMode <= 1 ? (archetype.role || "") : "";
        const attackTypeCondition = conditionMode === 2 ? ((variant + rarity.rank) % 2 ? "physical" : "magic") : "";
        const elementCondition = !roleCondition && !attackTypeCondition
          ? (archetype.element || ELEMENT_IDS[(variant + rarity.rank * 2 + archetypeIndex) % ELEMENT_IDS.length])
          : "";
        const baseName = rarity.id === "legendary" && legacy
          ? legendaryName
          : (legacy ? `${rarity.prefix}${archetype.name}` : `${rarity.prefix}${origin}${archetype.name}${epithet}`);
        const item = {
          id,
          slot: slot.id,
          rarity: rarity.id,
          name: usedNames.has(baseName) ? `${baseName}・${String(itemIndex + 1).padStart(3, "0")}` : baseName,
          stats: scaledStats(archetype.stats, rarity.rank, slot.id, variant),
          role: roleCondition,
          element: elementCondition,
          attackType: attackTypeCondition,
          conditionalPercent: rarity.conditionalPercent,
          sort: rarity.rank * 100000 + itemIndex
        };
        usedNames.add(item.name);
        item.description = describeItem(item);
        items.push(Object.freeze(item));
      }
    });
    return Object.freeze(items);
  }

  const ITEMS = createCatalog();
  const ITEM_BY_ID = Object.freeze(Object.fromEntries(ITEMS.map((item) => [item.id, item])));
  const ITEMS_BY_RARITY = Object.freeze(Object.fromEntries(RARITIES.map((rarity) => [
    rarity.id,
    Object.freeze(ITEMS.filter((item) => item.rarity === rarity.id))
  ])));
  const ITEMS_BY_SLOT = Object.freeze(Object.fromEntries(SLOTS.map((slot) => [
    slot.id,
    Object.freeze(ITEMS.filter((item) => item.slot === slot.id))
  ])));
  const STARTER_ITEMS = Object.freeze({
    "common-weapon-blade": 2,
    "common-weapon-staff": 2,
    "common-weapon-bow": 2,
    "common-armor-plate": 2,
    "common-armor-robe": 2,
    "common-armor-coat": 2,
    "common-accessory-fang": 2,
    "common-accessory-orb": 2,
    "common-accessory-feather": 2
  });

  function normalizeCountMap(value) {
    const result = {};
    Object.entries(value || {}).forEach(([id, count]) => {
      if (!ITEM_BY_ID[id]) return;
      const amount = Math.max(0, Math.floor(Number(count) || 0));
      if (amount) result[id] = amount;
    });
    return result;
  }

  function effectiveInventory(record = {}) {
    const result = normalizeCountMap(record.territoryEquipment);
    Object.entries(STARTER_ITEMS).forEach(([id, count]) => {
      result[id] = Math.max(Number(result[id]) || 0, count);
    });
    return result;
  }

  function ensureStarterRecord(record = {}) {
    record.territoryEquipment = effectiveInventory(record);
    record.territoryItemDex = normalizeCountMap(record.territoryItemDex);
    record.territoryManualEquipment = normalizeManualEquipment(record.territoryManualEquipment);
    Object.keys(STARTER_ITEMS).forEach((id) => {
      record.territoryItemDex[id] = Math.max(1, Number(record.territoryItemDex[id]) || 0);
    });
    record.territoryRewardRarity = { ...(record.territoryRewardRarity || {}) };
    return record;
  }

  function rarityRoll(random = Math.random) {
    const value = random();
    let cursor = 0;
    for (let index = RARITIES.length - 1; index >= 0; index -= 1) {
      const rarity = RARITIES[index];
      cursor += rarity.chance;
      if (value < cursor) return rarity;
    }
    return RARITY_BY_ID.common;
  }

  function generateRewards(seed, count) {
    const random = seededRandom(seed);
    const rewards = {};
    const total = Math.max(0, Math.min(40, Math.floor(Number(count) || 0)));
    for (let index = 0; index < total; index += 1) {
      const rarity = rarityRoll(random);
      const pool = ITEMS_BY_RARITY[rarity.id];
      const item = pool[Math.floor(random() * pool.length)];
      rewards[item.id] = (rewards[item.id] || 0) + 1;
    }
    return rewards;
  }

  function applyRewards(record, rewards) {
    ensureStarterRecord(record);
    Object.entries(rewards || {}).forEach(([id, count]) => {
      const item = ITEM_BY_ID[id];
      const amount = Math.max(0, Math.floor(Number(count) || 0));
      if (!item || !amount) return;
      record.territoryEquipment[id] = (Number(record.territoryEquipment[id]) || 0) + amount;
      record.territoryItemDex[id] = (Number(record.territoryItemDex[id]) || 0) + amount;
      record.territoryRewardRarity[item.rarity] = (Number(record.territoryRewardRarity[item.rarity]) || 0) + amount;
      record.territoryEquipmentDrops = (Number(record.territoryEquipmentDrops) || 0) + amount;
    });
    return record;
  }

  function rewardCountForMatch(options = {}) {
    const lines = Math.max(0, Number(options.bingoLines) || 0);
    const monsterCount = Math.max(1, Number(options.totalMonsterCount) || 1);
    const opens = Math.max(0, Number(options.opens) || 0);
    const base = 1 + lines + Math.floor(Math.sqrt(monsterCount) / 4) + Math.floor(opens / 5);
    return Math.max(2, Math.min(12, base + (options.won ? 3 : 0) + (options.mvp ? 1 : 0)));
  }

  function rewardCountForSeason(result = {}, rank = 6) {
    const performance = Math.floor((Number(result.wins) || 0) / 8) +
      Math.floor((Number(result.captures) || 0) / 6) +
      Math.floor((Number(result.points) || 0) / 500);
    const placement = [10, 7, 5, 3, 2, 1][Math.max(0, Math.min(5, Number(rank) - 1))] || 1;
    return Math.max(5, Math.min(24, 5 + placement + performance));
  }

  function scoreItem(item, monster) {
    const stats = global.TeamBingoMonsterSystem?.combatStats?.(monster.nodeId) || {};
    const attackType = stats.attackType || "physical";
    const primary = attackType === "magic" ? "magic" : "attack";
    let score = RARITY_BY_ID[item.rarity].power;
    Object.entries(item.stats).forEach(([stat, value]) => {
      const weight = stat === primary ? 2.2 : (stat === "hp" ? .45 : 1);
      score += Number(value) * weight;
    });
    if (item.role && item.role === monster.role) score += 18;
    if (item.element && item.element === monster.element) score += 14;
    if (item.attackType && item.attackType === attackType) score += 16;
    return score;
  }

  function manualKey(nodeId, slot, itemId) {
    return [nodeId, slot, itemId].map((value) => String(value || "")).join(MANUAL_SEPARATOR);
  }

  function normalizeManualEquipment(value = {}) {
    const result = {};
    Object.entries(value || {}).forEach(([key, enabled]) => {
      if (!(Number(enabled) > 0)) return;
      const [nodeId, slot, itemId] = String(key).split(MANUAL_SEPARATOR);
      if (!nodeId || !SLOT_BY_ID[slot] || ITEM_BY_ID[itemId]?.slot !== slot) return;
      result[manualKey(nodeId, slot, itemId)] = 1;
    });
    return result;
  }

  function manualLoadouts(record = {}) {
    const result = {};
    Object.keys(normalizeManualEquipment(record.territoryManualEquipment)).forEach((key) => {
      const [nodeId, slot, itemId] = key.split(MANUAL_SEPARATOR);
      result[nodeId] ||= {};
      if (!result[nodeId][slot]) result[nodeId][slot] = itemId;
    });
    return result;
  }

  function manualItemCounts(record = {}, ignoreNodeId = "", ignoreSlot = "") {
    const result = {};
    Object.entries(manualLoadouts(record)).forEach(([nodeId, loadout]) => {
      Object.entries(loadout).forEach(([slot, itemId]) => {
        if (nodeId === ignoreNodeId && slot === ignoreSlot) return;
        result[itemId] = (result[itemId] || 0) + 1;
      });
    });
    return result;
  }

  function availableManualCount(record, itemId, nodeId = "", slot = "") {
    const inventory = effectiveInventory(record);
    const used = manualItemCounts(record, nodeId, slot);
    return Math.max(0, (Number(inventory[itemId]) || 0) - (Number(used[itemId]) || 0));
  }

  function clearManualAssignment(record, nodeId = "", slot = "") {
    record.territoryManualEquipment = normalizeManualEquipment(record.territoryManualEquipment);
    Object.keys(record.territoryManualEquipment).forEach((key) => {
      const [currentNodeId, currentSlot] = key.split(MANUAL_SEPARATOR);
      if (nodeId && currentNodeId !== nodeId) return;
      if (slot && currentSlot !== slot) return;
      delete record.territoryManualEquipment[key];
    });
    return record.territoryManualEquipment;
  }

  function setManualItem(record, nodeId, slot, itemId = "") {
    ensureStarterRecord(record);
    if (!nodeId || !SLOT_BY_ID[slot]) return false;
    if (!itemId) {
      clearManualAssignment(record, nodeId, slot);
      return true;
    }
    const item = ITEM_BY_ID[itemId];
    if (!item || item.slot !== slot || availableManualCount(record, itemId, nodeId, slot) < 1) return false;
    clearManualAssignment(record, nodeId, slot);
    record.territoryManualEquipment[manualKey(nodeId, slot, itemId)] = 1;
    return true;
  }

  function autoAssign(monsters, record = {}) {
    const remaining = effectiveInventory(record);
    const assignments = {};
    const manual = manualLoadouts(record);
    const sortedMonsters = [...(monsters || [])]
      .filter((monster) => monster?.nodeId && monster.nodeId !== "egg")
      .sort((a, b) => (Number(b.score) || Number(b.power) || 0) - (Number(a.score) || Number(a.power) || 0));
    sortedMonsters.forEach((monster) => {
      assignments[monster.nodeId] = {};
      SLOTS.forEach((slot) => {
        const itemId = manual[monster.nodeId]?.[slot.id];
        if (!itemId || !(Number(remaining[itemId]) > 0)) return;
        assignments[monster.nodeId][slot.id] = itemId;
        remaining[itemId] -= 1;
      });
    });
    sortedMonsters.forEach((monster) => {
        SLOTS.forEach((slot) => {
          if (assignments[monster.nodeId][slot.id]) return;
          let item = null;
          let bestScore = -Infinity;
          ITEMS_BY_SLOT[slot.id].forEach((candidate) => {
            if (!(Number(remaining[candidate.id]) > 0)) return;
            const candidateScore = scoreItem(candidate, monster);
            if (candidateScore > bestScore || (candidateScore === bestScore && candidate.sort > (item?.sort || -1))) {
              item = candidate;
              bestScore = candidateScore;
            }
          });
          if (!item) return;
          assignments[monster.nodeId][slot.id] = item.id;
          remaining[item.id] -= 1;
        });
    });
    return assignments;
  }

  function normalizeLoadout(value = {}) {
    const result = {};
    SLOTS.forEach((slot) => {
      const id = String(value?.[slot.id] || "");
      if (ITEM_BY_ID[id]?.slot === slot.id) result[slot.id] = id;
    });
    return result;
  }

  function applyEquipmentStats(baseStats, loadout, nodeId) {
    const result = { ...(baseStats || {}) };
    const monsterStats = global.TeamBingoMonsterSystem?.combatStats?.(nodeId) || {};
    Object.values(normalizeLoadout(loadout)).forEach((id) => {
      const item = ITEM_BY_ID[id];
      Object.entries(item.stats).forEach(([stat, value]) => {
        result[stat] = Math.max(1, Math.round((Number(result[stat]) || 0) + Number(value)));
      });
      const matches = (item.role && item.role === monsterStats.role) ||
        (item.element && item.element === monsterStats.element) ||
        (item.attackType && item.attackType === monsterStats.attackType);
      if (matches) {
        const primary = monsterStats.attackType === "magic" ? "magic" : "attack";
        result[primary] = Math.max(1, Math.round((Number(result[primary]) || 0) + item.conditionalPercent));
      }
    });
    return result;
  }

  function equipmentMultiplier(monster) {
    const loadout = normalizeLoadout(monster?.equipment);
    const attackType = monster?.attackType || global.TeamBingoMonsterSystem?.combatStats?.(monster?.nodeId)?.attackType || "";
    let multiplier = 1;
    Object.values(loadout).forEach((id) => {
      const item = ITEM_BY_ID[id];
      if (!item) return;
      if (
        (item.role && item.role === monster.role) ||
        (item.element && item.element === monster.element) ||
        (item.attackType && item.attackType === attackType)
      ) {
        multiplier += item.conditionalPercent / 100;
      }
    });
    return Math.min(1.4, multiplier);
  }

  function loadoutItems(loadout) {
    return SLOTS.map((slot) => ITEM_BY_ID[loadout?.[slot.id]]).filter(Boolean);
  }

  global.TeamBingoTerritoryEquipment = Object.freeze({
    SLOTS,
    SLOT_BY_ID,
    RARITIES,
    RARITY_BY_ID,
    ITEMS,
    ITEM_BY_ID,
    ITEMS_BY_RARITY,
    ITEMS_BY_SLOT,
    STARTER_ITEMS,
    clone,
    hashText,
    seededRandom,
    normalizeCountMap,
    effectiveInventory,
    ensureStarterRecord,
    rarityRoll,
    generateRewards,
    applyRewards,
    rewardCountForMatch,
    rewardCountForSeason,
    scoreItem,
    manualKey,
    normalizeManualEquipment,
    manualLoadouts,
    manualItemCounts,
    availableManualCount,
    clearManualAssignment,
    setManualItem,
    autoAssign,
    normalizeLoadout,
    applyEquipmentStats,
    equipmentMultiplier,
    loadoutItems
  });
})(typeof window !== "undefined" ? window : globalThis);
