(function bootstrapTerritoryEquipment(global) {
  "use strict";

  const SLOTS = Object.freeze([
    { id: "weapon", name: "武器", mark: "剣" },
    { id: "armor", name: "防具", mark: "盾" },
    { id: "accessory", name: "アクセサリー", mark: "宝" }
  ]);

  const RARITIES = Object.freeze([
    { id: "common", name: "コモン", color: "#aeb8c5", rank: 1, chance: .65, prefix: "旅人の" },
    { id: "rare", name: "レア", color: "#45a7ff", rank: 2, chance: .25, prefix: "蒼紋の" },
    { id: "epic", name: "エピック", color: "#c86cff", rank: 3, chance: .09, prefix: "王家の" },
    { id: "legendary", name: "レジェンダリー", color: "#ffbd35", rank: 4, chance: .01, prefix: "神話の" }
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

  function scaledStats(source, rarityRank, slot) {
    const result = {};
    Object.entries(source || {}).forEach(([stat, base]) => {
      const scale = stat === "hp" ? 2 : 1;
      result[stat] = Math.max(1, Math.round(Number(base) * scale + rarityRank * (stat === "hp" ? 2 : 1)));
    });
    if (!Object.keys(result).length) {
      result[slot === "weapon" ? "attack" : (slot === "armor" ? "defense" : "speed")] = rarityRank;
    }
    return result;
  }

  function describeItem(item) {
    const stats = Object.entries(item.stats)
      .map(([stat, value]) => `${STAT_NAMES[stat] || stat}+${value}`)
      .join(" / ");
    const condition = item.role
      ? `${ROLE_NAMES[item.role] || item.role}型なら戦力+${item.conditionalPercent}%`
      : `${ELEMENT_NAMES[item.element] || item.element}属性なら戦力+${item.conditionalPercent}%`;
    return `${stats}。${condition}`;
  }

  function createCatalog() {
    const items = [];
    RARITIES.forEach((rarity) => {
      SLOTS.forEach((slot) => {
        ITEM_ARCHETYPES[slot.id].forEach((archetype, index) => {
          const id = `${rarity.id}-${slot.id}-${archetype.id}`;
          const legendaryName = LEGENDARY_NAMES[`${slot.id}-${archetype.id}`];
          const item = {
            id,
            slot: slot.id,
            rarity: rarity.id,
            name: rarity.id === "legendary" ? legendaryName : `${rarity.prefix}${archetype.name}`,
            stats: scaledStats(archetype.stats, rarity.rank, slot.id),
            role: archetype.role || "",
            element: archetype.element || Object.keys(ELEMENT_NAMES)[(index + rarity.rank * 2) % Object.keys(ELEMENT_NAMES).length],
            conditionalPercent: rarity.rank,
            sort: rarity.rank * 100 + SLOTS.findIndex((entry) => entry.id === slot.id) * 10 + index
          };
          item.description = describeItem(item);
          items.push(Object.freeze(item));
        });
      });
    });
    return Object.freeze(items);
  }

  const ITEMS = createCatalog();
  const ITEM_BY_ID = Object.freeze(Object.fromEntries(ITEMS.map((item) => [item.id, item])));
  const ITEMS_BY_RARITY = Object.freeze(Object.fromEntries(RARITIES.map((rarity) => [
    rarity.id,
    Object.freeze(ITEMS.filter((item) => item.rarity === rarity.id))
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
    let score = RARITY_BY_ID[item.rarity].rank * 20;
    Object.entries(item.stats).forEach(([stat, value]) => {
      const weight = stat === primary ? 2.2 : (stat === "hp" ? .45 : 1);
      score += Number(value) * weight;
    });
    if (item.role && item.role === monster.role) score += 18;
    if (item.element && item.element === monster.element) score += 14;
    return score;
  }

  function autoAssign(monsters, record = {}) {
    const remaining = effectiveInventory(record);
    const assignments = {};
    [...(monsters || [])]
      .filter((monster) => monster?.nodeId && monster.nodeId !== "egg")
      .sort((a, b) => (Number(b.score) || Number(b.power) || 0) - (Number(a.score) || Number(a.power) || 0))
      .forEach((monster) => {
        assignments[monster.nodeId] = {};
        SLOTS.forEach((slot) => {
          const item = ITEMS
            .filter((candidate) => candidate.slot === slot.id && (Number(remaining[candidate.id]) || 0) > 0)
            .map((candidate) => ({ candidate, score: scoreItem(candidate, monster) }))
            .sort((a, b) => b.score - a.score || b.candidate.sort - a.candidate.sort)[0]?.candidate;
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
        (item.element && item.element === monsterStats.element);
      if (matches) {
        const primary = monsterStats.attackType === "magic" ? "magic" : "attack";
        result[primary] = Math.max(1, Math.round((Number(result[primary]) || 0) + item.conditionalPercent));
      }
    });
    return result;
  }

  function equipmentMultiplier(monster) {
    const loadout = normalizeLoadout(monster?.equipment);
    let multiplier = 1;
    Object.values(loadout).forEach((id) => {
      const item = ITEM_BY_ID[id];
      if (!item) return;
      if ((item.role && item.role === monster.role) || (item.element && item.element === monster.element)) {
        multiplier += item.conditionalPercent / 100;
      }
    });
    return Math.min(1.1, multiplier);
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
    autoAssign,
    normalizeLoadout,
    applyEquipmentStats,
    equipmentMultiplier,
    loadoutItems
  });
})(typeof window !== "undefined" ? window : globalThis);
