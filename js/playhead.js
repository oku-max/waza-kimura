// ═══ WAZA KIMURA — 再生位置の記憶（続きから再生）═══
//
// 【データ設計と安全方針】
// 既存の同期対象（videos.json / settings / カスタムビュー / ノート）には一切書かない。
// 専用ドキュメント users/<uid>/data/playback を新設し、そこだけを読み書きする。
//
//   { enabled: bool, pos: { <動画ID>: { t: 秒, at: ISO } }, updatedAt, savedBy }
//
//  - 書き込みは常に { merge:true }。位置は pos.<動画ID> というキー単位のマージなので、
//    2台が同時に別の動画を見ていても互いの記録を消さない。同じ動画なら後勝ち＝
//    「最後に見た位置」になり、それが正しい意味になる。
//  - キーの削除はしない。見終わった動画は 0 を書くだけ（消さない）。
//  - 非空 → 空の全置換をしない。pos 全体を .set() で丸ごと書く経路を作らない。
//  - クラウドが読めなかった場合も、キー単位の追記なので既存データを壊せない。
//    その場合は端末内（localStorage）だけで動き、次回ログイン時にマージされる。
//  - localStorage は wk_playhead のみを使う。他のキーは読まない・消さない。

const DOC_NAME  = 'playback';
const LS_KEY    = 'wk_playhead';
const MIN_KEEP  = 15;      // これ未満の位置は「まだ見ていない」とみなし記録しない
const END_MARGIN = 20;     // 終わり際は記録しない（次に開いたときは最初から）
const CLOUD_MIN_INTERVAL = 60 * 1000;  // 再生中のクラウド書き込みは最大1分に1回
const LS_MIN_INTERVAL    = 5 * 1000;   // 端末内キャッシュは5秒に1回
const SAFE_ID = /^[A-Za-z0-9_-]{1,300}$/;   // Firestoreのマップキーとして安全なID

let _enabled  = true;      // 既定はON（設定で切り替え、端末横断で同期）
let _pos      = {};        // id -> { t, at }
let _dirty    = new Set(); // 未送信の変更があるID
let _uid      = null;
let _lastCloudWrite = 0;
let _lastLsWrite    = 0;
const _sid = Math.random().toString(36).slice(2);

// ── 端末内キャッシュ（ログイン前・オフラインでも続きから再生できるように）──
function _lsLoad() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return;
    if (typeof raw.enabled === 'boolean') _enabled = raw.enabled;
    if (raw.pos && typeof raw.pos === 'object') _pos = raw.pos;
  } catch(e) {}
}
function _lsSave(force) {
  const now = Date.now();
  if (!force && now - _lastLsWrite < LS_MIN_INTERVAL) return;
  _lastLsWrite = now;
  try { localStorage.setItem(LS_KEY, JSON.stringify({ enabled: _enabled, pos: _pos })); } catch(e) {}
}
_lsLoad();

const _docRef = (uid) => window.firebase.firestore()
  .collection('users').doc(uid).collection('data').doc(DOC_NAME);

// ── クラウドから読み込み、端末内の記録と突き合わせる ──
// どちらかを消すことはしない。同じ動画は at（最終視聴時刻）が新しい方を採る。
async function _loadCloud(uid) {
  try {
    const snap = await _docRef(uid).get();
    if (snap.exists) {
      const d = snap.data() || {};
      if (typeof d.enabled === 'boolean') _enabled = d.enabled;
      const cloud = (d.pos && typeof d.pos === 'object') ? d.pos : {};
      for (const [id, e] of Object.entries(cloud)) {
        const t  = Number(e?.t) || 0;
        const at = String(e?.at || '');
        const mine = _pos[id];
        if (!mine || at > String(mine.at || '')) _pos[id] = { t, at };
      }
      _lsSave(true);
    }
    _syncToggleUI();
    console.log('[playhead] 読込完了:', Object.keys(_pos).length, '本ぶんの再生位置 / 続きから再生:', _enabled ? 'ON' : 'OFF');
  } catch(e) {
    // 読めなくても端末内の記録だけで動く。書き込みはキー単位のマージなので事故は起きない。
    console.warn('[playhead] クラウド読込に失敗（端末内の記録だけで動きます）:', e?.message || e);
  }
}

