// ===== 訪問（au光のマンション訪問）=====
// 部屋ごとの訪問記録・部屋の形・自社メモ・⚠危険の印をシートに残し、アプリと受け渡しする。
// カウンター（活動ログ）と集計の式には触らない。カウンターへの記録は、アプリが今までどおり addRecords で送る。
// シートは最初に使ったときに自動で作る（setup を実行し直さなくてよい）。
//
// 部屋のキー：「物件ID#棟の番号-部屋番号」（例 1234#0-301）。棟のキー：「物件ID#棟の番号」（例 1234#0）

const VISIT_LOG_SHEET = '訪問記録', VISIT_LAY_SHEET = '部屋の形', VISIT_MEMO_SHEET = '自社メモ', VISIT_DANGER_SHEET = '危険の印';
// 訪問の結果（アプリのボタンと同じ）。カウンターへの対応：契約→獲得、加入済み→対象外、空室→数えない、ほかは同じ名前
const VISIT_RESULTS = ['不在', 'インターホンNG', 'フロントNG', 'トーク後NG', '検討', '契約', '加入済み', '空室'];
// 前のアプリの結果（記録は残すが、新しくは入れられない）
const VISIT_OLD_RESULTS = ['即ケコ'];
// 訪問記録の列：A日時 B日付 C名前 D物件ID E棟 F部屋 G結果 Hメモ I ID J取り消した日時
const VISIT_LOG_HEAD = ['日時', '日付', '名前', '物件ID', '棟', '部屋', '結果', 'メモ', 'ID', '取り消した日時'];
// 部屋の形の列：A棟のキー B形（JSON：f階数・n1階の部屋数・fp階ごとの部屋数・x存在しない部屋）C更新日時 D名前
const VISIT_LAY_HEAD = ['棟のキー', '形（JSON）', '更新日時', '名前'];
// 自社メモの列：A物件ID B内容（JSON：間取り・戸数など）C更新日時 D名前
const VISIT_MEMO_HEAD = ['物件ID', '内容（JSON）', '更新日時', '名前'];
// 危険の印の列：A部屋のキー B付けた人 C日時 Dメモ（印を外すと行を消す）
const VISIT_DANGER_HEAD = ['部屋のキー', '付けた人', '日時', 'メモ'];
// 直してほしい（アプリの「🛠 直してほしい」から。不具合・要望）：A日時 B名前 C種類 D内容 E画面 F端末 G直前のエラー H ID I対応（管理者が書く）
// ★気になる（だれがどの物件を気にしているか）：A物件ID B名前 C日時
const VISIT_FAV_SHEET = '気になる', VISIT_FAV_HEAD = ['物件ID', '名前', '日時'];
const FEEDBACK_SHEET = '直してほしい', FEEDBACK_HEAD = ['日時', '名前', '種類', '内容', '画面', '端末', '直前のエラー', 'ID', '対応'];
const FEEDBACK_KINDS = ['動かない', '使いにくい', 'こうしてほしい', 'その他'];

const ROOM_KEY_RE = /^[\w.]+#\d+-[^#\s]{1,20}$/, TOU_KEY_RE = /^[\w.]+#\d+$/, BID_RE = /^[\w.]+$/;

// シートを取り出す。無ければ見出しを付けて作る
function visitSheet_(ss, name, head) {
  let sh = ss.getSheetByName(name);
  if (sh) return sh;
  sh = ss.insertSheet(name, ss.getSheets().length);
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#0B1E30').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  return sh;
}

function visitRows_(sh, cols) {
  const n = sh.getLastRow();
  return n > 1 ? sh.getRange(2, 1, n - 1, cols).getValues() : [];
}

function visitClear_() { CacheService.getScriptCache().put('visitVer', String(Date.now()), 21600); }

// 全部の訪問データ（取り消した記録は除く）。アプリは起動時と、記録を送ったあとに取り直す
// recs: [[時刻(ミリ秒), 名前, 部屋のキー, 結果, メモ, ID], ...]（古い順）
// lays: {棟のキー: 形}、memos: {物件ID: 内容}、danger: {部屋のキー: {w 付けた人, t 時刻, m メモ}}
function visitPull() {
  const cache = CacheService.getScriptCache(), k = 'visit_' + (cache.get('visitVer') || '0'), hit = cache.get(k);
  if (hit) return JSON.parse(hit);
  const ss = ss_(), out = { recs: [], lays: {}, memos: {}, danger: {}, favs: {} };
  visitRows_(visitSheet_(ss, VISIT_LOG_SHEET, VISIT_LOG_HEAD), VISIT_LOG_HEAD.length).forEach(v => {
    if (!(v[0] instanceof Date) || v[9] !== '') return;
    out.recs.push([v[0].getTime(), String(v[2]), v[3] + '#' + v[4] + '-' + v[5], String(v[6]), String(v[7]), String(v[8])]);
  });
  out.recs.sort((a, b) => a[0] - b[0]);
  const json_ = s => { try { return JSON.parse(s); } catch (e) { return null; } };
  visitRows_(visitSheet_(ss, VISIT_LAY_SHEET, VISIT_LAY_HEAD), 2).forEach(v => { const o = json_(v[1]); if (v[0] && o) out.lays[v[0]] = o; });
  visitRows_(visitSheet_(ss, VISIT_MEMO_SHEET, VISIT_MEMO_HEAD), 2).forEach(v => { const o = json_(v[1]); if (v[0] && o) out.memos[v[0]] = o; });
  visitRows_(visitSheet_(ss, VISIT_DANGER_SHEET, VISIT_DANGER_HEAD), 4).forEach(v => {
    if (v[0]) out.danger[v[0]] = { w: String(v[1]), t: v[2] instanceof Date ? v[2].getTime() : 0, m: String(v[3]) };
  });
  visitRows_(visitSheet_(ss, VISIT_FAV_SHEET, VISIT_FAV_HEAD), 3).forEach(v => {
    if (v[0] && v[1]) (out.favs[v[0]] = out.favs[v[0]] || {})[String(v[1])] = v[2] instanceof Date ? v[2].getTime() : 0;
  });
  const json = JSON.stringify(out);
  if (json.length < 90000) cache.put(k, json, 300);
  return out;
}

