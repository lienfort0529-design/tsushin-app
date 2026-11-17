// 通信インフラアプリ（GitHub Pages）。データは Apps Script「光回線カウンター」の API（合言葉つき）から読み書きする。
// 画面：カウンター／顧客進捗／ランキング／個人成績・KPI（全員が全部見られる）
const API_URL = 'https://script.google.com/macros/s/AKfycbzALOLUN8rAom2b6fXmlA0zV5raPXSY-KrRAtZnPNrxznetLprUi687Jy6v0dgKTxzz/exec';

// スマホに覚えておくもの（住宅設備アプリと同じ場所に入るので、名前の頭に hk を付けて分ける）
const KEY = { pass: 'hkPass', name: 'hkName', queue: 'hkQueue', cfg: 'hkCfg', view: 'hkView' };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = k => k ? Number(k.slice(5, 7)) + '/' + Number(k.slice(8, 10)) : '';
const pct = (a, b, d) => b ? (a / b * 100).toFixed(d == null ? 1 : d) + '%' : '-';
const toast = t => { const e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 2200); };

// ===== API =====
// text/plain で送ると、ブラウザの事前確認（CORS）が要らない
function api(fn, ...args) {
  return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ fn: fn, args: args, pass: store.get(KEY.pass, '') }) })
    .catch(() => { throw new Error('通信できません（電波を確認してください）'); })
    .then(r => r.json())
    .then(r => {
      if (r.auth) { const had = !!store.get(KEY.pass, ''); store.del(KEY.pass); showPass(had ? '合言葉が違います（変わったかもしれません）' : ''); throw new Error('合言葉を入れてください'); }
      if (r.error) throw new Error(r.error);
      return r.result;
    });
}

// ===== 最初の画面（合言葉 → 名前） =====
let cfg = store.get(KEY.cfg, null), me = store.get(KEY.name, '');

function showPass(msg) {
  $('shell').hidden = true; $('login').hidden = false; $('passStep').hidden = false; $('nameStep').hidden = true;
  $('passMsg').textContent = msg || 'チームの合言葉を入れてください';
  $('passIn').value = ''; setTimeout(() => $('passIn').focus(), 50);
}
$('passOk').onclick = () => {
  const v = $('passIn').value.trim();
  if (!v) return;
  store.set(KEY.pass, v);
  $('passOk').disabled = true; $('passMsg').textContent = '確認中…';
  api('appConfig').then(c => { saveCfg(c); showNames(); }, e => { if (!$('passStep').hidden) $('passMsg').textContent = e.message; })
    .finally(() => $('passOk').disabled = false);
};
$('passIn').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) $('passOk').click(); };

function showNames() {
  $('shell').hidden = true; $('login').hidden = false; $('passStep').hidden = true; $('nameStep').hidden = false;
  $('nameList').innerHTML = cfg.names.map(n => '<button>' + esc(n) + '</button>').join('');
  $('nameList').querySelectorAll('button').forEach((b, i) => b.onclick = () => { me = cfg.names[i]; store.set(KEY.name, me); start(); });
}

function saveCfg(c) { cfg = c; store.set(KEY.cfg, c); }

// ===== 画面の切り替え =====
const ICON = {
  counter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/></svg>',
  cust: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  rank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/></svg>',
  kpi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
};
const VIEWS = [['counter', 'カウンター'], ['cust', '顧客進捗'], ['rank', 'ランキング'], ['kpi', '個人成績・KPI']];
let view = store.get(KEY.view, 'counter');

function buildNav() {
  const html = VIEWS.map(([k, t]) => '<button data-v="' + k + '">' + ICON[k] + '<span>' + t + '</span></button>').join('');
  $('sideNav').innerHTML = html;
  $('tabs').innerHTML = VIEWS.map(([k, t]) => '<button data-v="' + k + '">' + ICON[k] + '<span>' + (k === 'kpi' ? 'KPI' : t) + '</span></button>').join('');
  document.querySelectorAll('[data-v]').forEach(b => b.onclick = () => go(b.dataset.v));
}

function go(v) {
  view = v; store.set(KEY.view, v);
  VIEWS.forEach(([k]) => $('v-' + k).hidden = k !== v);
  document.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $('topTitle').textContent = VIEWS.find(x => x[0] === v)[1];
  window.scrollTo(0, 0);
  if (v === 'counter') loadToday();
  if (v === 'cust') loadCust();
  if (v === 'rank' || v === 'kpi') loadStats();
}

document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (!a) return;
  if (a.dataset.act === 'rename') showNames();
  if (a.dataset.act === 'reload') { if (view === 'cust') loadCust(true); else loadStats(true); }
});

function start() {
  $('login').hidden = true; $('shell').hidden = false;
  $('meTop').textContent = me; $('meSide').textContent = me + ' さん';
  setupCounter();
  go(VIEWS.some(x => x[0] === view) ? view : 'counter');
  flush();
}

// ===== カウンター =====
// 押した記録はまずスマホに保存し（未送信）、電波があれば送る。電波がない間はたまっていき、戻ったら送る
const COLORS = { '不在': '#8a8f98', 'インターホンNG': '#2980b9', 'フロントNG': '#2980b9', 'トーク後NG': '#2980b9', '獲得': '#d9534f', '対象外': '#555' };
const FACE = ['フロントNG', '対象外', 'トーク後NG', '獲得'];
let queue = store.get(KEY.queue, []), sent = {}, busy = false, sending = false, built = false;
const saveQueue = () => store.set(KEY.queue, queue);
const sameDay = t => new Date(t).toDateString() === new Date().toDateString();

