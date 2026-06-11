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
