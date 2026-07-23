(function bootstrapMonsterSystem(global) {
  "use strict";

  const STAGES = ["たまご", "幼少期", "成長期", "成熟期", "完全体", "究極体", "超究極体"];
  const LINEAGES = [
    { id: "inferno", sheet: "lineage-inferno.png", mature: "フレアレオ", perfect: ["黒曜レオン", "マグマワイバーン"], ultimate: ["太陽獅子王", "ケルベロス・レクス", "炎冠竜", "彗星キマイラ"] },
    { id: "thunder", sheet: "lineage-thunder.png", mature: "ストームファング", perfect: ["雷刃ボルト", "雲上キリン"], ultimate: ["電光フェンリル", "雷帝タイグロン", "雷神キリン", "嵐竜狼"] },
    { id: "mecha", sheet: "lineage-mecha.png", mature: "ギアファルコン", perfect: ["ジェットラプター", "装甲フクロウ"], ultimate: ["軌道鳳凰", "隠密グリフォン", "要塞ノクチュア", "太陽砲翼"] },
    { id: "beetle", sheet: "lineage-beetle.png", mature: "クロノビートル", perfect: ["ドリルスカラベ", "歯車クワガタ"], ultimate: ["攻城コロッサス", "蒸気巨神", "時皇帝", "斬撃マンティス"] },
    { id: "grove", sheet: "lineage-grove.png", mature: "苔の守り手", perfect: ["深緑の騎士", "桜花シャーマン"], ultimate: ["世界樹巨神", "森羅パラディン", "桜花神", "太陽樹竜"] },
    { id: "spore", sheet: "lineage-spore.png", mature: "キノコロリン", perfect: ["猛毒道化師", "菌糸の魔女"], ultimate: ["疫病カーニバル", "毒笑クラウン", "悪夢女王", "宇宙予言者"] },
    { id: "abyss", sheet: "lineage-abyss.png", mature: "アビスシャーク", perfect: ["アンカーオルカ", "剣ヒレ"], ultimate: ["深海王オルカ", "クラーケンシャーク", "海皇", "潜水ドラゴン"] },
    { id: "cosmic", sheet: "lineage-cosmic.png", mature: "ほしクラゲ", perfect: ["星雲魔導士", "月光マンタ"], ultimate: ["銀河神", "星座エイ", "月姫クラゲ", "黒穴タコ"] },
    { id: "glacier", sheet: "lineage-glacier.png", mature: "氷牙ウルフ", perfect: ["凍刃フェンリル", "雪嵐キマイラ"], ultimate: ["氷皇ベオウルフ", "永久凍土ガルム", "白銀氷竜", "極光獣王"] },
    { id: "crystal", sheet: "lineage-crystal.png", mature: "水晶フクロウ", perfect: ["宝石グリフォン", "鏡晶魔導鳥"], ultimate: ["虹晶鳳凰", "金剛賢者", "万華鏡竜", "星晶裁定者"] },
    { id: "sky", sheet: "lineage-sky.png", mature: "蒼天グリフォン", perfect: ["雲海ペガサス", "雷雲ロック"], ultimate: ["天空王", "蒼穹神竜", "日輪ホルス", "星風ケツァル"] },
    { id: "tempest", sheet: "lineage-tempest.png", mature: "嵐角バイソン", perfect: ["竜巻タイガー", "暴風ガルーダ"], ultimate: ["台風大帝", "天災ベヒモス", "暴嵐竜神", "雷雲巨神"] },
    { id: "shadow", sheet: "lineage-shadow.png", mature: "月影ネコマタ", perfect: ["黒月アサシン", "夢喰いスフィンクス"], ultimate: ["冥月女帝", "夜刀神", "影獣バステト", "月蝕ケルベロス"] },
    { id: "spirit", sheet: "lineage-spirit.png", mature: "灯火キツネ", perfect: ["百鬼オオカミ", "魂導ミコ"], ultimate: ["黄泉九尾", "鬼火大将", "千霊神狐", "幽界守護神"] },
    { id: "candy", sheet: "lineage-candy.png", mature: "キャンディベア", perfect: ["パフェナイト", "ショコラウィッチ"], ultimate: ["菓子王国皇帝", "夢色ユニコーン", "飴細工ドラゴン", "混沌スイーツ神"] },
    { id: "junk", sheet: "lineage-junk.png", mature: "ガラクタロボ", perfect: ["スクラップタンク", "ゼンマイ博士"], ultimate: ["廃材要塞王", "超合金ポンコツ", "爆走ジャンク竜", "終末ブリキ神"] },
    { id: "coral", sheet: "lineage-coral.png", aspect: 1, mature: "サンゴリュウ", perfect: ["珊瑚騎竜", "真珠海蛇"], ultimate: ["珊瑚海神", "潮皇ネプティス", "光礁鳳凰", "貝殻巨獣"] },
    { id: "corsair", sheet: "lineage-corsair.png", aspect: 1, mature: "コルセアラッコ", perfect: ["鮫船長バルカ", "幽霊タコ航海士"], ultimate: ["海賊王クラーケン", "戦艦鯨アドミラ", "幽海竜ドレイク", "宝島蟹皇"] },
    { id: "dune", sheet: "lineage-dune.png", aspect: 1, mature: "サンドアルマ", perfect: ["琥珀サソリ", "砂宮ジャッカル"], ultimate: ["大砂竜ワーム", "黄金獅子ファラオ", "砂城亀バスティア", "玻璃嵐ジン"] },
    { id: "fossil", sheet: "lineage-fossil.png", aspect: 1, mature: "ホネラプター", perfect: ["化石トリケラ", "琥珀プテラ"], ultimate: ["骨王ティラノ", "琥珀鳳凰", "太古マンモス", "化石冥竜ヒュドラ"] },
    { id: "samurai", sheet: "lineage-samurai.png", aspect: .937, rightFacing: ["perfect-b", "ultimate-2"], mature: "ムシャカマキリ", perfect: ["青鬼クワガタ", "白鶴槍士"], ultimate: ["炎将軍竜", "双刃鬼大将", "天鎧キリン", "城塞武神"] },
    { id: "dojo", sheet: "lineage-dojo.png", aspect: 1, mature: "トラケンポウ", perfect: ["翡翠ゴリラ僧", "白兎蹴闘士"], ultimate: ["金龍大師", "山嶽熊王", "百拳阿修羅", "天武麒麟"] },
    { id: "sonic", sheet: "lineage-sonic.png", aspect: 1, rightFacing: ["perfect-a"], mature: "オトギツネ", perfect: ["雷弦ウルフ", "電奏フクロウ"], ultimate: ["爆音竜アンプリオン", "宇宙楽鳳凰", "重低音ゴリラ", "交響ユニコーン"] },
    { id: "festival", sheet: "lineage-festival.png", aspect: 1, mature: "ちょうちんタヌキ", perfect: ["太鼓イノシシ", "花火ツル"], ultimate: ["祭獅子大山車", "大花火竜", "千灯九尾", "踊神タコマツリ"] },
    { id: "bloom", sheet: "lineage-bloom.png", aspect: .75, mature: "ハナツノジカ", perfect: ["薔薇騎士鹿", "蓮華ツル"], ultimate: ["世界花竜", "春神キリン", "茨聖堂巨人", "虹庭鳳凰"] },
    { id: "dream", sheet: "lineage-dream.png", aspect: 1, mature: "ねむねむバク", perfect: ["月枕クマ", "星羊の魔導士"], ultimate: ["夢喰獣バクオウ", "月宮鯨", "悪夢翼獅子", "目覚時計神"] },
    { id: "slime", sheet: "lineage-slime.png", aspect: .889, mature: "ぷるナイト", perfect: ["ゼリー竜", "錬金スライム"], ultimate: ["虹粘王", "プリンヒュドラ", "水銀騎神", "宇宙泡アメーバ"] },
    { id: "gourmet", sheet: "lineage-gourmet.png", aspect: 1, mature: "コックレッサー", perfect: ["オーブンイノシシ", "麺龍シェフ"], ultimate: ["饗宴竜皇", "火鍋蟹王", "寿司鳳凰", "三ツ星鬼厨神"] },
    { id: "ink", sheet: "lineage-ink.png", aspect: 1, mature: "スミガラス", perfect: ["墨絵白虎", "紙鶴仙人"], ultimate: ["水墨龍", "筆鎧武神", "墨嵐鳳凰", "黒月画神"] },
    { id: "ninja", sheet: "lineage-ninja.png", aspect: 1, mature: "カゲガラス", perfect: ["黒豹シノビ", "煙蛙忍"], ultimate: ["八尾幻狐", "月影忍竜", "手裏剣フクロウ", "虚煙鬼王"] },
    { id: "rail", sheet: "lineage-rail.png", aspect: 1, mature: "きかんリュウ", perfect: ["新幹ワイバーン", "蒸気サイ"], ultimate: ["大陸鉄竜", "磁雷蛇マグネオ", "駅城機神", "王蒸気クジャク"] },
    { id: "ryu", sheet: "lineage-ryu.png", aspect: 1, mature: "マキモノリュウ", perfect: ["翠河龍", "白雲龍"], ultimate: ["紅帝龍", "蒼海龍王", "黄金天龍", "陰陽双龍"] }
  ];

  const LEGENDARY_IDS = ["legend-sun", "legend-night", "legend-world", "legend-time"];
  const LEGENDARY_CHANCE = .01;

  const RANK6_NAMES = Object.freeze({
    inferno: "獄炎神レグナヴァル", thunder: "天雷皇ライゼオン", mecha: "機神鳳凰ゼノギア", beetle: "甲帝王グランカブト",
    grove: "世界樹王ユグラント", spore: "冥茸妃モルガネラ", abyss: "深淵海皇リヴァイア", cosmic: "星海神鯨コスモーン",
    glacier: "氷獄狼帝フェンリオ", crystal: "晶翼神グリスタル", sky: "蒼天神鷲アルシオン", tempest: "嵐角龍王テンペスタ",
    shadow: "宵闇豹帝ノクティガ", spirit: "白焔九尾アマツキ", candy: "夢菓龍王ドラジェル", junk: "廃鋼巨神ギガントン",
    coral: "珊瑚海妃ネレイア", corsair: "海賊魔皇クラーケイン", dune: "砂界神竜スフィラード", fossil: "骸竜帝ボーンレクス",
    samurai: "炎武神将ムラクモ", dojo: "天拳聖猿ゴクウガ", sonic: "奏天翼竜オルフェオン", festival: "万華祭狐カグラビ",
    bloom: "花界神獣フローリア", dream: "夢月獏神ルナバク", slime: "虹耀粘王プリズマム", gourmet: "美食魔帝グルマンド",
    ink: "墨界書龍ゲンブン", ninja: "月影忍皇ヤタガラス", rail: "超轟鉄龍シンカリュウ", ryu: "天宙龍神アマツリュウ"
  });
  const RANK6_RIGHT_FACING = new Set(["abyss", "cosmic"]);

  const PASSIVE_SKILLS = Object.freeze([
    { id: "opening-guard", name: "開幕要塞", description: "最初の4ターン、防御と魔防が45%上昇", kind: "guard", turns: 4, value: 1.45 },
    { id: "iron-wall", name: "金剛障壁", description: "受けるダメージを常に12%軽減", kind: "damage-cut", value: .88 },
    { id: "regeneration", name: "再生核", description: "3ターンごとに最大HPの7%を回復", kind: "regen", interval: 3, value: .07 },
    { id: "quick-step", name: "幻影歩法", description: "16%の確率で攻撃を完全回避", kind: "dodge", value: .16 },
    { id: "last-stand", name: "不屈の魂", description: "一度だけHP1で攻撃を耐える", kind: "endure", value: 1 },
    { id: "battle-fury", name: "逆境猛進", description: "HP45%以下で攻撃性能が30%上昇", kind: "fury", threshold: .45, value: 1.30 },
    { id: "life-drain", name: "生命吸収", description: "与えたダメージの14%を回復", kind: "drain", value: .14 },
    { id: "counter-core", name: "反撃機構", description: "攻撃を受けるたび必殺ゲージが18上昇", kind: "revenge-energy", value: 18 },
    { id: "first-charge", name: "先陣の鼓動", description: "必殺ゲージ35から戦闘開始", kind: "initial-energy", value: 35 },
    { id: "specialist", name: "奥義研鑽", description: "必殺技の威力が25%上昇", kind: "special-power", value: 1.25 },
    { id: "finisher", name: "弱点看破", description: "HP35%以下の敵への威力が30%上昇", kind: "finisher", threshold: .35, value: 1.30 },
    { id: "hype-surge", name: "闘気共鳴", description: "必殺技の発動率が12%上昇", kind: "special-chance", value: .12 },
    { id: "physical-shell", name: "獣王の皮膜", description: "物理ダメージを18%軽減", kind: "type-cut", attackType: "physical", value: .82 },
    { id: "magic-shell", name: "魔導結界", description: "魔法ダメージを18%軽減", kind: "type-cut", attackType: "magic", value: .82 },
    { id: "berserk", name: "狂戦士の血", description: "通常攻撃の威力が18%上昇", kind: "normal-power", value: 1.18 },
    { id: "energy-rush", name: "加速充填", description: "通常攻撃後の必殺ゲージ上昇量が14増加", kind: "energy-gain", value: 14 },
    { id: "soul-reboot", name: "魂魄再起動", description: "一度だけ最大HPの32%で復活する", kind: "revive", value: .32 }
  ]);

  const ELEMENTS = Object.freeze({
    fire: { id: "fire", name: "炎", icon: "炎" },
    water: { id: "water", name: "水", icon: "水" },
    lightning: { id: "lightning", name: "雷", icon: "雷" },
    ice: { id: "ice", name: "氷", icon: "氷" },
    earth: { id: "earth", name: "地", icon: "地" },
    wind: { id: "wind", name: "風", icon: "風" },
    light: { id: "light", name: "光", icon: "光" },
    dark: { id: "dark", name: "闇", icon: "闇" }
  });

  const ELEMENT_ADVANTAGE = Object.freeze({
    fire: "ice",
    ice: "wind",
    wind: "earth",
    earth: "lightning",
    lightning: "water",
    water: "fire",
    light: "dark",
    dark: "light"
  });

  const COMBAT_ELEMENT_BY_LINEAGE = Object.freeze({
    egg: "earth", beast: "wind", odd: "water",
    inferno: "fire", thunder: "lightning", mecha: "earth", beetle: "earth", grove: "earth", spore: "dark",
    abyss: "water", cosmic: "dark", glacier: "ice", crystal: "light", sky: "wind", tempest: "wind",
    shadow: "dark", spirit: "light", candy: "light", junk: "earth", coral: "water", corsair: "water",
    dune: "earth", fossil: "earth", samurai: "fire", dojo: "wind", sonic: "lightning", festival: "fire",
    bloom: "light", dream: "dark", slime: "water", gourmet: "fire", ink: "dark", ninja: "wind", rail: "lightning",
    ryu: "lightning", "legend-sun": "light", "legend-night": "dark", "legend-world": "earth", "legend-time": "fire"
  });

  const ROLES = Object.freeze({
    guardian: { id: "guardian", name: "ガーディアン", short: "GUARD", description: "敵を引きつけ、被ダメージを4%軽減", targetWeight: 1.35, damageTaken: .96 },
    striker: { id: "striker", name: "ストライカー", short: "STRIKE", description: "攻撃ダメージが5%上昇", damage: 1.05 },
    mystic: { id: "mystic", name: "ミスティック", short: "MYSTIC", description: "状態異常の付与率が10%上昇", statusChance: .10 },
    speedster: { id: "speedster", name: "スピードスター", short: "SPEED", description: "行動速度が8%、回避率が3%上昇", speed: 1.08, dodge: .03 },
    support: { id: "support", name: "サポーター", short: "SUPPORT", description: "連携必殺技の発動率が12%上昇", linkChance: .12 }
  });

  const ROLE_BY_LINEAGE = Object.freeze({
    egg: "guardian", beast: "striker", odd: "support",
    inferno: "striker", thunder: "speedster", mecha: "guardian", beetle: "guardian", grove: "support", spore: "mystic",
    abyss: "striker", cosmic: "mystic", glacier: "guardian", crystal: "support", sky: "speedster", tempest: "striker",
    shadow: "speedster", spirit: "support", candy: "support", junk: "guardian", coral: "support", corsair: "striker",
    dune: "guardian", fossil: "striker", samurai: "striker", dojo: "striker", sonic: "speedster", festival: "mystic",
    bloom: "support", dream: "mystic", slime: "guardian", gourmet: "striker", ink: "mystic", ninja: "speedster", rail: "guardian",
    ryu: "mystic", "legend-sun": "mystic", "legend-night": "striker", "legend-world": "guardian", "legend-time": "speedster"
  });

  const STATUS_EFFECTS = Object.freeze({
    burn: { id: "burn", name: "火傷", short: "BURN", turns: 3, element: "fire", damageRate: .045 },
    freeze: { id: "freeze", name: "凍結", short: "FREEZE", turns: 1, element: "ice", skip: true },
    shock: { id: "shock", name: "感電", short: "SHOCK", turns: 3, element: "lightning", speedRate: .72, energyLoss: 10 },
    poison: { id: "poison", name: "猛毒", short: "POISON", turns: 4, element: "dark", damageRate: .035 },
    blind: { id: "blind", name: "暗闇", short: "BLIND", turns: 2, element: "wind", missChance: .24 },
    break: { id: "break", name: "防御崩壊", short: "BREAK", turns: 3, element: "earth", defenseRate: .84 },
    soak: { id: "soak", name: "水縛", short: "SOAK", turns: 3, element: "water", speedRate: .82 },
    seal: { id: "seal", name: "光封", short: "SEAL", turns: 2, element: "light", energyLoss: 16 }
  });

  const COMBAT_ARCHETYPES = {
    egg:     { hp: 1.05, attack: .82, defense: 1.04, magic: .82, magicDefense: 1.08, speed: .78, type: "physical", special: "たまご大爆発" },
    beast:   { hp: 1.02, attack: 1.10, defense: .96, magic: .82, magicDefense: .90, speed: 1.13, type: "physical", special: "野生の咆哮" },
    odd:     { hp: 1.08, attack: .82, defense: 1.06, magic: 1.10, magicDefense: 1.12, speed: .86, type: "magic", special: "ふしぎ大奇跡" },
    inferno: { hp: 1.02, attack: 1.24, defense: .94, magic: 1.04, magicDefense: .86, speed: 1.02, type: "physical", special: "太陽獄炎" },
    thunder: { hp: .90, attack: 1.15, defense: .84, magic: 1.06, magicDefense: .92, speed: 1.32, type: "physical", special: "雷鳴咆哮" },
    mecha:   { hp: 1.12, attack: 1.08, defense: 1.26, magic: .82, magicDefense: 1.05, speed: .82, type: "physical", special: "軌道砲撃" },
    beetle:  { hp: 1.18, attack: 1.03, defense: 1.34, magic: .70, magicDefense: 1.02, speed: .72, type: "physical", special: "時空粉砕" },
    grove:   { hp: 1.22, attack: .82, defense: 1.12, magic: 1.12, magicDefense: 1.28, speed: .72, type: "magic", special: "世界樹開花" },
    spore:   { hp: .94, attack: .72, defense: .84, magic: 1.33, magicDefense: 1.12, speed: .95, type: "magic", special: "悪夢胞子" },
    abyss:   { hp: 1.12, attack: 1.18, defense: 1.02, magic: .88, magicDefense: .96, speed: 1.02, type: "physical", special: "深海大津波" },
    cosmic:  { hp: .92, attack: .72, defense: .82, magic: 1.38, magicDefense: 1.22, speed: 1.12, type: "magic", special: "銀河崩壊" },
    glacier: { hp: 1.08, attack: 1.16, defense: 1.16, magic: .92, magicDefense: 1.06, speed: .96, type: "physical", special: "永久氷獄" },
    crystal: { hp: .96, attack: .84, defense: 1.04, magic: 1.28, magicDefense: 1.32, speed: .94, type: "magic", special: "万華晶界" },
    sky:     { hp: .92, attack: 1.10, defense: .88, magic: 1.08, magicDefense: .96, speed: 1.34, type: "physical", special: "蒼穹天翔" },
    tempest: { hp: 1.16, attack: 1.22, defense: 1.08, magic: .88, magicDefense: .90, speed: .98, type: "physical", special: "天災大旋風" },
    shadow:  { hp: .90, attack: 1.08, defense: .82, magic: 1.30, magicDefense: 1.04, speed: 1.24, type: "magic", special: "月蝕冥界" },
    spirit:  { hp: 1.02, attack: .94, defense: .96, magic: 1.24, magicDefense: 1.22, speed: 1.06, type: "magic", special: "千霊百鬼夜行" },
    candy:   { hp: 1.24, attack: .90, defense: 1.12, magic: 1.14, magicDefense: 1.08, speed: .78, type: "magic", special: "夢色甘味大爆発" },
    junk:    { hp: 1.20, attack: 1.14, defense: 1.28, magic: .76, magicDefense: .92, speed: .76, type: "physical", special: "終末ゼンマイ砲" },
    coral:   { hp: 1.12, attack: .90, defense: 1.10, magic: 1.22, magicDefense: 1.20, speed: .88, type: "magic", special: "珊瑚海嘯" },
    corsair: { hp: 1.04, attack: 1.22, defense: .94, magic: .88, magicDefense: .90, speed: 1.18, type: "physical", special: "大海賊砲撃" },
    dune:    { hp: 1.18, attack: 1.08, defense: 1.30, magic: .82, magicDefense: 1.08, speed: .72, type: "physical", special: "黄金砂嵐" },
    fossil:  { hp: 1.16, attack: 1.26, defense: 1.14, magic: .72, magicDefense: .88, speed: .90, type: "physical", special: "太古絶滅衝" },
    samurai: { hp: 1.00, attack: 1.30, defense: 1.08, magic: .78, magicDefense: .94, speed: 1.15, type: "physical", special: "天下無双斬" },
    dojo:    { hp: 1.16, attack: 1.22, defense: 1.14, magic: .74, magicDefense: 1.00, speed: .98, type: "physical", special: "百拳天衝" },
    sonic:   { hp: .88, attack: .84, defense: .80, magic: 1.32, magicDefense: .98, speed: 1.38, type: "magic", special: "超音轟奏" },
    festival:{ hp: 1.08, attack: 1.02, defense: .98, magic: 1.20, magicDefense: 1.04, speed: 1.02, type: "magic", special: "万発大花火" },
    bloom:   { hp: 1.20, attack: .78, defense: 1.08, magic: 1.24, magicDefense: 1.30, speed: .82, type: "magic", special: "百花天輪" },
    dream:   { hp: 1.10, attack: .70, defense: .92, magic: 1.34, magicDefense: 1.34, speed: .82, type: "magic", special: "夢界大睡眠" },
    slime:   { hp: 1.32, attack: .84, defense: 1.12, magic: 1.12, magicDefense: 1.34, speed: .62, type: "magic", special: "虹粘超分裂" },
    gourmet: { hp: 1.30, attack: 1.12, defense: 1.16, magic: .94, magicDefense: 1.02, speed: .70, type: "physical", special: "究極満漢全席" },
    ink:     { hp: .94, attack: .88, defense: .90, magic: 1.32, magicDefense: 1.18, speed: 1.16, type: "magic", special: "天地水墨画" },
    ninja:   { hp: .86, attack: 1.22, defense: .78, magic: 1.08, magicDefense: .90, speed: 1.42, type: "physical", special: "影分身絶影刃" },
    rail:    { hp: 1.22, attack: 1.18, defense: 1.26, magic: .76, magicDefense: .94, speed: .92, type: "physical", special: "超特急轢撃" },
    ryu:     { hp: 1.08, attack: 1.14, defense: 1.02, magic: 1.20, magicDefense: 1.10, speed: 1.04, type: "magic", special: "天地龍脈波" },
    "legend-sun": { hp: 1.34, attack: 1.32, defense: 1.28, magic: 1.34, magicDefense: 1.30, speed: 1.20, type: "magic", special: "天照・万象光輪" },
    "legend-night": { hp: 1.30, attack: 1.36, defense: 1.24, magic: 1.38, magicDefense: 1.26, speed: 1.24, type: "physical", special: "冥星・虚空終焉" },
    "legend-world": { hp: 1.42, attack: 1.28, defense: 1.38, magic: 1.36, magicDefense: 1.40, speed: 1.14, type: "magic", special: "翠環・世界新生" },
    "legend-time": { hp: 1.30, attack: 1.40, defense: 1.24, magic: 1.40, magicDefense: 1.28, speed: 1.36, type: "physical", special: "時焔・永劫破断" }
  };

  const DIALOGUE = {
    egg: {
      idle: ["コツン……中で何か動いた！", "ピキッ。もうすぐ生まれそうだ。"],
      open: ["コンコン！いまの一手、殻まで響いた！", "たまごが嬉しそうに揺れている！"],
      evolve: ["殻を破って、いま誕生する！"], attack: ["ころころアタック！"], hurt: ["殻にヒビが入った！"], special: ["全部まとめて、シェルバースト！"], win: ["たまごのまま勝った……！"], defeat: ["殻の中で反省中……。"]
    },
    beast: {
      idle: ["ガオー！次のマスはどこだ！", "しっぽが勝手に動くぞ！"],
      open: ["ガオッ！いいマスを開けたな！", "その調子だ、もっと暴れようぜ！"],
      evolve: ["ガオオオ！力があふれてくる！"], attack: ["爪でぶっ飛ばす！", "ガオーッ、突撃だ！"], hurt: ["ぐるる……まだ立てる！"], special: ["野生全開！必殺の咆哮だ！"], win: ["ガオー！オレたちの勝ちだ！"], defeat: ["くぅん……次は負けないぞ。"]
    },
    odd: {
      idle: ["ぷにょ？勝つって食べられる？", "なんか変な予感がするるる。"],
      open: ["ぷにっ！そこ、たぶん大当たり！", "わーい、盤面が一個へこんだ！"],
      evolve: ["にょにょにょ……変なのになった！"], attack: ["ぷにょんと行くよー！", "よくわからない光線！"], hurt: ["形がちょっと変わっただけ！"], special: ["奇跡か事故か、オッドミラクル！"], win: ["勝ったの？じゃあ踊るー！"], defeat: ["床と仲良くしてくるね……。"]
    },
    inferno: {
      idle: ["ガオー！炎が勝負を欲しがっている！", "熱くなってきた。全部燃やすぞ！"],
      open: ["いい一手だ！炎の道が見えたぞ！", "ガオッ！勝利まで焼き尽くせ！"],
      evolve: ["灼熱の血が目覚めた！ガオオオ！"], attack: ["焦げ跡だけ残してやる！", "爆炎の爪をくらえ！"], hurt: ["熱いな……だが足りない！"], special: ["太陽ごと落とす！SUNBURST ROAR！"], win: ["ガオー！炎の王者はオレだ！"], defeat: ["火は消えない……また燃え上がる。"]
    },
    thunder: {
      idle: ["ビリビリするな。速攻で決めるぞ！", "雷より先に動いてみろ！"],
      open: ["そこだ！稲妻みたいな一手だ！", "速い、鋭い、完璧だ！"],
      evolve: ["雷鳴と一緒に駆け上がる！"], attack: ["遅い！もう背後だ！", "稲妻の牙を受けろ！"], hurt: ["チッ、電光でかわしきれないか！"], special: ["天を裂け！THUNDER HOWL！"], win: ["勝負は一瞬、それで十分だ！"], defeat: ["次はもっと速くなる……。"]
    },
    mecha: {
      idle: ["戦闘データ解析中。勝率、上昇。", "全システム正常。いつでも行ける。"],
      open: ["GOOD OPEN。最適解を確認。", "盤面更新。攻撃ルートを再計算。"],
      evolve: ["機体拡張完了。新形態へ移行する。"], attack: ["ターゲット捕捉。射出！", "近接モード、起動。"], hurt: ["装甲損傷。戦闘続行可能。"], special: ["出力制限解除。ORBITAL CANNON！"], win: ["作戦完了。チームワークは良好。"], defeat: ["再起動シーケンスへ移行……。"]
    },
    beetle: {
      idle: ["ギギッ。真正面から受け止める！", "この装甲、簡単には抜けないぞ。"],
      open: ["ギギッ！堅実ないい一手だ！", "進め。重くても止まらなければいい！"],
      evolve: ["装甲増設！さらに硬く、強く！"], attack: ["角で粉砕する！", "重装突進、どけえ！"], hurt: ["効かん！……少しだけ効いた！"], special: ["時ごと砕け！CHRONO CRUSH！"], win: ["最後に立つのは硬いヤツだ！"], defeat: ["装甲整備して出直す……。"]
    },
    grove: {
      idle: ["森の声が、次のマスを教えてくれる。", "焦らなくていい。根は深く伸びている。"],
      open: ["いい芽が出たね。大切に育てよう。", "盤面に新しい風が通ったよ。"],
      evolve: ["大地よ、もっと大きな姿を授けて。"], attack: ["根よ、相手を捕らえて！", "森の魔力を受けなさい。"], hurt: ["枝が折れても、また芽吹く。"], special: ["命よ満ちろ！WORLDROOT BLOOM！"], win: ["みんなで育てた勝利だね。"], defeat: ["少し眠って、また芽を出すよ。"]
    },
    spore: {
      idle: ["ひひっ、面白い胞子をまいておいたよ。", "笑ってる間に勝っちゃおうか。"],
      open: ["ひゃはっ！そこからキノコ生えるかも！", "いいねえ、そのマス毒々しいよ！"],
      evolve: ["ひひひ……もっと愉快な姿になった！"], attack: ["吸い込んだら笑いが止まらないよ！", "毒キノコはいかが？"], hurt: ["ひひっ、痛いって面白いねえ！"], special: ["悪夢まで育て！NIGHTMARE SPORES！"], win: ["最後に笑うキノコはボクでした！"], defeat: ["じめじめした所で復活するよ……。"]
    },
    abyss: {
      idle: ["海は静かだ。だが勝負は荒れるぞ。", "獲物の動きは全部見えている。"],
      open: ["いい波だ。そのまま押し切れ！", "一気に食らいつくぞ！"],
      evolve: ["深海の圧力が、この体を鍛え上げる！"], attack: ["逃がさない、噛み砕く！", "深海からの急襲だ！"], hurt: ["この程度、海の圧力より軽い！"], special: ["大海よ飲み込め！LEVIATHAN TIDE！"], win: ["勝者だけが海面へ上がれる。"], defeat: ["深く潜って傷を癒やす……。"]
    },
    cosmic: {
      idle: ["星の並びが勝利を示しています。", "ふわり。宇宙規模で応援中です。"],
      open: ["その一手、星座に刻みました。", "きらり。運命の軌道が変わります。"],
      evolve: ["星々よ、新しい姿を照らしてください。"], attack: ["重力の向きを変えます。", "星屑の魔法をどうぞ。"], hurt: ["宇宙は広いので、まだ平気です。"], special: ["光さえ逃がさない。GALAXY COLLAPSE！"], win: ["勝利の星が、いま一番輝いています。"], defeat: ["また巡る星の中で会いましょう……。"]
    }
  };

  Object.assign(DIALOGUE, {
    glacier: {
      idle: ["ひんやり行こう。頭は冷たく、勝負は熱く！", "氷の匂いがする。次の一手はそこだ！"],
      open: ["氷牙が冴えた！いいマスだ！"], evolve: ["凍てつく力が、新しい姿を作る！"],
      attack: ["凍れ、氷牙突進！"], hurt: ["冷たいくらいがちょうどいい！"], special: ["すべてを止めろ、永久氷獄！"], win: ["氷の勝利、きれいに決まったな！"], defeat: ["雪の下で鍛え直してくる……。"]
    },
    crystal: {
      idle: ["水晶に次の未来が映っています。", "きらり。勝利の光を見つけました。"],
      open: ["その一手、宝石より美しいです。"], evolve: ["結晶が重なり、輝きが増していく！"],
      attack: ["晶光よ、貫きなさい！"], hurt: ["ひびは輝きに変えられます。"], special: ["世界を映せ、万華晶界！"], win: ["勝利の色は、こんなにも鮮やか。"], defeat: ["欠片から、また結晶します……。"]
    },
    sky: {
      idle: ["空は広いぞ。もっと高く飛ぼう！", "風向き良好、勝利まで一直線だ！"],
      open: ["ナイス！追い風が来たぞ！"], evolve: ["雲を突き抜ける翼になった！"],
      attack: ["天空から急降下だ！"], hurt: ["まだ落ちない、風が支えている！"], special: ["空を制せ、蒼穹天翔！"], win: ["一番高い空から勝利を見届けたぞ！"], defeat: ["次はもっと高く飛ぶ……。"]
    },
    tempest: {
      idle: ["嵐の前は静かだな。暴れる準備はできた！", "角がうずく。派手な一手を頼むぞ！"],
      open: ["来たぞ、盤面に暴風警報だ！"], evolve: ["風圧限界突破！嵐そのものになる！"],
      attack: ["まとめて吹き飛べ！"], hurt: ["この巨体は嵐でも倒れん！"], special: ["天災級だ、天災大旋風！"], win: ["嵐が去った後に残るのは勝者だけだ！"], defeat: ["風を集め直して出直すぞ……。"]
    },
    shadow: {
      idle: ["月影から、こっそり応援してるよ。", "ふふ、次のマスはもう影が教えてくれた。"],
      open: ["その一手、夜より鮮やかだね。"], evolve: ["影が深くなって、姿が変わる……！"],
      attack: ["影縫い、逃がさないよ。"], hurt: ["それ、本当に本体だった？"], special: ["月を隠せ、月蝕冥界！"], win: ["静かな夜ほど、勝利はよく響くね。"], defeat: ["影に戻って、次を待つよ……。"]
    },
    spirit: {
      idle: ["鬼火が楽しそう。いい勝負になりそうだね。", "魂の声が、もう一歩だって言ってるよ。"],
      open: ["灯りがひとつ増えた。いいマスだね。"], evolve: ["集まれ魂たち、新しい姿を照らして！"],
      attack: ["狐火よ、舞いなさい！"], hurt: ["魂は傷ついても消えません。"], special: ["千の魂よ、千霊百鬼夜行！"], win: ["みんなの魂でつかんだ勝利だね。"], defeat: ["灯りを絶やさず、また会いましょう。"]
    },
    candy: {
      idle: ["勝ったらごほうび、特大パフェね！", "甘い匂いのするマス、どーこだ？"],
      open: ["あまーい！これは当たりマス！"], evolve: ["砂糖と夢を足したら、でっかくなった！"],
      attack: ["キャンディミサイル、ぽーん！"], hurt: ["ちょっと欠けたけど、まだおいしいよ！"], special: ["全部盛り、夢色甘味大爆発！"], win: ["勝利の味は、最高にあまーい！"], defeat: ["溶ける前に冷蔵庫へ帰るね……。"]
    },
    junk: {
      idle: ["ギコギコ正常！たぶん正常！", "余ったネジ、勝利に使えるかな？"],
      open: ["ピコーン！いいマス判定、たぶん！"], evolve: ["部品増量！説明書なしで超進化！"],
      attack: ["ガラクタ全弾発射！"], hurt: ["部品が一個飛んだだけ！予備ある！"], special: ["ゼンマイ最大、終末ゼンマイ砲！"], win: ["ポンコツでも勝てる！むしろ勝った！"], defeat: ["分解整備して、だいたい直る予定……。"]
    },
    coral: {
      idle: ["潮の香りだ。珊瑚の海が呼んでるぞ！", "ぷくぷく、次の波に乗ろう！"],
      open: ["いい波だ！珊瑚が一斉に光った！"], evolve: ["海の命をまとって、大きくなるぞ！"],
      attack: ["潮の牙を受けろ！"], hurt: ["波に揺れただけさ！"], special: ["海底まで響け、珊瑚海嘯！"], win: ["青い海ぜんぶが勝利を祝ってる！"], defeat: ["潮が満ちたら、また会おう……。"]
    },
    corsair: {
      idle: ["ヨーソロー！お宝マスはあっちだ！", "船長命令、派手に開けろー！"],
      open: ["大当たりだ！宝箱に入れとこう！"], evolve: ["新しい船と力を手に入れたぞ！"],
      attack: ["全砲門、ぶっぱなせ！"], hurt: ["船がちょいと揺れただけだ！"], special: ["海賊旗を上げろ、大海賊砲撃！"], win: ["勝利のお宝、ぜんぶいただき！"], defeat: ["沈んでも海賊は戻ってくるぞ……。"]
    },
    dune: {
      idle: ["砂は全部覚えている。勝ち筋もな。", "焦るな、砂嵐はこれからだ。"],
      open: ["砂の下から当たりを掘り出したぞ！"], evolve: ["砂岩の鎧が、さらに厚くなる！"],
      attack: ["砂ごと押し潰す！"], hurt: ["この装甲は崩れん！"], special: ["砂漠を覆え、黄金砂嵐！"], win: ["砂上に刻んだ勝利は消えない！"], defeat: ["砂に潜って出直すか……。"]
    },
    fossil: {
      idle: ["ガシャガシャ！太古の血が騒ぐ！", "一億年前から勝つ気だったぞ！"],
      open: ["発掘成功！とんでもない一手だ！"], evolve: ["眠っていた太古の姿が蘇る！"],
      attack: ["骨まで響く一撃だ！"], hurt: ["骨一本くらい予備がある！"], special: ["時代ごと吹き飛べ、太古絶滅衝！"], win: ["歴史に新しい勝者を刻んだぞ！"], defeat: ["また化石になって待ってる……。"]
    },
    samurai: {
      idle: ["静かに構えよ。勝機は一瞬。", "我が刃、次の一手を待っている。"],
      open: ["見事！迷いなき一手でござる！"], evolve: ["新たな鎧と覚悟、ここに！"],
      attack: ["一閃、参る！"], hurt: ["まだ膝はつかぬ！"], special: ["天下に轟け、天下無双斬！"], win: ["勝負あり。良き戦であった！"], defeat: ["修行を重ね、再び参る……。"]
    },
    dojo: {
      idle: ["押忍！一手一手が修行だ！", "構えろ、盤面も相手もまっすぐ見る！"],
      open: ["押忍！芯の通ったいいマスだ！"], evolve: ["鍛錬の成果、いま形となる！"],
      attack: ["正拳、まっすぐ撃ち抜く！"], hurt: ["痛みも修行のうち！"], special: ["百の拳を一瞬に、百拳天衝！"], win: ["礼！最高の勝負だった！"], defeat: ["腕立て千回して戻るぞ……。"]
    },
    sonic: {
      idle: ["ボリューム上げてくよ！準備はいい？", "次のマス、リズムに乗ってる！"],
      open: ["ナイスビート！盤面が跳ねた！"], evolve: ["新しいサウンドが体を駆け巡る！"],
      attack: ["低音をくらえー！"], hurt: ["ノイズくらいじゃ止まらない！"], special: ["会場ごと揺らせ、超音轟奏！"], win: ["アンコール！勝利の曲をもう一回！"], defeat: ["次のライブは絶対勝つからね……。"]
    },
    festival: {
      idle: ["わっしょい！盤面が祭りを待ってるぞ！", "太鼓鳴らして景気よくいこう！"],
      open: ["たーまやー！いいマス開いた！"], evolve: ["祭りはここから本番だー！"],
      attack: ["ドンドコ突撃だ！"], hurt: ["祭りの熱でへっちゃらだ！"], special: ["夜空を埋めろ、万発大花火！"], win: ["勝利だ、朝まで踊れー！"], defeat: ["来年の祭りでリベンジだ……。"]
    },
    bloom: {
      idle: ["つぼみが揺れてる。いいことが起きそう。", "一緒に勝利の花を咲かせよう。"],
      open: ["ほら、きれいな一手が咲いたよ！"], evolve: ["春の力が、新しい姿をくれた！"],
      attack: ["花びらの刃、舞って！"], hurt: ["散ってもまた咲けるよ。"], special: ["世界いっぱいに、百花天輪！"], win: ["みんなの勝利が満開だね！"], defeat: ["次の春まで根を伸ばすね……。"]
    },
    dream: {
      idle: ["すやぁ……勝つ夢、見えてるよ。", "次のマスは雲の向こう……たぶん。"],
      open: ["むにゃ！夢と同じマスが開いた！"], evolve: ["もっと大きな夢の姿になるよ……。"],
      attack: ["おやすみ雲、えいっ。"], hurt: ["夢だから痛く……ちょっと痛い。"], special: ["みんな眠れ、夢界大睡眠！"], win: ["勝った夢じゃなくて、本当に勝った！"], defeat: ["もう五分だけ寝たら本気出す……。"]
    },
    slime: {
      idle: ["ぷるぷる。形はないけど作戦はある！", "今日は丸め？それとも四角め？"],
      open: ["ぷるん！いい感じにへこんだ！"], evolve: ["ぷるるるる！体積が増えたー！"],
      attack: ["べちゃっと体当たり！"], hurt: ["飛び散った分を回収中！"], special: ["増えて混ざって、虹粘超分裂！"], win: ["勝利の形になりましたー！"], defeat: ["びんに入って休んでくる……。"]
    },
    gourmet: {
      idle: ["勝利のフルコース、仕込みは完璧！", "次のマス、いい匂いがするぞ！"],
      open: ["絶妙な焼き加減！ナイスオープン！"], evolve: ["火力最大、新メニュー完成だ！"],
      attack: ["熱々の一皿をくらえ！"], hurt: ["味見の刺激より軽い！"], special: ["全部盛りだ、究極満漢全席！"], win: ["勝利をおいしくいただきます！"], defeat: ["レシピを直して出直すぞ……。"]
    },
    ink: {
      idle: ["白い盤面に、勝利の一筆を。", "墨の流れが次のマスを示している。"],
      open: ["見事な一画。盤面が締まった！"], evolve: ["墨が踊り、新たな姿を描き出す！"],
      attack: ["黒き筆勢、走れ！"], hurt: ["にじみも絵の味だ。"], special: ["天地を描き替えろ、天地水墨画！"], win: ["勝利の落款、ここに完成。"], defeat: ["紙を替えて描き直そう……。"]
    },
    ninja: {
      idle: ["ニン。次のマスはすでに見切った。", "気配を消して、勝利へ近づく。"],
      open: ["任務成功。鮮やかな一手だ。"], evolve: ["秘伝の術で、新たな姿へ！"],
      attack: ["影より速く斬る！"], hurt: ["今のは残像……ではない！"], special: ["千の影よ、影分身絶影刃！"], win: ["任務完了。誰にも見つからず勝利。"], defeat: ["煙玉！次こそ仕留める……。"]
    },
    rail: {
      idle: ["出発進行！勝利駅までノンストップ！", "次のマスへ定刻通り参ります！"],
      open: ["ポイント切替よし！いいルートだ！"], evolve: ["車両増結、超進化急行だ！"],
      attack: ["特急通過、道を空けろ！"], hurt: ["少々の遅延、すぐ回復！"], special: ["終点まで一直線、超特急轢撃！"], win: ["勝利駅に定刻到着！"], defeat: ["車庫で整備して折り返します……。"]
    },
    ryu: {
      idle: ["龍脈が騒いでおる。次は良き一手ぞ。", "雲を呼び、勝運を集めよう。"],
      open: ["見事。盤面に龍の道が通った！"], evolve: ["天地の気よ、我を新たな龍へ！"],
      attack: ["龍爪、雲を裂け！"], hurt: ["この鱗、まだ砕けぬ。"], special: ["大地を巡れ、天地龍脈波！"], win: ["龍は勝者とともに天へ昇る。"], defeat: ["深き淵で力を蓄えよう……。"]
    },
    "legend-sun": {
      idle: ["光は満ちた。勝利への道を照らそう。"], open: ["その一手、天へ届いた。"], evolve: ["太陽の門が開く。伝説はここに降り立つ！"],
      attack: ["光輪よ、悪しきを焼き払え！"], hurt: ["この光は、まだ陰らない。"], special: ["天照・万象光輪！"], win: ["見事だ。汝らの勝利を太陽に刻もう。"], defeat: ["光は沈み、また昇る……。"]
    },
    "legend-night": {
      idle: ["星々が沈黙した。終焉の刻を待っている。"], open: ["運命の星が、いま砕けた。"], evolve: ["虚空が裂け、冥星の伝説が顕現する！"],
      attack: ["星ごと喰らい尽くす。"], hurt: ["虚無に傷は残らない。"], special: ["冥星・虚空終焉！"], win: ["勝利だけが、この宇宙に残った。"], defeat: ["我は星の闇へ還る……。"]
    },
    "legend-world": {
      idle: ["森も海も空も、汝らの一手を見守っている。"], open: ["世界の環が、勝利へひとつ巡った。"], evolve: ["翠の大地よ目覚めよ。世界の伝説が顕現する！"],
      attack: ["大地の脈動を受けよ。"], hurt: ["世界樹の根は揺るがない。"], special: ["万物よ蘇れ、翠環・世界新生！"], win: ["新しい世界に、汝らの勝利を刻もう。"], defeat: ["大地へ還り、再生の時を待つ……。"]
    },
    "legend-time": {
      idle: ["時の翼は、すでに勝利の瞬間を見た。"], open: ["その一手で未来が鮮烈に変わった。"], evolve: ["時輪よ砕け。永劫を越える伝説が降臨する！"],
      attack: ["一秒ごと焼き尽くす。"], hurt: ["傷つく前の時へ戻るだけだ。"], special: ["永遠を断て、時焔・永劫破断！"], win: ["この勝利は、すべての時代に残る。"], defeat: ["次の時代で再び相まみえよう……。"]
    }
  });

  function buildNodes() {
    const nodes = {};
    const add = (node) => { nodes[node.id] = Object.freeze(node); };
    const sprite = (sheet, size, position, aspect = 1, zoom = 1.12, facing = "left") => ({ sheet: `images/monsters/${sheet}`, size, position, aspect, zoom, facing });
    add({ id: "egg", name: "ふしぎタマゴ", stage: 0, lineage: "egg", sprite: sprite("egg.png", "contain", "center", 1, 1.16), next: ["child-ember", "child-odd", "child-frost", "child-shadow", "child-tide", "child-rune", "child-bloom", "child-scroll"] });
    add({ id: "child-ember", name: "ヒノコロン", stage: 1, lineage: "beast", sprite: sprite("childhood.png", "200% 100%", "0% 50%", .75, 1.16), next: ["growth-flare", "growth-gear"] });
    add({ id: "child-odd", name: "ぷるるん", stage: 1, lineage: "odd", sprite: sprite("childhood.png", "200% 100%", "100% 50%", .75, 1.16), next: ["growth-moss", "growth-bubble"] });
    add({ id: "child-frost", name: "ユキマル", stage: 1, lineage: "glacier", sprite: sprite("childhood-extra.png", "200% 100%", "0% 50%", .75, 1.12), next: ["growth-frost", "growth-storm"] });
    add({ id: "child-shadow", name: "ヨイフワ", stage: 1, lineage: "shadow", sprite: sprite("childhood-extra.png", "200% 100%", "100% 50%", .75, 1.12), next: ["growth-shadow", "growth-toy"] });
    add({ id: "child-tide", name: "しずくポヨ", stage: 1, lineage: "coral", sprite: sprite("childhood-new.png", "400% 100%", "0% 50%", .75, 1.13), next: ["growth-coral", "growth-dune"] });
    add({ id: "child-rune", name: "ルーンコ", stage: 1, lineage: "sonic", sprite: sprite("childhood-new.png", "400% 100%", "33.333% 50%", .75, 1.13), next: ["growth-blade", "growth-sonic"] });
    add({ id: "child-bloom", name: "はなピィ", stage: 1, lineage: "bloom", sprite: sprite("childhood-new.png", "400% 100%", "66.667% 50%", .75, 1.13), next: ["growth-bloom", "growth-slime"] });
    add({ id: "child-scroll", name: "まきものん", stage: 1, lineage: "ryu", sprite: sprite("childhood-new.png", "400% 100%", "100% 50%", .75, 1.13), next: ["growth-ink", "growth-rail"] });
    [
      ["growth-flare", "ほむらガオ", 0, "beast", ["inferno-mature", "thunder-mature"]],
      ["growth-gear", "ギアピヨン", 1, "mecha", ["mecha-mature", "beetle-mature"]],
      ["growth-moss", "モスモグ", 2, "grove", ["grove-mature", "spore-mature"]],
      ["growth-bubble", "アワプク", 3, "odd", ["abyss-mature", "cosmic-mature"]]
    ].forEach(([id, name, x, lineage, next, facing]) => add({ id, name, stage: 2, lineage, sprite: sprite("growth-v2.png", "400% 100%", `${x * 33.333}% 50%`, 1, 1.18, facing), next }));
    [
      ["growth-frost", "コオリヒョウ", 0, "glacier", ["glacier-mature", "crystal-mature"]],
      ["growth-storm", "ソラバネ", 1, "sky", ["sky-mature", "tempest-mature"]],
      ["growth-shadow", "ヨルカゲ", 2, "shadow", ["shadow-mature", "spirit-mature"]],
      ["growth-toy", "オモチャバコ", 3, "junk", ["candy-mature", "junk-mature"]]
    ].forEach(([id, name, x, lineage, next]) => add({ id, name, stage: 2, lineage, sprite: sprite("growth-extra-v2.png", "400% 100%", `${x * 33.333}% 50%`, 1, 1.15), next }));
    [
      ["growth-coral", "サンゴッコ", 0, "coral", ["coral-mature", "corsair-mature"], "right"],
      ["growth-dune", "スナゴロ", 1, "dune", ["dune-mature", "fossil-mature"], "right"],
      ["growth-blade", "カタナッコ", 2, "samurai", ["samurai-mature", "dojo-mature"]],
      ["growth-sonic", "オトタマ", 3, "sonic", ["sonic-mature", "festival-mature"]]
    ].forEach(([id, name, x, lineage, next, facing]) => add({ id, name, stage: 2, lineage, sprite: sprite("growth-new-a.png", "400% 100%", `${x * 33.333}% 50%`, .625, 1.15, facing), next }));
    [
      ["growth-bloom", "ハナモリ", 0, "bloom", ["bloom-mature", "dream-mature"]],
      ["growth-slime", "ぷるゼリー", 1, "slime", ["slime-mature", "gourmet-mature"]],
      ["growth-ink", "スミマル", 2, "ink", ["ink-mature", "ninja-mature"]],
      ["growth-rail", "ちびドラ号", 3, "rail", ["rail-mature", "ryu-mature"]]
    ].forEach(([id, name, x, lineage, next]) => add({ id, name, stage: 2, lineage, sprite: sprite("growth-new-b.png", "400% 100%", `${x * 33.333}% 50%`, .75, 1.15), next }));
    LINEAGES.forEach((lineage) => {
      const matureId = `${lineage.id}-mature`;
      const perfectA = `${lineage.id}-perfect-a`;
      const perfectB = `${lineage.id}-perfect-b`;
      const aspect = lineage.aspect || .75;
      const facingFor = (slot) => lineage.rightFacing?.includes(slot) ? "right" : "left";
      add({ id: matureId, name: lineage.mature, stage: 3, lineage: lineage.id, sprite: sprite(lineage.sheet, "400% 200%", "0% 0%", aspect, 1.16, facingFor("mature")), next: [perfectA, perfectB] });
      add({ id: perfectA, name: lineage.perfect[0], stage: 4, lineage: lineage.id, sprite: sprite(lineage.sheet, "400% 200%", "33.333% 0%", aspect, 1.16, facingFor("perfect-a")), next: [`${lineage.id}-ultimate-0`, `${lineage.id}-ultimate-1`] });
      add({ id: perfectB, name: lineage.perfect[1], stage: 4, lineage: lineage.id, sprite: sprite(lineage.sheet, "400% 200%", "66.667% 0%", aspect, 1.16, facingFor("perfect-b")), next: [`${lineage.id}-ultimate-2`, `${lineage.id}-ultimate-3`] });
      lineage.ultimate.forEach((name, index) => add({ id: `${lineage.id}-ultimate-${index}`, name, stage: 5, lineage: lineage.id, sprite: sprite(lineage.sheet, "400% 200%", `${index * 33.333}% 100%`, aspect, 1.14, facingFor(`ultimate-${index}`)), next: [`${lineage.id}-rank6`] }));
    });
    LINEAGES.forEach((lineage, index) => {
      const sheet = index < 16 ? "rank6-a-v3.png" : "rank6-b-v3.png";
      const slot = index % 16;
      const x = slot % 4;
      const y = Math.floor(slot / 4);
      add({
        id: `${lineage.id}-rank6`,
        name: RANK6_NAMES[lineage.id],
        stage: 6,
        lineage: lineage.id,
        rank6: true,
        requirements: lineage.ultimate.map((_, ultimateIndex) => `${lineage.id}-ultimate-${ultimateIndex}`),
        sprite: sprite(sheet, "400% 400%", `${x * 33.333}% ${y * 33.333}%`, 1, 1.08, RANK6_RIGHT_FACING.has(lineage.id) ? "right" : "left"),
        next: []
      });
    });
    add({ id: "legend-sun", name: "天照皇レイオーン", stage: 5, lineage: "legend-sun", legendary: true, sprite: sprite("legendary.png", "200% 100%", "0% 50%", .75, 1.16), next: [] });
    add({ id: "legend-night", name: "冥星王ゼロノクス", stage: 5, lineage: "legend-night", legendary: true, sprite: sprite("legendary.png", "200% 100%", "100% 50%", .75, 1.16), next: [] });
    add({ id: "legend-world", name: "翠環神ユグドラグーン", stage: 5, lineage: "legend-world", legendary: true, sprite: sprite("legendary-new.png", "200% 100%", "0% 50%", .875, 1.16), next: [] });
    add({ id: "legend-time", name: "時焔皇クロノフェニクス", stage: 5, lineage: "legend-time", legendary: true, sprite: sprite("legendary-new.png", "200% 100%", "100% 50%", .875, 1.16), next: [] });
    return Object.freeze(nodes);
  }

  const NODES = buildNodes();

  function rank6Requirements(nodeId) {
    const node = NODES[nodeId];
    if (!node) return [];
    if (node.rank6) return [...(node.requirements || [])];
    const target = (node.next || []).map((id) => NODES[id]).find((candidate) => candidate?.rank6);
    return [...(target?.requirements || [])];
  }

  function canEvolveRank6(nodeId, monsterDex = {}) {
    const requirements = rank6Requirements(nodeId);
    return Boolean(requirements.length && requirements.every((id) => monsterDex?.[id]));
  }

  function normalizeName(name) {
    return String(name || "").trim().replace(/\s+/g, " ") || "UNKNOWN PLAYER";
  }

  function playerKey(name) {
    return normalizeName(name).toLocaleLowerCase("ja-JP");
  }

  function monsterSlot(value) {
    return Math.max(0, Math.min(1, Math.floor(Number(value) || 0)));
  }

  function monsterKey(name, slot = 0) {
    return `${playerKey(name)}::${monsterSlot(slot)}`;
  }

  function createPlayerMonster(name, team = "", slot = 0) {
    const normalized = normalizeName(name);
    return {
      playerKey: playerKey(normalized), playerName: normalized, team, slot: monsterSlot(slot),
      nodeId: "egg", stage: 0, opens: 0, history: ["egg"], claimedCells: []
    };
  }

  function normalizePlayerMonster(value, name = "", team = "", slot = undefined) {
    const source = value && typeof value === "object" ? value : {};
    const normalized = normalizeName(name || source.playerName);
    const node = NODES[source.nodeId] || NODES.egg;
    const history = Array.isArray(source.history) ? source.history.filter((id) => NODES[id]) : [];
    return {
      playerKey: playerKey(normalized),
      playerName: normalized,
      team: team || source.team || "",
      slot: monsterSlot(slot === undefined ? source.slot : slot),
      nodeId: node.id,
      stage: node.stage,
      opens: Math.max(0, Number(source.opens) || 0),
      history: history.length ? history : [node.id],
      claimedCells: Array.from(new Set(Array.isArray(source.claimedCells) ? source.claimedCells.map(String) : []))
    };
  }

  function syncPlayerMonsters(existing, members, team, monstersPerPlayer = 1) {
    const source = Array.isArray(existing) ? existing : [];
    const count = monstersPerPlayer === 2 ? 2 : 1;
    const byKey = new Map(source.map((monster) => [monsterKey(monster?.playerName, monster?.slot), monster]));
    return (members || []).flatMap((member) => Array.from({ length: count }, (_, slot) => (
      normalizePlayerMonster(byKey.get(monsterKey(member, slot)), member, team, slot)
    )));
  }

  function distributedEvolutionRandom(value, peers = [], random = Math.random) {
    const monster = normalizePlayerMonster(value, value?.playerName, value?.team);
    const current = NODES[monster.nodeId] || NODES.egg;
    if (!current.next.length) return random;
    const occupied = (peers || []).map((peer) => NODES[peer?.nodeId] ? peer.nodeId : "");
    const counts = current.next.map((nodeId) => occupied.filter((occupiedId) => occupiedId === nodeId).length);
    const minimum = Math.min(...counts);
    const candidates = counts.map((count, index) => count === minimum ? index : -1).filter((index) => index >= 0);
    const selected = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))] || 0;
    let branchSelected = false;
    return () => {
      if (!branchSelected) {
        branchSelected = true;
        return (selected + .25) / current.next.length;
      }
      return random();
    };
  }

  function evolvePlayerMonster(value, cellToken = "", random = Math.random, monsterDex = {}) {
    const monster = normalizePlayerMonster(value, value?.playerName, value?.team);
    const token = String(cellToken || "");
    if (token && monster.claimedCells.includes(token)) return { monster, evolved: false, previousId: monster.nodeId };
    if (token) monster.claimedCells.push(token);
    monster.opens += 1;
    const previousId = monster.nodeId;
    const current = NODES[previousId];
    if (!current?.next?.length) return { monster, evolved: false, previousId };
    const rank6Target = current.next.map((id) => NODES[id]).find((node) => node?.rank6);
    if (rank6Target && !canEvolveRank6(current.id, monsterDex)) {
      return { monster, evolved: false, previousId, rank6Locked: true, requirements: rank6Requirements(current.id) };
    }
    const nextIndex = Math.max(0, Math.min(current.next.length - 1, Math.floor(random() * current.next.length)));
    let next = NODES[current.next[nextIndex]];
    if (current.stage === 4 && random() < LEGENDARY_CHANCE) {
      const legendaryIndex = Math.max(0, Math.min(LEGENDARY_IDS.length - 1, Math.floor(random() * LEGENDARY_IDS.length)));
      next = NODES[LEGENDARY_IDS[legendaryIndex]] || next;
    }
    monster.nodeId = next.id;
    monster.stage = next.stage;
    monster.history.push(next.id);
    return { monster, evolved: true, previousId };
  }

  function hashText(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function passiveSkill(nodeId) {
    const node = NODES[nodeId] || NODES.egg;
    const offset = node.stage * 3 + (node.legendary ? 7 : 0) + (node.rank6 ? 11 : 0);
    return PASSIVE_SKILLS[(hashText(node.id) + offset) % PASSIVE_SKILLS.length];
  }

  function combatElement(nodeId) {
    const node = NODES[nodeId] || NODES.egg;
    return ELEMENTS[COMBAT_ELEMENT_BY_LINEAGE[node.lineage]] || ELEMENTS.earth;
  }

  function combatRole(nodeId) {
    const node = NODES[nodeId] || NODES.egg;
    return ROLES[ROLE_BY_LINEAGE[node.lineage]] || ROLES.striker;
  }

  function elementMultiplier(attackerElement, targetElement) {
    const attack = typeof attackerElement === "string" ? attackerElement : attackerElement?.id;
    const target = typeof targetElement === "string" ? targetElement : targetElement?.id;
    if (!ELEMENTS[attack] || !ELEMENTS[target] || attack === target) return 1;
    if (ELEMENT_ADVANTAGE[attack] === target) return 1.1;
    if (ELEMENT_ADVANTAGE[target] === attack) return 1 / 1.1;
    return 1;
  }

  function statusForElement(element) {
    const id = typeof element === "string" ? element : element?.id;
    return Object.values(STATUS_EFFECTS).find((status) => status.element === id) || null;
  }

  function linkTechnique(firstNodeId, secondNodeId) {
    const first = combatElement(firstNodeId);
    const second = combatElement(secondNodeId);
    if (first.id === second.id) {
      return { id: `${first.id}-resonance`, name: `${first.name}双星陣`, multiplier: 1.30, chanceBonus: .16, elements: [first.id] };
    }
    const pair = [first.id, second.id].sort().join("+");
    const named = {
      "fire+wind": "爆嵐クロスブレイカー",
      "lightning+water": "蒼雷タイダルボルト",
      "ice+light": "極光ダイヤモンドレイ",
      "dark+earth": "冥界グランドフォール",
      "dark+light": "終極エクリプスノヴァ",
      "earth+fire": "火山皇メテオバースト",
      "ice+water": "絶海フローズンゼロ",
      "lightning+wind": "天翔サンダーテンペスト"
    }[pair];
    return {
      id: pair.replace("+", "-"),
      name: named || `${first.name}${second.name}クロスインパクト`,
      multiplier: named ? 1.34 : 1.24,
      chanceBonus: named ? .12 : .04,
      elements: [first.id, second.id]
    };
  }

  function masteryLevel(experience) {
    const xp = Math.max(0, Number(experience) || 0);
    return Math.min(50, 1 + Math.floor(Math.sqrt(xp / 24)));
  }

  function applyMasteryStats(stats, experience) {
    const source = stats && typeof stats === "object" ? stats : {};
    const level = masteryLevel(experience);
    const boosted = { ...source, masteryLevel: level };
    ["hp", "attack", "defense", "magic", "magicDefense", "speed"].forEach((key) => {
      boosted[key] = Math.max(1, Math.round(Number(source[key]) || 0) + level);
    });
    return boosted;
  }

  function masteryInheritanceRate(currentStage, ancestorStage) {
    const distance = Math.max(0, Math.floor(Number(currentStage) || 0) - Math.floor(Number(ancestorStage) || 0));
    return [1, .32, .16, .08, .04, .02, .01][Math.min(6, distance)];
  }

  function masteryExperienceDistribution(history, currentNodeId, experience) {
    const gain = Math.max(0, Math.round(Number(experience) || 0));
    if (!gain || !NODES[currentNodeId]) return [];
    const ids = Array.from(new Set([...(Array.isArray(history) ? history : []), currentNodeId])).filter((id) => NODES[id]);
    const currentStage = NODES[currentNodeId].stage;
    return ids.map((nodeId) => ({
      nodeId,
      experience: Math.max(1, Math.round(gain * masteryInheritanceRate(currentStage, NODES[nodeId].stage)))
    }));
  }

  function masteryTitle(experience) {
    const level = masteryLevel(experience);
    if (level >= 40) return "魂の盟友";
    if (level >= 25) return "歴戦の相棒";
    if (level >= 15) return "共鳴する絆";
    if (level >= 7) return "頼れる仲間";
    if (level >= 3) return "育成中";
    return "はじめまして";
  }

  const ELEMENT_BY_LINEAGE = Object.freeze({
    inferno: "fire", thunder: "lightning", mecha: "impact", beetle: "claw", grove: "earth", spore: "dark",
    abyss: "water", cosmic: "dark", glacier: "ice", crystal: "light", sky: "wind", tempest: "lightning",
    shadow: "dark", spirit: "light", candy: "light", junk: "impact", coral: "water", corsair: "slash",
    dune: "earth", fossil: "fang", samurai: "slash", dojo: "impact", sonic: "wind", festival: "fire",
    bloom: "light", dream: "dark", slime: "water", gourmet: "fang", ink: "dark", ninja: "claw", rail: "impact",
    ryu: "lightning", beast: "claw", odd: "water", egg: "impact", "legend-sun": "light", "legend-night": "dark",
    "legend-world": "earth", "legend-time": "fire"
  });

  function battleEffect(nodeId, special = false) {
    const node = NODES[nodeId] || NODES.egg;
    const effect = ELEMENT_BY_LINEAGE[node.lineage] || (combatStats(node.id).attackType === "magic" ? "light" : "impact");
    if (!special && combatStats(node.id).attackType === "physical") {
      const physical = ["claw", "fang", "slash", "impact"];
      return physical[hashText(node.id) % physical.length];
    }
    return effect;
  }

  function combatStats(nodeId) {
    const node = NODES[nodeId] || NODES.egg;
    const archetype = COMBAT_ARCHETYPES[node.lineage] || COMBAT_ARCHETYPES.odd;
    const element = combatElement(node.id);
    const role = combatRole(node.id);
    const base = [
      { hp: 150, attack: 24, defense: 22, magic: 24, magicDefense: 22, speed: 20 },
      { hp: 220, attack: 34, defense: 31, magic: 34, magicDefense: 31, speed: 31 },
      { hp: 310, attack: 48, defense: 43, magic: 48, magicDefense: 43, speed: 44 },
      { hp: 420, attack: 65, defense: 58, magic: 65, magicDefense: 58, speed: 60 },
      { hp: 550, attack: 84, defense: 76, magic: 84, magicDefense: 76, speed: 78 },
      { hp: 700, attack: 108, defense: 98, magic: 108, magicDefense: 98, speed: 100 },
      { hp: 920, attack: 142, defense: 128, magic: 142, magicDefense: 128, speed: 126 }
    ][node.stage];
    const variance = ((hashText(node.id) % 15) - 7) / 100;
    const scaled = (key) => Math.max(1, Math.round(base[key] * archetype[key] * (1 + variance)));
    return {
      hp: scaled("hp"), attack: scaled("attack"), defense: scaled("defense"), magic: scaled("magic"),
      magicDefense: scaled("magicDefense"), speed: scaled("speed"), attackType: archetype.type, special: archetype.special,
      element: element.id, elementName: element.name, role: role.id, roleName: role.name
    };
  }

  function specialChanceForHype(value) {
    const hype = Math.max(0, Math.min(100, Number(value) || 0));
    return .06 + (hype / 100) * .42;
  }

  function dialogue(nodeId, moment = "idle", random = Math.random) {
    const node = NODES[nodeId] || NODES.egg;
    const tone = DIALOGUE[node.lineage] || DIALOGUE.odd;
    const pool = tone[moment] || tone.idle || ["……！"];
    return pool[Math.max(0, Math.min(pool.length - 1, Math.floor(random() * pool.length)))] || pool[0];
  }

  function seededRandom(seed) {
    let value = Number(seed) >>> 0 || 1;
    return () => {
      value += 0x6D2B79F5;
      let mixed = value;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  global.TeamBingoMonsterSystem = Object.freeze({
    STAGES, LINEAGES, LEGENDARY_IDS, LEGENDARY_CHANCE, RANK6_NAMES, PASSIVE_SKILLS, ELEMENTS, ROLES, STATUS_EFFECTS, NODES,
    createPlayerMonster, normalizePlayerMonster, syncPlayerMonsters, distributedEvolutionRandom, evolvePlayerMonster,
    rank6Requirements, canEvolveRank6, passiveSkill, combatElement, combatRole, elementMultiplier, statusForElement, linkTechnique,
    masteryLevel, masteryTitle, applyMasteryStats, masteryInheritanceRate, masteryExperienceDistribution,
    battleEffect, combatStats, specialChanceForHype, dialogue, playerKey, monsterKey, seededRandom
  });
})(typeof window !== "undefined" ? window : globalThis);