// まとめて送る（電波がない間にスマホにたまった分も）。ops は古い順。1件ずつ：
//   {op:'rec',   id, name, ts, key, result, memo}  訪問の記録（同じ id は二重に入れない）
//   {op:'del',   id, name, rid}                    自分の記録 rid を取り消す（行は消さず、取り消した日時を入れる）
//   {op:'lay',   id, name, ts, key, lay}           棟の部屋の形（lay が null なら消す）
//   {op:'memo',  id, name, ts, bid, memo}          自社メモ（物件ごとに丸ごと置き換え）
//   {op:'dgr',   id, name, ts, key, on, memo}      ⚠危険の印を付ける（on:true）／外す（on:false）
//   {op:'fav',   id, name, ts, bid, on}            ★気になるを付ける（on:true）／外す（on:false）。「気になる」シートに1人1行
//   {op:'fb',    id, name, ts, kind, text, where, ua, err}  直してほしい（「直してほしい」シートに1行。同じ id は二重に入れない）
// 部屋の形・自社メモは、シートの方が新しければ上書きしない（電波が戻ったときに古い内容で消さないため）
// 返すもの：{ids: 受け取った id, data: visitPull() と同じもの}
function visitPush(ops) {
  if (!Array.isArray(ops)) throw new Error('送るものがありません');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = ss_(), done = [];
    const log = visitSheet_(ss, VISIT_LOG_SHEET, VISIT_LOG_HEAD), logRows = visitRows_(log, VISIT_LOG_HEAD.length);
    const seen = new Set(logRows.map(v => String(v[8]))), add = [];
    const upsert = visitUpsert_(ss);
    ops.forEach(o => {
      const name = String(o && o.name || '').trim(), ts = Number(o && o.ts) || Date.now();
      if (!o || !name) return;
      if (o.op === 'rec') {
        const m = String(o.key || '').match(/^(.+)#(\d+)-(.+)$/);
        if (seen.has(String(o.id)) || !m || !ROOM_KEY_RE.test(o.key) || !VISIT_RESULTS.includes(o.result)) return done.push(o.id);
        seen.add(String(o.id));
        const t = new Date(ts);
        add.push([t, dayOf_(t), name, m[1], Number(m[2]), m[3], o.result, String(o.memo || '').slice(0, 500), String(o.id), '']);
      } else if (o.op === 'del') {
        // まだシートに書いていない分（同じ送信の中）なら、書く前に外す
        const j = add.findIndex(r => r[8] === String(o.rid) && r[2] === name);
        if (j >= 0) add.splice(j, 1);
        else {
          const i = logRows.findIndex(v => String(v[8]) === String(o.rid) && String(v[2]) === name && v[9] === '');
          if (i >= 0) log.getRange(i + 2, 10).setValue(new Date());
        }
        visitUndoCounter_(ss, String(o.rid), name);
      } else if (o.op === 'lay') {
        if (TOU_KEY_RE.test(o.key)) upsert(VISIT_LAY_SHEET, VISIT_LAY_HEAD, o.key, o.lay == null ? null : JSON.stringify(o.lay), ts, name);
      } else if (o.op === 'memo') {
        if (BID_RE.test(o.bid) && o.memo && typeof o.memo === 'object') upsert(VISIT_MEMO_SHEET, VISIT_MEMO_HEAD, o.bid, JSON.stringify(o.memo), ts, name);
      } else if (o.op === 'dgr') {
        if (ROOM_KEY_RE.test(o.key)) visitDanger_(ss, o.key, !!o.on, name, ts, String(o.memo || '').slice(0, 500));
      } else if (o.op === 'fav') {
        if (BID_RE.test(o.bid) && name) visitFav_(ss, String(o.bid), name, !!o.on, ts);
      } else if (o.op === 'fb') {
        visitFeedback_(ss, o, name, ts);
      }
      done.push(o.id);
    });
    if (add.length) log.getRange(log.getLastRow() + 1, 1, add.length, VISIT_LOG_HEAD.length).setValues(add);
    visitClear_();
    return { ids: done, data: visitPull() };
  } finally {
    lock.releaseLock();
  }
}

