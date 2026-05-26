// WAZA KIMURA — dev server with alias API
// Static file serving + POST/GET endpoints for tag-master.js alias management

const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const ROOT       = path.resolve(__dirname);
const TAG_MASTER = path.join(ROOT, 'js/tag-master.js');
const PORT       = process.env.PORT || 5710;

const MIME = {
  html: 'text/html', css: 'text/css', js: 'application/javascript',
  json: 'application/json', png: 'image/png', jpg: 'image/jpeg',
  svg: 'image/svg+xml', ico: 'image/x-icon', woff2: 'font/woff2',
};

// id → display name (must match tag-master.js)
const CAT_ID_TO_NAME = {
  escape:    'エスケープ・ディフェンス',
  entry:     'ガード構築・エントリー',
  retention: 'ガードリテンション',
  control:   'コントロール／プレッシャー',
  concept:   'コンセプト・原理',
  sweep:     'スイープ',
  takedown:  'テイクダウン',
  back:      'バックテイク・バックアタック',
  pass:      'パスガード',
  finish:    'フィニッシュ',
};
const CAT_IDS = Object.keys(CAT_ID_TO_NAME);

// ─── tag-master.js 操作 ──────────────────────────────────────

function findAliasRange(content, catId) {
  const idMarker = `id: '${catId}'`;
  const idIdx    = content.indexOf(idMarker);
  if (idIdx === -1) return null;
  const nextIdIdx  = content.indexOf("id: '", idIdx + idMarker.length);
  const aliasOpen  = content.indexOf('aliases: [', idIdx);
  if (aliasOpen === -1) return null;
  if (nextIdIdx > -1 && aliasOpen > nextIdIdx) return null;
  const start = aliasOpen + 'aliases: ['.length;
  const end   = content.indexOf(']', start);
  if (end === -1 || (nextIdIdx > -1 && end > nextIdIdx + 200)) return null;
  return { start, end };
}

function parseAliases(block) {
  const result = [];
  const re = /'([^'\\]*)'/g;
  let m;
  while ((m = re.exec(block)) !== null) result.push(m[1]);
  return result;
}

function formatAliases(aliases) {
  if (!aliases.length) return '\n    ';
  return '\n      ' + aliases.map(a => `'${a}'`).join(',\n      ') + ',\n    ';
}

function aliasAdd(catId, alias) {
  const content = fs.readFileSync(TAG_MASTER, 'utf8');
  const range   = findAliasRange(content, catId);
  if (!range) return { ok: false, error: `category '${catId}' not found` };
  const block   = content.substring(range.start, range.end);
  const current = parseAliases(block);
  if (current.includes(alias)) return { ok: true, already: true };
  current.push(alias);
  const next = content.substring(0, range.start) + formatAliases(current) + content.substring(range.end);
  fs.writeFileSync(TAG_MASTER, next, 'utf8');
  return { ok: true, added: true };
}

function aliasRemove(catId, alias) {
  const content  = fs.readFileSync(TAG_MASTER, 'utf8');
  const range    = findAliasRange(content, catId);
  if (!range) return { ok: false, error: `category '${catId}' not found` };
  const block    = content.substring(range.start, range.end);
  const current  = parseAliases(block);
  const filtered = current.filter(a => a !== alias);
  if (filtered.length === current.length) return { ok: true, notfound: true };
  const next = content.substring(0, range.start) + formatAliases(filtered) + content.substring(range.end);
  fs.writeFileSync(TAG_MASTER, next, 'utf8');
  return { ok: true, removed: true };
}

function aliasList() {
  const content = fs.readFileSync(TAG_MASTER, 'utf8');
  return CAT_IDS.map(catId => {
    const range   = findAliasRange(content, catId);
    const aliases = range ? parseAliases(content.substring(range.start, range.end)) : [];
    return { id: catId, name: CAT_ID_TO_NAME[catId], aliases };
  });
}

// ─── REVERSAL_TRIGGERS 操作 ──────────────────────────────────

