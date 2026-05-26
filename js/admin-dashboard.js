
// ─── iframe ページ埋め込み（遅延ロード）────────────────────────
function _renderIframe(panelId, src) {
  const el = document.getElementById(panelId);
  if (!el) return;
  // 既に iframe が入っていたらスキップ（再レンダリング不要）
  if (el.querySelector('iframe')) return;
  el.innerHTML = `<iframe src="${src}" style="width:100%;height:calc(100vh - 120px);border:none;display:block"></iframe>`;
}

// ─── タグ全体図 ──────────────────────────────────────────────
function _renderTagMaster() {
  const el = document.getElementById('admin-p-tagmaster');
  if (!el) return;

  const CATS  = window.CATEGORIES  || [];
  const POS   = window.POSITIONS   || [];
  const TB_KW = window.TB_KEYWORDS || {};

  const CAT_META = {
    escape:    { tb:'BOT' }, entry:     { tb:'BOT' }, retention: { tb:'BOT' },
    control:   { tb:'TOP' }, concept:   { tb:'NEU' }, sweep:     { tb:'BOT' },
    takedown:  { tb:'STD' }, back:      { tb:'NEU' }, pass:      { tb:'TOP' },
    finish:    { tb:'NEU' },
  };
  const TB_CLR = { BOT:'#c94f1a', TOP:'#1a6fd4', STD:'#1a9e6e', NEU:'#8840cc' };
  const TB_BG  = { BOT:'rgba(217,79,26,.08)', TOP:'rgba(26,111,212,.08)', STD:'rgba(26,158,110,.08)', NEU:'rgba(136,64,204,.08)' };

  const kw = kws => kws.map(k => `<span style="font-size:10px;padding:2px 6px;border-radius:8px;background:#f0f2f8;border:1px solid #d0d6e8;color:#6b7590;margin:2px">${k}</span>`).join('');
  const chip = a => `<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:#f4f6fa;border:1px solid #d0d6e8;color:#4a5070;margin:2px;display:inline-block">${a}</span>`;
  const badge = tb => `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:${TB_BG[tb]||'#eee'};color:${TB_CLR[tb]||'#999'}">${tb}</span>`;

  // ── Layer 1: TB ──
  let html = `<div style="font-size:11px;color:#7a85a0;margin-bottom:16px">tag-master.js の内容をリアルタイムで表示。編集は Alias ビルダーから行う。</div>`;

  html += `<div style="font-size:13px;font-weight:700;margin-bottom:10px;color:#1a2038">Layer 1 — TB キーワード</div>`;
  html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">`;
  for (const [tb, kws] of Object.entries(TB_KW)) {
    const clr = tb==='トップ'?'#1a6fd4':tb==='ボトム'?'#c94f1a':'#1a9e6e';
    const bg  = tb==='トップ'?'rgba(26,111,212,.06)':tb==='ボトム'?'rgba(217,79,26,.06)':'rgba(26,158,110,.06)';
    html += `<div style="border-radius:10px;border:1px solid #d0d6e8;overflow:hidden">
      <div style="padding:8px 12px;background:${bg};font-weight:700;font-size:12px;color:${clr}">${tb}</div>
      <div style="padding:8px;display:flex;flex-wrap:wrap">${kw(kws)}</div>
    </div>`;
  }
  html += `</div>`;

  // ── Layer 2: Categories ──
  html += `<div style="font-size:13px;font-weight:700;margin-bottom:10px;color:#1a2038">Layer 2 — Category (${CATS.length}固定)</div>`;
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;margin-bottom:20px">`;
  for (const c of CATS) {
    const tb = CAT_META[c.id]?.tb || 'NEU';
    html += `<div style="border-radius:10px;border:1px solid #d0d6e8;padding:10px 12px;background:#fff">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
        <span style="font-weight:700;font-size:12px">${c.name}</span>
        ${badge(tb)}
        <span style="font-size:10px;color:#9aa0b8;margin-left:auto">${(c.aliases||[]).length}語</span>
      </div>
      <div style="display:flex;flex-wrap:wrap">${(c.aliases||[]).map(chip).join('')}</div>
    </div>`;
  }
  html += `</div>`;

  // ── Layer 3: Positions ──
  html += `<div style="font-size:13px;font-weight:700;margin-bottom:10px;color:#1a2038">Layer 3 — Position (${POS.length}固定)</div>`;
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;margin-bottom:20px">`;
  for (const p of POS) {
    html += `<div style="border-radius:8px;border:1px solid #d0d6e8;padding:8px 10px;background:#fff">
      <div style="font-weight:700;font-size:12px;color:#8840cc;margin-bottom:4px">${p.ja} <span style="font-size:10px;color:#9aa0b8;font-weight:400">${p.en}</span></div>
      <div style="display:flex;flex-wrap:wrap">${(p.aliases||[]).map(chip).join('')}</div>
    </div>`;
  }
  html += `</div>`;

  // ── Layer 4: Tags ──
  html += `<div style="font-size:13px;font-weight:700;margin-bottom:6px;color:#1a2038">Layer 4 — #Tag（自由記入）</div>`;
  html += `<div style="font-size:11px;color:#7a85a0;background:#f4f6fa;border-radius:8px;padding:10px 14px">サイドバー非表示・AI自動抽出はデフォルト OFF。ドリル・その他などはここに格納。</div>`;

  el.innerHTML = html;
}