function setupCounter() {
  $('cDate').textContent = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
  if (built) return;
  built = true;
  $('grid').innerHTML = '';
  cfg.results.forEach(r => {
    const b = document.createElement('button');
    b.className = 'r'; b.style.background = COLORS[r] || '#333';
    b.innerHTML = esc(r) + '<span data-c="' + esc(r) + '">0</span>';
    b.onclick = () => r === '獲得' ? openApp() : record(r);
    $('grid').appendChild(b);
  });
  $('product').length = 1;
  cfg.products.forEach(p => $('product').add(new Option(p, p)));
  render();
}

function render() {
  if (!built) return;
  const counts = Object.assign({}, sent), prod = Object.assign({}, sent.products);
  queue.filter(q => q.name === me && sameDay(q.ts)).forEach(q => {
    counts[q.result] = (counts[q.result] || 0) + 1;
    if (q.product) prod[q.product] = (prod[q.product] || 0) + 1;
  });
  document.querySelectorAll('[data-c]').forEach(s => s.textContent = counts[s.dataset.c] || 0);
  const face = FACE.reduce((s, r) => s + (counts[r] || 0), 0);
  $('face').textContent = face;
  $('knock').textContent = face + (counts['不在'] || 0) + (counts['インターホンNG'] || 0);
  $('talk').textContent = (counts['トーク後NG'] || 0) + (counts['獲得'] || 0);
  $('apo').textContent = counts['獲得'] || 0;
  $('prodToday').textContent = cfg.products.map(p => p + ' ' + (prod[p] || 0)).join('・');
  $('pending').style.display = queue.length ? 'block' : 'none';
  $('pending').textContent = '未送信 ' + queue.length + '件（電波が戻ったら自動で送ります）';
}

// ひらがなはカタカナに直し、空白は取る
const kana = s => s.replace(/[\s　]/g, '').replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));

// 「獲得」は申込日・商材・お客様名・セイメイ（カナ）を入れてから記録する（顧客進捗に1行増える）
function openApp() {
  if (busy) return;
  $('appDate').value = new Date().toLocaleDateString('sv-SE');
  ['product', 'customer', 'sei', 'mei'].forEach(id => $(id).value = ''); $('appErr').textContent = '';
  $('appBox').classList.add('open');
}
$('appCancel').onclick = () => $('appBox').classList.remove('open');
$('appOk').onclick = () => {
  const customer = $('customer').value.trim(), appDate = $('appDate').value, product = $('product').value;
  const sei = kana($('sei').value), mei = kana($('mei').value);
  $('sei').value = sei; $('mei').value = mei;
  const err = !appDate ? '申込日を入れてください' : !product ? '商材を選んでください' : !customer ? 'お客様名を入れてください'
    : !sei || !mei ? 'セイ・メイ（カナ）を入れてください' : !/^[ァ-ヶー]+$/.test(sei + mei) ? 'セイ・メイはカタカナで入れてください' : '';
  if (err) { $('appErr').textContent = err; return; }
  $('appBox').classList.remove('open');
  record('獲得', { appDate: appDate, customer: customer, sei: sei, mei: mei, product: product });
};

function record(result, extra) {
  if (busy) return;
  queue.push(Object.assign({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 8), name: me, result: result, ts: Date.now() }, extra));
  saveQueue();
  $('msg').textContent = '記録しました：' + result + (extra && extra.product ? '（' + extra.product + '）' : '');
  render();
  // 押し間違い防止に少しの間ほかを押せなくする
  setBusy(true, '記録中…');
  setTimeout(() => setBusy(false), 500);
  flush();
}

// 未送信をまとめて送る。送れた分だけ消す（同じ記録は二重に入らない）
function flush() {
  if (sending || !queue.length) return;
  sending = true;
  const batch = queue.slice(0, 50);
  api('addRecords', batch).then(r => {
    sending = false;
    queue = queue.filter(q => !r.ids.includes(q.id));
    saveQueue();
    statsAt = 0; custAt = 0;
    loadToday();
    if (queue.length) flush();
  }, () => { sending = false; render(); });
}
setInterval(flush, 20000);
window.addEventListener('online', flush);

$('undo').onclick = () => ask('直前の記録を取り消しますか？（獲得なら顧客進捗の行も消えます）').then(ok => {
  if (!ok) return;
  const i = queue.map(q => q.name).lastIndexOf(me);
  if (i >= 0) { queue.splice(i, 1); saveQueue(); render(); $('msg').textContent = '取り消しました（未送信の分）'; return; }
  if (!navigator.onLine) { $('msg').textContent = '電波がない時は、送信済みの記録は取り消せません'; return; }
  setBusy(true, '取り消し中…');
  api('undoLast', me).then(c => { setBusy(false); sent = c; statsAt = 0; custAt = 0; render(); $('msg').textContent = '取り消しました'; },
    e => { setBusy(false); $('msg').textContent = 'エラー: ' + e.message; });
});

function setBusy(on, text) {
  busy = on;
  if (text) $('overlayText').textContent = text;
  document.body.classList.toggle('busy', on);
}

function loadToday() {
  render();
  api('getToday', me).then(c => { sent = c; render(); }, () => {});
}

// 0時をまたいだら今日の数字に戻す
let lastDay = new Date().toDateString();
setInterval(() => { if (new Date().toDateString() !== lastDay) { lastDay = new Date().toDateString(); sent = {}; setupCounter(); loadToday(); } }, 60000);

