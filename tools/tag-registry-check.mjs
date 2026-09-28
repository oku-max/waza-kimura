#!/usr/bin/env node
// ═══ タググループの一覧（js/tag-registry.js・段階1）の検査 ═══
// 使い方: node tools/tag-registry-check.mjs
//
// 段階1は「土台」。画面は変えず、データも消さない・書き換えない。ここで見張ること:
//   ① まっさらから作ると、今の画面と同じ並び（タグ1〜4 = tb/cat/pos/tags）で、マーク・習得は未使用
//   ② 今の4つの名前と選択肢は複製しない（tagSettings を読む）。変えればすぐ反映される
//   ③ 編集したことのある旧テンプレートだけが未使用のタググループになる。二度は足さない。
//      テンプレートが後で消えても、移したグループは消さない
//   ④ 動画の値は今の保存場所から読むだけ（v.tb 等・★Next ドリル・習得・v.tg）
//   ⑤ 壊れた形・自分より新しい形は受け取らない／書かない
//   ⑥ クラウドとのやりとり（firebase.js の本物の関数を偽のクラウドにつなぐ）:
//      設定を読めていない→何もしない／読めない→書かない／無い→1回だけ作って書く／
//      有って足すものが無い→書かない／書けない→以後書かずに1回だけ知らせる／途中でユーザーが変わった→書かない
//   ⑦ 一覧のコードが、動画・tagSettings・テンプレートに書き込まない
//   ⑧ バックアップに一覧とテンプレートが入り、復元で戻る
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let fail = 0;
const ck = (name, ok, detail) => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (!ok && detail !== undefined ? '\n      → ' + detail : ''));
  if (!ok) fail++;
};
const J = x => JSON.stringify(x);

const REG_SRC = read('js/tag-registry.js');

// 本物の tag-registry.js を、まっさらな window で読む
function boot({ ls = {}, tagSettings, lang = 'ja' } = {}) {
  const store = { ...ls };
  const win = {
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    tagSettings: tagSettings || [
      { key: 'tb', label: 'トップ/ボトム', visible: true, presets: ['トップ', 'ボトム'] },
      { key: 'cat', label: 'カテゴリ', visible: true, presets: ['パスガード'] },
      { key: 'pos', label: 'ポジション', visible: true, presets: ['ハーフガード'] },
      { key: 'tags', label: 'テクニック', visible: false, presets: ['キムラ'] },
    ],
    STATUS_CANON: ['未着手', '理解', '練習中', 'マスター'],
    WK_LANG: () => lang,
  };
  win.window = win;
  win.tagLabel = k => (win.tagSettings.find(t => t.key === k) || {}).label || k;
  win.tagPresets = k => (win.tagSettings.find(t => t.key === k) || {}).presets || [];
  vm.createContext(win);
  vm.runInContext(REG_SRC, win);
  return { win, R: win.tagRegistry, store };
}

// ── ① まっさら ──
{
  const { R, store } = boot();
  const s = R.slots();
  ck('① まっさらでは タグ1〜4 = tb/cat/pos/tags（今の画面と同じ並び）', J(s.map(g => g && g.store)) === J(['tb', 'cat', 'pos', 'tags']), J(s.map(g => g && g.store)));
  const un = R.groups().filter(g => g.slot < 0).map(g => g.id);
  ck('① マーク・習得は未使用に入っている', J(un) === J(['mark', 'status']), J(un));
  ck('① マーク・習得は普通のタググループ（store:map・v52.876）', R.group('mark').store === 'map' && R.group('status').store === 'map');
  ck('① 検索の対象: 今の4つは対象・マークと習得は対象外', R.groups().every(g => g.search === !['mark', 'status'].includes(g.id)));
  ck('① 作った一覧を端末の控えに書く', !!store.wk_tagRegistry && R._valid(JSON.parse(store.wk_tagRegistry)));
  ck('① 初期値のある印: トップ/ボトム・ポジション', J(R.groups().filter(g => g.def).map(g => g.def)) === J(['tb', 'pos']));
}

