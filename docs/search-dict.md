# WAZA KIMURA 検索辞書

v52.826 時点。検索が引く表はこれ1枚だけです（`js/tag-master.js` の `SEARCH_DICT`）。

**全 164 行（書き方は延べ 577 通り）**

- **1行＝同じもの。** 先頭が代表表記、その後ろは同じものの別の書き方（日本語・英語・略称）
- 打った語がこの行のどれかに一致すると、**同じ行の全部の書き方で**タイトル・チャンネル・プレイリスト・タグ・メモを探します
- 別の技・上位/下位・分類のキーワードは入れていません（「ロングステップ」でデラヒーバは出ない）
- 全角/半角・カタカナ/ひらがな・長音・区切り・英語の複数形は、辞書に書かなくても吸収されます

> このファイルは `node tools/search-dict-md.mjs` で作り直します。手で書き換えない。

## ガード（下のポジション）

| # | 代表表記 | 同じものの別の書き方 |
|---|---|---|
| 1 | **クローズドガード** | closed guard / closed / クロガ / フルガード / full guard |
| 2 | **オープンガード** | open guard / オープン |
| 3 | **ハーフガード** | half guard / half / ハーフ |
| 4 | **ディープハーフ** | deep half guard / deep half / ディープ |
| 5 | **リバースハーフガード** | reverse half guard / reverse half / リバースハーフ |
| 6 | **ハーフバタフライ** | half butterfly / ハーフバタフライガード |
| 7 | **ニーシールド** | knee shield / z guard / z-guard / Zガード / ニーシールドハーフ |
| 8 | **ロックダウン** | lockdown / lock down |
| 9 | **アンダーフックハーフ** | underhook half / 脇差し |
| 10 | **シングルレッグハーフ** | single leg half |
| 11 | **バタフライガード** | butterfly guard / butterfly / バタフラ |
| 12 | **デラヒーバ** | de la riva / dlr / de la riva guard / デラヒバ / デラヒーバガード |
| 13 | **リバースデラヒーバ** | reverse de la riva / rdlr / reverse dlr / リバデラ |
| 14 | **デラヒーバX** | de la riva x / dlx / デラエックス |
| 15 | **Xガード** | x guard / x-guard / エックスガード |
| 16 | **SLX** | single leg x / シングルレッグX / シングルレッグXガード / single x / ワンレッグX |
| 17 | **Kガード** | k guard / k-guard / ケーガード |
| 18 | **50/50** | 50-50 / 5050 / フィフティフィフティ / fifty fifty |
| 19 | **スパイダーガード** | spider guard / spider / スパイダ |
| 20 | **インバーテッドスパイダー** | inverted spider |
| 21 | **ラッソーガード** | lasso guard / lasso / ラッソ |
| 22 | **シャローラッソー** | shallow lasso |
| 23 | **片襟片袖** | collar sleeve / collar and sleeve / collar sleeve guard / カラースリーブ |
| 24 | **ラペルガード** | lapel guard / lapel / ラペル |
| 25 | **ワームガード** | worm guard |
| 26 | **スクイッドガード** | squid guard |
| 27 | **グッバーガード** | gubber guard |
| 28 | **ラバーガード** | rubber guard |
| 29 | **ミッションコントロール** | mission control |
| 30 | **シッティングガード** | seated guard / sitting guard / sit up guard / シットアップガード |
| 31 | **シングルレッグガード** | single leg guard |
| 32 | **インバーテッド** | inverted guard / inverted / トルネードガード / tornado guard |
| 33 | **オクトパスガード** | octopus guard / octopus |
| 34 | **クォーターガード** | quarter guard |
| 35 | **タートル** | turtle / turtle position / 亀 / 亀ポジション |

## 上のポジション・コントロール

| # | 代表表記 | 同じものの別の書き方 |
|---|---|---|
| 36 | **マウント** | mount / full mount / マウントポジション / 縦四方固め |
| 37 | **サイドコントロール** | side control / side mount / サイドポジション / 横四方固め |
| 38 | **ノースサウス** | north south / north-south / ノースサウスポジション |
| 39 | **袈裟固め** | kesa gatame / kesagatame / scarf hold / ケサガタメ |
| 40 | **ニーオンベリー** | knee on belly / knee ride / kneeride / ニーオンザベリー / 膝乗り |
| 41 | **バックコントロール** | back control / back mount / rear mount / バックマウント |
| 42 | **ボディトライアングル** | body triangle |
| 43 | **クルシフィックス** | crucifix |
| 44 | **フロントヘッドロック** | front headlock / front head lock |
| 45 | **クロスフェイス** | cross face / crossface |
| 46 | **アンダーフック** | underhook / under hook |
| 47 | **オーバーフック** | overhook / over hook |
| 48 | **ヘッドクォーター** | headquarters / head quarters / ヘッドクォーターズ / ヘッドクオーター |