// ── 変更ぶんだけをクラウドへ（キー単位のマージ書き込み）──
export async function phFlush(force) {
  if (!_dirty.size) return;                    // 変化なし＝何も書かない
  _lsSave(!!force);                            // 端末内は先に確定（未ログインでもここまでは効く）
  if (!_uid || !window.firebase?.firestore) return;
  if (!force && Date.now() - _lastCloudWrite < CLOUD_MIN_INTERVAL) return;

  const payload = {};
  const sending = [];
  for (const id of _dirty) {
    if (!SAFE_ID.test(id)) {
      // 想定外のID形式。クラウドには送らず端末内だけに残す（黙って消さない）
      console.warn('[playhead] 同期できないID形式のため端末内のみ保存:', id);
      continue;
    }
    const e = _pos[id];
    if (!e) continue;
    payload[id] = { t: e.t, at: e.at };
    sending.push(id);
  }
  _dirty.clear();
  if (!sending.length) return;

  _lastCloudWrite = Date.now();
  try {
    await _docRef(_uid).set(
      { pos: payload, updatedAt: new Date().toISOString(), savedBy: _sid },
      { merge: true }   // ← 他の動画・他端末の記録には触れない
    );
  } catch(e) {
    console.warn('[playhead] 保存に失敗（次回まとめて再送します）:', e?.message || e);
    for (const id of sending) _dirty.add(id);   // 取りこぼさないよう戻す
  }
}

// ── 再生位置を記録する（再生中に呼ばれる。ここでは端末内まで）──
export function phRecord(id, sec, durationSec) {
  if (!_enabled || !id) return;
  const t   = Math.floor(Number(sec) || 0);
  const dur = Math.floor(Number(durationSec) || 0);
  // 冒頭すぎる／終わり際は「続き」として意味がないので 0（＝次回は最初から）にする
  const keep = (t >= MIN_KEEP && (dur <= 0 || t <= dur - END_MARGIN)) ? t : 0;
  const cur  = _pos[id];
  if (cur && cur.t === keep) return;            // 変化なし＝書かない
  if (!cur && keep === 0) return;               // 記録するほどのものがない
  _pos[id] = { t: keep, at: new Date().toISOString() };
  _dirty.add(id);
  _lsSave();
}

// ── 続きから再生する位置（秒）。0 なら最初から ──
export function phGetResume(id) {
  if (!_enabled || !id) return 0;
  const t = Number(_pos[id]?.t) || 0;
  return t >= MIN_KEEP ? t : 0;
}

// ── 見終わった: 次回は最初から（キーは消さずに 0 を書く）──
export function phClear(id) {
  if (!id || !_pos[id] || _pos[id].t === 0) return;
  _pos[id] = { t: 0, at: new Date().toISOString() };
  _dirty.add(id);
  _lsSave(true);
  phFlush(true);
}

// ── 設定のオン/オフ（端末横断）──
export function phIsEnabled() { return _enabled; }

export async function phSetEnabled(on) {
  _enabled = !!on;
  _lsSave(true);
  _syncToggleUI();
  window.toast?.(_enabled ? '続きから再生をオンにしました' : '続きから再生をオフにしました');
  if (!_uid || !window.firebase?.firestore) return;
  try {
    await _docRef(_uid).set(
      { enabled: _enabled, updatedAt: new Date().toISOString(), savedBy: _sid },
      { merge: true }   // ← 記録済みの位置(pos)には触れない
    );
  } catch(e) {
    console.warn('[playhead] 設定の保存に失敗:', e?.message || e);
    window.toast?.('⚠️ 設定を他の端末に同期できませんでした');
  }
}

function _syncToggleUI() {
  const el = document.getElementById('setting-resume');
  if (el) el.checked = _enabled;
}

// ── 起動 ──
export function initPlayhead() {
  _syncToggleUI();
  const bind = () => {
    const auth = window.firebase?.auth?.();
    if (!auth) { setTimeout(bind, 400); return; }
    // 既存の onAuthStateChanged には手を入れず、独立したリスナーとして購読する
    auth.onAuthStateChanged(u => {
      _uid = u?.uid || null;
      if (_uid) _loadCloud(_uid);
    });
  };
  bind();

  // 画面を閉じる/バックグラウンドに回る直前に取りこぼしを送る
  window.addEventListener('pagehide', () => { phFlush(true); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') phFlush(true);
  });
}

// ── 状態を目で見るための helper（コンソールで wkPlayhead() ）──
// 「効いていない」と「そもそも記録が無い」を切り分けるために用意する。
window.wkPlayhead = function() {
  const ids = Object.keys(_pos);
  const recent = ids.map(id => ({ 動画ID: id, 位置秒: _pos[id]?.t, 記録時刻: _pos[id]?.at }))
                    .sort((a, b) => String(b.記録時刻).localeCompare(String(a.記録時刻)))
                    .slice(0, 15);
  console.log('続きから再生:', _enabled ? 'ON' : 'OFF',
              '/ ログイン:', _uid ? '済' : '未',
              '/ 記録件数:', ids.length, '/ 未送信:', _dirty.size);
  console.table(recent);
  return { enabled: _enabled, uid: _uid, count: ids.length, dirty: _dirty.size, recent };
};

window.phRecord     = phRecord;
window.phGetResume  = phGetResume;
window.phClear      = phClear;
window.phFlush      = phFlush;
window.phIsEnabled  = phIsEnabled;
window.phSetEnabled = phSetEnabled;