// ── ② 名前と選択肢は tagSettings が正（複製しない）──
{
  const { win, R } = boot();
  ck('② 名前は tagSettings のラベル', R.group('f_pos').name === 'ポジション');
  ck('② 選択肢は tagSettings の選択肢', J(R.group('f_tb').options) === J(['トップ', 'ボトム']));
  win.tagSettings[0].label = 'TB'; win.tagSettings[0].presets.push('スタンディング');
  ck('② tagSettings を変えると、すぐ一覧の表示も変わる（控えを持っていない）', R.group('f_tb').name === 'TB' && R.group('f_tb').options.length === 3);
  ck('② 保存する一覧に今の4つの名前・選択肢を持たない', R.raw().groups.filter(g => ['tb', 'cat', 'pos', 'tags'].includes(g.store)).every(g => !('name' in g) && !('opts' in g)));
  ck('② マーク・習得の名前は既定（日本語）', R.group('mark').name === 'マーク' && R.group('status').name === '習得');
  const en = boot({ lang: 'en' }).R;
  ck('② 英語表示ではマーク・習得の既定名も英語', en.group('mark').name === 'Marks' && en.group('status').name === 'Progress');
  ck('② マークの最初の選択肢は お気に入り・Next・ドリル（表示も値のまま）', J(R.group('mark').options) === J(['お気に入り', 'Next', 'ドリル']) && R.optionLabel(R.group('mark'), 'Next') === 'Next');
  ck('② 習得の最初の選択肢は 理解・練習中・マスター（未着手はタグにしない）', J(R.group('status').options) === J(['理解', '練習中', 'マスター']));
}

// ── ③ 旧テンプレート ──
{
  const { R } = boot();
  R.reconcile(null);   // 1回目はマークをタグ4へ入れる（⑪で見る）
  ck('③ 編集したことが無い（null）なら何も足さない', R.reconcile(null) === false && R.groups().length === 6);
  const raw = { seeded: true, list: [
    { id: 'pos', name: 'ポジション', values: ['クローズドガード', 'ハーフガード', 'ハーフガード', ''] },
    { id: 'u_abc', name: '練習メニュー', values: ['ドリル', 'スパー'] },
  ] };
  ck('③ 編集した旧テンプレートを足すと true（保存が要る）', R.reconcile(raw) === true);
  const t = R.groups().filter(g => /^t_/.test(g.id));
  ck('③ 旧テンプレートが未使用のタググループになる（名前に「（旧テンプレート）」）', J(t.map(g => [g.name, g.slot])) === J([['ポジション（旧テンプレート）', -1], ['練習メニュー（旧テンプレート）', -1]]), J(t.map(g => [g.name, g.slot])));
  ck('③ 選択肢は重複・空を除いて写す', J(R.group('t_pos').options) === J(['クローズドガード', 'ハーフガード']));
  ck('③ もう一度呼んでも二度は足さない（false）', R.reconcile(raw) === false && R.groups().length === 8);
  ck('③ テンプレートが後で消えても、移したグループは残る', R.reconcile({ seeded: true, list: [] }) === false && R.groups().length === 8);
  ck('③ 新しいテンプレートだけを足す', R.reconcile({ seeded: true, list: [...raw.list, { id: 'u_new', name: '新', values: ['A'] }] }) === true && R.groups().length === 9);
  ck('③ 枠（タグ1〜4）は変えない', J(R.slots().map(g => g.id)) === J(['f_tb', 'f_cat', 'f_pos', 'mark']));
  const en = boot({ lang: 'en' }).R; en.reconcile({ seeded: true, list: [{ id: 'x', name: 'Menu', values: [] }] });
  ck('③ 英語表示の人は「(old template)」', en.group('t_x').name === 'Menu (old template)');
}

