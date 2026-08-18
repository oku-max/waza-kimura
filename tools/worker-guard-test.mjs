// _worker.js の認証・回数制限を実際に動かして確かめる。
//
// なぜ必要か: guard を各ハンドラに差し込む変更は、書き間違えると
//   (a) 既存ユーザーの機能が突然401で止まる
//   (b) 逆にオーナー限定が外れて誰でも高いAPIを叩ける
// のどちらかを静かに起こす。node --check では両方とも検出できない。
//
// 使い方: node tools/worker-guard-test.mjs
// 終了コード: 0 = 全て期待どおり / 1 = 失敗あり
//
// 外部への fetch は全部モックする（本物のAPIは一切叩かない・課金も発生しない）。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp  = path.join(ROOT, 'tools', '_worker.copy.mjs');   // ESMとして読むための一時コピー
fs.writeFileSync(tmp, fs.readFileSync(path.join(ROOT, '_worker.js')));
const worker = (await import(tmp + '?v=' + Math.random())).default;

// ── モック ──────────────────────────────────────────────
const VALID = 'VALID_TOKEN', OWNER = 'OWNER_TOKEN';
let upstreamCalls = [];
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  upstreamCalls.push(u);
  if (u.includes('identitytoolkit')) {
    const { idToken } = JSON.parse(opts.body);
    if (idToken === VALID) return new Response(JSON.stringify({ users: [{ localId: 'uid-user', email: 'user@example.com' }] }), { status: 200 });
    if (idToken === OWNER) return new Response(JSON.stringify({ users: [{ localId: 'uid-owner', email: 'okujournal@gmail.com' }] }), { status: 200 });
    return new Response(JSON.stringify({ error: { message: 'INVALID_ID_TOKEN' } }), { status: 400 });
  }
  if (u.includes('youtube/v3')) return new Response(JSON.stringify({ items: [] }), { status: 200 });
  if (u.includes('anthropic'))  return new Response(JSON.stringify({ content: [{ text: '{}' }] }), { status: 200 });
  return new Response('{}', { status: 200 });
};

// Cloudflare の Cache API のモック（本番は caches.default）
function makeCache() {
  const m = new Map();
  return { _m: m,
    async match(req) {
      const v = m.get(req.url);
      return v ? new Response(v.body, { status: v.status, headers: v.headers }) : undefined;
    },
    async put(req, res) {
      m.set(req.url, { body: await res.text(), status: res.status, headers: new Headers(res.headers) });
    } };
}
const useCache = (c) => { globalThis.caches = c ? { default: c } : undefined; };

function makeKV() {
  const m = new Map();
  return { _m: m, async get(k){ return m.has(k) ? m.get(k) : null; }, async put(k,v){ m.set(k,v); } };
}
const baseEnv = () => ({
  YOUTUBE_API_KEY: 'yt', ANTHROPIC_API_KEY: 'an', GEMINI_API_KEY: 'gm', ASSEMBLYAI_API_KEY: 'aa',
  FIREBASE_API_KEY: 'fb', ASSETS: { fetch: async () => new Response('static', { status: 200 }) },
});

const call = (env, url, { token, method = 'GET', body } = {}) => {
  const h = {};
  if (token) h['Authorization'] = 'Bearer ' + token;
  if (body)  h['Content-Type']  = 'application/json';
  return worker.fetch(new Request('https://x.dev' + url, {
    method, headers: h, body: body ? JSON.stringify(body) : undefined,
  }), env);
};

