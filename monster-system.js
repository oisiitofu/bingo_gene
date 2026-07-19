(function bootstrapMonsterSystem(global) {
  "use strict";

  const STAGES = ["たまご", "幼少期", "成長期", "成熟期", "完全体", "究極体"];
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
    { id: "junk", sheet: "lineage-junk.png", mature: "ガラクタロボ", perfect: ["スクラップタンク", "ゼンマイ博士"], ultimate: ["廃材要塞王", "超合金ポンコツ", "爆走ジャンク竜", "終末ブリキ神"] }
  ];

  const LEGENDARY_IDS = ["legend-sun", "legend-night"];
  const LEGENDARY_CHANCE = .075;

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
    "legend-sun": { hp: 1.34, attack: 1.32, defense: 1.28, magic: 1.34, magicDefense: 1.30, speed: 1.20, type: "magic", special: "天照・万象光輪" },
    "legend-night": { hp: 1.30, attack: 1.36, defense: 1.24, magic: 1.38, magicDefense: 1.26, speed: 1.24, type: "physical", special: "冥星・虚空終焉" }
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
    "legend-sun": {
      idle: ["光は満ちた。勝利への道を照らそう。"], open: ["その一手、天へ届いた。"], evolve: ["太陽の門が開く。伝説はここに降り立つ！"],
      attack: ["光輪よ、悪しきを焼き払え！"], hurt: ["この光は、まだ陰らない。"], special: ["天照・万象光輪！"], win: ["見事だ。汝らの勝利を太陽に刻もう。"], defeat: ["光は沈み、また昇る……。"]
    },
    "legend-night": {
      idle: ["星々が沈黙した。終焉の刻を待っている。"], open: ["運命の星が、いま砕けた。"], evolve: ["虚空が裂け、冥星の伝説が顕現する！"],
      attack: ["星ごと喰らい尽くす。"], hurt: ["虚無に傷は残らない。"], special: ["冥星・虚空終焉！"], win: ["勝利だけが、この宇宙に残った。"], defeat: ["我は星の闇へ還る……。"]
    }
  });

  function buildNodes() {
    const nodes = {};
    const add = (node) => { nodes[node.id] = Object.freeze(node); };
    const sprite = (sheet, size, position, aspect = 1, zoom = 1.12) => ({ sheet: `images/monsters/${sheet}`, size, position, aspect, zoom });
    add({ id: "egg", name: "ふしぎタマゴ", stage: 0, lineage: "egg", sprite: sprite("egg.png", "contain", "center", 1, 1.16), next: ["child-ember", "child-odd", "child-frost", "child-shadow"] });
    add({ id: "child-ember", name: "ヒノコロン", stage: 1, lineage: "beast", sprite: sprite("childhood.png", "200% 100%", "0% 50%", .75, 1.16), next: ["growth-flare", "growth-gear"] });
    add({ id: "child-odd", name: "ぷるるん", stage: 1, lineage: "odd", sprite: sprite("childhood.png", "200% 100%", "100% 50%", .75, 1.16), next: ["growth-moss", "growth-bubble"] });
    add({ id: "child-frost", name: "ユキマル", stage: 1, lineage: "glacier", sprite: sprite("childhood-extra.png", "200% 100%", "0% 50%", .75, 1.12), next: ["growth-frost", "growth-storm"] });
    add({ id: "child-shadow", name: "ヨイフワ", stage: 1, lineage: "shadow", sprite: sprite("childhood-extra.png", "200% 100%", "100% 50%", .75, 1.12), next: ["growth-shadow", "growth-toy"] });
    [
      ["growth-flare", "ほむらガオ", 0, "beast", ["inferno-mature", "thunder-mature"]],
      ["growth-gear", "ギアピヨン", 1, "mecha", ["mecha-mature", "beetle-mature"]],
      ["growth-moss", "モスモグ", 2, "grove", ["grove-mature", "spore-mature"]],
      ["growth-bubble", "アワプク", 3, "odd", ["abyss-mature", "cosmic-mature"]]
    ].forEach(([id, name, x, lineage, next]) => add({ id, name, stage: 2, lineage, sprite: sprite("growth.png", "400% 100%", `${x * 33.333}% 50%`, .375, 1.18), next }));
    [
      ["growth-frost", "コオリヒョウ", 0, "glacier", ["glacier-mature", "crystal-mature"]],
      ["growth-storm", "ソラバネ", 1, "sky", ["sky-mature", "tempest-mature"]],
      ["growth-shadow", "ヨルカゲ", 2, "shadow", ["shadow-mature", "spirit-mature"]],
      ["growth-toy", "オモチャバコ", 3, "junk", ["candy-mature", "junk-mature"]]
    ].forEach(([id, name, x, lineage, next]) => add({ id, name, stage: 2, lineage, sprite: sprite("growth-extra.png", "400% 100%", `${x * 33.333}% 50%`, .375, 1.15), next }));
    LINEAGES.forEach((lineage) => {
      const matureId = `${lineage.id}-mature`;
      const perfectA = `${lineage.id}-perfect-a`;
      const perfectB = `${lineage.id}-perfect-b`;
      add({ id: matureId, name: lineage.mature, stage: 3, lineage: lineage.id, sprite: sprite(lineage.sheet, "400% 200%", "0% 0%", .75, 1.16), next: [perfectA, perfectB] });
      add({ id: perfectA, name: lineage.perfect[0], stage: 4, lineage: lineage.id, sprite: sprite(lineage.sheet, "400% 200%", "33.333% 0%", .75, 1.16), next: [`${lineage.id}-ultimate-0`, `${lineage.id}-ultimate-1`] });
      add({ id: perfectB, name: lineage.perfect[1], stage: 4, lineage: lineage.id, sprite: sprite(lineage.sheet, "400% 200%", "66.667% 0%", .75, 1.16), next: [`${lineage.id}-ultimate-2`, `${lineage.id}-ultimate-3`] });
      lineage.ultimate.forEach((name, index) => add({ id: `${lineage.id}-ultimate-${index}`, name, stage: 5, lineage: lineage.id, sprite: sprite(lineage.sheet, "400% 200%", `${index * 33.333}% 100%`, .75, 1.14), next: [] }));
    });
    add({ id: "legend-sun", name: "天照皇レイオーン", stage: 5, lineage: "legend-sun", legendary: true, sprite: sprite("legendary.png", "200% 100%", "0% 50%", .75, 1.04), next: [] });
    add({ id: "legend-night", name: "冥星王ゼロノクス", stage: 5, lineage: "legend-night", legendary: true, sprite: sprite("legendary.png", "200% 100%", "100% 50%", .75, 1.04), next: [] });
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
    STAGES, LINEAGES, LEGENDARY_IDS, LEGENDARY_CHANCE, NODES, createPlayerMonster, normalizePlayerMonster, syncPlayerMonsters,
    distributedEvolutionRandom, evolvePlayerMonster, combatStats, specialChanceForHype, dialogue, playerKey, seededRandom
  });
})(window);