// ── ④ 動画の値は今の場所から読むだけ ──
{
  const { R } = boot();
  R.reconcile({ seeded: true, list: [{ id: 'm', name: 'M', values: ['A'] }] });
  const v = { tb: ['トップ'], cat: [], pos: ['ハーフガード'], tags: ['キムラ'], fav: true, next: false, drill: true, status: '練習中', tg: { t_m: ['A'], mark: ['お気に入り'] } };
  const before = J(v);
  ck('④ タグ1〜4 の値', J(R.valuesOf(v, 'f_tb')) === J(['トップ']) && J(R.valuesOf(v, 'f_tags')) === J(['キムラ']));
  ck('④ マークは v.tg.mark から（古い欄 v.fav/v.drill は読まない）', J(R.valuesOf(v, 'mark')) === J(['お気に入り']));
  ck('④ 習得は v.tg.status から（古い欄 v.status は読まない）', J(R.valuesOf(v, 'status')) === '[]');
  ck('④ 新しいグループは v.tg から', J(R.valuesOf(v, 't_m')) === J(['A']) && J(R.valuesOf({}, 't_m')) === '[]');
  R.valuesOf(v, 'f_tb').push('X');
  ck('④ 読んでも動画は変わらない（返す配列はコピー）', J(v) === before);
}

// ── ⑤ 形の検査 ──
{
  const { R, store } = boot();
  const good = R.raw();
  ck('⑤ 壊れた形は受け取らない（枠が3つ）', R.applyRemote({ ...good, slots: ['f_tb', 'f_cat', 'f_pos'] }) === false);
  ck('⑤ 壊れた形は受け取らない（枠が知らないグループを指す）', R.applyRemote({ ...good, slots: ['zz', null, null, null] }) === false);
  ck('⑤ 壊れた形は受け取らない（グループが空）', R.applyRemote({ ...good, groups: [] }) === false);
  ck('⑤ 受け取らなかったとき、いまの一覧はそのまま', J(R.raw()) === J(good));
  const future = { ...good, v: 99 };
  ck('⑤ 自分より新しい形は読むが、書き出さない（raw が null）', R.applyRemote(future) === true && R.raw() === null && R.isReadOnly() === true);
  ck('⑤ 新しい形のときは足しもしない', R.reconcile({ seeded: true, list: [{ id: 'q', name: 'Q', values: [] }] }) === false);
  ck('⑤ クラウドに無い（null）なら、この端末の控えは使わずまっさらから', R.applyRemote(null) === true && R.groups().length === 6 && !R.isReadOnly());
  // 端末の控えが壊れていたら使わない
  const b = boot({ ls: { wk_tagRegistry: '{"slots":[1]}' } }).R;
  ck('⑤ 端末の控えが壊れていたら使わない', b.groups().length === 6);
}

// ── ⑥ クラウドとのやりとり（firebase.js の本物）──
const FB_SRC = read('js/firebase.js');
const a = FB_SRC.indexOf('let _regReady = false;');
const bEnd = FB_SRC.indexOf('// テスト期間中の汚染データ消去用');
ck('⑥ firebase.js に一覧の読み書きがある', a > 0 && bEnd > a);
const fnSrc = FB_SRC.slice(a, bEnd).replace(/export async function/g, 'async function').replace(/^window\.saveTagRegistry.*$/m, '');

