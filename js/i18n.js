// ═══ WAZA KIMURA — 多言語基盤 (JA / EN) ═══
// 方針: データ(Firestore/localStorage)は常に日本語のまま。表示だけ翻訳する。
//   - 言語決定: localStorage 'wk_lang'（手動上書き）→ なければ navigator.language（自動）
//   - window.t(key, fallback)        : UI文字列
//   - window.tCat / tPos / tTb        : タグ分類名（カテゴリ/ポジション/TB）の表示翻訳
//   - window.applyStaticI18n()        : [data-i18n] / [data-i18n-ph] を一括翻訳
(function () {
  'use strict';
  const KEY = 'wk_lang';

  function detect() {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ja' || saved === 'en') return saved;
    const n = (navigator.language || navigator.userLanguage || 'ja').toLowerCase();
    return n.startsWith('ja') ? 'ja' : 'en';
  }
  let _lang = detect();

  window.WK_LANG = () => _lang;
  window.wkLangMode = () => (localStorage.getItem(KEY) || 'auto'); // 'auto'|'ja'|'en'

  function _highlightLangSeg() {
    const cur = window.wkLangMode();
    document.querySelectorAll('#wk-lang-seg button[data-lang]').forEach(b => {
      const on = b.getAttribute('data-lang') === cur;
      b.style.background = on ? 'var(--accent)' : 'var(--surface2)';
      b.style.color = on ? '#fff' : 'var(--text)';
      b.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
    });
  }

  window.wkSetLang = function (mode) {
    if (mode === 'auto') localStorage.removeItem(KEY);
    else if (mode === 'ja' || mode === 'en') localStorage.setItem(KEY, mode);
    _lang = detect();
    document.documentElement.lang = _lang;
    try { window.applyStaticI18n(); } catch (e) {}
    _highlightLangSeg();
    if (_lang === 'en') { try { window._wkAutoI18n?.start(); window._wkAutoI18n?.rebuild(); } catch (e) {} }
    else { try { window._wkAutoI18n?.stop(); } catch (e) {} }
    // 動的描画を更新
    try { window.AF && window.AF(); } catch (e) {}
    try { window._cvRefreshViewBar && window._cvRefreshViewBar(); } catch (e) {}
    try { window.renderSettings && window.renderSettings(); } catch (e) {}
    try { window.toast && window.toast(_lang === 'en' ? 'Language: English' : '言語: 日本語'); } catch (e) {}
  };
  window._wkHighlightLangSeg = _highlightLangSeg;

  // ── UI文字列辞書 (key → {ja, en}) ──
  const DICT = {
    // 言語設定
    'settings.language':        { ja: '言語', en: 'Language' },
    'settings.language.auto':   { ja: '自動（端末設定）', en: 'Auto (device)' },
    'settings.language.ja':     { ja: '日本語', en: '日本語' },
    'settings.language.en':     { ja: 'English', en: 'English' },
    'settings.language.desc':   { ja: '表示言語。データは変更されません。', en: 'Display language. Your data is not changed.' },
    // 取り込み: タグの付け方ピッカー
    'itag.howto':               { ja: '🏷 タグの付け方', en: '🏷 How to tag' },
    'itag.mode.ai':             { ja: '🤖 自動判別', en: '🤖 Auto-detect' },
    'itag.mode.ai.sub':         { ja: 'AIにおまかせ', en: 'Let AI decide' },
    'itag.mode.manual':         { ja: '✋ 自分で選ぶ', en: '✋ Choose myself' },
    'itag.mode.manual.sub':     { ja: 'いま手動で', en: 'Manually now' },
    'itag.mode.none':           { ja: '🚫 タグなし', en: '🚫 No tags' },
    'itag.mode.none.sub':       { ja: 'あとで整理', en: 'Sort later' },
    'itag.ai.hint':             { ja: 'タイトル・チャンネル名からAIがタグを推定します。', en: 'Tags are estimated from the title and channel name.' },
    'itag.ai.warn':             { ja: 'AIの判定は正確でない場合があります。あとからいつでも修正できます。', en: 'Auto-detection may not be accurate. You can fix it anytime later.' },
    'itag.none.hint':           { ja: 'タグを付けずに追加します。あとからいつでもタグ付けできます。', en: 'Added without tags. You can tag them anytime later.' },
    'itag.target.all':          { ja: '📌 全ての動画に同じタグを適用', en: '📌 Apply the same tags to all videos' },
    'itag.section.tags':        { ja: 'タグ', en: 'Tags' },
    'itag.row.tb':              { ja: 'トップ/ボトム/スタンディング', en: 'Top / Bottom / Standing' },
    'itag.row.cat':             { ja: 'カテゴリ', en: 'Category' },
    'itag.row.pos':             { ja: 'ポジション', en: 'Position' },
    'itag.row.tech':            { ja: 'テクニック', en: 'Technique' },
    'itag.add.pos':             { ja: '＋ ポジション', en: '+ Position' },
    'itag.add.tech':            { ja: '＋ テクニック', en: '+ Technique' },
    'itag.dd.filter':           { ja: '絞り込み...', en: 'Filter...' },
    'itag.dd.tech':             { ja: 'テクニック検索・新規追加（Enterで追加）', en: 'Search or add technique (Enter to add)' },
    'itag.dd.none':             { ja: '候補なし', en: 'No matches' },
    'itag.dd.tech.none':        { ja: '候補なし（Enterで新規追加）', en: 'No matches (Enter to add new)' },
    'itag.dd.ungrouped':        { ja: '未グループ', en: 'Ungrouped' },
    'itag.dd.empty':            { ja: '既存テクニックなし（入力して新規追加）', en: 'No techniques yet (type to add)' },
    // サイドバー
    'sb.addVideo':       { ja: '＋ 動画を追加', en: '+ Add videos' },
    'sb.list':           { ja: 'リスト', en: 'List' },
    'sb.view':           { ja: 'ビュー', en: 'View' },
    'sb.card':           { ja: '📋 カード', en: '📋 Cards' },
    'sb.table':          { ja: '📊 テーブル', en: '📊 Table' },
    'sb.filter':         { ja: 'フィルター', en: 'Filters' },
    'sb.advSearch':      { ja: '詳細検索', en: 'Advanced search' },
    'sb.state':          { ja: 'マーク・習得', en: 'Marks & Progress' },
    'sb.src':            { ja: 'ソース・チャンネル・プレイリスト', en: 'Source / Channel / Playlist' },
    'sb.tag':            { ja: 'タグ', en: 'Tags' },
    'sb.saved':          { ja: '保存した検索条件', en: 'Saved searches' },
    'sb.savedNone':      { ja: '保存した検索条件はありません', en: 'No saved searches' },
    'sb.saveCurrent':    { ja: '＋ 現在の検索条件を保存', en: '+ Save current search' },
    'sb.recent':         { ja: '最近みた動画', en: 'Recently watched' },
    'sb.bulk':           { ja: '☑ 一括編集', en: '☑ Bulk edit' },
    'sb.resetFilters':   { ja: 'フィルターをリセット', en: 'Reset filters' },
    // リスト（カスタムビュー）ピッカー
    'cv.picker.title':   { ja: 'リスト', en: 'Lists' },
    'cv.master':         { ja: 'マスター', en: 'Master' },
    'cv.masterDesc':     { ja: 'ライブラリ全体', en: 'Entire library' },
    'cv.section':        { ja: 'カスタムビュー', en: 'Custom views' },
    'cv.manage':         { ja: '整理', en: 'Manage' },
    'cv.done':           { ja: '完了', en: 'Done' },
    'cv.edit':           { ja: '編集', en: 'Edit' },
    'cv.tpl':            { ja: 'テンプレ', en: 'Templates' },
    'cv.new':            { ja: '新しいカスタムビューを作成', en: 'Create a new custom view' },
    'cv.manual':         { ja: '手動選択', en: 'Manual' },
    'cv.dynamic':        { ja: '条件で自動', en: 'Auto (filter)' },
    'cv.count':          { ja: '本', en: ' videos' },
    // Vパネル タグ編集
    'vp.tags':           { ja: 'タグ', en: 'Tags' },
    'vp.locked':         { ja: '🔒 ロック中', en: '🔒 Locked' },
    'vp.unlocked':       { ja: '🔓 自動', en: '🔓 Auto' },
    // URL取込
    'url.title':         { ja: '🔗 URLから動画を追加', en: '🔗 Add videos from URLs' },
    'url.desc':          { ja: 'YouTube・Vimeo・Google Drive・XのURLを貼り付け（複数行OK）', en: 'Paste YouTube / Vimeo / Google Drive / X URLs (multiple lines OK)' },
    'url.analyze':       { ja: '🔍 解析する', en: '🔍 Analyze' },
    'url.template':      { ja: '⬇ テンプレ', en: '⬇ Template' },
    'url.channel':       { ja: '📺 チャンネル名', en: '📺 Channel' },
    'url.optional':      { ja: '任意', en: 'optional' },
    'url.pick':          { ja: '既存から選ぶ / 新規追加', en: 'Choose existing / add new' },
    'url.playlist':      { ja: '📋 プレイリストに追加', en: '📋 Add to playlist' },
    'url.add':           { ja: '＋ ライブラリに追加', en: '+ Add to library' },
    // 設定
    'set.subtitle':      { ja: '表示・AI・再生・外観の設定', en: 'Display, AI, playback and appearance' },
    'set.tag':           { ja: 'タグ表示設定', en: 'Tag display' },
    'set.filter':        { ja: 'フィルター設定', en: 'Filters' },
    'set.ai':            { ja: 'AI取込設定', en: 'AI import' },
    'set.playback':      { ja: '再生設定', en: 'Playback' },
    'set.appearance':    { ja: '外観設定', en: 'Appearance' },
    'set.backup':        { ja: 'バックアップ / 復元', en: 'Backup / Restore' },
    // アカウントメニュー
    'acct.loginDesc':    { ja: 'ログインすると動画の追加・トラッキングが利用できます', en: 'Sign in to add and track videos' },
    'acct.addVideo':     { ja: '動画を追加', en: 'Add videos' },
    'acct.logout':       { ja: 'ログアウト', en: 'Sign out' },
    // ソート
    'sort.addedAt':      { ja: '追加日', en: 'Date added' },
    'sort.title':        { ja: 'タイトル', en: 'Title' },
    'sort.status':       { ja: '習得度', en: 'Progress' },
    'sort.lastPlayed':   { ja: '最近再生した', en: 'Recently played' },
    'sort.duration':     { ja: '再生時間', en: 'Duration' },
    'cv.empty':          { ja: 'カスタムビューがありません', en: 'No custom views yet' },
    // 共通
    'common.cancel':     { ja: 'キャンセル', en: 'Cancel' },
    'common.reset':      { ja: 'リセット', en: 'Reset' },
  };

  window.t = function (key, fallback) {
    const e = DICT[key];
    if (!e) return fallback != null ? fallback : key;
    return e[_lang] != null ? e[_lang] : (e.ja != null ? e.ja : key);
  };
  window.WK_I18N = DICT; // 拡張用に公開

  // ── タグ分類名の表示翻訳（データは日本語のまま） ──
  const CAT_EN = {
    'エスケープ・ディフェンス':   'Escape / Defense',
    'ガード構築・エントリー':     'Guard Entry',
    'ガードリテンション':         'Guard Retention',
    'コントロール／プレッシャー': 'Control / Pressure',
    'コンセプト・原理':           'Concepts / Principles',
    'スイープ':                   'Sweep',
    'テイクダウン':               'Takedown',
    'バックテイク・バックアタック': 'Back Take / Back Attack',
    'パスガード':                 'Guard Pass',
    'フィニッシュ':               'Finish / Submission',
  };
  const TB_EN = { 'トップ': 'Top', 'ボトム': 'Bottom', 'スタンディング': 'Standing', '中立': 'Neutral' };

  window.tCat = function (name) { return _lang === 'en' ? (CAT_EN[name] || name) : name; };
  window.tTb  = function (v)    { return _lang === 'en' ? (TB_EN[v] || v) : v; };
  window.tPos = function (ja) {
    if (_lang !== 'en') return ja;
    const p = (window.POSITIONS || []).find(x => x.ja === ja);
    return p && p.en ? p.en : ja;
  };

  // ── 静的要素の翻訳 ──
  window.applyStaticI18n = function () {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const v = window.t(el.getAttribute('data-i18n'));
      if (v != null) el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const v = window.t(el.getAttribute('data-i18n-ph'));
      if (v != null) el.setAttribute('placeholder', v);
    });
  };


  // ═══ 表示層 自動翻訳エンジン（EN時のみ） ═══════════════════
  // 描画済み/新規描画のテキストノードと placeholder/title を辞書で置換する。
  // ・データ(Firestore/localStorage)には一切触れない（DOM表示のみ）
  // ・ユーザー入力/メモ(contenteditable)・入力値(value)は対象外
  // ・元の日本語は node.__wkOrig に保存し、日本語へ戻すと復元
  const _JA_RE = /[぀-ヿ一-鿿]/;

  const STATIC_AUTO = {
    // ── ステータス/優先度（データ値の表示） ──
    '未着手':'Not started','理解':'Understood','把握':'Understood','練習中':'Practicing','習得中':'Practicing','できる':'Mastered','マスター':'Master',
    '今すぐ':'Now','そのうち':'Later','保留':'On hold','未分類':'Uncategorized','未設定':'Not set','中立':'Neutral',
    // ── 共通ボタン/語 ──
    'キャンセル':'Cancel','保存':'Save','削除':'Delete','追加':'Add','編集':'Edit','完了':'Done','閉じる':'Close','戻る':'Back','← 戻る':'← Back','次へ →':'Next →','適用':'Apply','リセット':'Reset','検索':'Search','全選択':'Select all','全解除':'Clear all','候補なし':'No matches','取得中...':'Loading...','認証中...':'Authorizing...','再取得':'Reload','その他':'Other','名前':'Name','タイトル':'Title','追加日':'Date added','長さ':'Duration','再生回数':'Play count','件数順':'By count','名前順':'By name','最近':'Recent','グループ別':'By group','視聴済み':'Watched','未視聴':'Unwatched','お気に入り':'Favorite','カウント':'Count','習得度':'Progress','習得':'Progress','チャンネル':'Channel','プレイリスト':'Playlist','タグ':'Tags','テクニック':'Technique','カテゴリ':'Category','ポジション':'Position','ドリル':'Drill','メモ':'Memo','要約/メモ':'Memo','トップ/ボトム/スタンディング':'Top/Bottom/Standing',
    // ── カード/一覧 ──
    '動画が見つかりませんでした':'No videos found','💬 メモ':'💬 Memo','アーカイブしますか？':'Archive this video?','(タイトルなし)':'(untitled)',
    // ── Vパネル ──
    '動画を再生してからスキップしてください':'Play the video before skipping','∧ 閉じる':'∧ Close','編集 ∨':'Edit ∨','設定する ∨':'Set ∨','＋ ループ区間をブックマーク':'+ Bookmark loop section','＋ 現在位置でブックマーク':'+ Bookmark current position','動画を再生してください':'Play the video first','開始・終了を設定してください':'Set start and end times','⚠ 開始が終了より後になっています':'⚠ Start is after end','🔁 ループを開始しました':'🔁 Loop started','開始・終了を両方設定してください':'Set both start and end','ブックマーク名（空欄でも可）':'Bookmark name (optional)','🔖 ブックマークを追加しました':'🔖 Bookmark added','まだブックマークがありません':'No bookmarks yet','チャプターが見つかりませんでした':'No chapters found','ラベルを入力...':'Enter a label...','動画を再生中に操作してください':'Use while the video is playing','終了時間を削除しました':'End time removed','正しい時間を入力してください（例: 1:30 または 90）':'Enter a valid time (e.g. 1:30 or 90)','動画を再生中にブックマークしてください':'Bookmark while the video is playing','を記録しました':' recorded','A点・B点をセットしてください':'Set points A and B','🔖 保存しました':'🔖 Saved','タイトルを変更しました':'Title updated','認証に失敗しました。再試行':'Authorization failed. Retry','タップしてチャンネルに絞り込む':'Tap to filter by this channel','✎ 変更':'✎ Change','＋ チャンネルを選ぶ':'+ Choose channel','検索・新規追加...':'Search or add new...','↪ プレイリストに移動':'↪ Move to playlist','⧉ プレイリストにコピー':'⧉ Copy to playlist','他のプレイリストがありません':'No other playlists','プレイリスト名を入力してください':'Enter a playlist name','ループ再生':'Loop','ブックマーク':'Bookmarks','カウンター':'Counter','最終':'Last','次の動画':'Up next','お気に入り登録中 ⭐':'Favorited ⭐','お気に入りに追加':'Add to favorites','📦 アーカイブ':'📦 Archive','🔄 タグリセット':'🔄 Reset tags','🤖 AIタグ提案':'🤖 AI tag suggest','📓 Notes に追加':'📓 Add to Notes','✓ 検証済みにする':'✓ Mark verified','✓ 検証済み':'✓ Verified','✓ 自動保存済み':'✓ Auto-saved','✨ AI要約':'✨ AI summary','現在位置でブックマーク':'Bookmark current position',
    // ── 一括編集 ──
    '動画を選択してください':'Select videos first','本の動画を編集中':' videos selected','チャンネル・プレイリスト':'Channel / Playlist','✓ 変更する':'✓ Apply','✎ 変更・検索':'✎ Change / search','↪ 移動':'↪ Move','⧉ コピー':'⧉ Copy','＋ ポジション':'+ Position','＋ テクニック':'+ Technique','⏳ 分析中...':'⏳ Analyzing...','リセットする属性を選んでください':'Choose attributes to reset','⚠ すべてのタグをリセット':'⚠ Reset all tags','テクニックタグがありません':'No technique tags','（複数）':'(multiple)','0回':'0 times',
    // ── フィルター ──
    '✕ 閉じる':'✕ Close','選択中:':'Selected:','0 件':'0 items','検索条件を保存':'Save search','現在の絞り込み条件をリストとして保存します':'Save the current filters as a list','🔄 現在の条件で保存':'🔄 Save current filters','名前をそのままにすると上書き保存、変更すると別名で保存されます':'Keep the name to overwrite, change it to save as new','テクニック・ポジション名で探す...':'Search techniques / positions...','テクニック名で絞り込み...':'Filter by technique...','ポジション名で絞り込み...':'Filter by position...','絞り込み...':'Filter...',
    // ── 取り込み（共通/YouTube/GDrive/URL） ──
    'プレイリストを選択':'Choose playlists','取り込むプレイリストを選んでください':'Select playlists to import','すべて取込済みのプレイリストを隠す':'Hide fully imported playlists','非表示にしたプレイリストも表示（管理用）':'Show hidden playlists (admin)','📥 未取込を一括取込':'📥 Import all new','動画を選択':'Select videos','取込済を非表示':'Hide imported','取込済み':'Imported','取り込む ✓':'Import ✓','チャンネル名':'Channel','プレイリスト名':'Playlist name','フォルダ名から自動入力':'Auto-filled from folder name','編集可・空欄でプレイリストなし':'Editable; empty = no playlist','タイトルから除去する文字列（自動検出）':'Text to strip from titles (auto-detected)','空欄でプレイリストなし':'Empty = no playlist','任意':'optional','例: Triforce（空欄でも登録できます）':'e.g. Triforce (can be empty)','✓ このフォルダを選択':'✓ Choose this folder','📁 フォルダを選択':'📁 Choose folder','スキャン中...':'Scanning...','検索または新しいチャンネル名を入力...':'Search or type a new channel...','検索または新しいプレイリスト名を入力...':'Search or type a new playlist...','すでにライブラリにあります':'Already in your library','再試行':'Retry','🔄 再試行':'🔄 Retry','対応フォーマット':'Supported formats','テクニック検索・新規追加（Enterで追加）':'Search or add technique (Enter to add)',
    // ── カスタムビュー作成/編集 ──
    '新しいビューを作成':'Create a new view','ビュー名':'View name','ビュー名・追加方法':'Name & how to add','テンプレート':'Template','ビューの種類':'View type','テーブル型':'Table','カード型':'Cards','カスタム列で管理':'Manage with custom columns','サムネ一覧表示':'Thumbnail grid','動画の追加方法':'How to add videos','手動で選択':'Pick manually','自分でピックアップ':'Choose yourself','条件で自動選択':'Auto by filter','フィルター条件で更新':'Updates with filters','テンプレートを選ぶ':'Choose a template','後から列の追加・削除ができます':'You can add or remove columns later','このテンプレートで作成':'Create with this template','例: スパー準備、今月の課題...':'e.g. Sparring prep, This month...','動画を追加':'Add videos','動画を選ぶ':'Choose videos','ライブラリから選ぶ':'Choose from library','保存済みの動画から選択':'Pick from saved videos','URLで追加':'Add by URL','タイトルで検索…':'Search by title...','列を追加':'Add column','列名':'Column name','列名を入力...':'Enter column name...','リストを編集':'Edit list','名前を変更':'Rename','テンプレとして保存':'Save as template',
    // ── 設定 ──
    'AI取込設定':'AI import','再生設定':'Playback','外観設定':'Appearance','タグ表示設定':'Tag display','フィルター設定':'Filters','軽量バックアップ':'Light backup','フルバックアップ':'Full backup','インポート（復元）':'Import (restore)','📥 エクスポート':'📥 Export','📥 フルエクスポート':'📥 Full export','📤 インポート':'📤 Import','バックアップJSONを読み込んでデータを復元します（現在のデータは上書きされます）':'Restore data from a backup JSON (current data will be overwritten)','言語':'Language','自動（端末設定）':'Auto (device)','表示言語。データは変更されません。':'Display language. Your data is not changed.',
    // ── 通知/トースト（固定文） ──
    '✅ ライブラリに保存しました':'✅ Saved to library','📥 エクスポート中…':'📥 Exporting...','✅ 軽量バックアップを保存しました':'✅ Light backup saved','⏳ 復元中…':'⏳ Restoring...','✨ AI要約をMemoに追記しました':'✨ AI summary added to Memo','キャンセルしました':'Cancelled','ログインが必要です':'Sign-in required','言語: 日本語':'Language: 日本語',
    'ソース・チャンネル・プレイリスト':'Source / Channel / Playlist',
    // ── 収束ラウンド1（クロール収集 224語） ──
    '0本選択':'0 selected',
    '1.📋 未着手':'1.📋 Not started',
    '1行目:':'Row 1:',
    '2.📖 理解':'2.📖 Understood',
    '3.🔄 練習中':'3.🔄 Practicing',
    '4.⭐ マスター':'4.⭐ Mastered',
    'CSV / Excel ヘッダー':'CSV / Excel headers',
    'Googleでログイン':'Sign in with Google',
    'Search...  -除外  "完全一致"  title:  ch:':'Search...  -exclude  "exact"  title:  ch:',
    'VPanelで動画を自動再生':'Auto-play videos in the panel',
    'YouTube / Vimeo など':'YouTube / Vimeo etc.',
    'YouTubeで柔術動画を検索':'Search BJJ videos on YouTube',
    'YouTubeで検索':'Search YouTube',
    'YouTube・Vimeo・Google Drive・XのURLを貼り付け（複数行OK）／CSV・Excelはヘッダー':'Paste YouTube / Vimeo / Google Drive / X URLs (multi-line OK). CSV/Excel headers:',
    'x.com/user/status/... ・ twitter.com/user/status/...（再生のみ・スキップ等不可）':'x.com/user/status/... (playback only)',
    'youtube.com/watch?v= ・ youtu.be/ ・ shorts/ ・ embed/':'youtube.com/watch?v= / youtu.be / shorts / embed',
    '※ デバイスとOSを両方選択してください':'* Select both device and OS',
    '← ノートに戻る':'← Back to note',
    '← 前へ':'← Prev',
    '→ 矢印':'→ Arrow',
    '↩ 一括復元':'↩ Restore all',
    '↩ 取消':'↩ Undo',
    '↩ 戻す':'↩ Revert',
    '⊟ フィルター':'⊟ Filters',
    '① 選択':'① Select',
    '② 動画を選ぶ':'② Choose videos',
    '③ 取り込み':'③ Import',
    '□ 四角':'□ Box',
    '□ 背景':'□ Background',
    '▶ この場面から再生':'▶ Play from here',
    '▼ 既存':'▼ Existing',
    '◎ Community タブ':'◎ Community tab',
    '☆ Fav解除':'☆ Unfavorite',
    '☑ 一括編集':'☑ Bulk edit',
    '☰ フィルター':'☰ Filters',
    '⚙ 設定':'⚙ Settings',
    '⚡ Action フィルター':'⚡ Action filter',
    '✎ 一括編集':'✎ Bulk edit',
    '✎ 一括編集する':'✎ Bulk edit',
    '✎ 編集':'✎ Edit',
    '✏️ ペン':'✏️ Pen',
    '✓ 保存':'✓ Save',
    '✓ 確定':'✓ Confirm',
    '✕ 中止':'✕ Abort',
    '✕ 削除':'✕ Delete',
    '✕ 終了':'✕ End',
    '⬛ 黒帯':'⬛ Black belt',
    '⬜ 白帯':'⬜ White belt',
    'こうしたい':'Feature request',
    'すべて選択':'Select all',
    'に対応':'supported',
    'やり直す (Ctrl+Y)':'Redo (Ctrl+Y)',
    'アタック':'Attack',
    'アノテーション消去':'Clear annotations',
    'エスケ':'Esc.',
    'エスケープ':'Escape',
    'カメラロールから選択':'Choose from camera roll',
    'カード':'Cards',
    'クリア':'Clear',
    'クリーム':'Cream',
    'グレー':'Gray',
    'コミュニティ動画タブを表示（この端末のみ）':'Show Community tab (this device only)',
    'コント':'Ctrl.',
    'サイズ':'Size',
    'サイドバーを開閉':'Toggle sidebar',
    'スキップ':'Skip',
    'スタ':'Stand',
    'ステータス・進捗・優先度':'Status / Progress / Priority',
    'タブ表示':'Tab display',
    'ダーク':'Dark',
    'チャンネル名で検索...':'Search channels...',
    'チャンネル名で絞り込み...':'Filter by channel...',
    'テーブル':'Table',
    'テーマ':'Theme',
    'ドット':'Dots',
    'ドラッグで幅を調整':'Drag to resize',
    'ノートを同期':'Sync notes',
    'ハーフ':'Half',
    'バグ・不具合':'Bug report',
    'バック':'Back',
    'バックコントロール':'Back control',
    'パスG':'Pass',
    'フィニ':'Finish',
    'フィルター':'Filters',
    'フィルターリセット':'Reset filters',
    'フィードバック':'Feedback',
    'ブルーグレー':'Blue-gray',
    'プレイリストに移動':'Move to playlist',
    'プレイリスト名で絞り込み...':'Filter by playlist...',
    'プレイリスト名を入力...':'Enter playlist name...',
    'ペン':'Pen',
    'ページ':'Page',
    'ポジション・テクニック':'Position / Technique',
    'マーク・習得':'Marks & Progress',
    'ライト':'Light',
    'リテ':'Ret.',
    'ログイン':'Sign in',
    '上記＋スナップショット画像もすべて含む（枚数が多いと時間がかかります）':'Everything above plus all snapshot images (may take a while)',
    '並べ替え：':'Sort:',
    '中':'M',
    '使い方がわからない':'How do I use this?',
    '使い方ガイド':'User guide',
    '使用環境':'Environment',
    '例: ガード スイープ':'e.g. guard sweep',
    '例: ドリル 基礎':'e.g. drill basics',
    '修正履歴':'Edit history',
    '元に戻す (Ctrl+Z)':'Undo (Ctrl+Z)',
    '全アノテーション削除':'Delete all annotations',
    '全消去':'Erase all',
    '全画面':'Fullscreen',
    '内容':'Details',
    '円':'Circle',
    '写真':'Photo',
    '切り抜き':'Crop',
    '切取':'Crop',
    '列':'Columns',
    '動画':'Video',
    '動画の長さ':'Video duration',
    '動画パネル':'Video panel',
    '動画パネルを開いた際に自動的に再生を開始します':'Start playback automatically when the panel opens',
    '動画リスト・タグ・メモ・ノート・設定をJSONで保存（画像除く）':'Save videos, tags, memos, notes and settings as JSON (no images)',
    '取り込む':'Import',
    '右に90°回転':'Rotate 90° right',
    '右回転':'Rotate right',
    '同期':'Sync',
    '含むキーワード':'Include keywords',
    '四角':'Box',
    '太':'Bold',
    '完了！':'Done!',
    '実行':'Run',
    '左に90°回転':'Rotate 90° left',
    '左回転':'Rotate left',
    '戻す':'Revert',
    '手書きキャンバス':'Sketch canvas',
    '文字':'Text',
    '文字サイズ':'Font size',
    '文字入力':'Text input',
    '新しいプレイリスト名':'New playlist name',
    '方眼':'Grid',
    '既存のプレイリスト':'Existing playlists',
    '昇降順切替':'Toggle sort order',
    '最近再生した':'Recently played',
    '未取込のみ':'New only',
    '条件名を入力...':'Enter a name...',
    '検索対象':'Search in',
    '検索結果をVパネルで視聴し、ライブラリに追加しよう':'Watch results in the panel and add them to your library',
    '検証ドット・精度バッジを表示（この端末のみ）':'Show verification dots & accuracy badges (this device only)',
    '横線':'Lines',
    '決定':'OK',
    '消す':'Erase',
    '無地':'Plain',
    '画像':'Image',
    '白':'White',
    '白紙に自由に描く':'Draw freely on a blank page',
    '白背景ボックス':'White box',
    '矢印':'Arrow',
    '種類':'Type',
    '細':'Thin',
    '罫線':'Ruled',
    '自動':'Auto',
    '色':'Color',
    '表示する列を選択':'Choose visible columns',
    '表示テキストの大きさを調整します':'Adjust display text size',
    '解除':'Remove',
    '設定':'Settings',
    '読み込み中...':'Loading...',
    '起動タブ':'Startup tab',
    '起動・リロード時に最初に表示するタブ':'Tab shown on launch/reload',
    '追加する':'Add',
    '追加する種類を選択':'Choose what to add',
    '送信':'Send',
    '進む':'Forward',
    '選択':'Select',
    '選択・移動':'Select / Move',
    '選択中を削除':'Delete selected',
    '関連度順':'By relevance',
    '除外キーワード':'Exclude keywords',
    '🏷️ タグで絞り込む':'🏷️ Filter by tags',
    '👁 未視聴':'👁 Unwatched',
    '👁 視聴済み':'👁 Watched',
    '👥 おすすめユーザー':'👥 Suggested users',
    '💬 フィードバック':'💬 Feedback',
    '💬 メモあり':'💬 Has memo',
    '💾 保存':'💾 Save',
    '💾 保存した検索条件':'💾 Saved searches',
    '💾 条件を保存':'💾 Save filters',
    '💾 検索条件を保存':'💾 Save search',
    '📋 プレイリストから取り込む':'📋 Import from playlists',
    '📋 プレイリストフィルター':'📋 Playlist filter',
    '📍 ポジションフィルター':'📍 Position filter',
    '📓 どのノートに追加しますか？':'📓 Add to which note?',
    '📥 プレイリストを選択':'📥 Choose playlists',
    '📦 削除せず非表示にした動画。いつでも復元できます。':'📦 Hidden (not deleted). You can restore anytime.',
    '📱 スマホ':'📱 Phone',
    '📺 コミュニティの動画':'📺 Community videos',
    '📺 チャンネルフィルター':'📺 Channel filter',
    '📺 チャンネル名':'📺 Channel',
    '🔍 タイトルで検索…':'🔍 Search by title...',
    '🔎 詳細':'🔎 Details',
    '🔎 詳細検索':'🔎 Advanced search',
    '🔒 AI管理':'🔒 AI admin',
    '🔒 管理モード':'🔒 Admin mode',
    '🔖 ブックマークあり':'🔖 Has bookmarks',
    '🔗 URL入力':'🔗 URLs',
    '🔝 トップ/ボトム フィルター':'🔝 Top/Bottom filter',
    '🔥 よく検索されるテクニック':'🔥 Trending techniques',
    '🔧 管理':'🔧 Admin',
    '🔵 青帯':'🔵 Blue belt',
    '🕐 最近みた動画':'🕐 Recently watched',
    '🖼 画像あり':'🖼 Has images',
    '🗂 タグ全体図':'🗂 Tag map',
    '🗑 一括削除':'🗑 Bulk delete',
    '🟣 ドリル':'🟣 Drill',
    '🟣 紫帯':'🟣 Purple belt',
    '🟤 茶帯':'🟤 Brown belt',
    '🥋 テクニックフィルター':'🥋 Technique filter',
    '🥋 帯':'🥋 Belt',
    '（url列のみ必須・空欄可）':'(only the url column is required)',
    '（任意）':'(optional)',
    '（最大3枚）':'(up to 3)',
    '＋ ライブラリに追加':'+ Add to library',
    '＋ 選択':'+ Select',
  };

  const AUTO_PATTERNS = [
    [/^(\d+)\s*本$/, '$1 videos'],
    [/^(\d+)\s*件$/, '$1 items'],
    [/^(\d+)\s*枚$/, '$1 shots'],
    [/^(\d+)本の動画を編集中$/, 'Editing $1 videos'],
    [/^✅ (\d+)件をライブラリに追加しました(.*)$/, '✅ Added $1 videos to library'],
    [/^✅ (\d+)本の動画を追加しました$/, '✅ Added $1 videos'],
    [/^📋 (\d+)件をリストに追加$/, '📋 Add $1 to list'],
    [/^📌 (\d+)件を追加しました$/, '📌 Added $1'],
    [/^📑 (\d+)件のチャプターを取得しました$/, '📑 Loaded $1 chapters'],
    [/^🏷 (\d+)本のタグをタイトルから補完しました$/, '🏷 Tagged $1 videos from titles'],
    [/^(\d+)本を取り込む$/, 'Import $1 videos'],
    [/^動画を選択 \((\d+)本 \/ 取込済 (\d+)本\)$/, 'Select videos ($1 / $2 imported)'],
  ];

  const _autoMap = new Map();
  let _autoBuilt = false;
  function _buildAutoMap() {
    _autoMap.clear();
    for (const [ja, en] of Object.entries(STATIC_AUTO)) _autoMap.set(ja, en);
    (window.POSITIONS || []).forEach(p => { if (p.ja && p.en && p.ja !== p.en) _autoMap.set(p.ja, p.en); });
    for (const [ja, en] of Object.entries(CAT_EN)) _autoMap.set(ja, en);
    for (const [ja, en] of Object.entries(TB_EN)) _autoMap.set(ja, en);
    _autoBuilt = true;
  }

  const _missed = new Set();
  window.wkI18nMissing = () => Array.from(_missed).sort();

  function _translatePhrase(t) {
    if (!_autoBuilt) _buildAutoMap();
    const hit = _autoMap.get(t);
    if (hit != null) return hit;
    for (const [re, rep] of AUTO_PATTERNS) { if (re.test(t)) return t.replace(re, rep); }
    if (t.length <= 80) _missed.add(t);
    return null;
  }

  function _skipNode(el) {
    if (!el) return true;
    if (el.closest && el.closest('[contenteditable], script, style, textarea')) return true;
    return false;
  }

  function _translateTextNode(node) {
    const v = node.nodeValue;
    if (!v || !_JA_RE.test(v)) return;
    if (_skipNode(node.parentElement)) return;
    const t = v.trim();
    if (!t) return;
    const en = _translatePhrase(t);
    if (en != null) {
      if (node.__wkOrig == null) node.__wkOrig = v;
      node.nodeValue = v.replace(t, en);
    }
  }

  function _translateAttrs(el) {
    if (_skipNode(el)) return;
    for (const attr of ['placeholder', 'title']) {
      const v = el.getAttribute && el.getAttribute(attr);
      if (v && _JA_RE.test(v)) {
        const en = _translatePhrase(v.trim());
        if (en != null) {
          if (!el.__wkOrigAttr) el.__wkOrigAttr = {};
          if (el.__wkOrigAttr[attr] == null) el.__wkOrigAttr[attr] = v;
          el.setAttribute(attr, en);
        }
      }
    }
  }

  function _walk(root) {
    if (root.nodeType === 3) { _translateTextNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    if (root.nodeType === 1) {
      _translateAttrs(root);
      if (_skipNode(root)) return;
    }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    let n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) _translateTextNode(n);
      else _translateAttrs(n);
    }
  }

  function _restoreAll() {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    let n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3 && n.__wkOrig != null) { n.nodeValue = n.__wkOrig; n.__wkOrig = null; }
      else if (n.nodeType === 1 && n.__wkOrigAttr) {
        for (const [a, v] of Object.entries(n.__wkOrigAttr)) n.setAttribute(a, v);
        n.__wkOrigAttr = null;
      }
    }
  }

  let _observer = null;
  function _startAuto() {
    if (_observer || !document.body) return;
    _buildAutoMap();
    _walk(document.body);
    _observer = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'characterData') _translateTextNode(m.target);
        else for (const node of m.addedNodes) _walk(node);
      }
    });
    _observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function _stopAuto() {
    if (_observer) { _observer.disconnect(); _observer = null; }
    try { _restoreAll(); } catch (e) {}
  }
  window._wkAutoI18n = { start: _startAuto, stop: _stopAuto, rebuild: _buildAutoMap };

  document.documentElement.lang = _lang;
  function _initI18n() { try { window.applyStaticI18n(); } catch (e) {} try { _highlightLangSeg(); } catch (e) {} if (_lang === 'en') _startAuto(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _initI18n);
  else _initI18n();
})();