function ask(text) {
  return new Promise(res => {
    $('askText').textContent = text; $('askBox').classList.add('open');
    const done = v => { $('askBox').classList.remove('open'); res(v); };
    $('askYes').onclick = () => done(true); $('askNo').onclick = () => done(false);
  });
}

// ===== 顧客進捗 =====
let cust = [], custAt = 0, editing = null;
const CANCEL = ['エントリー前キャンセル', 'キャンセル依頼', 'キャンセル依頼済'];
const isCancel = c => c.line === '申込取消' || CANCEL.includes(c.entry);
const isOpen = c => !!c.done && !isCancel(c);

function loadCust(force) {
  fillFilters();
  if (!force && Date.now() - custAt < 60000) return drawCust();
  if (!cust.length) $('custBody').innerHTML = '<div class="loading">読み込み中…</div>';
  api('custList').then(r => { cust = r; custAt = Date.now(); drawCust(); },
    e => { $('custBody').innerHTML = '<div class="empty">読み込めませんでした：' + esc(e.message) + '</div>'; });
}

let filled = false;
function fillFilters() {
  if (filled) return;
  filled = true;
  [['fStaff', 1], ['fEntry', 2], ['fProd', 1], ['e-entry', 1], ['e-line', 1]].forEach(([id, n]) => $(id).length = n);
  cfg.names.forEach(n => $('fStaff').add(new Option(n, n)));
  cfg.entryStatus.forEach(s => { $('fEntry').add(new Option(s, s)); $('e-entry').add(new Option(s, s)); });
  cfg.lineStatus.forEach(s => $('e-line').add(new Option(s, s)));
  cfg.products.forEach(p => $('fProd').add(new Option(p, p)));
  ['fText', 'fStaff', 'fEntry', 'fProd', 'fOpen'].forEach(id => $(id).oninput = drawCust);
}

function entryBadge(c) {
  if (!c.entry) return '<span class="badge">エントリー未入力</span>';
  const cls = CANCEL.includes(c.entry) || c.entry === 'フォローコールNG' ? 'red' : c.entry === 'フォローコールOK' ? 'green'
    : c.entry === 'エントリー済み' ? 'blue' : ['不備対応中', '確認依頼', 'フォローコール営業戻し', 'フォローコール長期不通'].includes(c.entry) ? 'yellow' : '';
  return '<span class="badge ' + cls + '">' + esc(c.entry) + '</span>';
}
function stateBadge(c) {
  if (isCancel(c)) return '<span class="badge red">キャンセル</span>';
  if (c.done) return '<span class="badge green">開通 ' + md(c.done) + '</span>';
  if (c.jumper) return '<span class="badge blue">工事予定 ' + md(c.jumper) + '</span>';
  return '';
}