async function cloud({ settingsReady = true, docExists = false, docReg = null, getThrows = false, setThrows = false, templates = null, switchUserDuringGet = false } = {}) {
  const { win: w } = boot();
  w.getTagTemplatesRaw = () => templates;
  const log = { gets: 0, sets: [], toasts: [], snap: null };
  const env = {
    currentUser: { uid: 'U1' },
    _settingsReady: settingsReady,
    _sessionId: 'S',
    showToast: m => log.toasts.push(m),
    db: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({
      get: async () => {
        log.gets++;
        if (switchUserDuringGet) env.currentUser = { uid: 'U2' };
        if (getThrows) throw new Error('offline');
        return { exists: docExists, data: () => ({ reg: docReg }) };
      },
      set: async d => { if (setThrows) throw new Error('permission-denied'); log.sets.push(d); },
      onSnapshot: (cb) => { log.snap = cb; return () => { log.snap = null; }; },
    }) }) }) }) },
    window: w,
  };
  // currentUser は本物では firebase.js の変数で、途中で変わりうる。env を通して毎回読む
  const src = fnSrc.replace(/currentUser/g, '__env.currentUser');
  const names = Object.keys(env).filter(k => k !== 'currentUser');
  const make = new Function('__env', ...names, 'console', src + '\nreturn { loadTagRegistry, saveTagRegistry, st: () => ({ _regReady, _regWriteBlocked }) };');
  const api2 = make(env, ...names.map(k => env[k]), { error() {}, warn() {}, log() {} });
  await api2.loadTagRegistry('U1');
  await new Promise(r => setTimeout(r, 0));
  return { log, api: api2, R: w.tagRegistry };
}

{
  let r = await cloud({ settingsReady: false });
  ck('⑥ 設定を読めていないときは、読まない・書かない', r.log.gets === 0 && r.log.sets.length === 0);
  r = await cloud({ getThrows: true });
  ck('⑥ クラウドを読めないときは書かない', r.log.sets.length === 0 && r.api.st()._regReady === false);
  r = await cloud({ docExists: false });
  ck('⑥ クラウドに無いと確定したら、1回だけ作って書く', r.log.sets.length === 1 && boot().R._valid(r.log.sets[0].reg), J(r.log.sets.length));
  ck('⑥ 書く中身に savedBy と updatedAt', r.log.sets[0]?.savedBy === 'S' && !!r.log.sets[0]?.updatedAt);
  const existing = boot().R.raw();
  existing.markSlot4 = true;   // マークをタグ4へ入れる整えは済んでいる
  existing.groups.push({ id: 'n1', store: 'map', name: '自作', opts: ['a'], search: true });
  r = await cloud({ docExists: true, docReg: existing });
  ck('⑥ クラウドにあって足すものが無ければ書かない', r.log.sets.length === 0);
  ck('⑥ クラウドの一覧を採る（この端末で作り直さない）', !!r.R.group('n1'));
  r = await cloud({ docExists: true, docReg: existing, templates: { seeded: true, list: [{ id: 'z', name: 'Z', values: ['1'] }] } });
  ck('⑥ 旧テンプレートを足したときだけ書く', r.log.sets.length === 1 && r.log.sets[0].reg.groups.some(g => g.id === 't_z') && r.log.sets[0].reg.groups.some(g => g.id === 'n1'));
  r = await cloud({ docExists: true, docReg: { slots: [1, 2], groups: [] } });
  ck('⑥ クラウドの一覧が読めない形なら、上書きしない', r.log.sets.length === 0 && r.api.st()._regReady === false);
  r = await cloud({ docExists: true, docReg: { ...existing, v: 2 } });
  ck('⑥ 自分より新しい形のクラウドは上書きしない', r.log.sets.length === 0);
  r = await cloud({ docExists: false, setThrows: true });
  const sets1 = r.log.toasts.length;
  const again = await r.api.saveTagRegistry();
  ck('⑥ 書けなかったら1回だけ知らせ、以後は書かない', sets1 === 1 && again === false && r.log.toasts.length === 1 && r.api.st()._regWriteBlocked === true);
  // ── 他の端末の変更を受け取る（段階3a）──
  {
    const base = boot().R.raw();
    const rr = await cloud({ docExists: true, docReg: base });
    const fire = (reg, extra) => rr.log.snap && rr.log.snap({ exists: true, metadata: { hasPendingWrites: !!(extra && extra.pending) }, data: () => Object.assign({ reg, updatedAt: '2999-01-01T00:00:00Z', savedBy: 'OTHER' }, extra || {}) });
    ck('⑥ 読み込みの後、クラウドの変更を見張る', typeof rr.log.snap === 'function');
    const other = JSON.parse(JSON.stringify(base)); other.slots[3] = null;
    fire(other, { savedBy: 'S' });
    ck('⑥ 自分が書いたものは受け取らない', rr.R.slots()[3] !== null);
    fire(other, { pending: true });
    ck('⑥ 送信中のものは受け取らない', rr.R.slots()[3] !== null);
    await rr.api.saveTagRegistry();
    fire(other, { updatedAt: '2000-01-01T00:00:00Z' });
    ck('⑥ この端末が最後に書いたより古いもの（書く前の中身の遅い通知）は受け取らない', rr.R.slots()[3] !== null);
    fire({ slots: [1] });
    ck('⑥ 壊れた形は受け取らない', rr.R.slots()[3] !== null);
    fire(other);
    ck('⑥ 他の端末の新しい変更は受け取る', rr.R.slots()[3] === null);
  }
  r = await cloud({ docExists: false, switchUserDuringGet: true });
  ck('⑥ 読んでいる間に別のユーザーに変わったら書かない', r.log.sets.length === 0);
}
ck('⑥ ユーザーが変わったら、準備と「書けない」印を戻す',
  /_newUid !== _prevUid\)\s*\{[^}]*_regReady = false;[^}]*_regWriteBlocked = false;/.test(FB_SRC));
