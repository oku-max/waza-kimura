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
  const un = R.groups().filter(g => g.slot < 0).map(g => g.store);
  ck('① マーク・習得は未使用に入っている', J(un) === J(['mark', 'status']), J(un));
  ck('① 検索の対象: 今の4つは対象・マークと習得は対象外', R.groups().every(g => g.search === !['mark', 'status'].includes(g.store)));
  ck('① 作った一覧を端末の控えに書く', !!store.wk_tagRegistry && R._valid(JSON.parse(store.wk_tagRegistry)));
  ck('① 初期値のある印: トップ/ボトム・ポジション・マーク・習得', J(R.groups().filter(g => g.def).map(g => g.def)) === J(['tb', 'pos', 'mark', 'status']));
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
  ck('② マークの選択肢は ★・Next・ドリル（値は動画の項目名）', J(R.group('mark').options) === J(['fav', 'next', 'drill']) && R.optionLabel(R._fresh().groups[4], 'fav') === '⭐ お気に入り');
  ck('② 習得の選択肢は STATUS_CANON', J(R.group('status').options) === J(['未着手', '理解', '練習中', 'マスター']));
}

// ── ③ 旧テンプレート ──
{
  const { R } = boot();
  ck('③ 編集したことが無い（null）なら何も足さない', R.reconcile(null) === false && R.groups().length === 6);
  const raw = { seeded: true, list: [
    { id: 'pos', name: 'ポジション', values: ['クローズドガード', 'ハーフガード', 'ハーフガード', ''] },
    { id: 'u_abc', name: '練習メニュー', values: ['ドリル', 'スパー'] },
  ] };
  ck('③ 編集した旧テンプレートを足すと true（保存が要る）', R.reconcile(raw) === true);
  const t = R.groups().filter(g => g.store === 'map');
  ck('③ 旧テンプレートが未使用のタググループになる（名前に「（旧テンプレート）」）', J(t.map(g => [g.name, g.slot])) === J([['ポジション（旧テンプレート）', -1], ['練習メニュー（旧テンプレート）', -1]]), J(t.map(g => [g.name, g.slot])));
  ck('③ 選択肢は重複・空を除いて写す', J(R.group('t_pos').options) === J(['クローズドガード', 'ハーフガード']));
  ck('③ もう一度呼んでも二度は足さない（false）', R.reconcile(raw) === false && R.groups().length === 8);
  ck('③ テンプレートが後で消えても、移したグループは残る', R.reconcile({ seeded: true, list: [] }) === false && R.groups().length === 8);
  ck('③ 新しいテンプレートだけを足す', R.reconcile({ seeded: true, list: [...raw.list, { id: 'u_new', name: '新', values: ['A'] }] }) === true && R.groups().length === 9);
  ck('③ 枠（タグ1〜4）は変えない', J(R.slots().map(g => g.id)) === J(['f_tb', 'f_cat', 'f_pos', 'f_tags']));
  const en = boot({ lang: 'en' }).R; en.reconcile({ seeded: true, list: [{ id: 'x', name: 'Menu', values: [] }] });
  ck('③ 英語表示の人は「(old template)」', en.group('t_x').name === 'Menu (old template)');
}

// ── ④ 動画の値は今の場所から読むだけ ──
{
  const { R } = boot();
  R.reconcile({ seeded: true, list: [{ id: 'm', name: 'M', values: ['A'] }] });
  const v = { tb: ['トップ'], cat: [], pos: ['ハーフガード'], tags: ['キムラ'], fav: true, next: false, drill: true, status: '練習中', tg: { t_m: ['A'] } };
  const before = J(v);
  ck('④ タグ1〜4 の値', J(R.valuesOf(v, 'f_tb')) === J(['トップ']) && J(R.valuesOf(v, 'f_tags')) === J(['キムラ']));
  ck('④ マーク = fav/drill（true のものだけ）', J(R.valuesOf(v, 'mark')) === J(['fav', 'drill']));
  ck('④ 習得 = 1つ', J(R.valuesOf(v, 'status')) === J(['練習中']) && J(R.valuesOf({}, 'status')) === '[]');
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
  const log = { gets: 0, sets: [], toasts: [] };
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
  ck('⑦ 動画の値を書き換える代入が無い', !/\bv\s*\.\s*\w+\s*=[^=]|\bv\[[^\]]+\]\s*=[^=]/.test(code));
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

console.log(fail ? `\n✗ 問題 ${fail}件` : '\n✓ タググループの一覧: 問題なし');
process.exit(fail ? 1 : 0);