// ── テスト ──────────────────────────────────────────────
let pass = 0, fail = 0;
const warns = [];
const origWarn = console.warn; console.warn = (...a) => warns.push(a.join(' '));
async function t(name, fn) {
  try { await fn(); origWarn(`  ✅ ${name}`); pass++; }
  catch (e) { origWarn(`  ❌ ${name}\n     ${e.message}`); fail++; }
}
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: 期待 ${b} / 実際 ${a}`); };

origWarn('\n【第1段階】REQUIRE_AUTH 未設定 — 既存の動作を壊さないこと');
await t('未認証の yt-search は今までどおり通る', async () => {
  eq((await call(baseEnv(), '/api/yt-search?q=armbar')).status, 200, 'status');
});
await t('未認証の ai-tag も通る', async () => {
  const r = await call(baseEnv(), '/api/ai-tag', { method: 'POST', body: { title: 'x' } });
  if (r.status === 401 || r.status === 403) throw new Error('拒否された: ' + r.status);
});
await t('通過時は警告ログが残る（後で REQUIRE_AUTH に上げる判断材料）', async () => {
  warns.length = 0;
  await call(baseEnv(), '/api/yt-search?q=a');
  if (!warns.some(w => w.includes('[guard] 未認証'))) throw new Error('警告が出ていない');
});
await t('ai-summary は未認証だと今までどおり 403（オーナー限定が外れていない）', async () => {
  eq((await call(baseEnv(), '/api/ai-summary', { method: 'POST', body: { ytId: 'a' } })).status, 403, 'status');
});
await t('ai-summary は一般ユーザーでも 403', async () => {
  eq((await call(baseEnv(), '/api/ai-summary', { method: 'POST', body: { ytId: 'a' }, token: VALID })).status, 403, 'status');
});

origWarn('\n【第2段階】REQUIRE_AUTH=1 — 未認証を拒否');
const strict = () => ({ ...baseEnv(), REQUIRE_AUTH: '1' });
await t('未認証の yt-search は 401', async () => {
  eq((await call(strict(), '/api/yt-search?q=a')).status, 401, 'status');
});
await t('壊れたトークンも 401', async () => {
  eq((await call(strict(), '/api/yt-search?q=a', { token: 'GARBAGE' })).status, 401, 'status');
});
await t('正しいトークンなら通る', async () => {
  eq((await call(strict(), '/api/yt-search?q=a', { token: VALID })).status, 200, 'status');
});
await t('未認証の ai-tag / translate / asr-start も 401', async () => {
  for (const [p, b] of [['/api/ai-tag', { title: 'x' }], ['/api/translate', { items: [{ text: 'a', sec: 1 }] }], ['/api/asr-start', { fileId: 'f', token: 't' }]]) {
    eq((await call(strict(), p, { method: 'POST', body: b })).status, 401, p);
  }
});
await t('/api/asr-src は認証不要のまま（AssemblyAIが取りに来る経路）', async () => {
  const r = await call(strict(), '/api/asr-src?t=bogus');
  if (r.status === 401) throw new Error('401になった。外部から取得できなくなり文字起こしが壊れる');
});

origWarn('\n【回数制限】KV あり');
await t('YouTube検索は11回目で 429', async () => {
  const env = { ...baseEnv(), QUOTA_KV: makeKV(), REQUIRE_AUTH: '1' };
  for (let i = 1; i <= 10; i++) eq((await call(env, '/api/yt-search?q=a', { token: VALID })).status, 200, `${i}回目`);
  const r = await call(env, '/api/yt-search?q=a', { token: VALID });
  eq(r.status, 429, '11回目');
  const j = await r.json();
  if (!j.quota) throw new Error('quota フラグが無い');
});
await t('上限は環境変数で変えられる', async () => {
  const env = { ...baseEnv(), QUOTA_KV: makeKV(), REQUIRE_AUTH: '1', LIMIT_YT_SEARCH: '2' };
  await call(env, '/api/yt-search?q=a', { token: VALID });
  await call(env, '/api/yt-search?q=a', { token: VALID });
  eq((await call(env, '/api/yt-search?q=a', { token: VALID })).status, 429, '3回目');
});
await t('利用者ごとに独立して数える', async () => {
  const env = { ...baseEnv(), QUOTA_KV: makeKV(), REQUIRE_AUTH: '1', LIMIT_YT_SEARCH: '1' };
  eq((await call(env, '/api/yt-search?q=a', { token: VALID })).status, 200, 'user 1回目');
  eq((await call(env, '/api/yt-search?q=a', { token: VALID })).status, 429, 'user 2回目');
  eq((await call(env, '/api/yt-search?q=a', { token: OWNER })).status, 200, 'owner は別枠');
});
await t('アプリ全体のYouTube上限でも止まる（1人が使い切っても他が巻き込まれる前に）', async () => {
  const env = { ...baseEnv(), QUOTA_KV: makeKV(), REQUIRE_AUTH: '1', LIMIT_YT_SEARCH: '999', YT_GLOBAL_UNITS: '250' };
  eq((await call(env, '/api/yt-search?q=a', { token: VALID })).status, 200, '1回目 102単位');
  eq((await call(env, '/api/yt-search?q=a', { token: VALID })).status, 200, '2回目 204単位');
  const r = await call(env, '/api/yt-search?q=a', { token: VALID });   // 306 > 250
  eq(r.status, 429, '3回目');
  if (!(await r.json()).global) throw new Error('global フラグが無い');
});
await t('AI系は別バケットなので YouTube を使い切っても動く', async () => {
  const env = { ...baseEnv(), QUOTA_KV: makeKV(), REQUIRE_AUTH: '1', LIMIT_YT_SEARCH: '1' };
  await call(env, '/api/yt-search?q=a', { token: VALID });
  eq((await call(env, '/api/yt-search?q=a', { token: VALID })).status, 429, 'yt 使い切り');
  const r = await call(env, '/api/ai-tag', { method: 'POST', body: { title: 'x' }, token: VALID });
  if (r.status === 429) throw new Error('AIまで巻き添えで止まった');
});
await t('KVが落ちても機能は止まらない（fail-open）', async () => {
  const brokenKV = { async get(){ throw new Error('KV down'); }, async put(){ throw new Error('KV down'); } };
  const env = { ...baseEnv(), QUOTA_KV: brokenKV, REQUIRE_AUTH: '1' };
  eq((await call(env, '/api/yt-search?q=a', { token: VALID })).status, 200, 'status');
});

origWarn('\n【キャッシュ】YouTube検索の使い回し');
await t('同じ検索語の2回目はキャッシュから返る（YouTubeを叩かない）', async () => {
  const c = makeCache(); useCache(c);
  const env = { ...baseEnv(), REQUIRE_AUTH: '1' };
  await call(env, '/api/yt-search?q=armbar', { token: VALID });
  upstreamCalls = [];
  const r = await call(env, '/api/yt-search?q=armbar', { token: VALID });
  eq(r.status, 200, 'status');
  eq(r.headers.get('X-WK-Cache'), 'hit', 'キャッシュ印');
  const n = upstreamCalls.filter(u => u.includes('youtube/v3')).length;
  eq(n, 0, 'YouTubeへの呼び出し回数');
  useCache(null);
});
await t('キャッシュに当たると回数を消費しない', async () => {
  const c = makeCache(); useCache(c);
  const env = { ...baseEnv(), QUOTA_KV: makeKV(), REQUIRE_AUTH: '1', LIMIT_YT_SEARCH: '1' };
  eq((await call(env, '/api/yt-search?q=kimura', { token: VALID })).status, 200, '1回目');
  // 上限1回だが、同じ語ならキャッシュなので何度でも返る
  for (let i = 0; i < 5; i++) {
    eq((await call(env, '/api/yt-search?q=kimura', { token: VALID })).status, 200, `キャッシュ${i}`);
  }
  // 別の語は上限に当たる
  eq((await call(env, '/api/yt-search?q=guard', { token: VALID })).status, 429, '別の語');
  useCache(null);
});
await t('検索語が違えばキャッシュは共有されない', async () => {
  const c = makeCache(); useCache(c);
  const env = { ...baseEnv(), REQUIRE_AUTH: '1' };
  await call(env, '/api/yt-search?q=aaa', { token: VALID });
  const r = await call(env, '/api/yt-search?q=bbb', { token: VALID });
  if (r.headers.get('X-WK-Cache') === 'hit') throw new Error('別の語なのに当たった');
  useCache(null);
});
await t('未認証はキャッシュより先に弾かれる（REQUIRE_AUTH=1のとき）', async () => {
  const c = makeCache(); useCache(c);
  const env = { ...baseEnv(), REQUIRE_AUTH: '1' };
  await call(env, '/api/yt-search?q=ccc', { token: VALID });
  eq((await call(env, '/api/yt-search?q=ccc')).status, 401, 'status');
  useCache(null);
});
await t('caches が無い環境でも落ちない（ローカル実行）', async () => {
  useCache(null);
  eq((await call({ ...baseEnv(), REQUIRE_AUTH: '1' }, '/api/yt-search?q=zzz', { token: VALID })).status, 200, 'status');
});

origWarn('\n【回帰】既存の経路が壊れていないこと');
await t('静的ファイルはそのまま返る', async () => {
  eq((await call(baseEnv(), '/index.html')).status, 200, 'status');
});
await t('/.git は404のまま', async () => {
  eq((await call(baseEnv(), '/.git/config')).status, 404, 'status');
});
await t('未知のAPIは404のまま', async () => {
  eq((await call(baseEnv(), '/api/nope')).status, 404, 'status');
});
await t('rss-proxy は youtube.com 以外を拒否したまま', async () => {
  eq((await call(baseEnv(), '/api/rss-proxy?url=https://evil.com/x')).status, 403, 'status');
});
await t('thumb-proxy は google 以外を拒否したまま', async () => {
  eq((await call(baseEnv(), '/api/thumb-proxy?url=https://evil.com/x.jpg')).status, 403, 'status');
});
await t('トークン検証は使い回される（毎回 identitytoolkit を叩かない）', async () => {
  const env = { ...baseEnv(), REQUIRE_AUTH: '1' };
  upstreamCalls = [];
  for (let i = 0; i < 4; i++) await call(env, '/api/yt-search?q=a', { token: VALID });
  const n = upstreamCalls.filter(u => u.includes('identitytoolkit')).length;
  if (n > 1) throw new Error(`${n}回叩いている（キャッシュが効いていない）`);
});

console.warn = origWarn;
console.log(`\n合計: ${pass} 件成功 / ${fail} 件失敗`);
fs.unlinkSync(tmp);
process.exit(fail ? 1 : 0);