ck('⑥ 読み込みは設定の後（旧テンプレートがクラウドから届いてから移す）',
  FB_SRC.indexOf('await loadUserSettings(user.uid);') < FB_SRC.indexOf('await loadTagRegistry(user.uid);'));
ck('⑥ settings doc には一覧を入れない（古いタブが丸ごと .set で消すため）',
  !/tagRegistry\s*:/.test(FB_SRC.slice(FB_SRC.indexOf('export async function saveUserSettings'), FB_SRC.indexOf('export async function saveCvStartup'))));

// ── ⑦ 一覧のコードは他のデータに書き込まない ──
{
  const code = REG_SRC.replace(/\/\/.*$/gm, '');
  const bad = ['saveUserData', 'debounceSave', 'saveTagSettings', 'saveUserSettings', "'wk_tagSettings'", "'wk_tagTemplates'", 'removeItem', 'tagTemplateDelete', 'applyRemoteTagTemplates'].filter(w => code.includes(w));
  ck('⑦ tag-registry.js は動画・tagSettings・テンプレートを書かない', bad.length === 0, bad.join(', '));
  const sets = [...code.matchAll(/localStorage\.setItem\(([^,]+),/g)].map(m => m[1].trim());
  ck('⑦ localStorage に書くのは自分の控え（wk_tagRegistry）だけ', sets.every(k => k === 'LS_KEY'), sets.join(', '));
  // 例外は1つだけ: マーク・習得を v.tg へ写す migrateMarkStatus（足すだけ。⑩で中身を確かめる）
  const noMig = code.replace(/function migrateMarkStatus[\s\S]*?\n  \}\n/, '');
  ck('⑦ 動画の値を書き換える代入が無い（migrateMarkStatus を除く）', noMig !== code && !/\bv\s*\.\s*\w+\s*=[^=]|\bv\[[^\]]+\]\s*=[^=]/.test(noMig));
  const mig = code.slice(code.indexOf('function migrateMarkStatus'), code.indexOf('function migrateMarkStatus') + (code.length - noMig.length));
  const migSets = [...mig.matchAll(/\bv(?:\.\w+)+\s*=[^=]/g)].map(m => m[0].replace(/\s*=.*/, ''));
  ck('⑦ migrateMarkStatus が書くのは v.tg / v.tg.mark / v.tg.status だけ', migSets.length > 0 && migSets.every(x => ['v.tg', 'v.tg.mark', 'v.tg.status'].includes(x)), migSets.join(', '));
}

