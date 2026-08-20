// ═══ WAZA KIMURA — ノートのテンプレート v52.706 ═══
//
// 育成計画や目標は、新しいデータ型を作らずノートに置く。
// テンプレートは「枠だけ用意する」もので、埋めなくてもノートは成立する。
//
// ── データ経路（CLAUDE.md ルール1のため明記）──
//  書き込み: window._notesCreateNote()（ノートを1件足すだけ・既存ノートは触らない）
//            localStorage 'wk_note_tpls'（自作テンプレ・新規キー）
//  読み取り: window.videos / window._murmursGetData（読むだけ）
//  カスタムビュー（_views / wk_cv_views）には触れない。
//  そのためテンプレートに customview ブロックは入れない（作るには _views を
//  書き換える必要があり、v52.541 と同じ経路になるため）。

const LS_TPL = 'wk_note_tpls';

const _esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $n  = s => document.querySelector(s);
const $$n = s => [...document.querySelectorAll(s)];

const h2   = t => ({ type:'h2',   content:t });
const text = t => ({ type:'text', content:t || '' });
const vidlist = (name, tags) => ({
  type:'vidlist', name: name || '関連動画',
  mode:'filter', filter: tags && tags.length ? { tags: tags.slice() } : {},
  max:20, sort:{ key:'addedAt', asc:false }
});

// secs: [見出し, 何で埋めるか]
//   'body'    = 元になったメモの本文
//   'related' = 同じタグの過去のメモ
//   null      = 空欄
const PRESETS = [
  { k:'goal', ic:'🎯', nm:'目標', ds:'できるようになりたいこと1つ',
    grp:'メモから育てる', status:'wip',
    secs:[['できるようになりたいこと','body'],
          ['いま引っかかっているところ','related'],
          ['試すこと',null]],
    vid:'関連動画' },

  { k:'counter', ic:'⚔️', nm:'対策シート', ds:'やられていることへの対処',
    grp:'メモから育てる', status:'wip',
    secs:[['やられていること','body'],
          ['なぜ効かれるのか（推測）','related'],
          ['対処の候補',null],
          ['試した結果（追記していく）',null]],
    vid:'参考になりそうな動画' },

  { k:'break', ic:'🔬', nm:'技の分解', ds:'ひとつの技を細かく開く',
    grp:'メモから育てる', status:'wip',
    secs:[['この技について','body'],
          ['入口（どこから入るか）',null],
          ['効く条件',null],
          ['よくある失敗','related'],
          ['連携（成功したら／防がれたら）',null]],
    vid:'この技の動画' },

  { k:'plan', ic:'🗺', nm:'育成計画', ds:'3〜6ヶ月のまとまり',
    grp:'まとめて計画する', status:'wip',
    secs:[['この期間で一番伸ばしたいこと','body'],
          ['取り組むテーマ','related'],
          ['ここに近づいたら「できた」と思える',null],
          ['見直す日',null]],
    vid:'関連動画' },

  { k:'diary', ic:'📅', nm:'練習日誌', ds:'その日1日ぶん',
    grp:'まとめて計画する', status:'new',
    secs:[['効いた','body'],['効かなかった',null],['次に試す',null]],
    vid:null },

  { k:'blank', ic:'📄', nm:'空白から', ds:'自分で組み立てる',
    grp:'まとめて計画する', status:'new',
    secs:[['','body']], vid:null }
];

// ── 自作テンプレート ──
let _mine = [];
function _loadMine() {
  try { _mine = JSON.parse(localStorage.getItem(LS_TPL) || '[]'); } catch (e) { _mine = []; }
  if (!Array.isArray(_mine)) _mine = [];
}
function _saveMine() {
  try { localStorage.setItem(LS_TPL, JSON.stringify(_mine)); } catch (e) {}
}
_loadMine();
window._noteTplsGet = () => _mine.slice();          // バックアップ用
window._noteTplsSet = list => {                      // 復元用
  if (!Array.isArray(list) || !list.length) return;  // 空で潰さない
  _mine = list; _saveMine();
};
const _all = () => [...PRESETS, ..._mine];

