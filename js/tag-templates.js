// ═══ WAZA KIMURA — タググループのテンプレート ═══
// Notion「タグシステム再考」項目04。
//
// 考え方:
//   タググループは4つ固定だが、名前も中身もユーザーが決める（項目03）。
//   ここにあるのは「押したら選択肢に入る」見本であって、システムが押し付けるものではない。
//
// 大事な決まり:
//   テンプレートは必ず「コピー」として渡す。参照にしない。
//   こちらがテンプレの中身を後から変えても、ユーザーが既に入れた選択肢は動かない。
//   （CLAUDE.md のデータ安全ルール「非空→空の上書き禁止」とも同じ向き）
(function () {
  'use strict';

  // どこから中身を読むか（Notion 項目15）
  //
  //   テンプレの中身  … admin-dashboard で育てる（waza_positions / waza_tag_dict）
  //   検索辞書        … tag-master.js の POSITIONS / CATEGORIES（項目02・別物）
  //
  // この2つは同じ27ポジションから始まっているが、役割もスキーマも違う。
  //   テンプレ側: { id, names:{ja,en}, group, aliases:{ja,en} }
  //   辞書側:     { id, ja, en, aliases:[] }
  // テンプレは「ユーザーが選択肢に入れる見本」なので、育てる場所である
  // テンプレ側を先に読む。まだ何も育てていなければ辞書の名前で代用する。
  // 辞書そのものは検索用として手を触れない。
  function _fromStore(key, pick) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || !arr.length) return null;
      const names = arr.map(pick).filter(Boolean);
      return names.length ? names : null;
    } catch (e) { return null; }
  }
  const TEMPLATES = [
    {
      id: 'pos',
      name: 'ポジション',
      desc: 'クローズド、デラヒーバ、ハーフ…',
      values: () => _fromStore('waza_positions', p => p && p.names && p.names.ja)
                  || (window.POSITIONS || []).map(p => p.ja).filter(Boolean)
    },
    {
      id: 'cat',
      name: '動作の種類',
      desc: 'パスガード、スイープ、フィニッシュ…',
      values: () => _fromStore('waza_tag_dict', c => c && ((c.names && c.names.ja) || c.name))
                  || (window.CATEGORIES || []).map(c => c.name).filter(Boolean)
    },
    {
      id: 'tb',
      name: '上下',
      desc: 'トップ / ボトム / スタンディング',
      values: () => (window.TB_VALUES || []).slice()
    },
    {
      id: 'practice',
      name: '練習ステータス',
      desc: '自由に作っていいことの見本',
      values: () => ['要復習', '試合で使う', 'できた']
    }
  ];

  // ── ユーザーが編集したテンプレート ──
  //
  // 上の TEMPLATES は「まだ何も触っていない人に出す見本」。
  // 一度でも編集したら、その時点の中身をユーザーのものとして固めて
  // ここに持つ（_materialize）。以後 TEMPLATES は二度と出てこない。
  //
  // 「まだ触っていない」と「全部消した」を区別するために、入れ物は
  // 配列ではなく { seeded:true, list:[...] } にしてある。キーが有れば
  // list が空でもユーザーの意思なので、見本を勝手に復活させない
  // （タググループの種入れ tag-seed-check と同じ考え方）。
  const LS_KEY = 'wk_tagTemplates';

  function _loadUser() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;                       // まだ触っていない
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.list)) return p.list; // 空配列も尊重する
    } catch (e) {}
    return null;
  }

  function _clean(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).map(t => {
      if (!t || typeof t !== 'object') return null;
      // id は onclick 属性に入るので、英数字と _ - だけに限る。
      // 壊れた値・クォートの混じった値が来ても、そこから先へ渡さない。
      let id = String(t.id || '').trim().replace(/[^A-Za-z0-9_-]/g, '');
      if (!id || seen.has(id)) id = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
      seen.add(id);
      const vals = [];
      (Array.isArray(t.values) ? t.values : []).forEach(v => {
        const s = String(v == null ? '' : v).trim();
        if (s && vals.indexOf(s) < 0) vals.push(s);
      });
      return { id, name: String(t.name || '').trim() || '名前のないテンプレート', desc: String(t.desc || ''), values: vals };
    }).filter(Boolean);
  }

  function _saveUser(list) {
    const cleaned = _clean(list);
    try { localStorage.setItem(LS_KEY, JSON.stringify({ seeded: true, list: cleaned })); } catch (e) {}
    window.saveUserSettings?.();   // 他の端末にも届ける
    return cleaned;
  }

  // 見本のままでは編集できないので、最初の編集で見本のコピーを固める。
  function _materialize() {
    const u = _loadUser();
    return u ? _clean(u) : tagTemplates();
  }

  // テンプレート一覧（表示用）。values は毎回新しい配列を返す。
  function tagTemplates() {
    const u = _loadUser();
    if (u) return _clean(u);
    return TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      desc: t.desc,
      values: t.values().slice()   // ← コピー。呼び出し側が書き換えても元に影響しない
    }));
  }

  // 1つ取り出す。無ければ null。
  function tagTemplate(id) {
    return tagTemplates().find(t => t.id === id) || null;
  }

  // ── 編集 ──
  // どれも「いまの一覧を固めて、1か所だけ変えて、書き戻す」。
  // 他のテンプレートには触らない。
  function tagTemplateRename(id, name) {
    const v = String(name == null ? '' : name).trim();
    if (!v) return false;                       // 空の名前にはしない
    const list = _materialize();
    const t = list.find(x => x.id === id);
    if (!t || t.name === v) return false;
    t.name = v;
    _saveUser(list);
    return true;
  }

  function tagTemplateSetValues(id, values) {
    const list = _materialize();
    const t = list.find(x => x.id === id);
    if (!t) return false;
    t.values = Array.isArray(values) ? values.slice() : [];
    _saveUser(list);
    return true;
  }

  function tagTemplateDelete(id) {
    const list = _materialize();
    const next = list.filter(x => x.id !== id);
    if (next.length === list.length) return false;
    _saveUser(next);
    return true;
  }

  // 新しく作る。作った id を返す（そのまま編集画面を開くため）。
  function tagTemplateCreate(name) {
    const list = _materialize();
    const id = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    list.push({ id, name: String(name || '').trim() || '新しいテンプレート', desc: '', values: [] });
    _saveUser(list);
    return id;
  }

  // ── クラウド同期 ──
  // 保存する中身。まだ触っていなければ null を返し、firebase 側は
  // 何も書かない（見本しか無い端末が、他の端末の編集を消さないため）。
  function getTagTemplatesRaw() {
    const u = _loadUser();
    return u ? { seeded: true, list: _clean(u) } : null;
  }

  // クラウドから受け取る。形が合っているものだけ入れる。
  // null / 壊れた値は「クラウドにまだ無い」とみなして何もしない
  // （こちらのローカルを空で上書きしない）。
  function applyRemoteTagTemplates(obj) {
    if (!obj || !Array.isArray(obj.list)) return false;
    try { localStorage.setItem(LS_KEY, JSON.stringify({ seeded: true, list: _clean(obj.list) })); } catch (e) {}
    return true;
  }

  window.tagTemplates            = tagTemplates;
  window.tagTemplate             = tagTemplate;
  window.tagTemplateRename       = tagTemplateRename;
  window.tagTemplateSetValues    = tagTemplateSetValues;
  window.tagTemplateDelete       = tagTemplateDelete;
  window.tagTemplateCreate       = tagTemplateCreate;
  window.getTagTemplatesRaw      = getTagTemplatesRaw;
  window.applyRemoteTagTemplates = applyRemoteTagTemplates;
})();
