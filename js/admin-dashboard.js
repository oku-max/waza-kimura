// ═══ WAZA KIMURA — AI管理ダッシュボード v52.480 ═══

// v52.832: 死んでいた5つ（修正履歴 / テンプレ:動作の種類 / テンプレ:ポジション /
// タグ全体図 / Aliasビルダー）を削除した。AIタグ付けとキーワード推定の廃止で
// 役目が終わっていたのに画面だけ残り、テンプレ2つは編集しても設定画面に上書きされる状態だった。
const ALL_SUBS = ['searchdict','feedback'];

// ── Admin sub-tab switching ──
export function switchAdminSub(sub) {
  ALL_SUBS.forEach(s => {
    const p = document.getElementById('admin-p-' + s);
    if (p) p.style.display = s === sub ? '' : 'none';
    const tab = document.querySelector(`.admin-stab[data-sub="${s}"]`);
    if (tab) {
      tab.style.color = s === sub ? 'var(--accent)' : 'var(--text3)';
      tab.style.borderBottomColor = s === sub ? 'var(--accent)' : 'transparent';
      tab.classList.toggle('active', s === sub);
    }
  });
  if (sub === 'feedback')     _renderFeedbackAdmin();
  if (sub === 'searchdict')   _renderSearchDict();
}
window.switchAdminSub = switchAdminSub;

// テンプレ画面（カテゴリ／ポジション）のための Firestore 双方向同期は v52.832 で廃止。
// その画面を消したので、localStorage の waza_tag_dict / waza_positions を
// 管理画面側から上書きする経路も止める（いまの正は設定の tagSettings.presets）。
// 保存済みのデータは消していない。読み書きしなくなっただけ。

// ── Main render (called from switchTab('admin')) ──
export async function renderAdminDashboard() {
  switchAdminSub('searchdict');   // 既定は検索辞書
}
window.renderAdminDashboard = renderAdminDashboard;


// ── フィードバック閲覧（オーナー専用） ──
const _OWNER_FB = 'okujournal@gmail.com';
const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const TYPE_LABEL = { howto:'使い方', bug:'バグ', request:'要望', other:'その他' };
const TYPE_COLOR = { howto:'var(--blue)', bug:'var(--red)', request:'var(--green)', other:'var(--text3)' };
const PAGE_LABEL = { card:'カード', table:'テーブル', filter:'フィルター', vpanel:'Vパネル', settings:'設定', library:'Library', search:'Search', notes:'Notes', other:'その他' };

