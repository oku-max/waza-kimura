// ═══ アプリを切り替えて戻ったとき、はじめの画面にしない（v52.963）═══
// オーナー「アプリを切り替えただけで いちいち リセットされるのがめんどくさい」。
// スマホは裏に回したページを終わらせることがあり、戻るとページを最初から読み込み直す
// （アプリからは止められない）。そこで、裏に回る瞬間に「どこを見ていたか」を控え、
// 読み込み直したときにそこへ戻す。読み込み直していなければ何もしない（画面はそのまま残っている）。
//
// 控えるもの: 開いていたタブ / マスターのカード・テーブル表示 / 開いていた動画パネル / 開いていたノート / スクロールの位置 /
//             YouTube検索の結果（もう一度 YouTube に問い合わせない）
// 開いていたリストは custom-view.js が前から覚えている（wk_cv_lastView）ので、ここでは触らない。
// 控える場所はこの端末の localStorage `wk_resume` だけ。動画・リスト・ノートのデータには書かない・クラウドへ送らない。
// 戻している途中に画面を触ったら、そこでやめる（操作を横取りしない）。
(function () {
  const KEY = 'wk_resume';
  const TABS = ['home', 'community', 'settings', 'admin', 'search', 'notes', 'murmurs'];

  function curTab() {
    for (const t of TABS) if (document.getElementById(t + 'Tab')?.classList.contains('active')) return t;
    return 'home';
  }
  function scrollTops() {
    const o = {};
    if (window.scrollY > 0) o.__win = Math.round(window.scrollY);
    document.querySelectorAll('[id]').forEach(el => {
      if (el.scrollTop > 0 && el.offsetParent !== null) o[el.id] = Math.round(el.scrollTop);
    });
    return o;
  }
  function vpShown() {
    const p = document.getElementById('vpanel');   // ライブラリの動画パネル（開いているとき .open）
    return !!(window.openVPanelId && p && p.classList.contains('open'));
  }

  let _restoring = false;
  let _pendingSc = null;   // 付け直している途中のスクロール位置（まだ届いていないものは、控えの値を引き継ぐ）
  function save() {
    if (_restoring) return;   // タブ・パネルを戻している途中の半端な画面で上書きしない
    try {
      const sc = scrollTops();
      if (_pendingSc) for (const k in _pendingSc) if (!(k in sc)) sc[k] = _pendingSc[k];
      // リストを開いていないとき（マスター）のカード/テーブル。リストを開いていればリストが自分の表示形式を覚えている
      const inList = !!(window._cvActiveViewId || window._cvVideoIds || window._cvCardVideoIds);
      const s = { at: Date.now(), tab: curTab(), sc,
                  lib: inList ? null : (window._libViewMode === 'card' ? 'card' : 'org'),
                  vp: vpShown() ? window.openVPanelId : null,
                  note: window._notesActiveId?.() || null,
                  sr: window.ytSrResumeGet?.() || null };
      try { localStorage.setItem(KEY, JSON.stringify(s)); }
      catch (e) { s.sr = null; localStorage.setItem(KEY, JSON.stringify(s)); }   // 入り切らなければ検索結果だけ諦める
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  window.addEventListener('pagehide', save);

  // 共有から開いた（?st_url= 等。js/share-target.js）ときは、その画面を優先して戻さない。
  // ?q= 等の絞り込みは filter.js がいつも URL に書いているものなので、それでは止めない
  if (/[?&]st_(url|text|title)=/.test(location.search)) return;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (!saved || typeof saved !== 'object') return;

  let touched = false;
  const stopOn = () => { touched = true; };
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => window.addEventListener(ev, stopOn, { capture: true, once: true, passive: true }));
  const wait = (cond, ms) => new Promise(res => {
    const t0 = Date.now();
    (function tick() { if (cond() || Date.now() - t0 > ms) return res(cond()); setTimeout(tick, 80); })();
  });

  (async function restore() {
    _restoring = true;
    try {
      if (!(await wait(() => typeof window.switchTab === 'function', 10000)) || touched) return;
      // 動画が並ぶのを待つ（端末の控えから出るので、ふつうは一瞬）
      await wait(() => (window.videos || []).length > 0, 10000);
      if (touched) return;
      const tab = TABS.includes(saved.tab) ? saved.tab : 'home';
      if (tab !== 'home') window.switchTab(tab);
      else if ((saved.lib === 'card' || saved.lib === 'org') && saved.lib !== window._libViewMode
               && !(window._cvActiveViewId || window._cvVideoIds || window._cvCardVideoIds)) window._libView?.(saved.lib);
      if (tab === 'search' && saved.sr) window.ytSrResumeSet?.(saved.sr);
      if (tab === 'notes' && saved.note) {
        await new Promise(r => setTimeout(r, 120));
        if (!touched) window._notesOpenNote?.(saved.note);
      }
      if (saved.vp && (window.videos || []).some(v => v.id === saved.vp)) {
        await new Promise(r => setTimeout(r, 120));
        if (!touched) window.openVPanel?.(saved.vp);
      }
      _restoring = false;   // ここから先（スクロールの付け直し）の間に裏へ回っても、今の画面を控える
      // スクロール: 読み込みの後しばらくは、カード/テーブルの切り替えや描き直しで位置が 0 に戻る・
      // 行を少しずつ描くので途中までしか届かないことがある。そこで 8 秒のあいだ、届いていなければ付け直す
      // （画面を触ったらそこでやめる）
      const sc = saved.sc || {};
      _pendingSc = sc;
      const keys = Object.keys(sc);
      const t0 = Date.now();
      while (keys.length && !touched && Date.now() - t0 < 8000) {
        for (const k of keys) {
          const want = sc[k];
          if (k === '__win') { if (window.scrollY < want - 4) window.scrollTo(0, want); continue; }
          const el = document.getElementById(k);
          if (el && el.offsetParent !== null && el.scrollTop < want - 4) el.scrollTop = want;
        }
        await new Promise(r => setTimeout(r, 150));
      }
    } catch (e) { console.warn('[resume]', e); }
    finally { _restoring = false; _pendingSc = null; }
  })();
})();
