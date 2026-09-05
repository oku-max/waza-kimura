// Journal の「声をかける」（アプリ内リマインド）の動きを、ブラウザなしで確かめる。
//   node tools/journal-remind-check.mjs
// js/murmurs.js をそのまま読み込み、時計とタイマーだけを偽物に差し替えて観測する。
// DOM は「出そうとしたか」を数えるだけの最小限のはりぼて。
// 時刻の期待値を JST で書いているので、実行環境のタイムゾーンも JST に固定する。
process.env.TZ = 'Asia/Tokyo';
const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }
};
const fakeEl = () => {
  const target = function(){ return fakeEl(); };
  return new Proxy(target, {
    get(t, p) {
      if (p in t && p !== 'name' && p !== 'length') return t[p];
      if (p === Symbol.toPrimitive || p === 'toString') return () => '';
      if (p === Symbol.iterator) return function*(){};
      if (p === 'length') return 0;
      if (p === 'value' || p === 'innerHTML' || p === 'textContent') return '';
      if (p === 'classList') return { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
      if (p === 'dataset' || p === 'style') return {};
      return fakeEl();
    },
    set(t, p, v) { t[p] = v; return true; }, apply() { return fakeEl(); }
  });
};
let inserted = [], visListeners = [];
globalThis.document = {
  visibilityState: 'visible',
  addEventListener(ev, fn) { if (ev === 'visibilitychange') visListeners.push(fn); },
  createElement: () => fakeEl(),
  querySelector: sel => (sel === '.topbar' ? { parentElement: { insertBefore: n => inserted.push(n) } }
                        : sel === '#mm-composer.open' ? null : fakeEl()),
  querySelectorAll: () => [],
  getElementById: id => (id === 'mm-remind' ? null : fakeEl()),
  body: { dataset:{}, classList:{ add(){}, remove(){}, toggle(){}, contains(){return false} },
          appendChild: n => inserted.push(n), contains: () => false, style:{} }
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {};

// ── 偽タイマー ──
let timers = [], tid = 1;
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => { const id = tid++; timers.push({ id, fn, ms }); return id; };
globalThis.clearTimeout = id => { timers = timers.filter(t => t.id !== id); };
function fireTimers() { const due = timers; timers = []; due.forEach(t => t.fn()); }

// ── 偽の時計 ──
const RealDate = Date;
function setNow(iso) {
  const fixed = new RealDate(iso).getTime();
  class D extends RealDate {
    constructor(...a) { super(...(a.length ? a : [fixed])); }
    static now() { return fixed; }
  }
  globalThis.Date = D;
}

const M = await import('../js/murmurs.js');
const out = [];
const check = (n, got, want) => out.push(`${got === want ? 'OK ' : '★NG'}  ${n} → 表示=${got} (期待 ${want})`);
const shown = () => { const r = inserted.length > 0; inserted = []; return r; };
function reset(rem, data, iso) {
  setNow(iso);
  window._murmursClear();
  timers = [];
  store['wk_murmur_remind'] = JSON.stringify({ on:true, hour:19, everyDays:1, lastShown:'', lastSnoozed:'', ...(rem||{}) });
  window._murmursSetRemind({ on:true, hour:19, everyDays:1, lastShown:'', lastSnoozed:'', ...(rem||{}) });
  timers = [];
  window._murmursLoadFromRemote({ data: data || [], tpls: [] });
  fireTimers();          // load 1.2秒後の初回チェック
  inserted = [];
}
const old = [{ id:'a', ts:'2026-08-20T10:00:00.000Z', body:'昔のメモ' }];

// A) 10時に開いて、そのまま開きっぱなしで19時をまたぐ
reset({}, old, '2026-09-05T10:00:00+09:00');
setNow('2026-09-05T19:00:10+09:00');
fireTimers();                                   // 見張りタイマーが起きる
check('10時に開いて開きっぱなし → 19時に出る', shown(), true);

// B) 同じ日にもう一度タイマーが回っても二重に出ない
setNow('2026-09-05T19:35:00+09:00');
fireTimers();
check('同じ日の2回目（二重表示しない）', shown(), false);

// C) 日をまたいで翌日19時にまた出る
setNow('2026-09-06T19:00:10+09:00');
fireTimers();
check('翌日19時にまた出る', shown(), true);

// D) 昼にタブへ戻っても出ない／夜に戻ると出る
reset({}, old, '2026-09-05T10:00:00+09:00');
visListeners.forEach(f => f());
check('昼にタブ復帰（出ないのが正）', shown(), false);
setNow('2026-09-05T21:00:00+09:00');
visListeners.forEach(f => f());
check('夜にタブ復帰 → 出る', shown(), true);

// E) 今日すでに書いていれば出ない
reset({}, [{ id:'b', ts:'2026-09-05T09:00:00+09:00', body:'今日書いた' }], '2026-09-05T10:00:00+09:00');
setNow('2026-09-05T20:00:00+09:00');
fireTimers(); visListeners.forEach(f => f());
check('今日すでに書いた', shown(), false);

// F) OFF なら見張りも動かない
reset({ on:false }, old, '2026-09-05T10:00:00+09:00');
setNow('2026-09-05T20:00:00+09:00');
fireTimers(); visListeners.forEach(f => f());
check('OFF設定', shown(), false);

// G) ログアウト後にバーが出ない
reset({}, old, '2026-09-05T10:00:00+09:00');
window._murmursClear();
setNow('2026-09-05T20:00:00+09:00');
fireTimers(); visListeners.forEach(f => f());
check('ログアウト後', shown(), false);

// H) クラウドが空でローカルに記録がある端末でも出る
window._murmursClear();
setNow('2026-09-05T20:00:00+09:00');
store['wk_murmurs'] = JSON.stringify(old);
window._murmursInitForUser();
timers = []; inserted = [];
window._murmursLoadFromRemote({ data: [], tpls: [] });   // クラウド側は空
fireTimers();
check('クラウド空＋ローカル有', shown(), true);

// I) 週1設定は見張りが回っても週1のまま
reset({ everyDays:7, lastShown:'2026-9-2' }, old, '2026-09-05T10:00:00+09:00');
setNow('2026-09-05T20:00:00+09:00');
fireTimers();
check('週1・前回3日前（まだ出さない）', shown(), false);

globalThis.Date = RealDate; globalThis.setTimeout = realTimeout;
console.log(out.join('\n'));
if (out.some(l => l.startsWith('★'))) process.exitCode = 1;