async function _renderFeedbackAdmin(targetEl) {
  const el = targetEl || document.getElementById('admin-p-feedback');
  if (!el) return;

  const email = window._firebaseCurrentUser?.()?.email;
  if (email !== _OWNER_FB) {
    el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px;">🔒 オーナーのみ閲覧できます</div>';
    return;
  }

  el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px;">読み込み中...</div>';

  try {
    const snap = await firebase.firestore()
      .collection('feedback')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    if (snap.empty) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px;">フィードバックはまだありません</div>';
      return;
    }

    const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const rows = items.map((d, idx) => {
      const date = (() => {
        if (!d.createdAt) return '—';
        const jst = new Date(new Date(d.createdAt).getTime() + 9 * 60 * 60 * 1000);
        return String(jst.getUTCMonth()+1).padStart(2,'0') + '-' + String(jst.getUTCDate()).padStart(2,'0') + ' ' + String(jst.getUTCHours()).padStart(2,'0') + ':' + String(jst.getUTCMinutes()).padStart(2,'0');
      })();
      const typeLabel = TYPE_LABEL[d.type] || d.type || '—';
      const typeColor = TYPE_COLOR[d.type] || 'var(--text3)';
      const pageLabel = PAGE_LABEL[d.page] || d.page || '—';
      const preview = (d.text || '').slice(0, 50) + ((d.text || '').length > 50 ? '…' : '');
      const imgs = d.images || (d.imageData ? [d.imageData] : []);
      const imgCount = imgs.length;
      const hasMemo = !!d.adminMemo;

      return `
        <tr class="fb-adm-row" onclick="fbAdmToggle(${idx},this)">
          <td style="padding:7px 6px;white-space:nowrap">
            <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:${typeColor}22;color:${typeColor}">${_esc(typeLabel)}</span>
          </td>
          <td style="padding:7px 6px;white-space:nowrap">
            <span style="font-size:10px;color:var(--text2);background:var(--surface3);padding:2px 7px;border-radius:10px">${_esc(pageLabel)}</span>
          </td>
          <td style="padding:7px 6px;font-size:11px;color:var(--text3);white-space:nowrap;font-family:'DM Mono',monospace">${date}</td>
          <td style="padding:7px 6px;font-size:12px;color:var(--text);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${preview ? _esc(preview) : '<span style="color:var(--text3)">—</span>'}
          </td>
          <td style="padding:7px 4px;text-align:center;font-size:11px;color:var(--text3);white-space:nowrap">
            ${imgCount ? `🖼 ${imgCount}` : ''}
          </td>
          <td style="padding:7px 4px;text-align:center;font-size:11px">
            ${hasMemo ? '<span style="color:var(--accent)" title="メモあり">💬</span>' : ''}
          </td>
          <td style="padding:7px 6px;text-align:right" onclick="event.stopPropagation()">
            <button onclick="fbAdmDelete('${d.id}',${idx})" style="background:none;border:1px solid var(--border);color:var(--text3);font-size:10px;padding:3px 8px;border-radius:10px;cursor:pointer;font-family:inherit">削除</button>
          </td>
        </tr>
        <tr id="fb-adm-detail-${idx}" style="display:none">
          <td colspan="7" style="padding:0 0 6px 0">
            <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin:0 0 2px 0">
              ${d.text ? `<div style="font-size:12px;line-height:1.65;margin-bottom:10px;white-space:pre-wrap">${_esc(d.text)}</div>` : ''}
              ${imgCount ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
                ${imgs.map(src => `<img src="${src}" style="max-height:130px;max-width:180px;border-radius:6px;cursor:zoom-in;object-fit:cover" onclick="fbAdmLightbox(this.src)">`).join('')}
              </div>` : ''}
              <div style="font-size:11px;color:var(--text3);margin-bottom:10px">from: ${_esc(d.email || '—')}</div>
              <div style="display:flex;gap:6px;align-items:flex-end">
                <textarea id="fb-memo-${idx}" placeholder="管理メモ（自分用）" rows="2"
                  style="flex:1;background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:12px;color:var(--text);resize:vertical;font-family:inherit">${_esc(d.adminMemo || '')}</textarea>
                <button onclick="fbAdmSaveMemo('${d.id}',${idx})"
                  style="background:var(--accent);color:var(--on-accent);border:none;border-radius:6px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0">保存</button>
              </div>
            </div>
          </td>
        </tr>`;
    }).join('');

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:12px;color:var(--text3)">${items.length} 件</div>
        <button onclick="window.reloadFeedbackAdmin?.()" style="font-size:11px;padding:4px 12px;border-radius:6px;background:var(--surface2);border:1px solid var(--border);color:var(--text2);cursor:pointer">↻ 更新</button>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;min-width:460px">
          <thead>
            <tr style="border-bottom:2px solid var(--border)">
              <th style="padding:5px 6px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">種類</th>
              <th style="padding:5px 6px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">ページ</th>
              <th style="padding:5px 6px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">日時</th>
              <th style="padding:5px 6px;font-size:10px;font-weight:700;color:var(--text3);text-align:left;text-transform:uppercase;letter-spacing:.5px">内容</th>
              <th style="padding:5px 4px;width:36px"></th>
              <th style="padding:5px 4px;width:24px"></th>
              <th style="padding:5px 6px;width:52px"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <style>
        .fb-adm-row { border-bottom:1px solid var(--border2); cursor:pointer; transition:background .1s; }
        .fb-adm-row:hover { background:var(--surface2); }
      </style>
      <div id="fb-img-lb" onclick="this.style.display='none'" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.88);align-items:center;justify-content:center;cursor:zoom-out">
        <img id="fb-img-lb-img" style="max-width:92vw;max-height:92vh;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.6);pointer-events:none">
      </div>`;
  } catch (e) {
    el.innerHTML = `<div style="padding:20px;color:#f66;font-size:12px;">読み込みエラー: ${e.message}</div>`;
  }
}

window.reloadFeedbackAdmin = () => _renderFeedbackAdmin(document.getElementById('admin-inner-fb') || undefined);

window.fbAdmToggle = function(idx, row) {
  const detail = document.getElementById('fb-adm-detail-' + idx);
  if (!detail) return;
  const open = detail.style.display !== 'none';
  detail.style.display = open ? 'none' : '';
};