function findReversalRange(content) {
  const marker = 'const REVERSAL_TRIGGERS = [';
  const start  = content.indexOf(marker);
  if (start === -1) return null;
  const arrStart = start + marker.length;
  const arrEnd   = content.indexOf('];', arrStart);
  if (arrEnd === -1) return null;
  return { start: arrStart, end: arrEnd };
}

function parseReversalTriggers(block) {
  const result = [];
  const re = /'([^'\\]*)'/g;
  let m;
  while ((m = re.exec(block)) !== null) result.push(m[1]);
  return result;
}

function formatReversalTriggers(triggers) {
  if (!triggers.length) return '\n';
  return '\n  ' + triggers.map(t => `'${t}'`).join(',') + ',\n';
}

function reversalList() {
  const content = fs.readFileSync(TAG_MASTER, 'utf8');
  const range   = findReversalRange(content);
  return range ? parseReversalTriggers(content.substring(range.start, range.end)) : [];
}

function reversalAdd(trigger) {
  const content  = fs.readFileSync(TAG_MASTER, 'utf8');
  const range    = findReversalRange(content);
  if (!range) return { ok: false, error: 'REVERSAL_TRIGGERS not found' };
  const current  = parseReversalTriggers(content.substring(range.start, range.end));
  if (current.includes(trigger)) return { ok: true, already: true };
  current.push(trigger);
  const next = content.substring(0, range.start) + formatReversalTriggers(current) + content.substring(range.end);
  fs.writeFileSync(TAG_MASTER, next, 'utf8');
  return { ok: true, added: true };
}

function reversalRemove(trigger) {
  const content  = fs.readFileSync(TAG_MASTER, 'utf8');
  const range    = findReversalRange(content);
  if (!range) return { ok: false, error: 'REVERSAL_TRIGGERS not found' };
  const current  = parseReversalTriggers(content.substring(range.start, range.end));
  const filtered = current.filter(t => t !== trigger);
  if (filtered.length === current.length) return { ok: true, notfound: true };
  const next = content.substring(0, range.start) + formatReversalTriggers(filtered) + content.substring(range.end);
  fs.writeFileSync(TAG_MASTER, next, 'utf8');
  return { ok: true, removed: true };
}

// ─── HTTP server ─────────────────────────────────────────────

function readBody(req) {
  return new Promise(resolve => {
    let buf = '';
    req.on('data', c => buf += c);
    req.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({}); } });
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // GET /api/aliases → 全カテゴリの現在のaliasリスト
  if (pathname === '/api/aliases' && req.method === 'GET') {
    return json(res, aliasList());
  }

  // POST /api/alias/add { catId, alias }
  if (pathname === '/api/alias/add' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.catId || !body.alias) return json(res, { ok: false, error: 'catId and alias required' }, 400);
    return json(res, aliasAdd(body.catId, body.alias));
  }

  // POST /api/alias/remove { catId, alias }
  if (pathname === '/api/alias/remove' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.catId || !body.alias) return json(res, { ok: false, error: 'catId and alias required' }, 400);
    return json(res, aliasRemove(body.catId, body.alias));
  }

  // GET /api/reversal-triggers → 現在のトリガーリスト
  if (pathname === '/api/reversal-triggers' && req.method === 'GET') {
    return json(res, reversalList());
  }

  // POST /api/reversal-trigger/add { trigger }
  if (pathname === '/api/reversal-trigger/add' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.trigger) return json(res, { ok: false, error: 'trigger required' }, 400);
    return json(res, reversalAdd(body.trigger));
  }

  // POST /api/reversal-trigger/remove { trigger }
  if (pathname === '/api/reversal-trigger/remove' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.trigger) return json(res, { ok: false, error: 'trigger required' }, 400);
    return json(res, reversalRemove(body.trigger));
  }

  // Static files
  const filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  try {
    const ext = path.extname(filePath).slice(1);
    res.setHeader('Content-Type', MIME[ext] || 'text/plain');
    res.end(fs.readFileSync(filePath));
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, () => console.log(`WAZA dev server on :${PORT}`));