function drawCust() {
  const t = kana($('fText').value.trim()), raw = $('fText').value.trim(), st = $('fStaff').value, en = $('fEntry').value, pr = $('fProd').value, op = $('fOpen').value;
  const list = cust.filter(c => (!st || c.staff === st) && (!pr || c.product === pr)
      && (!en || (en === '-' ? !c.entry : c.entry === en))
      && (!op || (op === '1' ? isOpen(c) : op === '0' ? !isOpen(c) && !isCancel(c) : isCancel(c)))
      && (!raw || c.customer.includes(raw) || (c.sei + c.mei).includes(t)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.row - a.row);
  $('custCount').textContent = list.length + '件' + (list.length !== cust.length ? '（全' + cust.length + '件）' : '');
  if (!list.length) { $('custBody').innerHTML = '<div class="empty">' + (cust.length ? '条件に合うお客様がいません' : 'まだ獲得がありません') + '</div>'; return; }
  const kn = c => esc((c.sei + ' ' + c.mei).trim());
  const cards = list.map(c => '<button class="citem" data-row="' + c.row + '"><div class="t"><b>' + esc(c.customer || '（名前なし）') + '</b><span class="k">' + kn(c) + '</span></div>' +
    '<div class="m">' + md(c.date) + ' 申込 ・ ' + esc(c.staff) + ' ・ ' + esc(c.product) + '</div><div class="s">' + entryBadge(c) + stateBadge(c) +
    (c.line ? '<span class="badge">回線 ' + esc(c.line) + '</span>' : '') + '</div></button>').join('');
  const d = k => k ? md(k) : '';
  const rows = list.map(c => '<tr data-row="' + c.row + '"><td>' + d(c.date) + '</td><td>' + esc(c.staff) + '</td><td><b>' + esc(c.customer) + '</b><div class="k">' + kn(c) + '</div></td>' +
    '<td>' + esc(c.product) + '</td><td>' + entryBadge(c) + '</td><td>' + d(c.entryDate) + '</td><td>' + d(c.jumper) + '</td><td>' + esc(c.line) + '</td>' +
    '<td>' + d(c.netDate) + '</td><td>' + d(c.billDate) + '</td><td>' + (c.done ? (isCancel(c) ? d(c.done) : '<span class="badge green">' + d(c.done) + '</span>') : '') + '</td>' +
    '<td class="memo">' + esc(c.memo) + '</td></tr>').join('');
  $('custBody').innerHTML = '<div class="clist">' + cards + '</div><div class="ctable"><table><thead><tr><th>申込日</th><th>担当</th><th>お客様名</th><th>商材</th>' +
    '<th>エントリーステータス</th><th>エントリー日</th><th>ジャンパ工事</th><th>回線契約</th><th>NET締結</th><th>課金開始</th><th>工事完了</th><th>メモ</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  $('custBody').querySelectorAll('[data-row]').forEach(el => el.onclick = () => openCust(cust.find(c => c.row === Number(el.dataset.row))));
}

const EDIT = ['entry', 'entryDate', 'jumper', 'line', 'netDate', 'billDate', 'done', 'memo'];
function openCust(c) {
  editing = c;
  $('cbName').textContent = (c.customer || '（名前なし）') + ' 様';
  $('cbInfo').innerHTML = esc((c.sei + ' ' + c.mei).trim()) + '<br>申込日 ' + esc(c.date.replace(/-/g, '/')) + ' ・ 担当 ' + esc(c.staff) + ' ・ ' + esc(c.product);
  EDIT.forEach(k => {
    const el = $('e-' + k);
    if (el.tagName === 'SELECT' && c[k] && ![...el.options].some(o => o.value === c[k])) el.add(new Option(c[k], c[k]));
    el.value = c[k] || '';
  });
  $('cbErr').textContent = '';
  $('custBox').classList.add('open');
}
$('cbCancel').onclick = () => $('custBox').classList.remove('open');
$('cbOk').onclick = () => {
  const c = editing, u = { row: c.row, id: c.id, date: c.date, customer: c.customer };
  EDIT.forEach(k => u[k] = $('e-' + k).value.trim());
  if (EDIT.every(k => (u[k] || '') === (c[k] || ''))) { $('custBox').classList.remove('open'); return; }
  $('cbOk').disabled = true; $('cbErr').textContent = '保存中…';
  api('custUpdate', u).then(r => {
    const i = cust.indexOf(c);
    if (i >= 0) cust[i] = r;
    statsAt = 0;
    $('custBox').classList.remove('open');
    drawCust();
    toast('保存しました');
  }, e => { $('cbErr').textContent = e.message; }).finally(() => $('cbOk').disabled = false);
};

// ===== 集計（ランキング・KPI） =====
let S = null, statsAt = 0, rankP = 'month', kpiMode = 'all', kpiWho = '', kpiUnit = 'month', kpiOff = 0;
const RI = r => S.results.indexOf(r);

function loadStats(force) {
  if (S && !force && Date.now() - statsAt < 60000) return drawStats();
  if (S) drawStats();
  api('stats').then(r => { S = r; statsAt = Date.now(); drawStats(); },
    e => { const m = '<div class="empty">読み込めませんでした：' + esc(e.message) + '</div>'; if (!S) { $('rankBody').innerHTML = m; $('kpiBody').innerHTML = m; } else toast(e.message); });
}
function drawStats() { if (view === 'rank') drawRank(); if (view === 'kpi') drawKpi(); }

const zero = () => ({ c: S.results.map(() => 0), wp: {}, o: 0, op: {}, ng: 0 });
const get = (name, p) => (S.data[name] && S.data[name][p]) || zero();
function sumOf(names, p) {
  const t = zero();
  names.forEach(n => { const x = get(n, p); x.c.forEach((v, i) => t.c[i] += v); t.o += x.o; t.ng += x.ng;
    Object.keys(x.wp).forEach(q => t.wp[q] = (t.wp[q] || 0) + x.wp[q]); Object.keys(x.op).forEach(q => t.op[q] = (t.op[q] || 0) + x.op[q]); });
  return t;
}
// 訪問・対面・提案・獲得・率（シートの個人成績と同じ数え方）
function kpi(x) {
  const c = r => x.c[RI(r)] || 0;
  const visit = x.c.reduce((a, b) => a + b, 0), face = c('フロントNG') + c('対象外') + c('トーク後NG') + c('獲得'), talk = c('トーク後NG') + c('獲得'), won = c('獲得');
  const r = (a, b) => b ? a / b : null;
  return { visit, face, talk, won, opened: x.o, ng: x.ng, rFace: r(face, visit), rTalk: r(talk, face), rClose: r(won, talk), rWon: r(won, visit), raw: x };
}
const rate = v => v == null ? '-' : (v * 100).toFixed(1) + '%';
function bar(v, g, cls) {
  if (!g) return '<div class="bar"><i style="width:0"></i></div>';
  const p = Math.min(v / g, 1) * 100;
  return '<div class="bar"><i class="' + (v >= g ? 'done' : cls || '') + '" style="width:' + p + '%"></i></div>';
}
const segBtns = (opts, cur, attr) => '<div class="seg">' + opts.map(([k, t]) => '<button ' + attr + '="' + k + '"' + (k === cur ? ' class="on"' : '') + '>' + t + '</button>').join('') + '</div>';
const PLABEL = { day: '今日', week: '今週', month: '今月', prev: '先月', year: '年間' };
const range = p => md(S.periods[p].s) + (S.periods[p].s === S.periods[p].e ? '' : '〜' + md(S.periods[p].e));

// ----- ランキング -----
function drawRank() {
  const act = S.active, all = Object.keys(S.data);
  // 今日のMVP：今日の獲得がいちばん多い人（同数なら訪問が多い人）
  const mvp = act.map(n => kpi(get(n, 'day'))).map((k, i) => ({ n: act[i], w: k.won, v: k.visit }))
    .sort((a, b) => b.w - a.w || b.v - a.v)[0];
  const mvpHtml = '<div class="card mvp"><span class="crown">👑</span><div><small>今日のMVP（' + md(S.today) + '）</small>' +
    (mvp && mvp.w ? '<b>' + esc(mvp.n) + '</b>　獲得 <span class="num">' + mvp.w + '</span>件' : '<b>まだいません</b> <span class="sub">最初に獲得した人がMVP！</span>') + '</div></div>';
  // チーム目標（今月）：全員の合計（辞めた人の分も含む。シートと同じ）
  const tm = sumOf(all, 'month'), tk = kpi(tm), g = S.goals.team;
  const goalRow = (label, v, goal) => '<div class="goal"><div class="row"><span>' + label + '</span><span><b class="num">' + v + '</b> / ' + (goal == null ? '-' : goal) + '件（' + (goal ? pct(v, goal, 0) : '-') + '）</span></div>' + bar(v, goal, 'warn') + '</div>';
  const goalHtml = '<div class="card"><h2>チーム目標 <span class="sub">今月 ' + range('month') + '</span></h2>' + goalRow('獲得', tk.won, g.won) + goalRow('開通', tk.opened, g.opened) + '</div>';

  const board = (title, note, val, prodOf) => {
    const rows = act.map(n => { const x = get(n, rankP); return { n, v: val(x), p: prodOf(x) }; });
    rows.sort((a, b) => b.v - a.v);   // 同数はメンバーの並び順（シートと同じ）
    const max = Math.max(0, ...rows.map(r => r.v));
    const body = rows.map(r => {
      const pos = rows.filter(x => x.v > r.v).length + 1, medal = r.v > 0 && pos <= 3 ? ['🥇', '🥈', '🥉'][pos - 1] : '';
      const detail = S.products.filter(q => r.p[q]).map(q => esc(q) + ' ' + r.p[q]).join('・');
      return '<div class="rk' + (medal ? ' m' + pos : '') + '"><span class="pos">' + (medal || pos) + '</span><span class="nm">' + esc(r.n) + '</span>' +
        '<span class="ct">' + r.v + '<small>件</small></span><div class="dt"><div class="bar"><i style="width:' + (max ? r.v / max * 100 : 0) + '%"></i></div><span>' + detail + '</span></div></div>';
    }).join('');
    return '<div class="card"><h2>' + title + ' <span class="sub">' + note + '</span></h2>' + (body || '<div class="empty">在籍のメンバーがいません</div>') + '</div>';
  };
  $('rankBody').innerHTML = mvpHtml + '<div style="height:12px"></div>' + goalHtml +
    '<div class="periods" style="margin-top:16px">' + segBtns([['week', '今週'], ['month', '今月'], ['year', '年間']], rankP, 'data-rp') + ' <span class="sub">' + range(rankP) + '</span></div>' +
    '<div class="cards c2">' + board('獲得ランキング', '', x => x.c[RI('獲得')], x => x.wp) + board('開通ランキング', '工事完了日・キャンセル除く', x => x.o, x => x.op) + '</div>';
  $('rankBody').querySelectorAll('[data-rp]').forEach(b => b.onclick = () => { rankP = b.dataset.rp; drawRank(); });
}

// ----- 個人成績・KPI -----
$('kpiMode').querySelectorAll('button').forEach(b => b.onclick = () => {
  kpiMode = b.dataset.m; $('kpiMode').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); if (S) drawKpi();
});
function drawKpi() {
  if (kpiMode === 'one' && (kpiUnit === 'day' || kpiUnit === 'year')) { kpiUnit = 'month'; kpiOff = 0; }
  const P = kpiPeriod();
  if (!P.src) { $('kpiBody').innerHTML = periodBar(P) + '<div class="loading">読み込み中…</div>'; bindPeriod(); return; }
  if (kpiMode === 'all') drawKpiAll(P); else drawKpiOne(P);
}