// ── テンプレートからノートの中身を組み立てる ──
// src: { body, related[] } … メモから育てるときだけ渡す
export function buildNote(tpl, src) {
  const blocks = [];
  const title = (src?.body || '').split('\n')[0].slice(0, 120) || `${tpl.nm}`;

  // 自作テンプレ: 保存したブロックをそのまま使う。
  // 先頭の本文だけメモの中身で埋め、動画リストの条件はメモのタグを入れる。
  if (tpl.rawBlocks) {
    let filledFirst = false;
    tpl.rawBlocks.forEach(b => {
      if (b.type === 'vidlist') {
        blocks.push({ ...JSON.parse(JSON.stringify(b)),
          filter: tpl.vidFilter || (src?.tags?.length ? { tags: src.tags.slice() } : {}) });
        return;
      }
      if (!filledFirst && b.type === 'text' && src?.body && !b.content) {
        blocks.push({ type: 'text', content: src.body });
        filledFirst = true;
        return;
      }
      blocks.push(JSON.parse(JSON.stringify(b)));
    });
    return { name: src ? title : tpl.nm, status: tpl.status || 'new',
             tags: (src?.tags || []).slice(), blocks };
  }

  (tpl.secs || []).forEach(([head, fill]) => {
    if (head) blocks.push(h2(head));
    let body = '';
    if (fill === 'body' && src?.body) body = src.body;
    else if (fill === 'related' && src?.related?.length)
      body = src.related.map(r => '・' + String(r).replace(/\n/g, ' ')).join('\n');
    blocks.push(text(body));
  });

  if (tpl.vid) blocks.push(vidlist(tpl.vid, src?.tags || []));

  return {
    name: src ? title : tpl.nm,
    status: tpl.status || 'new',
    tags: (src?.tags || []).slice(),
    blocks
  };
}

// ── 選ぶ画面 ──
function _modal() {
  let d = document.getElementById('nt-modal');
  if (d) return d;
  d = document.createElement('div');
  d.id = 'nt-modal';
  d.innerHTML = `
    <div class="nt-card" role="dialog" aria-label="テンプレート">
      <div class="nt-hd"><h2 id="nt-h">テンプレート</h2>
        <button class="nt-x" id="nt-x" aria-label="閉じる">✕</button></div>
      <div class="nt-bd" id="nt-bd"></div>
      <div class="nt-ft" id="nt-ft"></div>
    </div>`;
  document.body.appendChild(d);
  d.onclick = e => { if (e.target === d) _close(); };
  document.getElementById('nt-x').onclick = _close;
  return d;
}
const _close = () => document.getElementById('nt-modal')?.classList.remove('open');
window._noteTplClose = _close;

// src を渡すとメモから育てるモード、渡さないと白紙から作るモード
export function openTemplatePicker(src) {
  _modal().classList.add('open');
  $n('#nt-h').textContent = src ? 'どの形に育てますか' : '新しいノート';
  const groups = [...new Set(_all().map(t => t.grp || '自分のテンプレート'))];
  $n('#nt-bd').innerHTML =
    (src ? `<p class="nt-lead">このメモを元にノートを作ります。<span class="nt-q">${_esc(src.body)}</span></p>` : '') +
    groups.map(g => `
      <p class="nt-sec">${_esc(g)}</p>
      <div class="nt-grid">${_all().filter(t => (t.grp || '自分のテンプレート') === g).map(t => `
        <div class="nt-card-w">
          <button class="nt-card-b" data-nt="${_esc(t.k)}">
            <span class="nt-ic">${t.ic || '📄'}</span>
            <span class="nt-nm">${_esc(t.nm)}</span>
            <span class="nt-ds">${_esc(t.ds || '')}</span>
          </button>
          ${t.rawBlocks ? `<button class="nt-del" data-nt-del="${_esc(t.k)}" title="削除">🗑</button>` : ''}
        </div>`).join('')}</div>`).join('');
  $n('#nt-ft').innerHTML = '';
  $$n('#nt-bd [data-nt]').forEach(b => b.onclick = () => _preview(b.dataset.nt, src));
  $$n('#nt-bd [data-nt-del]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    window._noteTplRemove(b.dataset.ntDel);
    window.toast?.('削除しました');
    openTemplatePicker(src);
  });
}

