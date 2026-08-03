/* ══════════════════════════════════════════════════════════════════════
   共有シートからの登録（Web Share Target）

   YouTubeアプリなどの「共有」→ WAZA KIMURA を選ぶと、
   URL入力タブが開いて共有されたURLが自動で解析される。

   受け取り口:  /?st_url=... [&st_text=...] [&st_title=...]
     - Android : manifest.json の share_target がこのクエリで起動する
     - iOS / PC: ショートカットApp・ブックマークレットから同じURLを叩けば同じ動作

   データ層には一切触れない。
   videos を書き換えるのは既存の detectUrls() → addUrls() の経路のみで、
   このファイルは「入力欄に文字列を入れて解析ボタン相当を呼ぶ」だけ。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── iOSショートカット用のURLをコピー（URL入力タブのヘルプから呼ばれる）──
  window.wkCopyShareUrl = function () {
    const url = location.origin + location.pathname.replace(/[^/]*$/, '') + '?st_url=';
    const done = () => window.toast?.('📋 コピーしました');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done, () => window.prompt('コピーしてください', url));
    } else {
      window.prompt('コピーしてください', url);
    }
  };

  const q = new URLSearchParams(location.search);
  const rawUrl   = q.get('st_url')   || '';
  const rawText  = q.get('st_text')  || '';
  const rawTitle = q.get('st_title') || '';
  if (!rawUrl && !rawText && !rawTitle) return;

  // アドレスバーから共有パラメータを消す（リロードで二重に走らないように）。
  // 他のクエリ（フィルタ復元など）は残す。
  q.delete('st_url'); q.delete('st_text'); q.delete('st_title');
  try {
    const rest = q.toString();
    history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
  } catch (e) { /* replaceState不可でも動作に支障はない */ }

  // 共有本文は「動画タイトル\nURL」のように本文が混ざる。URLだけを拾う。
  const urls = [];
  const seen = new Set();
  for (const src of [rawUrl, rawText, rawTitle]) {
    const found = String(src).match(/https?:\/\/[^\s<>"'、,]+/g) || [];
    for (let u of found) {
      u = u.replace(/[.,)\]】」]+$/, '');
      if (!seen.has(u)) { seen.add(u); urls.push(u); }
    }
  }

  const payload = urls.length ? urls.join('\n') : String(rawText || rawTitle || '').trim();
  if (!payload) return;

  // アプリの初期化と動画データの読み込みを待ってから開く。
  // videos が空のまま解析すると既存動画との重複判定が効かないため。
  const t0 = Date.now();
  (function waitReady() {
    // switchImportTab / toast はモジュール読み込み後に window へ生える。
    // openImportHub の内部で使われるので、揃うまで待つ。
    const uiReady = typeof window.openImportHub   === 'function'
                 && typeof window.detectUrls      === 'function'
                 && typeof window.switchImportTab === 'function'
                 && !!document.getElementById('urlIn');
    const dataReady = Array.isArray(window.videos) && window.videos.length > 0;
    const waited = Date.now() - t0;
    // UIは最大30秒まで待つ。それでも揃わないなら諦める（ポーリングを残さない）
    if (!uiReady) { if (waited < 30000) setTimeout(waitReady, 120); return; }
    // データは最大10秒まで待つ（動画0本の新規ユーザーは待ち切って進む）
    if (!dataReady && waited < 10000) { setTimeout(waitReady, 120); return; }
    openWithShared();
  })();

  function openWithShared() {
    try {
      window.openImportHub();
      const ta = document.getElementById('urlIn');
      if (ta) ta.value = payload;
      if (urls.length) {
        window.toast?.('🔗 共有されたURLを解析します');
        window.detectUrls();
      } else {
        window.toast?.('⚠️ 共有された内容にURLが見つかりませんでした');
      }
    } catch (e) {
      console.error('[share-target]', e);
      window.toast?.('⚠️ 共有された内容の取り込みに失敗しました');
    }
  }
})();