// 日付（yyyy-MM-dd）の計算
const dkey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dof = k => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
const addDays = (k, n) => { const d = dof(k); d.setDate(d.getDate() + n); return dkey(d); };
const dim = k => new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0).getDate(); // その月の日数

// どの月・どの週でも：今の選び方（kpiUnit・kpiOff）の期間と、その数字のもと（src）
// 今週・今月・先月・今日・年間は stats の分を使い、それ以外は API に期間を指定して読む（statsRange）
const RC = {};
function kpiPeriod() {
  const t = S.today, u = kpiUnit, o = kpiOff;
  let s, e, full, key, label;
  if (u === 'day' || u === 'year') { key = u; s = S.periods[u].s; e = S.periods[u].e; label = u === 'day' ? '今日 ' + md(s) : s.slice(0, 4) + '年（1/1〜' + md(e) + '）'; }
  else if (u === 'month') {
    const d = dof(t); d.setDate(1); d.setMonth(d.getMonth() + o);
    s = dkey(d); full = addDays(s, dim(s) - 1); e = full < t ? full : t;
    key = o === 0 ? 'month' : o === -1 ? 'prev' : null;
    label = Number(s.slice(0, 4)) + '年' + Number(s.slice(5, 7)) + '月' + (o === 0 ? '（今月）' : o === -1 ? '（先月）' : '');
  } else {
    const d = dof(t); d.setDate(d.getDate() - (d.getDay() + 6) % 7 + o * 7);
    s = dkey(d); full = addDays(s, 6); e = full < t ? full : t;
    key = o === 0 ? 'week' : null;
    label = md(s) + '〜' + md(full) + (o === 0 ? '（今週）' : o === -1 ? '（先週）' : '');
  }
  // 目標：月はそのまま、週は「月の目標 ÷ その月の日数」を7日分足す。今日・年間は目標なし
  let scale = null;
  if (u === 'month') scale = 1;
  if (u === 'week') { scale = 0; for (let i = 0; i < 7; i++) scale += 1 / dim(addDays(s, i)); }
  const P = { u, s, e, full: full || e, label, scale };
  // 日ごとの推移は stats に今月・先月の分がある
  const inS = key && (u !== 'week' || s >= S.periods.prev.s);
  if (inS) P.src = { get: n => (S.data[n] && S.data[n][key]) || zero(), names: Object.keys(S.data), daily: S.daily, active: S.active, goals: S.goals, products: S.products };
  else {
    const c = RC[s + e];
    if (c && Date.now() - c.at < (e < t ? 300000 : 60000)) P.src = { get: n => c.r.data[n] ? c.r.data[n].r : zero(), names: Object.keys(c.r.data), daily: c.r.daily, active: c.r.active, goals: c.r.goals, products: c.r.products };
    else if (!(c && c.loading)) {
      RC[s + e] = Object.assign(c || {}, { loading: true });
      api('statsRange', s, e).then(r => { RC[s + e] = { at: Date.now(), r }; if (view === 'kpi') drawKpi(); },
        err => { delete RC[s + e]; toast(err.message); });
      if (c && c.r) P.src = { get: n => c.r.data[n] ? c.r.data[n].r : zero(), names: Object.keys(c.r.data), daily: c.r.daily, active: c.r.active, goals: c.r.goals, products: c.r.products };
    }
  }
  return P;
}
const gScale = (g, P) => g == null || P.scale == null ? null : g * P.scale;
const gFmt = g => g == null ? '-' : Number.isInteger(g) ? String(g) : g.toFixed(1);