// ── ⑧ バックアップ ──
{
  const html = read('index.html');
  const exp = html.slice(html.indexOf('async function _wazaCollectLightData'), html.indexOf('async function wazaExportLight'));
  ck('⑧ 書き出しにテンプレートが入る', /tagTemplates\s*:\s*window\.getTagTemplatesRaw/.test(exp));
  ck('⑧ 書き出しに一覧が入る', /tagRegistry\s*:\s*window\.tagRegistry\?\.raw/.test(exp));
  const imp = html.slice(html.indexOf('window.wazaImport = async function'));
  ck('⑧ 復元で一覧が戻る（形が合うときだけ・無い古いバックアップでは今のまま）', /if \(data\.tagRegistry && window\.tagRegistry\?\.applyRemote\(data\.tagRegistry\)\)/.test(imp));
  ck('⑧ 復元でテンプレートが戻る（applyRemoteSettings が data.tagTemplates を読む）', /data\.tagTemplates/.test(read('js/settings.js')) && /window\.applyRemoteSettings\?\.\(data\)/.test(imp));
  ck('⑧ 一覧の script が読み込まれている（テンプレートの後）', html.indexOf('js/tag-templates.js') > 0 && html.indexOf('js/tag-templates.js') < html.indexOf('js/tag-registry.js'));
}

// ── ⑨ 編集（段階3a）──
{
  const { win, R, store } = boot();
  { const r0 = R.raw(); r0.markSlot4 = true; R.applyRemote(r0); }   // マークをタグ4へ入れる整えは済んでいる（この節は テクニック＝タグ4 の並びで見る）
  let saves = 0, events = 0;
  win.saveTagRegistry = () => { saves++; };
  win.CustomEvent = function (n) { this.type = n; };
  win.dispatchEvent = e => { if (e.type === 'wk-tagreg') events++; };
  R.reconcile({ seeded: true, list: [{ id: 'm', name: 'M', values: ['a'] }] });
  const ids = () => R.slotInfo().map(x => x && x.id);
  ck('⑨ 未使用のグループを空いていない枠へ → 元いたグループは未使用へ', R.setSlot('t_m', 1) && J(ids()) === J(['f_tb', 't_m', 'f_pos', 'f_tags']) && R.group('f_cat').slot === -1);
  ck('⑨ 枠どうしは入れ替え', R.setSlot('f_tags', 0) && J(ids()) === J(['f_tags', 't_m', 'f_pos', 'f_tb']));
  ck('⑨ 未使用にする → 枠は空く', R.setSlot('t_m', -1) && J(ids()) === J(['f_tags', null, 'f_pos', 'f_tb']));
  ck('⑨ 変えるたびに保存と画面への知らせ', saves === 3 && events === 3, `${saves}/${events}`);
  ck('⑨ 端末の控えにも書く', JSON.parse(store.wk_tagRegistry).slots[1] === null);
  ck('⑨ 検索の対象を切り替える', R.setSearch('f_pos', false) && !R.searchIds().includes('f_pos') && R.setSearch('f_pos', true));
  ck('⑨ 今の4つの名前・選択肢はここでは変えない（tagSettings が正）', !R.setName('f_tb', 'X') && !R.addOption('f_tb', 'X'));
  ck('⑨ マーク・習得の選択肢も足す・外すができる（v52.876 から普通のタググループ）', R.addOption('mark', 'X') && R.group('mark').options.includes('X') && R.removeOption('mark', 'X') && R.removeOption('status', '理解') && !R.group('status').options.includes('理解'));
  ck('⑨ マーク・習得の名前は変えられる（空にはしない）', R.setName('mark', '印') && R.group('mark').name === '印' && !R.setName('mark', '  '));
  ck('⑨ 新しいグループの選択肢を足す・外す（重複・空は足さない）', R.addOption('t_m', 'b') && !R.addOption('t_m', 'b') && !R.addOption('t_m', ' ') && R.removeOption('t_m', 'a') && J(R.group('t_m').options) === J(['b']));
  const nid = R.createGroup('練習', 1);
  ck('⑨ 新しく作る → その枠に入る（空いていた枠）', !!nid && ids()[1] === nid && R.group(nid).name === '練習' && R.group(nid).store === 'map');
  ck('⑨ 名前が空なら既定の名前', R.group(R.createGroup('  ')).name === '新しいタググループ');
  const fut = R.raw(); fut.v = 99; R.applyRemote(fut);
  ck('⑨ 自分より新しい形の一覧は編集しない', !R.setSlot('f_tb', 1) && !R.setSearch('f_tb', false) && R.createGroup('x') === null);
  const code = REG_SRC.replace(/\/\/.*$/gm, '');
  const code2 = code.replace(/function migrateMarkStatus[\s\S]*?\n  \}\n/, '');
  ck('⑨ 編集は動画に触らない（v. への代入・wkSetTagValue が無い。migrateMarkStatus を除く）', !/\bv\s*\.\s*\w+\s*=[^=]/.test(code2) && !/wkSetTagValue/.test(code));
}