window.fbAdmDelete = async function(docId, idx) {
  if (!confirm('このフィードバックを削除しますか？')) return;
  try {
    await firebase.firestore().collection('feedback').doc(docId).delete();
    document.getElementById('fb-adm-detail-' + idx)?.remove();
    // find and remove the data row by looking for the row that triggered this
    const tbody = document.querySelector('#admin-p-feedback tbody');
    if (tbody) {
      // rebuild by reloading
      window.reloadFeedbackAdmin?.();
    }
  } catch(e) {
    alert('削除に失敗しました: ' + e.message);
  }
};

window.fbAdmLightbox = function(src) {
  const lb = document.getElementById('fb-img-lb');
  const img = document.getElementById('fb-img-lb-img');
  if (!lb || !img) return;
  img.src = src;
  lb.style.display = 'flex';
};

window.fbAdmSaveMemo = async function(docId, idx) {
  const memo = document.getElementById('fb-memo-' + idx)?.value || '';
  try {
    await firebase.firestore().collection('feedback').doc(docId).update({ adminMemo: memo });
    window.toast?.('💾 メモ保存');
  } catch(e) {
    alert('保存に失敗しました。Firestoreルールにdelete/updateを追加してください。');
  }
};


// ── 検索辞書（見るだけ） ───────────────────────────
// 検索が引く表は SEARCH_DICT の1枚だけ。ここはその中身をそのまま出す窓で、
// 書き換えはしない（辞書を変えるのはコード側。docs/search-dict.md も同じ中身）。
// この画面用のエスケープ（_esc は別の関数の中のローカル変数なのでここからは見えない）
const _sdEsc = s => String(s == null ? '' : s)
  .replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

function _renderSearchDict(targetId = 'admin-p-searchdict') {
  const el = document.getElementById(targetId);
  if (!el) return;
  const p = targetId === 'admin-p-searchdict' ? 'sd' : 'sd2';   // 2か所に出しても id がぶつからないように
  const rows = window.SEARCH_DICT || [];
  const words = rows.reduce((n, r) => n + r.length, 0);
  el.innerHTML = `
    <div style="font-size:12px;color:var(--text2);line-height:1.7;margin-bottom:10px">
      検索が引く表はこれ1枚だけです。<b>1行＝同じもの</b>で、左が代表表記、右がその別の書き方。<br>
      打った語がどれかに一致すると、<b>同じ行の全部の書き方で</b>タイトル・チャンネル・プレイリスト・タグ・メモを探します。<br>
      別の技や分類のキーワードは入れていません（「ロングステップ」でデラヒーバは出ません）。<br>
      全角/半角・カタカナ/ひらがな・長音・区切り・英語の複数形は、辞書に書かなくても吸収されます。
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <input id="${p}-q" type="text" placeholder="辞書の中を絞り込む…" oninput="window._sdFilter(this.value,'${p}')"
             style="flex:1;padding:7px 10px;font-size:12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text)">
      <span id="${p}-count" style="font-size:11px;color:var(--text3);white-space:nowrap">${rows.length} 行 / ${words} 語</span>
    </div>
    <div id="${p}-list" style="border:1px solid var(--border);border-radius:8px;overflow:hidden;max-height:420px;overflow-y:auto"></div>`;
  _sdDraw('', p);
}
window._renderSearchDictInto = _renderSearchDict;

function _sdDraw(q, p = 'sd') {
  const list = document.getElementById(p + '-list');
  if (!list) return;
  const norm = window._normTag || (x => String(x || '').toLowerCase());
  const nq   = norm(q || '');
  const all  = window.SEARCH_DICT || [];
  const rows = all.map((r, i) => ({ i: i + 1, r })).filter(({ r }) => !nq || r.some(w => norm(w).includes(nq)));
  const cnt = document.getElementById(p + '-count');
  if (cnt) cnt.textContent = nq ? `${rows.length} 行が一致` : `${all.length} 行 / ${all.reduce((n, r) => n + r.length, 0)} 語`;
  list.innerHTML = rows.length
    ? rows.map(({ i, r }) => `
        <div style="display:flex;gap:10px;padding:7px 10px;border-bottom:1px solid var(--border);font-size:12px;align-items:baseline">
          <span style="color:var(--text3);font-size:10px;min-width:28px;text-align:right;font-family:'DM Mono',monospace">${i}</span>
          <b style="min-width:150px;color:var(--text)">${_sdEsc(r[0])}</b>
          <span style="color:var(--text2)">${r.slice(1).map(_sdEsc).join(' / ')}</span>
        </div>`).join('')
    : '<div style="padding:14px;font-size:12px;color:var(--text3);text-align:center">その語は辞書にありません（打った文字がそのまま入っている動画は、辞書に無くても出ます）</div>';
}
window._sdFilter = _sdDraw;