// 期間の選び方：今日／週／月／年間（一人ずつは週／月）と、‹ › で前後の週・月へ
function periodBar(P) {
  const units = kpiMode === 'all' ? [['day', '今日'], ['week', '週'], ['month', '月'], ['year', '年間']] : [['week', '週'], ['month', '月']];
  const nav = P.u === 'week' || P.u === 'month' ? '<div class="pnav"><button data-off="-1" aria-label="前へ">‹</button><b>' + esc(P.label) + '</b><button data-off="1" aria-label="次へ"' + (kpiOff >= 0 ? ' disabled' : '') + '>›</button>' +
    (kpiOff ? '<button class="now" data-off="0">' + (P.u === 'week' ? '今週' : '今月') + 'へ</button>' : '') + '</div>' : '<div class="pnav"><b>' + esc(P.label) + '</b></div>';
  return '<div class="periods">' + segBtns(units, P.u, 'data-ku') + nav + '</div>';
}
function bindPeriod() {
  $('kpiBody').querySelectorAll('[data-ku]').forEach(b => b.onclick = () => { kpiUnit = b.dataset.ku; kpiOff = 0; drawKpi(); });
  $('kpiBody').querySelectorAll('[data-off]').forEach(b => b.onclick = () => { const d = Number(b.dataset.off); kpiOff = d ? kpiOff + d : 0; if (kpiOff > 0) kpiOff = 0; drawKpi(); });
}