## パスガード

| # | 代表表記 | 同じものの別の書き方 |
|---|---|---|
| 49 | **パスガード** | guard pass / guard passing / ガードパス |
| 50 | **ニーカット** | knee cut / knee slice / knee slide / knee through / cross knee / cross knee pass / ニースライス / ニースルー / クロスニー |
| 51 | **レッグドラッグ** | leg drag / legdrag |
| 52 | **トレアドール** | toreando / torreando / toreada / bullfighter pass / トレアンド / ブルファイターパス |
| 53 | **ロングステップ** | long step / long step pass / longstep / ロングステップパス |
| 54 | **スマッシュパス** | smash pass / スマッシュ |
| 55 | **スタックパス** | stack pass / スタック |
| 56 | **ダブルアンダーパス** | double under pass / double unders / ダブルアンダー |
| 57 | **オーバーアンダー** | over under pass / over-under pass / オーバーアンダーパス |
| 58 | **ボディロックパス** | body lock pass / bodylock pass |
| 59 | **サンパウロパス** | sao paulo pass / sao paulo |
| 60 | **Xパス** | x pass / x-pass / エックスパス |
| 61 | **レッグウィーブ** | leg weave / leg weave pass |
| 62 | **フォールディングパス** | folding pass |
| 63 | **バックステップ** | back step / backstep |
| 64 | **フロートパス** | float pass / floating pass / フローティングパス |

## スイープ・リバーサル

| # | 代表表記 | 同じものの別の書き方 |
|---|---|---|
| 65 | **スイープ** | sweep / sweeps |
| 66 | **シザースイープ** | scissor sweep |
| 67 | **ヒップバンプスイープ** | hip bump / ヒップバンプ |
| 68 | **フラワースイープ** | flower sweep / pendulum sweep / ペンデュラムスイープ |
| 69 | **バタフライスイープ** | butterfly sweep / elevator sweep / エレベータースイープ |
| 70 | **トルネードスイープ** | tornado sweep |
| 71 | **オーバーヘッドスイープ** | overhead sweep / balloon sweep / バルーンスイープ |
| 72 | **マッスルスイープ** | muscle sweep |
| 73 | **ジョンウェインスイープ** | john wayne sweep / ジョンワインスイープ |
| 74 | **トライポッドスイープ** | tripod sweep |
| 75 | **シックルスイープ** | sickle sweep |
| 76 | **ウェイタースイープ** | waiter sweep |
| 77 | **ベリンボロ** | berimbolo |
| 78 | **リバースベリンボロ** | reverse berimbolo |
| 79 | **クラブライド** | crab ride |
| 80 | **キスオブザドラゴン** | kiss of the dragon |

## 極め（絞め・関節）

| # | 代表表記 | 同じものの別の書き方 |
|---|---|---|
| 81 | **サブミッション** | submission / submissions / サブミ |
| 82 | **アームバー** | armbar / arm bar / juji gatame / 腕十字 |
| 83 | **三角絞め** | triangle choke / triangle / 三角締め / トライアングル |
| 84 | **リアトライアングル** | rear triangle / back triangle / バックトライアングル |
| 85 | **サイドトライアングル** | side triangle |
| 86 | **モノプラッタ** | monoplata |
| 87 | **オモプラッタ** | omoplata / オモプラータ |
| 88 | **キムラ** | kimura / 腕緘 / 腕がらみ |
| 89 | **アメリカーナ** | americana |
| 90 | **肩固め** | kata gatame / katagatame / arm triangle / head and arm choke / アームトライアングル |
| 91 | **ギロチン** | guillotine |
| 92 | **アームインギロチン** | arm in guillotine / arm-in guillotine |
| 93 | **ブラボーチョーク** | bravo choke |
| 94 | **ダース** | darce / d'arce |
| 95 | **アナコンダ** | anaconda |
| 96 | **ジャパニーズネクタイ** | japanese necktie |
| 97 | **ペルビアンネクタイ** | peruvian necktie |
| 98 | **リアネイキドチョーク** | rear naked choke / rnc / mata leao / 裸絞め / 裸絞 / リアネイキド / マタレオン |
| 99 | **ボーアンドアロー** | bow and arrow / 弓矢絞め |
| 100 | **クロスチョーク** | cross choke / cross collar choke / 十字絞め |
| 101 | **ループチョーク** | loop choke |
| 102 | **エゼキエル** | ezekiel / ezequiel / 袖車 |
| 103 | **ベースボールチョーク** | baseball choke / baseball bat choke / ベースボールバットチョーク |
| 104 | **ペーパーカッター** | paper cutter |
| 105 | **ノースサウスチョーク** | north south choke |
| 106 | **ショートチョーク** | short choke |
| 107 | **ラペルチョーク** | lapel choke |
| 108 | **ゴゴプラッタ** | gogoplata |
| 109 | **ツイスター** | twister |
| 110 | **ネッククランク** | neck crank / ネックロック |
| 111 | **リストロック** | wrist lock / wristlock / 手首関節 |
| 112 | **バイセップスライサー** | bicep slicer / biceps slicer / bicep crush / バイセップススライサー |
| 113 | **カーフスライサー** | calf slicer / calf crush / カーフクラッシュ |
| 114 | **バナナスプリット** | banana split |
| 115 | **エレクトリックチェア** | electric chair |