// 部屋の形・自社メモを1行ずつ置き換える（A列がキー）。シートの更新日時の方が新しければ何もしない
function visitUpsert_(ss) {
  const rows = {};
  return (sheet, head, key, json, ts, name) => {
    const sh = visitSheet_(ss, sheet, head);
    if (!rows[sheet]) rows[sheet] = visitRows_(sh, 3);
    const i = rows[sheet].findIndex(v => String(v[0]) === key);
    if (i >= 0 && rows[sheet][i][2] instanceof Date && rows[sheet][i][2].getTime() > ts) return;
    if (json === null) {
      if (i >= 0) { sh.deleteRow(i + 2); rows[sheet].splice(i, 1); }
      return;
    }
    const v = [key, json, new Date(ts), name];
    if (i >= 0) { sh.getRange(i + 2, 1, 1, 4).setValues([v]); rows[sheet][i] = v; }
    else { sh.getRange(sh.getLastRow() + 1, 1, 1, 4).setValues([v]); rows[sheet].push(v); }
  };
}

// ★気になるを付ける（同じ人・同じ物件は1行だけ）／外す
function visitFav_(ss, bid, name, on, ts) {
  const sh = visitSheet_(ss, VISIT_FAV_SHEET, VISIT_FAV_HEAD), rows = visitRows_(sh, 3);
  const i = rows.findIndex(v => String(v[0]) === bid && String(v[1]) === name);
  if (on && i < 0) sh.getRange(sh.getLastRow() + 1, 1, 1, 3).setValues([[bid, name, new Date(ts)]]);
  if (!on && i >= 0) sh.deleteRow(i + 2);
}

function visitDanger_(ss, key, on, name, ts, memo) {
  const sh = visitSheet_(ss, VISIT_DANGER_SHEET, VISIT_DANGER_HEAD), rows = visitRows_(sh, 1), i = rows.findIndex(v => String(v[0]) === key);
  if (on && i < 0) sh.getRange(sh.getLastRow() + 1, 1, 1, 4).setValues([[key, name, new Date(ts), memo]]);
  if (!on && i >= 0) sh.deleteRow(i + 2);
}

// ===== 物件データ（訪問の物件リスト）=====
// 物件データは公開リポジトリに置かず、スプレッドシートの「物件データ」シートに入れる（作り方は Visit.gs の外、作者の手元）。
// シート：A1＝版、A2から下＝「x」＋ 圧縮した JSON（gzip を base64 にしたもの）を分けたもの。先頭の x は外してつなぐ
// アプリは持っている版を送る。同じ版なら中身は返さない（スマホに保存した分をそのまま使う）
const VISIT_DATA_SHEET = '物件データ';

// 返すもの：{ver: 版, same: true}（同じ版のとき）／{ver: 版, gz: 圧縮したデータ}／{ver: ''}（まだ入っていない）
function visitData(have) {
  const sh = ss_().getSheetByName(VISIT_DATA_SHEET), n = sh ? sh.getLastRow() : 0;
  if (n < 2) return { ver: '' };
  const ver = String(sh.getRange(1, 1).getValue()).trim();
  if (have && String(have) === ver) return { ver: ver, same: true };
  const gz = sh.getRange(2, 1, n - 1, 1).getValues().map(v => String(v[0]).trim().replace(/^x/, '')).join('');
  return { ver: ver, gz: gz };
}

// 訪問の記録を取り消したら、カウンター（活動ログ）に同じ ID で入っている1件も消す（獲得なら顧客進捗の行も）。
// undoLast と同じやり方。自分の記録だけ
function visitUndoCounter_(ss, id, name) {
  const log = ss.getSheetByName(LOG_SHEET);
  if (!log) return;
  const { rows, offset } = recent_(log);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][4]) !== id || rows[i][2] !== name) continue;
    log.deleteRow(offset + i);
    if (rows[i][3] === '獲得') AREAS.forEach(ar => {
      const a = appSheet_(ar, ss), n = a ? lastFilled_(a) : 0;
      const ids = n > 1 ? a.getRange(2, APP_HEAD.length, n - 1, 1).getValues().flat() : [];
      const j = ids.lastIndexOf(id);
      if (j >= 0) a.deleteRow(j + 2);
    });
    clearStats_();
    return;
  }
}

// 直してほしいことを「直してほしい」シートに1行足す（同じ ID は入れない）
function visitFeedback_(ss, o, name, ts) {
  const sh = visitSheet_(ss, FEEDBACK_SHEET, FEEDBACK_HEAD), id = String(o.id || '');
  const n = sh.getLastRow(), ids = n > 1 ? sh.getRange(2, 8, n - 1, 1).getValues().flat().map(String) : [];
  if (!id || ids.includes(id)) return;
  const cut = (v, m) => String(v || '').slice(0, m);
  sh.appendRow([new Date(ts), name, FEEDBACK_KINDS.includes(o.kind) ? o.kind : 'その他', cut(o.text, 2000), cut(o.where, 300), cut(o.ua, 200), cut(o.err, 300), id, '']);
}