// ── ⑩ マーク・習得を普通のタググループにする（v52.876）──
{
  // 前の版の一覧（store:'mark'/'status'・def あり・名前を変えて枠に入れていた）
  const old = { v: 1, slots: ['f_tb', 'mark', 'f_pos', 'f_tags'], migratedTemplates: [], groups: [
    { id: 'f_tb', store: 'tb', search: true, def: 'tb' }, { id: 'f_cat', store: 'cat', search: true },
    { id: 'f_pos', store: 'pos', search: true, def: 'pos' }, { id: 'f_tags', store: 'tags', search: true },
    { id: 'mark', store: 'mark', search: false, def: 'mark', name: '印' }, { id: 'status', store: 'status', search: true, def: 'status' } ] };
  const { win, R, store } = boot({ ls: { wk_tagRegistry: JSON.stringify(old) } });
  // 本物は js/config.js の normStatus（旧表記 把握→理解・習得中→練習中）
  win.normStatus = x => (x === '把握' ? '理解' : x === '習得中' ? '練習中' : (x || '未着手'));
  const m = R.group('mark'), st = R.group('status');
  ck('⑩ 前の版の一覧を読むと、マーク・習得は store:map になる（ID はそのまま）', m.store === 'map' && st.store === 'map');
  ck('⑩ 付けた名前・枠・検索の対象はそのまま', m.name === '印' && m.slot === 1 && m.search === false && st.search === true, J([m.name, m.slot, m.search, st.search]));
  ck('⑩ 選択肢は今までの値（お気に入り/Next/ドリル・理解/練習中/マスター）', J(m.options) === J(['お気に入り', 'Next', 'ドリル']) && J(st.options) === J(['理解', '練習中', 'マスター']));
  ck('⑩ 端末の控えも直した形になる', JSON.parse(store.wk_tagRegistry).groups.every(g => g.store !== 'mark' && g.store !== 'status'));
  ck('⑩ 他の端末から前の版の形が届いても、普通のグループとして受け取る', R.applyRemote({ ...old, slots: ['f_tb', 'f_cat', 'status', 'f_tags'] }) && R.group('status').store === 'map' && R.group('status').slot === 2);

  const vids = [
    { id: 'a', fav: true, next: true, drill: false, status: '練習中' },
    { id: 'b', status: '把握' },                                  // 旧表記 → 理解
    { id: 'c', status: '未着手', fav: false },                    // 写すものが無い
    { id: 'd' },                                                  // 何も無い
    { id: 'e', fav: true, tg: { mark: [] } },                     // 新しい画面で外した後（空の配列がある）
    { id: 'f', status: 'マスター', tg: { t_x: ['A'] } },          // ほかのグループの値はそのまま
    { id: 'g', fav: true, tg: 'broken' },                         // 形の違う tg には触らない
  ];
  const before = JSON.parse(J(vids));
  const n = R.migrateMarkStatus(vids);
  const by = id => vids.find(v => v.id === id);
  ck('⑩ 写した本数を返す（a・b・f の3本）', n === 3, n);
  ck('⑩ ★/Next → マークのタグ、習得 → 習得のタグ', J(by('a').tg) === J({ mark: ['お気に入り', 'Next'], status: ['練習中'] }), J(by('a').tg));
  ck('⑩ 習得の旧表記は今の表記で写す', J(by('b').tg) === J({ status: ['理解'] }));
  ck('⑩ 未着手・何も無い動画には何も書かない（tg を作らない）', !('tg' in by('c')) && !('tg' in by('d')));
  ck('⑩ 一度タグの置き場所がある動画には二度と写さない（外したタグが元の欄から復活しない）', J(by('e').tg) === J({ mark: [] }));
  ck('⑩ ほかのグループの値は変えない', J(by('f').tg) === J({ t_x: ['A'], status: ['マスター'] }));
  ck('⑩ 形の違う tg には触らない', by('g').tg === 'broken');
  ck('⑩ 元の欄（fav/next/drill/status）は消さない・書き換えない', vids.every((v, i) => ['fav', 'next', 'drill', 'status'].every(k => J(v[k]) === J(before[i][k]))));
  ck('⑩ もう一度呼んでも何も変えない（0本）', R.migrateMarkStatus(vids) === 0);
  ck('⑩ 写した値は valuesOf で読める', J(R.valuesOf(by('a'), 'mark')) === J(['お気に入り', 'Next']) && J(R.valuesOf(by('b'), 'status')) === J(['理解']));
}