function drawKpiAll(P) {
  const src = P.src, act = src.active, rg = src.goals.rate, withGoal = P.scale != null;
  const sum = names => { const t = zero(); names.forEach(n => { const x = src.get(n); x.c.forEach((v, i) => t.c[i] += v); t.o += x.o; t.ng += x.ng; }); return t; };
  const team = kpi(sum(act)), mg = src.goals.member;
  const teamGoal = { visit: gScale(act.reduce((s, n) => s + (mg[n] && mg[n].visit || 0), 0) || null, P), won: gScale(src.goals.team.won, P), opened: gScale(src.goals.team.opened, P) };
  const gOf = n => { const g = mg[n] || {}; return { visit: gScale(g.visit, P), won: gScale(g.won, P), opened: gScale(g.opened, P) }; };
  const rows = act.map(n => ({ n, k: kpi(src.get(n)), g: gOf(n) }));
  // 率の色：緑＝目標達成・赤＝チーム平均より下
  const cls = (v, goal, avg) => v == null ? '' : goal != null && v >= goal ? 'good' : avg != null && v < avg ? 'bad' : '';
  const rc = (k, isTeam) => [['rFace', rg.face], ['rTalk', rg.talk], ['rClose', rg.close], ['rWon', null]].map(([f, goal]) => ({ v: k[f], c: isTeam ? '' : cls(k[f], goal, team[f]) }));
  const ach = (v, g) => '<td class="ach">' + v + ' <span>/ ' + gFmt(g) + (g ? '（' + pct(v, g, 0) + '）' : '') + '</span>' + bar(v, g) + '</td>';
  const tr = (name, k, g, isTeam) => '<tr' + (isTeam ? ' class="team"' : ' data-who="' + esc(name) + '"') + '><td>' + esc(name) + '</td>' +
    (withGoal ? ach(k.visit, g.visit) : '<td>' + k.visit + '</td>') + '<td>' + k.face + '</td><td>' + k.talk + '</td>' +
    (withGoal ? ach(k.won, g.won) : '<td>' + k.won + '</td>') + '<td>' + k.ng + '</td>' + (withGoal ? ach(k.opened, g.opened) : '<td>' + k.opened + '</td>') +
    rc(k, isTeam).map(x => '<td class="' + x.c + '">' + rate(x.v) + '</td>').join('') + '</tr>';
  const gl = v => v == null ? '' : '<br><span style="font-weight:400">目標' + Math.round(v * 100) + '%</span>';
  const gh = withGoal ? '（目標）' : '';
  const table = '<div class="ktable wideonly"><table><thead><tr><th>名前</th><th>訪問' + gh + '</th><th>対面</th><th>提案</th><th>獲得' + gh + '</th><th>前確NG</th><th>開通' + gh + '</th>' +
    '<th>対面率' + gl(rg.face) + '</th><th>提案率' + gl(rg.talk) + '</th><th>成約率' + gl(rg.close) + '</th><th>獲得率</th></tr></thead><tbody>' +
    tr('チーム合計', team, teamGoal, true) + rows.map(r => tr(r.n, r.k, r.g)).join('') + '</tbody></table></div>';
  const card = (name, k, g, isTeam) => '<div class="kc' + (isTeam ? ' team' : '') + '"' + (isTeam ? '' : ' data-who="' + esc(name) + '"') + '><div class="t"><b>' + esc(name) + '</b><span class="sub">獲得率 ' + rate(k.rWon) + '</span></div>' +
    '<div class="nums">' + [['訪問', k.visit], ['対面', k.face], ['提案', k.talk], ['獲得', k.won], ['前確NG', k.ng], ['開通', k.opened]].map(([l, v]) => '<div>' + l + '<b>' + v + '</b></div>').join('') + '</div>' +
    '<div class="rates">' + rc(k, isTeam).slice(0, 3).map((x, i) => '<div class="' + x.c + '">' + ['対面率', '提案率', '成約率'][i] + '<b>' + rate(x.v) + '</b></div>').join('') + '<div>獲得率<b>' + rate(k.rWon) + '</b></div></div>' +
    (withGoal ? '<div class="achs">' + [['訪問', k.visit, g.visit], ['獲得', k.won, g.won], ['開通', k.opened, g.opened]].map(([l, v, gg]) => '<div>' + l + ' ' + v + '/' + gFmt(gg) + bar(v, gg) + '</div>').join('') + '</div>' : '') + '</div>';
  const cards = '<div class="kcards">' + card('チーム合計', team, teamGoal, true) + rows.map(r => card(r.n, r.k, r.g)).join('') + '</div>';
  const note = '<p class="sub knote">' + md(P.s) + '〜' + md(P.e) + '　緑＝目標達成・赤＝チーム平均より下。' + (P.u === 'week' ? '週の目標＝月の目標÷その月の日数×7日。' : '') + '名前を押すと一人ずつ</p>';
  $('kpiBody').innerHTML = periodBar(P) + note + table + cards;
  bindPeriod();
  $('kpiBody').querySelectorAll('[data-who]').forEach(el => el.onclick = () => { kpiWho = el.dataset.who; $('kpiMode').querySelector('[data-m=one]').click(); });
}