function _preview(key, src) {
  const tpl = _all().find(t => t.k === key);
  if (!tpl) return;
  const spec = buildNote(tpl, src);
  const filled = new Set();
  (tpl.secs || []).forEach(([h, f]) => { if (f) filled.add(h); });

  $n('#nt-h').textContent = `${tpl.ic || '📄'} ${tpl.nm}`;
  $n('#nt-bd').innerHTML = `
    <p class="nt-title">${_esc(spec.name)}</p>
    <span class="nt-status">${_esc({wip:'学習中',new:'新規',done:'習得',review:'要復習'}[spec.status] || '新規')}</span>
    ${spec.blocks.map((b, i) => {
      if (b.type === 'h2') return `<p class="nt-h2">■ ${_esc(b.content)}</p>`;
      if (b.type === 'text') return b.content
        ? `<div class="nt-fill">${_esc(b.content)}</div>`
        : `<div class="nt-empty">空欄のままで大丈夫です</div>`;
      if (b.type === 'vidlist') {
        const tags = b.filter?.tags || [];
        return `<p class="nt-h2">■ ${_esc(b.name)}　<span class="nt-note-i">動画リスト${
          tags.length ? `（条件：${tags.map(t => '#' + _esc(t)).join(' ')}）` : ''}</span></p>
          <div class="nt-blk"><b>自動で並びます</b>${tags.length
            ? ` — 条件に合う動画が増えたら、このノートにも増えます。`
            : ` — 条件はノートの中で決められます。`}</div>`;
      }
      return '';
    }).join('')}
    <p class="nt-anno">${src
      ? '<b>黄色</b>がメモから引き継いだ中身、<b>グレー</b>は空欄です。埋めなくてもノートは成立します。'
      : '見出しだけ用意します。中身はあとから書けます。'}</p>`;
  $n('#nt-ft').innerHTML = `
    <button class="nt-ghost" id="nt-back">← 選び直す</button>
    <button class="nt-go" id="nt-make">このノートを作る</button>`;
  $n('#nt-back').onclick = () => openTemplatePicker(src);
  $n('#nt-make').onclick = () => {
    const id = window._notesCreateNote?.(spec);
    _close();
    if (id) {
      window.toast?.(`📓「${spec.name}」を作りました`);
      window._notesOpenNote?.(id);
    } else {
      window.toast?.('⚠️ ノートを作れませんでした');
    }
  };
}

// ═══ ノートをテンプレートにする ═══
// ノートは読むだけ（_notesGetNote はコピーを返す）。書き込みは wk_note_tpls のみ。

// 型として残せるブロックだけを拾う。
// 動画・画像・カスタムビュー・段組みなどはそのノート固有の中身なので持ち込まない。
const KEEP = new Set(['h2', 'text', 'quote', 'vidlist']);

function _toTemplate(note, { keepText, keepCond }) {
  const secs = [];
  const blocks = [];
  let dropped = 0;
  let vidName = null;

  (note.blocks || []).forEach(b => {
    if (!KEEP.has(b.type)) { dropped++; return; }
    if (b.type === 'vidlist') {
      vidName = b.name || '関連動画';
      blocks.push({ ...JSON.parse(JSON.stringify(b)),
        filter: keepCond ? (b.filter || {}) : {},
        ids: [] });
      return;
    }
    // 見出しは型そのものなので必ず残す。空にできるのは本文だけ。
    const isHead = b.type === 'h2';
    blocks.push({ type: b.type, content: (isHead || keepText) ? (b.content || '') : '' });
  });

  // 見出し＋直後の本文を1組として secs に写す（メモから育てるときに使う）
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'h2') {
      secs.push([b.content, secs.length === 0 ? 'body' : null]);
      if (blocks[i + 1] && blocks[i + 1].type !== 'h2' && blocks[i + 1].type !== 'vidlist') i++;
    }
  }
  return { secs, blocks, dropped, vidName };
}