// ── ⑪ マークをタグ4に入れる（オーナー決定 2026-09-28・1回だけ）──
{
  const { R } = boot();
  ck('⑪ 初めての整え（reconcile）でマークがタグ4に入り、いたグループは未使用へ（保存が要る＝true）',
    R.reconcile(null) === true && J(R.slots().map(g => g && g.id)) === J(['f_tb', 'f_cat', 'f_pos', 'mark']) && R.group('f_tags').slot === -1);
  ck('⑪ 済んだ印が一覧に残る（クラウド・端末の控えに乗る）', R.raw().markSlot4 === true);
  ck('⑪ 二度目は何もしない', R.reconcile(null) === false);
  R.setSlot('f_tags', 3);
  ck('⑪ 自分でマークを外した後は、入れ直さない', R.reconcile(null) === false && R.group('mark').slot === -1 && R.group('f_tags').slot === 3);
  const b = boot().R; b.setSlot('mark', 1);
  ck('⑪ すでに枠にマークがあれば枠は触らない（印だけ付ける）', b.reconcile(null) === true && J(b.slots().map(g => g && g.id)) === J(['f_tb', 'mark', 'f_pos', 'f_tags']) && b.raw().markSlot4 === true);
  const c = boot().R; const r0 = c.raw(); r0.markSlot4 = true; c.applyRemote(r0);
  ck('⑪ 他の端末で済んでいれば（印あり）枠は触らない', c.reconcile(null) === false && c.group('mark').slot === -1);
  const code = REG_SRC.slice(REG_SRC.indexOf('if (!r.markSlot4)'), REG_SRC.indexOf('if (!r.markSlot4)') + 400);
  ck('⑪ 動画には触らない（一覧の枠だけ）', !/\bv\.|wkSetTagValue|videos/.test(code));
}

console.log(fail ? `\n✗ 問題 ${fail}件` : '\n✓ タググループの一覧: 問題なし');
process.exit(fail ? 1 : 0);