function drawKpiOne(P) {
  const src = P.src, names = src.active.slice();
  if (!kpiWho) kpiWho = names.includes(me) ? me : names[0] || '';
  if (kpiWho && !names.includes(kpiWho)) names.push(kpiWho);
  const n = kpiWho, x = src.get(n), k = kpi(x), g0 = src.goals.member[n] || {}, rg = src.goals.rate;
  const g = { visit: gScale(g0.visit, P), won: gScale(g0.won, P), opened: gScale(g0.opened, P) };
  const all = zero(); src.names.forEach(m => { const y = src.get(m); y.c.forEach((v, i) => all.c[i] += v); all.o += y.o; all.ng += y.ng; });
  const avg = kpi(all); // チーム平均＝全員の合計で計算（シートと同じ）
  const head = '<div class="oneHead"><select id="who">' + names.map(m => '<option' + (m === n ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select></div>';
  const big = '<div class="card span2"><h2>目標と達成' + (P.u === 'week' ? ' <span class="sub">週の目標＝月の目標÷その月の日数×7日</span>' : '') + '</h2><div class="big">' + [['訪問', k.visit, g.visit], ['獲得', k.won, g.won], ['開通', k.opened, g.opened]].map(([l, v, gg]) =>
    '<div><small>' + l + '</small><b>' + v + '</b><span class="g">目標 ' + gFmt(gg) + (gg ? '（' + pct(v, gg, 0) + '）' : '') + '</span>' + bar(v, gg) + '</div>').join('') + '</div></div>';
  const judge = (v, a, goal) => v == null ? '' : goal != null && v >= goal ? '<span class="badge green">◎ 目標達成</span>' : a != null && v >= a ? '<span class="badge blue">○ 平均以上</span>' : '<span class="badge red">△ 平均より下</span>';
  const rates = '<div class="card span2"><h2>率 <span class="sub">本人・チーム平均・目標</span></h2><table class="mini"><tr><th></th><th>本人</th><th>平均</th><th>目標</th><th>判定</th></tr>' +
    [['対面率', 'rFace', rg.face], ['提案率', 'rTalk', rg.talk], ['成約率', 'rClose', rg.close], ['獲得率', 'rWon', null]].map(([l, f, goal]) =>
      '<tr><td>' + l + '</td><td><b>' + rate(k[f]) + '</b></td><td>' + rate(avg[f]) + '</td><td>' + (goal == null ? '' : Math.round(goal * 100) + '%') + '</td><td class="j">' + judge(k[f], avg[f], goal) + '</td></tr>').join('') + '</table></div>';
  const mx = Math.max(1, ...x.c);
  const breakdown = '<div class="card"><h2>結果の内訳 <span class="sub">訪問 ' + k.visit + '件</span></h2>' + S.results.map((r, i) =>
    '<div class="hbar"><span>' + esc(r) + '</span><div class="bar"><i style="width:' + x.c[i] / mx * 100 + '%;background:' + (COLORS[r] || '#333') + '"></i></div><span>' + x.c[i] + '（' + pct(x.c[i], k.visit, 0) + '）</span></div>').join('') + '</div>';
  const prods = '<div class="card"><h2>商材別</h2><table class="mini"><tr><th>商材</th><th>獲得</th><th>開通</th></tr>' +
    src.products.map(q => '<tr><td>' + esc(q) + '</td><td>' + (x.wp[q] || 0) + '</td><td>' + (x.op[q] || 0) + '</td></tr>').join('') +
    '<tr><td><b>合計</b></td><td><b>' + k.won + '</b></td><td><b>' + k.opened + '</b></td></tr></table><p class="sub" style="margin:10px 0 0">前確NG ' + k.ng + '件</p></div>';
  const chart = '<div class="card span2 chart"><h2>日ごとの推移 <span class="sub">棒＝訪問、線＝獲得</span></h2>' + drawChart(src.daily[n] || {}, P.s, P.full) +
    '<div class="legend"><span><i style="background:#9aa8ba"></i>訪問</span><span><i style="background:#d9534f"></i>獲得</span></div></div>';
  $('kpiBody').innerHTML = periodBar(P) + head + (n ? '<div class="cards c4">' + big + rates + breakdown + prods + chart + '</div>' : '<div class="empty">在籍のメンバーがいません</div>');
  bindPeriod();
  if ($('who')) $('who').onchange = e => { kpiWho = e.target.value; drawKpi(); };
}

// 日ごとの推移（棒＝訪問・左の目盛り、線＝獲得・右の目盛り）。s〜e の日ごと（週は7日、月はその月の日数）
function drawChart(dd, s, e) {
  const keys = []; for (let k = s; k <= e; k = addDays(k, 1)) keys.push(k);
  const days = keys.length, week = days <= 7;
  const v = keys.map(k => (dd[k] || [0, 0])[0]), w = keys.map(k => (dd[k] || [0, 0])[1]);
  const W = innerWidth < 600 ? 400 : 720, H = innerWidth < 600 ? 230 : 240, L = 34, R = 30, T = 12, B = 26, cw = (W - L - R) / days;
  const top = n => [4, 8, 12, 20, 40, 60, 80, 100, 200, 400, 800].find(x => x >= n) || Math.ceil(n / 400) * 400;
  const vm = top(Math.max(...v)), wm = top(Math.max(...w)), yv = n => T + (H - T - B) * (1 - n / vm), yw = n => T + (H - T - B) * (1 - n / wm);
  let g = '';
  for (let i = 0; i <= 4; i++) { const yy = T + (H - T - B) * i / 4;
    g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e3e8f0"/>' +
      '<text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="#4b5567">' + Math.round(vm * (4 - i) / 4) + '</text>' +
      '<text x="' + (W - R + 6) + '" y="' + (yy + 4) + '" font-size="11" fill="#d9534f">' + +(wm * (4 - i) / 4).toFixed(1) + '</text>'; }
  v.forEach((n, i) => { if (n) g += '<rect x="' + (L + i * cw + cw * (week ? .25 : .15)) + '" y="' + yv(n) + '" width="' + cw * (week ? .5 : .7) + '" height="' + (H - B - yv(n)) + '" rx="2" fill="#9aa8ba"><title>' + md(keys[i]) + ' 訪問' + n + '</title></rect>'; });
  const last = keys[keys.length - 1] > S.today ? keys.indexOf(S.today) : days - 1;
  const pts = w.slice(0, last + 1).map((n, i) => (L + i * cw + cw / 2).toFixed(1) + ',' + yw(n).toFixed(1));
  if (pts.length) g += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#d9534f" stroke-width="2"/>' +
    w.slice(0, last + 1).map((n, i) => '<circle cx="' + (L + i * cw + cw / 2) + '" cy="' + yw(n) + '" r="' + (n ? 3.5 : 2) + '" fill="#d9534f"><title>' + md(keys[i]) + ' 獲得' + n + '</title></circle>').join('');
  const WD = '日月火水木金土';
  keys.forEach((k, i) => { if (week || i === 0 || (i + 1) % (W < 600 ? 7 : 5) === 0) g += '<text x="' + (L + i * cw + cw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#4b5567">' + md(k) + (week ? '(' + WD[dof(k).getDay()] + ')' : '') + '</text>'; });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="日ごとの推移">' + g + '</svg>';
}

// 開いたままでも1分ごとに集計を新しくする（見ている画面だけ）
setInterval(() => { if (!document.hidden && (view === 'rank' || view === 'kpi')) loadStats(); if (!document.hidden && view === 'cust') loadCust(); }, 60000);

// ===== はじまり =====
buildNav();
if (!store.get(KEY.pass, '')) showPass();
else if (!cfg) api('appConfig').then(c => { saveCfg(c); me && c.names.includes(me) ? start() : showNames(); }, e => { if ($('login').hidden) showPass(e.message); });
else {
  me && cfg.names.includes(me) ? start() : showNames();
  api('appConfig').then(c => { const changed = JSON.stringify(c) !== JSON.stringify(cfg); saveCfg(c); if (changed) { built = false; filled = false; if (!$('shell').hidden) { setupCounter(); } } }, () => {});
}

// 画面をスマホに保存しておく（電波が弱くても開ける）
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
