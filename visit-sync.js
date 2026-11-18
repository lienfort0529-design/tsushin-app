// 訪問の画面（visit.html）のデータまわり。
// 1) 物件データ：Apps Script の visitData から受け取り、スマホ（IndexedDB）に保存する。版が変わったときだけ取り直す
// 2) 記録・部屋の形・自社メモ・⚠危険の印：visit.js の save() が来たら、前との違いを「送るもの」にしてためる（hkVisitQ）。
//    電波があれば visitPush で送り、visitPull で全員分を取り直す。電波がない間はスマホにたまり、戻ったら送る
// 合言葉・名前は通信インフラ（app.js）と同じもの（hkPass・hkName・hkAdmin）を使う。無ければ通信インフラの画面へ戻す
(() => {
  // app.js の API_URL と同じ（変えるときは両方）
  const API_URL = 'https://script.google.com/macros/s/AKfycbzALOLUN8rAom2b6fXmlA0zV5raPXSY-KrRAtZnPNrxznetLprUi687Jy6v0dgKTxzz/exec';
  const K = { pass: 'hkPass', name: 'hkName', admin: 'hkAdmin', state: 'hkVisitState', q: 'hkVisitQ' };
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const home = () => { location.href = './'; };
  if (!get(K.pass, '')) return home();

  function api(fn, ...args) {
    return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args, pass: get(K.pass, ''), admin: get(K.admin, '') }) })
      .then(r => r.json())
      .then(r => {
        if (r.auth) { home(); throw new Error('合言葉を入れ直してください'); }
        if (r.error) throw new Error(r.error);
        return r.result;
      });
  }

  // ===== 物件データ =====
  const idb = () => new Promise((ok, ng) => {
    const r = indexedDB.open('hkVisit', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error);
  });
  const idbGet = k => idb().then(db => new Promise(ok => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); })).catch(() => null);
  const idbPut = (k, v) => idb().then(db => new Promise(ok => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = ok; t.onerror = ok; })).catch(() => {});
  // 圧縮したデータ（gzip を base64 にしたもの）を元に戻す
  const unzip = gz => new Response(new Blob([Uint8Array.from(atob(gz), c => c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
  const msg = t => { const e = document.getElementById('vload'); if (e) e.innerHTML = t; };
  function boot(d) {
    window.BLD = d.bld; window.DBX = d.dbx; window.META = { updated: d.ver };
    const s = document.createElement('script'); s.src = 'visit.js'; document.body.appendChild(s);
    const e = document.getElementById('vload'); if (e) e.remove();
  }
  idbGet('data').then(have => {
    if (have) boot(have);
    else msg('物件データを読み込んでいます…<br><small>はじめてのときだけ少し時間がかかります</small>');
    return api('visitData', have ? have.ver : '').then(r => {
      if (!r.ver) { if (!have) msg('物件データがまだ入っていません。管理者に連絡してください。'); return; }
      if (r.same || !r.gz) return;
      return unzip(r.gz).then(d => idbPut('data', d).then(() => {
        if (!have) boot(d);
        else VS.note('物件データが新しくなりました。開き直すと反映されます');
      }));
    });
  }).catch(e => { if (!window.BLD) msg('物件データを読み込めませんでした（' + e.message + '）<br><a class="vback" href="visit.html">もう一度</a>'); });

  // ===== 記録まわり =====
  // 結果の記号（visit.js）とシートの言葉
  const RL = { fu: '不在', ih: 'インターホンNG', fr: 'フロントNG', so: 'トーク後NG', kn: '検討', ok: '契約', ka: '加入済み', ak: '空室' };
  const LR = Object.fromEntries(Object.entries(RL).map(([k, v]) => [v, k]));
  const KEYS = { au_hist: 'H', au_layout: 'LAY', au_memo: 'MM', au_danger: 'DGR' };
  const md = t => { const d = new Date(t); return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0'); };
  const clone = o => JSON.parse(JSON.stringify(o));
  const me = () => { const n = get(K.name, ''); return n === '（管理者）' ? '' : n; };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // 画面が持っている入れ物（visit.js の H・LAY・MM・DGR）。中身だけ入れ替える
  const live = { H: {}, LAY: {}, MM: {}, DGR: {} };
  let prev, queue = get(K.q, []), onData = null, sending = false, waiting = false;

  // シートの全部（visitPull の形）→ 画面の形
  function fromServer(d) {
    const o = { H: {}, LAY: d.lays || {}, MM: d.memos || {}, DGR: {} };
    (d.recs || []).forEach(([t, w, key, res, m, id]) => (o.H[key] = o.H[key] || []).push({ id: id, s: LR[res] || res, d: md(t), w: w, t: t, m: m }));
    Object.keys(d.danger || {}).forEach(k => { const x = d.danger[k]; o.DGR[k] = { w: x.w, d: md(x.t), t: x.t, m: x.m }; });
    return o;
  }
  // まだ送っていないものを、画面の形に重ねる
  function applyOp(o, p) {
    if (p.op === 'rec') { const h = o.H[p.key] = o.H[p.key] || []; if (!h.some(x => x.id === p.id)) h.push({ id: p.id, s: LR[p.result], d: md(p.ts), w: p.name, t: p.ts, m: p.memo }); }
    if (p.op === 'del') Object.keys(o.H).forEach(k => { o.H[k] = o.H[k].filter(x => x.id !== p.rid); if (!o.H[k].length) delete o.H[k]; });
    if (p.op === 'lay') { if (p.lay == null) delete o.LAY[p.key]; else o.LAY[p.key] = p.lay; }
    if (p.op === 'memo') o.MM[p.bid] = p.memo;
    if (p.op === 'dgr') { if (p.on) o.DGR[p.key] = { w: p.name, d: md(p.ts), t: p.ts, m: p.memo }; else delete o.DGR[p.key]; }
  }
  function fill(o) {
    Object.keys(live).forEach(n => { const x = live[n]; Object.keys(x).forEach(k => delete x[k]); Object.assign(x, o[n]); });
    prev = clone(live); set(K.state, prev);
  }

  // 前と今の違いを「送るもの」にする
  function diff(n, a, b) {
    const name = me(), ts = Date.now(), ops = [];
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    if (n === 'H') {
      const was = {}; Object.values(a).forEach(h => h.forEach(x => was[x.id] = x));
      const now = {}; Object.keys(b).forEach(k => b[k].forEach(x => { if (!x.id) x.id = uid(); now[x.id] = 1; if (!was[x.id] && RL[x.s]) ops.push({ op: 'rec', id: x.id, name: x.w || name, ts: x.t || ts, key: k, result: RL[x.s], memo: x.m || '' }); }));
      Object.keys(was).forEach(id => { if (!now[id]) ops.push({ op: 'del', id: uid(), name: name, rid: id }); });
    } else keys.forEach(k => {
      if (JSON.stringify(a[k]) === JSON.stringify(b[k])) return;
      if (n === 'LAY') ops.push({ op: 'lay', id: uid(), name: name, ts: ts, key: k, lay: b[k] == null ? null : b[k] });
      if (n === 'MM') ops.push({ op: 'memo', id: uid(), name: name, ts: ts, bid: k, memo: b[k] || {} });
      if (n === 'DGR') ops.push({ op: 'dgr', id: uid(), name: name, ts: ts, key: k, on: !!b[k], memo: b[k] ? b[k].m || '' : '' });
    });
    return ops;
  }

  function flush() {
    if (sending || !navigator.onLine) return;
    sending = true;
    const batch = queue.slice(0, 200);
    (batch.length ? api('visitPush', batch) : api('visitPull').then(d => ({ ids: [], data: d })))
      .then(r => {
        const done = new Set(r.ids || []);
        queue = queue.filter(p => !done.has(p.id)); set(K.q, queue);
        const o = fromServer(r.data); queue.forEach(p => applyOp(o, p));
        // 入力中・部屋を開いている間は画面を作り直さない（あとで）
        if (JSON.stringify(o) !== JSON.stringify(live)) { fill(o); waiting = !(onData && onData()); }
      })
      .catch(() => {})
      .finally(() => { sending = false; if (queue.length) setTimeout(flush, 3000); });
  }

  window.VS = {
    has: k => k in KEYS,
    get: k => live[KEYS[k]],
    save(k, v) {
      const n = KEYS[k], ops = diff(n, prev[n], v);
      prev[n] = clone(v); set(K.state, prev);
      if (!ops.length) return;
      queue = queue.concat(ops); set(K.q, queue);
      flush();
    },
    me: me, id: uid,
    admin: () => !!get(K.admin, ''),
    note: t => { const e = document.createElement('div'); e.className = 'toast'; e.textContent = t; document.body.appendChild(e); setTimeout(() => e.remove(), 4000); },
    // visit.js の最後に呼ばれる。redraw は画面を作り直せたら true を返す
    start(redraw) {
      onData = redraw; flush();
      setInterval(() => { if (!document.hidden) { if (waiting && onData) waiting = !onData(); flush(); } }, 30000);
      addEventListener('online', flush);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) flush(); });
    },
  };
  // 前回の分（電波がなくても開けるように）＋まだ送っていない分
  const saved = get(K.state, null) || { H: {}, LAY: {}, MM: {}, DGR: {} };
  queue.forEach(p => applyOp(saved, p));
  fill(saved);
})();
