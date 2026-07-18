(function bootstrapMonsterSystem(global) {
  "use strict";

  const STAGES = ["たまご", "幼少期", "成長期", "成熟期", "完全体", "究極体"];
  const LINEAGES = [
    { id: "inferno", sheet: "lineage-inferno.png", mature: "FLARE LEO", perfect: ["OBSIDIAN LEON", "MAGMA WYVERN"], ultimate: ["SOLAR LEONIS", "CERBERUS REX", "INFERNO DRACROWN", "COMET CHIMERA"] },
    { id: "thunder", sheet: "lineage-thunder.png", mature: "STORM FANG", perfect: ["SABER VOLT", "CLOUD KIRIN"], ultimate: ["VOLT FENRIR", "LIGHTNING TIGRON", "RAIJIN KIRIN", "TEMPEST DRACOLF"] },
    { id: "mecha", sheet: "lineage-mecha.png", mature: "GEAR FALCON", perfect: ["JET RAPTOR", "ARMOR OWL"], ultimate: ["ORBITAL PHOENIX", "STEALTH GRYPHON", "FORTRESS NOCTUA", "SOLAR LASERWING"] },
    { id: "beetle", sheet: "lineage-beetle.png", mature: "CHRONO BEETLE", perfect: ["DRILL SCARAB", "GEAR STAG"], ultimate: ["SIEGE COLOSSUS", "STEAM TITAN", "TIME EMPEROR", "RAZOR MANTIS"] },
    { id: "grove", sheet: "lineage-grove.png", mature: "MOSS GUARDIAN", perfect: ["VERDANT KNIGHT", "BLOSSOM SHAMAN"], ultimate: ["WORLDROOT GIANT", "GROVE PALADIN", "SAKURA DEITY", "SUNWOOD DRAGON"] },
    { id: "spore", sheet: "lineage-spore.png", mature: "SPORE GOBLIN", perfect: ["POISON JESTER", "MYCELIUM WITCH"], ultimate: ["PLAGUE CARNIVAL", "TOXIC CLOWN", "NIGHTMARE QUEEN", "COSMIC ORACLE"] },
    { id: "abyss", sheet: "lineage-abyss.png", mature: "ABYSS SHARK", perfect: ["ANCHOR ORCA", "SWORDFIN"], ultimate: ["LEVIATHAN ORCA", "KRAKEN SHARK", "SEA EMPEROR", "SUBMARINE DRAGON"] },
    { id: "cosmic", sheet: "lineage-cosmic.png", mature: "STAR JELLY", perfect: ["NEBULA MAGE", "MOON MANTA"], ultimate: ["GALAXY DEITY", "CONSTELLATION RAY", "MOON JELLY QUEEN", "BLACKHOLE OCTO"] }
  ];

  const COMBAT_ARCHETYPES = {
    egg:     { hp: 1.05, attack: .82, defense: 1.04, magic: .82, magicDefense: 1.08, speed: .78, type: "physical", special: "SHELL BURST" },
    beast:   { hp: 1.02, attack: 1.10, defense: .96, magic: .82, magicDefense: .90, speed: 1.13, type: "physical", special: "WILD ROAR" },
    odd:     { hp: 1.08, attack: .82, defense: 1.06, magic: 1.10, magicDefense: 1.12, speed: .86, type: "magic", special: "ODD MIRACLE" },
    inferno: { hp: 1.02, attack: 1.24, defense: .94, magic: 1.04, magicDefense: .86, speed: 1.02, type: "physical", special: "SUNBURST ROAR" },
    thunder: { hp: .90, attack: 1.15, defense: .84, magic: 1.06, magicDefense: .92, speed: 1.32, type: "physical", special: "THUNDER HOWL" },
    mecha:   { hp: 1.12, attack: 1.08, defense: 1.26, magic: .82, magicDefense: 1.05, speed: .82, type: "physical", special: "ORBITAL CANNON" },
    beetle:  { hp: 1.18, attack: 1.03, defense: 1.34, magic: .70, magicDefense: 1.02, speed: .72, type: "physical", special: "CHRONO CRUSH" },
    grove:   { hp: 1.22, attack: .82, defense: 1.12, magic: 1.12, magicDefense: 1.28, speed: .72, type: "magic", special: "WORLDROOT BLOOM" },
    spore:   { hp: .94, attack: .72, defense: .84, magic: 1.33, magicDefense: 1.12, speed: .95, type: "magic", special: "NIGHTMARE SPORES" },
    abyss:   { hp: 1.12, attack: 1.18, defense: 1.02, magic: .88, magicDefense: .96, speed: 1.02, type: "physical", special: "LEVIATHAN TIDE" },
    cosmic:  { hp: .92, attack: .72, defense: .82, magic: 1.38, magicDefense: 1.22, speed: 1.12, type: "magic", special: "GALAXY COLLAPSE" }
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

  function buildNodes() {
    const nodes = {};
    const add = (node) => { nodes[node.id] = Object.freeze(node); };
    const sprite = (sheet, size, position, aspect = 1) => ({ sheet: `images/monsters/${sheet}`, size, position, aspect });
    add({ id: "egg", name: "MYSTERY EGG", stage: 0, lineage: "egg", sprite: sprite("egg.png", "contain", "center", 1), next: ["child-ember", "child-odd"] });
    add({ id: "child-ember", name: "EMBER CUB", stage: 1, lineage: "beast", sprite: sprite("childhood.png", "200% 100%", "0% 50%", .75), next: ["growth-flare", "growth-gear"] });
    add({ id: "child-odd", name: "ODDLING", stage: 1, lineage: "odd", sprite: sprite("childhood.png", "200% 100%", "100% 50%", .75), next: ["growth-moss", "growth-bubble"] });
    [
      ["growth-flare", "FLARE FANG", 0, "beast", ["inferno-mature", "thunder-mature"]],
      ["growth-gear", "GEAR WING", 1, "mecha", ["mecha-mature", "beetle-mature"]],
      ["growth-moss", "MOSS MUNCH", 2, "grove", ["grove-mature", "spore-mature"]],
      ["growth-bubble", "BUBBLE IMP", 3, "odd", ["abyss-mature", "cosmic-mature"]]
    ].forEach(([id, name, x, lineage, next]) => add({ id, name, stage: 2, lineage, sprite: sprite("growth.png", "400% 100%", `${x * 33.333}% 50%`, .375), next }));
    LINEAGES.forEach((lineage) => {
      const matureId = `${lineage.id}-mature`;
      const perfectA = `${lineage.id}-perfect-a`;
      const perfectB = `${lineage.id}-perfect-b`;
      add({ id: matureId, name: lineage.mature, stage: 3, lineage: lineage.id, sprite: sprite(lineage.sheet, "400% 200%", "0% 0%", .75), next: [perfectA, perfectB] });
      add({ id: perfectA, name: lineage.perfect[0], stage: 4, lineage: lineage.id, sprite: sprite(lineage.sheet, "400% 200%", "33.333% 0%", .75), next: [`${lineage.id}-ultimate-0`, `${lineage.id}-ultimate-1`] });
      add({ id: perfectB, name: lineage.perfect[1], stage: 4, lineage: lineage.id, sprite: sprite(lineage.sheet, "400% 200%", "66.667% 0%", .75), next: [`${lineage.id}-ultimate-2`, `${lineage.id}-ultimate-3`] });
      lineage.ultimate.forEach((name, index) => add({ id: `${lineage.id}-ultimate-${index}`, name, stage: 5, lineage: lineage.id, sprite: sprite(lineage.sheet, "400% 200%", `${index * 33.333}% 100%`, .75), next: [] }));
    });
    return Object.freeze(nodes);
  }

  const NODES = buildNodes();

  function normalizeName(name) {
    return String(name || "").trim().replace(/\s+/g, " ") || "UNKNOWN PLAYER";
  }

  function playerKey(name) {
    return normalizeName(name).toLocaleLowerCase("ja-JP");
  }

  function createPlayerMonster(name, team = "") {
    const normalized = normalizeName(name);
    return { playerKey: playerKey(normalized), playerName: normalized, team, nodeId: "egg", stage: 0, opens: 0, history: ["egg"], claimedCells: [] };
  }

  function normalizePlayerMonster(value, name = "", team = "") {
    const source = value && typeof value === "object" ? value : {};
    const normalized = normalizeName(name || source.playerName);
    const node = NODES[source.nodeId] || NODES.egg;
    const history = Array.isArray(source.history) ? source.history.filter((id) => NODES[id]) : [];
    return {
      playerKey: playerKey(normalized),
      playerName: normalized,
      team: team || source.team || "",
      nodeId: node.id,
      stage: node.stage,
      opens: Math.max(0, Number(source.opens) || 0),
      history: history.length ? history : [node.id],
      claimedCells: Array.from(new Set(Array.isArray(source.claimedCells) ? source.claimedCells.map(String) : []))
    };
  }

  function syncPlayerMonsters(existing, members, team) {
    const source = Array.isArray(existing) ? existing : [];
    const byKey = new Map(source.map((monster) => [playerKey(monster?.playerName), monster]));
    return (members || []).map((member) => normalizePlayerMonster(byKey.get(playerKey(member)), member, team));
  }

  function evolvePlayerMonster(value, cellToken = "", random = Math.random) {
    const monster = normalizePlayerMonster(value, value?.playerName, value?.team);
    const token = String(cellToken || "");
    if (token && monster.claimedCells.includes(token)) return { monster, evolved: false, previousId: monster.nodeId };
    if (token) monster.claimedCells.push(token);
    monster.opens += 1;
    const previousId = monster.nodeId;
    const current = NODES[previousId];
    if (!current?.next?.length) return { monster, evolved: false, previousId };
    const nextIndex = Math.max(0, Math.min(current.next.length - 1, Math.floor(random() * current.next.length)));
    const next = NODES[current.next[nextIndex]];
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

  function combatStats(nodeId) {
    const node = NODES[nodeId] || NODES.egg;
    const archetype = COMBAT_ARCHETYPES[node.lineage] || COMBAT_ARCHETYPES.odd;
    const base = [
      { hp: 150, attack: 24, defense: 22, magic: 24, magicDefense: 22, speed: 20 },
      { hp: 220, attack: 34, defense: 31, magic: 34, magicDefense: 31, speed: 31 },
      { hp: 310, attack: 48, defense: 43, magic: 48, magicDefense: 43, speed: 44 },
      { hp: 420, attack: 65, defense: 58, magic: 65, magicDefense: 58, speed: 60 },
      { hp: 550, attack: 84, defense: 76, magic: 84, magicDefense: 76, speed: 78 },
      { hp: 700, attack: 108, defense: 98, magic: 108, magicDefense: 98, speed: 100 }
    ][node.stage];
    const variance = ((hashText(node.id) % 15) - 7) / 100;
    const scaled = (key) => Math.max(1, Math.round(base[key] * archetype[key] * (1 + variance)));
    return {
      hp: scaled("hp"), attack: scaled("attack"), defense: scaled("defense"), magic: scaled("magic"),
      magicDefense: scaled("magicDefense"), speed: scaled("speed"), attackType: archetype.type, special: archetype.special
    };
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
    STAGES, LINEAGES, NODES, createPlayerMonster, normalizePlayerMonster, syncPlayerMonsters,
    evolvePlayerMonster, combatStats, dialogue, playerKey, seededRandom
  });
})(window);