window._noteTplSaveFrom = function (noteId) {
  const note = window._notesGetNote?.(noteId || window._notesActiveId?.());
  if (!note) { window.toast?.('ノートが見つかりません'); return; }
  const opt = { keepText: false, keepCond: false };

  const paint = () => {
    const t = _toTemplate(note, opt);
    _modal().classList.add('open');
    $n('#nt-h').textContent = 'テンプレートにする';
    $n('#nt-bd').innerHTML = `
      <p class="nt-lead">「${_esc(note.name)}」の形を残して、次から同じ形で作れるようにします。
        <br><span class="nt-note-i">元のノートは変わりません。</span></p>
      <p class="nt-sec">名前</p>
      <input class="nt-fld" id="nt-save-nm" type="text" value="${_esc(note.name)}">
      <p class="nt-sec">中身をどうする</p>
      <div class="nt-opts">
        <button class="nt-chip" data-nt-keep="0" aria-pressed="${!opt.keepText}">見出しだけ</button>
        <button class="nt-chip" data-nt-keep="1" aria-pressed="${opt.keepText}">書いた中身も残す</button>
      </div>
      ${t.vidName ? `
        <p class="nt-sec">動画リストの条件</p>
        <div class="nt-opts">
          <button class="nt-chip" data-nt-cond="0" aria-pressed="${!opt.keepCond}">毎回決める</button>
          <button class="nt-chip" data-nt-cond="1" aria-pressed="${opt.keepCond}">この条件のまま</button>
        </div>` : ''}
      <p class="nt-sec">残るもの</p>
      <div class="nt-blk">
        ${t.blocks.filter(b => b.type === 'h2').map(b => `■ ${_esc(b.content || '(見出しなし)')}`).join('<br>') || '見出しなし'}
        ${t.vidName ? `<br>▸ ${_esc(t.vidName)}` : ''}
        ${t.dropped ? `<br><span class="nt-note-i">動画・画像・段組みなど ${t.dropped}個は持ち込みません（そのノート固有の中身のため）</span>` : ''}
      </div>`;
    $n('#nt-ft').innerHTML = `
      <button class="nt-ghost" id="nt-save-cancel">やめる</button>
      <button class="nt-go" id="nt-save-ok">保存</button>`;

    $$n('#nt-bd [data-nt-keep]').forEach(b => b.onclick = () => {
      opt.keepText = b.dataset.ntKeep === '1';
      const nm = $n('#nt-save-nm').value; paint(); $n('#nt-save-nm').value = nm;
    });
    $$n('#nt-bd [data-nt-cond]').forEach(b => b.onclick = () => {
      opt.keepCond = b.dataset.ntCond === '1';
      const nm = $n('#nt-save-nm').value; paint(); $n('#nt-save-nm').value = nm;
    });
    $n('#nt-save-cancel').onclick = _close;
    $n('#nt-save-ok').onclick = () => {
      const nm = $n('#nt-save-nm').value.trim();
      if (!nm) { window.toast?.('名前を入れてください'); $n('#nt-save-nm').focus(); return; }
      const built = _toTemplate(note, opt);
      _mine.push({
        k: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        ic: '⊞', nm, ds: '自分のテンプレート', grp: '自分のテンプレート',
        status: note.status || 'new',
        secs: built.secs.length ? built.secs : [['', 'body']],
        rawBlocks: built.blocks,
        vid: built.vidName,
        vidFilter: opt.keepCond ? (built.blocks.find(b => b.type === 'vidlist')?.filter || {}) : null
      });
      _saveMine();
      _close();
      window.toast?.(`⊞「${nm}」をテンプレートにしました`);
    };
  };
  paint();
};

// 自作テンプレの削除・改名（テンプレート一覧から）
window._noteTplRemove = function (k) {
  _mine = _mine.filter(t => t.k !== k); _saveMine();
};

window.openNoteTemplatePicker = openTemplatePicker;
