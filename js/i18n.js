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

  document.documentElement.lang = _lang;
  function _initI18n() { try { window.applyStaticI18n(); } catch (e) {} try { _highlightLangSeg(); } catch (e) {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _initI18n);
  else _initI18n();
})();
