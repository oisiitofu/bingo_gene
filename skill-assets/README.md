# Skill Assets

プレイヤー固有スキルの素材置き場です。

各プレイヤーフォルダ内の同じファイル名を差し替えると、コードを触らずに素材を変更できます。

- `logo.png` または `logo.svg`: スキル発動時に表示するロゴ。`logo.png` があれば優先
- `se.mp3` または `se.wav`: スキル発動直後に鳴るSE。どちらか片方だけでもOK
- `bgm.mp3` または `bgm.wav`: SEの後に流れるBGM。どちらか片方だけでもOK
- `openOverride`: コード側で指定されている特殊OPEN音

現在の特殊OPEN音:

- `おいしいとうふ/unpi.wav`: 相手のOPEN音を一時的に「うんぴ」にする
- `リーマ/ngo.wav`: 自分のOPEN音を一時的に「ﾝｺﾞ！」にする

追加素材:

- `Kento/aura.png`: Kentoスキル中に自分のカードへ重ねる紫オーラ
- `Lickey/castle.png`: Lickeyスキル中に自分の中央マスへ表示する城
- `audio/fever-rise.mp3`: FEVER TIME発生SE
- `audio/comeback-oh.mp3`: 逆転の一手発生SE

マスを選ぶスキルは、マス選択から20秒後にBGMがフェードアウトします。
マスを選ばないスキルは、発動から20秒後にBGMがフェードアウトします。
