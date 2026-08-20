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
        <button class="nt-card-b" data-nt="${_esc(t.k)}">
          <span class="nt-ic">${t.ic || '📄'}</span>
          <span class="nt-nm">${_esc(t.nm)}</span>
          <span class="nt-ds">${_esc(t.ds || '')}</span>
        </button>`).join('')}</div>`).join('');
  $n('#nt-ft').innerHTML = '';
  $$n('#nt-bd [data-nt]').forEach(b => b.onclick = () => _preview(b.dataset.nt, src));
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

window.openNoteTemplatePicker = openTemplatePicker;