## レッグロック（足関節）

| # | 代表表記 | 同じものの別の書き方 |
|---|---|---|
| 116 | **レッグロック** | leg lock / leglock / 足関節 / アシカン |
| 117 | **ヒールフック** | heel hook / heelhook |
| 118 | **インサイドヒールフック** | inside heel hook / inside heelhook / インサイドヒール |
| 119 | **アウトサイドヒールフック** | outside heel hook / outside heelhook / アウトサイドヒール |
| 120 | **ニーバー** | kneebar / knee bar / 膝十字 |
| 121 | **トーホールド** | toe hold / toehold |
| 122 | **アンクルロック** | ankle lock / straight ankle / footlock / foot lock / achilles lock / フットロック / アキレス腱固め |
| 123 | **エスティマロック** | estima lock / estima |
| 124 | **サドル** | saddle / 411 / 4-11 / inside sankaku / インサイドサンカク / honey hole / ハニーホール |
| 125 | **アシガラミ** | ashi garami / ashigarami / 足絡み |

## エスケープ・ディフェンス

| # | 代表表記 | 同じものの別の書き方 |
|---|---|---|
| 126 | **エスケープ** | escape / escapes |
| 127 | **エルボーエスケープ** | elbow escape / knee elbow escape / エルボーニーエスケープ |
| 128 | **ヒップエスケープ** | hip escape / shrimping / shrimp escape |
| 129 | **ブリッジアンドロール** | bridge and roll / upa / ブリッジ＆ロール / ウパ |
| 130 | **グランビーロール** | granby roll / granby / グランビー |
| 131 | **ヒッチハイカーエスケープ** | hitchhiker escape |
| 132 | **テクニカルスタンドアップ** | technical stand up / technical standup / テクニカルリフト |
| 133 | **ガードリテンション** | guard retention / retention / リテンション |
| 134 | **ガードリカバリー** | guard recovery |
| 135 | **フレーム** | frame / framing / フレーミング |
| 136 | **スプロール** | sprawl |

## テイクダウン・立ち技

| # | 代表表記 | 同じものの別の書き方 |
|---|---|---|
| 137 | **テイクダウン** | takedown / takedowns |
| 138 | **スタンディング** | standing / stand up / 立ち技 |
| 139 | **引き込み** | guard pull / pull guard / pulling guard / プルガード |
| 140 | **シングルレッグタックル** | single leg takedown / single leg tackle / 片足タックル |
| 141 | **ダブルレッグ** | double leg takedown / 両足タックル |
| 142 | **ハイクラッチ** | high crotch |
| 143 | **ニーピック** | knee pick |
| 144 | **アンクルピック** | ankle pick |
| 145 | **アームドラッグ** | arm drag / armdrag |
| 146 | **カラードラッグ** | collar drag / 襟ドラッグ |
| 147 | **スナップダウン** | snap down / snapdown |
| 148 | **ダックアンダー** | duck under / duckunder |
| 149 | **ロシアンタイ** | russian tie / two on one |
| 150 | **スープレックス** | suplex |
| 151 | **内股** | uchi mata / uchimata |
| 152 | **大外刈り** | osoto gari / osotogari / 大外刈 |
| 153 | **大内刈り** | ouchi gari / ouchigari / 大内刈 |
| 154 | **小内刈り** | kouchi gari / kouchigari / 小内刈 |
| 155 | **背負投** | seoi nage / seoinage / 背負い投げ |
| 156 | **一本背負い** | ippon seoi nage / ippon seoinage / 一本背負 |
| 157 | **巴投げ** | tomoe nage / tomoenage / 巴投 |
| 158 | **払腰** | harai goshi / haraigoshi / 払い腰 |
| 159 | **体落** | tai otoshi / taiotoshi / 体落とし |
| 160 | **肩車** | kata guruma / fireman carry / fireman's carry / ファイヤーマンズキャリー |

## そのほかよく使う言葉

| # | 代表表記 | 同じものの別の書き方 |
|---|---|---|
| 161 | **バックテイク** | back take / taking the back / バックを取る |
| 162 | **スクランブル** | scramble |
| 163 | **グリップブレイク** | grip break / grip breaking / グリップブレイキング |
| 164 | **ノーギ** | no gi / nogi / no-gi / ノーギー |
