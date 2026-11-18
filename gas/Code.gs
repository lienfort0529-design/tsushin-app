// 光回線 訪問販売 カウンター・集計
// スプレッドシートの「拡張機能 → Apps Script」に貼り、setup を1回実行する
const TZ = 'Asia/Tokyo';
// 検討（2026-11-18〜）：話は聞いてもらえて、返事待ち。提案に数える（提案＝トーク後NG＋検討＋獲得）
const RESULTS = ['不在', 'インターホンNG', 'フロントNG', 'トーク後NG', '検討', '獲得', '対象外'];
const PRODUCTS = ['au光', 'au光＋', 'コミュファ光']; // 最初に「商材」シートに入れる分。増やすときはシートに書き足す
const MEMBER_SHEET = 'メンバー', LOG_SHEET = '活動ログ', APP_SHEET = '顧客進捗', STATS_SHEET = '個人成績', RANK_SHEET = 'ランキング', PRODUCT_SHEET = '商材';
const GOAL_SHEET = '目標', KPI_ALL_SHEET = 'KPI一覧', KPI_ONE_SHEET = 'KPI個人', DAY_GOAL_SHEET = '日の目標';
// 数式の中でのシート名
const M_ = "'" + MEMBER_SHEET + "'", L_ = "'" + LOG_SHEET + "'", A_ = "'" + APP_SHEET + "'", P_ = "'" + PRODUCT_SHEET + "'", G_ = "'" + GOAL_SHEET + "'";
// エリア（2026-11-18〜）：顧客進捗はエリアごとのシート、活動ログは G列「エリア」。集計のシートは「全体／大阪／名古屋」で切り替える
const AREAS = ['大阪', '名古屋'];
const APP_SHEETS = AREAS.map(a => APP_SHEET + '（' + a + '）');
const appSheetOf_ = area => APP_SHEETS[Math.max(0, AREAS.indexOf(area))];
// 別のスプレッドシートに置くエリア（2026-11-18〜 名古屋。見られる人を限るため）。そのファイルの ID はスクリプト プロパティ NAGOYA_BOOK_ID
// 元のスプレッドシートの集計（個人成績・ランキング・KPI）では、別ファイルのエリアの開通・前確NGは数えない（アプリの集計では数える）
const EXTERNAL_AREAS = ['名古屋'];
const EXTERNAL_BOOK_NAME = '通信インフラ事業（名古屋）';
const LOCAL_AREAS = AREAS.filter(a => !EXTERNAL_AREAS.includes(a));
// そのエリアの顧客進捗シート（別ファイルのエリアはそのファイルから。まだ移していなければ元のファイル）
function appSheet_(area, ss) {
  const name = appSheetOf_(area), id = EXTERNAL_AREAS.includes(area) && PropertiesService.getScriptProperties().getProperty('NAGOYA_BOOK_ID');
  return id ? SpreadsheetApp.openById(id).getSheetByName(name) : (ss || ss_()).getSheetByName(name);
}
const AREA_PICK = ['全体'].concat(AREAS);
// 数式を作っている間だけ、エリアを選ぶセル（例 '$D$1'）を入れておく。null ならエリアで分けない
let AREA_ = null;
const MAX_MEMBERS = 30;  // 個人成績・ランキングの行数
const MAX_PRODUCTS = 10; // 個人成績の商材別の列数
const PROTECT_NOTE = '自動計算（触るの禁止）';
// 顧客進捗（旧：申込一覧）の列：A申込日 B担当 Cお客様名 Dセイ（カナ） Eメイ（カナ） F商材 G【エントリーステータス】 Hエントリー日
//   Iジャンパ工事予定日 J【回線】契約ステータス K【NET】締結年月日 L【NET】課金開始日 M工事完了日 Nメモ O ID
const APP_HEAD = ['申込日', '担当', 'お客様名', 'セイ（カナ）', 'メイ（カナ）', '商材', '【エントリーステータス】', 'エントリー日', 'ジャンパ工事予定日',
  '【回線】契約ステータス', '【NET】締結年月日', '【NET】課金開始日', '工事完了日', 'メモ', 'ID'];
const ENTRY_STATUS = ['エントリー済み', 'エントリー前キャンセル', '確認依頼', 'キャンセル依頼済', '不備対応中', 'エントリー予約', 'キャンセル依頼',
  'フォローコールOK', 'フォローコールNG', 'フォローコール営業戻し', 'フォローコール長期不通', '値なし'];
const LINE_STATUS = ['有効', '手続中', '申込取消', '値なし'];
// 開通に数えないもの：契約ステータス「申込取消」、エントリーステータスのキャンセル系
const CANCEL_ENTRY = ['エントリー前キャンセル', 'キャンセル依頼', 'キャンセル依頼済'];
// メンバーの列：A名前 B在籍 C月の訪問目標 D月の獲得目標 E月の開通目標
// 目標シート：B2チームの月の獲得目標 B3チームの月の開通目標 B6対面率 B7提案率 B8成約率の目標
const MEDAL = { '🥇': '#fff4c2', '🥈': '#eceff3', '🥉': '#f8e3d0' };

// ===== 手動で実行するもの =====

// 初期設定：シートを作り、このスプレッドシートを記録先として覚える。作り済みのシートは触らない
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  ss.setSpreadsheetTimeZone(TZ);
  const made = [];
  if (!ss.getSheetByName(MEMBER_SHEET)) { setupMembers_(ss.insertSheet(MEMBER_SHEET)); made.push(MEMBER_SHEET); }
  if (!ss.getSheetByName(PRODUCT_SHEET)) { setupProducts_(ss.insertSheet(PRODUCT_SHEET)); made.push(PRODUCT_SHEET); }
  if (!ss.getSheetByName(GOAL_SHEET)) { setupGoals_(ss.insertSheet(GOAL_SHEET)); made.push(GOAL_SHEET); }
  if (!ss.getSheetByName(LOG_SHEET)) { setupLog_(ss.insertSheet(LOG_SHEET)); made.push(LOG_SHEET); }
  LOCAL_AREAS.map(appSheetOf_).forEach(n => { if (!ss.getSheetByName(n)) { setupApplications_(ss.insertSheet(n)); made.push(n); } });
  if (!ss.getSheetByName(STATS_SHEET)) { setupStats_(ss.insertSheet(STATS_SHEET)); made.push(STATS_SHEET); }
  if (!ss.getSheetByName(RANK_SHEET)) { setupRanking_(ss.insertSheet(RANK_SHEET)); made.push(RANK_SHEET); }
  if (!ss.getSheetByName(KPI_ALL_SHEET)) { setupKpiAll_(ss.insertSheet(KPI_ALL_SHEET)); made.push(KPI_ALL_SHEET); }
  if (!ss.getSheetByName(KPI_ONE_SHEET)) { setupKpiOne_(ss.insertSheet(KPI_ONE_SHEET)); made.push(KPI_ONE_SHEET); }
  if (!ss.getSheetByName(DAY_GOAL_SHEET)) { setupDayGoal_(ss.insertSheet(DAY_GOAL_SHEET)); made.push(DAY_GOAL_SHEET); }
  // 最初からある空のシートは消す
  ss.getSheets().forEach(sh => {
    if (/^(シート|Sheet)\d+$/.test(sh.getName()) && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  orderSheets_(ss);
  Logger.log(made.length ? '作成: ' + made.join('・') : '作り済み（変更なし）');
}

// 商材を入れる前に作ったスプレッドシート用（1回だけ実行）：
// 商材シートを作り、申込一覧のC列の後ろに「商材」列を足し、個人成績・ランキングを作り直す（記録は消えない）
function upgradeProducts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), done = [];
  if (!ss.getSheetByName(PRODUCT_SHEET)) { setupProducts_(ss.insertSheet(PRODUCT_SHEET)); done.push('商材シートを作成'); }
  const log = ss.getSheetByName(LOG_SHEET);
  if (log.getRange('F1').getValue() !== '商材') { log.getRange('F1').setValue('商材').setFontWeight('bold').setBackground('#e8eaed'); done.push('活動ログにF列「商材」'); }
  const a = ss.getSheetByName(APP_SHEET);
  if (!hasHeader_(a, '商材')) {
    a.insertColumnBefore(4);
    a.getRange('D1').setValue('商材');
    productValidation_(ss, a);
    done.push('申込一覧にD列「商材」');
  }
  const period = ss.getSheetByName(STATS_SHEET) ? ss.getSheetByName(STATS_SHEET).getRange('B1').getValue() : '';
  [STATS_SHEET, RANK_SHEET].forEach(n => { const sh = ss.getSheetByName(n); if (sh) ss.deleteSheet(sh); });
  setupStats_(ss.insertSheet(STATS_SHEET));
  if (period) ss.getSheetByName(STATS_SHEET).getRange('B1').setValue(period);
  setupRanking_(ss.insertSheet(RANK_SHEET));
  done.push('個人成績・ランキングを作り直し');
  orderSheets_(ss);
  Logger.log(done.join(' / '));
}

// KPI・ランキングを入れる前に作ったスプレッドシート用（1回だけ実行）：
// メンバーに目標の列、目標シート、KPI一覧・KPI個人を足し、ランキングを作り直す（記録は消えない）
function upgradeKpi() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), done = [];
  if (!hasHeader_(ss.getSheetByName(APP_SHEET), '商材')) { upgradeProducts(); done.push('商材の更新'); }
  const m = ss.getSheetByName(MEMBER_SHEET);
  if (m.getRange('C1').getValue() !== '月の訪問目標') {
    m.getRange('D1').clearContent(); // 前の説明書き
    memberHeader_(m);
    done.push('メンバーに目標の列');
  }
  if (!ss.getSheetByName(GOAL_SHEET)) { setupGoals_(ss.insertSheet(GOAL_SHEET)); done.push('目標シートを作成'); }
  [RANK_SHEET, KPI_ALL_SHEET, KPI_ONE_SHEET].forEach(n => { const sh = ss.getSheetByName(n); if (sh) ss.deleteSheet(sh); });
  setupRanking_(ss.insertSheet(RANK_SHEET));
  setupKpiAll_(ss.insertSheet(KPI_ALL_SHEET));
  setupKpiOne_(ss.insertSheet(KPI_ONE_SHEET));
  done.push('ランキング・KPI一覧・KPI個人を作成');
  orderSheets_(ss);
  Logger.log(done.join(' / '));
}

// セイ・メイ（カナ）を入れる前に作ったスプレッドシート用（1回だけ実行）：
// 申込一覧のお客様名の右に「セイ（カナ）」「メイ（カナ）」の列を足し、集計のシートを作り直す（記録は消えない）
function upgradeKana() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), a = ss.getSheetByName(APP_SHEET);
  if (!hasHeader_(a, '商材')) upgradeProducts();
  if (hasHeader_(a, 'セイ（カナ）')) return Logger.log('作り済み（変更なし）');
  a.insertColumnsAfter(3, 2);
  a.getRange('D1:E1').setValues([['セイ（カナ）', 'メイ（カナ）']]).setFontWeight('bold').setBackground('#e8eaed');
  a.getRange('D2:E').clearDataValidations();
  a.setColumnWidths(4, 2, 120);
  const period = ss.getSheetByName(STATS_SHEET) ? ss.getSheetByName(STATS_SHEET).getRange('B1').getValue() : '';
  [STATS_SHEET, RANK_SHEET, KPI_ALL_SHEET, KPI_ONE_SHEET].forEach(n => { const sh = ss.getSheetByName(n); if (sh) ss.deleteSheet(sh); });
  setupStats_(ss.insertSheet(STATS_SHEET));
  if (period) ss.getSheetByName(STATS_SHEET).getRange('B1').setValue(period);
  setupRanking_(ss.insertSheet(RANK_SHEET));
  setupKpiAll_(ss.insertSheet(KPI_ALL_SHEET));
  setupKpiOne_(ss.insertSheet(KPI_ONE_SHEET));
  orderSheets_(ss);
  Logger.log('申込一覧にD列「セイ（カナ）」・E列「メイ（カナ）」を追加 / 個人成績・ランキング・KPIを作り直し');
}

// 顧客進捗を新しい列（エントリーステータス〜工事完了日）に作り直し、集計のシートも作り直す（1回だけ実行）。
// 顧客進捗にまだ記録がないときだけ動く
function upgradeEntry() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), a = ss.getSheetByName(APP_SHEET);
  if (hasHeader_(a, APP_HEAD[6])) return Logger.log('作り済み（変更なし）');
  if (lastFilled_(a) > 1) return Logger.log('顧客進捗に記録があるので止めました（列がずれるため）');
  a.showColumns(1, a.getMaxColumns());
  a.getRange(1, 1, a.getMaxRows(), a.getMaxColumns()).clearDataValidations().clear();
  setupApplications_(a);
  const period = ss.getSheetByName(STATS_SHEET) ? ss.getSheetByName(STATS_SHEET).getRange('B1').getValue() : '';
  [STATS_SHEET, RANK_SHEET, KPI_ALL_SHEET, KPI_ONE_SHEET].forEach(n => { const sh = ss.getSheetByName(n); if (sh) ss.deleteSheet(sh); });
  setupStats_(ss.insertSheet(STATS_SHEET));
  if (period) ss.getSheetByName(STATS_SHEET).getRange('B1').setValue(period);
  setupRanking_(ss.insertSheet(RANK_SHEET));
  setupKpiAll_(ss.insertSheet(KPI_ALL_SHEET));
  setupKpiOne_(ss.insertSheet(KPI_ONE_SHEET));
  orderSheets_(ss);
  Logger.log('顧客進捗を新しい列に作り直し / 個人成績・ランキング・KPIを作り直し');
}

// エリア（大阪／名古屋）を入れる前に作ったスプレッドシート用（1回だけ実行）：
// 「顧客進捗」を「顧客進捗（大阪）」に名前を変え、「顧客進捗（名古屋）」を作る。活動ログに G列「エリア」。集計のシートを作り直す（記録は消えない）
function upgradeArea() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), done = [];
  const old = ss.getSheetByName(APP_SHEET);
  if (old && !ss.getSheetByName(APP_SHEETS[0])) { old.setName(APP_SHEETS[0]); done.push(APP_SHEET + ' → ' + APP_SHEETS[0]); }
  LOCAL_AREAS.map(appSheetOf_).forEach(n => { if (!ss.getSheetByName(n)) { setupApplications_(ss.insertSheet(n)); done.push(n + 'を作成'); } });
  const log = ss.getSheetByName(LOG_SHEET);
  if (log.getRange('G1').getValue() !== 'エリア') { log.getRange('G1').setValue('エリア').setFontWeight('bold').setBackground('#e8eaed'); done.push('活動ログにG列「エリア」'); }
  const period = ss.getSheetByName(STATS_SHEET) ? ss.getSheetByName(STATS_SHEET).getRange('B1').getValue() : '';
  [STATS_SHEET, RANK_SHEET, KPI_ALL_SHEET, KPI_ONE_SHEET].forEach(n => { const sh = ss.getSheetByName(n); if (sh) ss.deleteSheet(sh); });
  setupStats_(ss.insertSheet(STATS_SHEET));
  if (period) ss.getSheetByName(STATS_SHEET).getRange('B1').setValue(period);
  setupRanking_(ss.insertSheet(RANK_SHEET));
  setupKpiAll_(ss.insertSheet(KPI_ALL_SHEET));
  setupKpiOne_(ss.insertSheet(KPI_ONE_SHEET));
  done.push('個人成績・ランキング・KPIをエリアの切り替えつきで作り直し');
  orderSheets_(ss);
  clearStats_();
  Logger.log(done.join(' / '));
}

// 「検討」を入れる前に作ったスプレッドシート用（1回だけ実行。実行する日は相談して決める）：
// 個人成績（トーク後NGと獲得の間に「検討」の列）・ランキング・KPI一覧・KPI個人を作り直す（活動ログ・顧客進捗の記録は消えない）
function upgradeKentou() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), st = ss.getSheetByName(STATS_SHEET);
  if (st && st.getRange('J5').getValue() === '検討') return Logger.log('作り済み（変更なし）');
  const period = st ? st.getRange('B1').getValue() : '';
  [STATS_SHEET, RANK_SHEET, KPI_ALL_SHEET, KPI_ONE_SHEET].forEach(n => { const sh = ss.getSheetByName(n); if (sh) ss.deleteSheet(sh); });
  setupStats_(ss.insertSheet(STATS_SHEET));
  if (period) ss.getSheetByName(STATS_SHEET).getRange('B1').setValue(period);
  setupRanking_(ss.insertSheet(RANK_SHEET));
  setupKpiAll_(ss.insertSheet(KPI_ALL_SHEET));
  setupKpiOne_(ss.insertSheet(KPI_ONE_SHEET));
  orderSheets_(ss);
  clearStats_();
  Logger.log('個人成績に「検討」の列 / 提案＝トーク後NG＋検討＋獲得 / ランキング・KPIを作り直し');
}

// 名古屋の顧客進捗を別のスプレッドシートに移す（1回だけ実行。もう一度実行すると商材の選択肢だけ新しくする）：
// 「通信インフラ事業（名古屋）」を作り（ID をスクリプト プロパティ NAGOYA_BOOK_ID に覚える）、このファイルの「顧客進捗（名古屋）」の行を移して、このファイルからは消す。
// 集計のシートを作り直す（名古屋の開通・前確NGはこのファイルでは数えない）
function migrateNagoya() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), props = PropertiesService.getScriptProperties(), done = [];
  let book, id = props.getProperty('NAGOYA_BOOK_ID');
  if (id) book = SpreadsheetApp.openById(id);
  else {
    book = SpreadsheetApp.create(EXTERNAL_BOOK_NAME);
    book.setSpreadsheetTimeZone(TZ);
    props.setProperty('NAGOYA_BOOK_ID', book.getId());
    done.push('「' + EXTERNAL_BOOK_NAME + '」を作成 ' + book.getUrl());
  }
  EXTERNAL_AREAS.forEach(area => {
    const name = appSheetOf_(area);
    let dst = book.getSheetByName(name);
    if (!dst) {
      dst = book.getSheets()[0].getName().match(/^(シート|Sheet)\d+$/) && book.getSheets()[0].getLastRow() === 0 ? book.getSheets()[0].setName(name) : book.insertSheet(name);
      setupApplications_(dst);
      done.push(name + 'を作成');
    } else productValidation_(book, dst);
    const src = ss.getSheetByName(name);
    if (src) {
      const n = lastFilled_(src);
      if (n > 1) {
        const rows = src.getRange(2, 1, n - 1, APP_HEAD.length).getValues();
        dst.getRange(lastFilled_(dst) + 1, 1, rows.length, APP_HEAD.length).setValues(rows);
      }
      ss.deleteSheet(src);
      done.push(name + 'の' + Math.max(0, n - 1) + '行を移して、このファイルから削除');
    }
  });
  const period = ss.getSheetByName(STATS_SHEET) ? ss.getSheetByName(STATS_SHEET).getRange('B1').getValue() : '';
  [STATS_SHEET, RANK_SHEET, KPI_ALL_SHEET, KPI_ONE_SHEET].forEach(n => { const sh = ss.getSheetByName(n); if (sh) ss.deleteSheet(sh); });
  setupStats_(ss.insertSheet(STATS_SHEET));
  if (period) ss.getSheetByName(STATS_SHEET).getRange('B1').setValue(period);
  setupRanking_(ss.insertSheet(RANK_SHEET));
  setupKpiAll_(ss.insertSheet(KPI_ALL_SHEET));
  setupKpiOne_(ss.insertSheet(KPI_ONE_SHEET));
  done.push('個人成績・ランキング・KPIを作り直し');
  orderSheets_(ss);
  clearStats_();
  Logger.log(done.join(' / '));
}

function hasHeader_(sh, label) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].includes(label);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('光回線管理').addItem('初期設定', 'setup').addToUi();
}

// ===== シートの作成 =====

function orderSheets_(ss) {
  [RANK_SHEET, KPI_ALL_SHEET, KPI_ONE_SHEET, STATS_SHEET, MEMBER_SHEET, GOAL_SHEET].concat(APP_SHEETS, [PRODUCT_SHEET, DAY_GOAL_SHEET, LOG_SHEET])
    .filter(n => ss.getSheetByName(n)).forEach((n, i) => { ss.setActiveSheet(ss.getSheetByName(n)); ss.moveActiveSheet(i + 1); });
}

function setupMembers_(sh) {
  memberHeader_(sh);
  sh.getRange(2, 2, 100, 1).insertCheckboxes();
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 160);
}

function memberHeader_(sh) {
  sh.getRange('A1:E1').setValues([['名前', '在籍', '月の訪問目標', '月の獲得目標', '月の開通目標']]).setFontWeight('bold').setBackground('#e8eaed');
  sh.getRange('C2:E101').setBackground('#fff2cc');
  sh.setColumnWidths(3, 3, 100);
  sh.getRange('G1').setValue('名前を入れて「在籍」にチェック → アプリ・ランキング・KPIに出ます。辞めた人はチェックを外す（記録は残ります）。黄色の目標はKPIの達成率に使います。');
}

// チーム目標と率の目標（黄色のセルを書き換える）
function setupGoals_(sh) {
  sh.getRange('A1').setValue('チーム目標（月）').setFontWeight('bold');
  sh.getRange('A2:B3').setValues([['獲得', 100], ['開通', 80]]);
  sh.getRange('A5').setValue('率の目標（全員共通）').setFontWeight('bold');
  sh.getRange('A6:B8').setValues([['対面率', 0.3], ['提案率', 0.5], ['成約率', 0.3]]);
  sh.getRange('B6:B8').setNumberFormat('0%');
  sh.getRangeList(['B2:B3', 'B6:B8']).setBackground('#fff2cc');
  sh.getRange('D1').setValue('黄色のセルを書き換える。チーム目標はランキングの達成バー、率の目標はKPIの色分けに使います。メンバーごとの目標は「メンバー」シートのC〜E列。');
  sh.setColumnWidth(1, 160);
}

function setupProducts_(sh) {
  sh.getRange('A1').setValue('商材').setFontWeight('bold').setBackground('#e8eaed');
  sh.getRange(2, 1, PRODUCTS.length, 1).setValues(PRODUCTS.map(p => [p]));
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 160);
  sh.getRange('C1').setValue('下に書き足すと、アプリの選択肢・個人成績・ランキングに自動で出ます（最大' + MAX_PRODUCTS + '個）。名前を変えると過去の記録と別の商材になるので注意。');
}

function setupLog_(sh) {
  sh.getRange('A1:G1').setValues([['日時', '日付', '名前', '結果', 'ID', '商材', 'エリア']]).setFontWeight('bold').setBackground('#e8eaed');
  sh.getRange('A:A').setNumberFormat('yyyy/MM/dd HH:mm:ss');
  sh.getRange('B:B').setNumberFormat('yyyy/MM/dd');
  sh.setFrozenRows(1);
  sh.protect().setDescription(PROTECT_NOTE).setWarningOnly(true);
}

function setupApplications_(sh) {
  sh.getRange(1, 1, 1, APP_HEAD.length).setValues([APP_HEAD]).setFontWeight('bold').setBackground('#e8eaed').setWrap(true);
  const date = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build();
  ['A:A', 'H:H', 'I:I', 'K:K', 'L:L', 'M:M'].forEach(c => sh.getRange(c).setNumberFormat('yyyy/MM/dd'));
  ['H2:H', 'I2:I', 'K2:K', 'L2:L', 'M2:M'].forEach(c => sh.getRange(c).setDataValidation(date));
  productValidation_(sh.getParent(), sh);
  sh.getRange('G2:G').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ENTRY_STATUS, true).build());
  sh.getRange('J2:J').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(LINE_STATUS, true).build());
  sh.setFrozenRows(1);
  sh.hideColumns(APP_HEAD.length); // ID（アプリの取り消し用）
  sh.setColumnWidth(3, 160); sh.setColumnWidths(4, 2, 110); sh.setColumnWidths(7, 7, 130); sh.setColumnWidth(14, 240);
}

function productValidation_(ss, sh) {
  const p = ss.getSheetByName(PRODUCT_SHEET);
  // 別ファイル（名古屋）には商材シートがないので、今の商材を選択肢にする（商材を足したら migrateNagoya を実行し直すと増える）
  sh.getRange('F2:F').setDataValidation(p ? SpreadsheetApp.newDataValidation().requireValueInRange(p.getRange('A2:A'), true).build()
    : SpreadsheetApp.newDataValidation().requireValueInList(products_(ss_()), true).build());
}

// 個人成績：B1で期間を選ぶ。7行目からメンバー、6行目がチーム合計。R列から商材別の獲得、AC列から商材別の開通
function setupStats_(sh) {
  sh.getRange('A1:A3').setValues([['期間'], ['開始'], ['終了']]).setFontWeight('bold');
  sh.getRange('B1').setValue('今月').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['今日', '今週', '今月', '年間'], true).build()).setBackground('#fff2cc');
  sh.getRange('B2').setFormula('=IFS(B1="今日",TODAY(),B1="今週",TODAY()-WEEKDAY(TODAY(),3),B1="今月",EOMONTH(TODAY(),-1)+1,B1="年間",DATE(YEAR(TODAY()),1,1))');
  sh.getRange('B3').setFormula('=TODAY()');
  sh.getRange('B2:B3').setNumberFormat('yyyy/MM/dd');
  areaPicker_(sh, 'C1', 'D1');
  sh.getRange('E1').setValue('← 黄色のセルで期間・エリアを切り替え（週は月曜から、年間は1月から）');
  AREA_ = '$D$1';

  const head = ['名前', '訪問', '不在', 'インターホンNG', '対面', 'フロントNG', '対象外', '提案', 'トーク後NG', '検討', '獲得', '前確NG', '開通', '対面率', '提案率', '成約率', '獲得率'];
  sh.getRange(5, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e8eaed');
  const last = 6 + MAX_MEMBERS;
  const sum = c => '=SUM(' + c + '7:' + c + last + ')';
  sh.getRange(6, 1, 1, head.length).setFormulas([['チーム合計', sum('B'), sum('C'), sum('D'), sum('E'), sum('F'), sum('G'), sum('H'), sum('I'), sum('J'), sum('K'), sum('L'), sum('M'),
    rate_('E', 'B', 6), rate_('H', 'E', 6), rate_('K', 'H', 6), rate_('K', 'B', 6)]]).setFontWeight('bold').setBackground('#f3f6fc');
  sh.getRange('A6').setValue('チーム合計');

  sh.getRange('A7').setFormula('=IFERROR(FILTER(' + M_ + '!A2:A,' + M_ + '!A2:A<>"",' + M_ + '!B2:B=TRUE),"")');

  const rows = [];
  for (let r = 7; r <= last; r++) {
    const cnt = res => '=IF($A' + r + '="","",' + logCount_('$A' + r, res, '$B$2', '$B$3') + ')';
    const blank = f => '=IF($A' + r + '="","",' + f + ')';
    rows.push([
      blank('C' + r + '+D' + r + '+E' + r),          // 訪問
      cnt('不在'), cnt('インターホンNG'),
      blank('F' + r + '+G' + r + '+H' + r),          // 対面＝フロントNG＋対象外＋提案
      cnt('フロントNG'), cnt('対象外'),
      blank('I' + r + '+J' + r + '+K' + r),          // 提案＝トーク後NG＋検討＋獲得
      cnt('トーク後NG'), cnt('検討'), cnt('獲得'),
      blank(ngCount_('$A' + r, '$B$2', '$B$3')),
      blank(opened_('$A' + r, '$B$2', '$B$3')),
      rate_('E', 'B', r), rate_('H', 'E', r), rate_('K', 'H', r), rate_('K', 'B', r),
    ]);
  }
  sh.getRange(7, 2, MAX_MEMBERS, 16).setFormulas(rows);
  sh.getRange(6, 14, MAX_MEMBERS + 1, 4).setNumberFormat('0.0%');

  // 商材別：商材シートの並びで列が自動で増える
  const names = '$A$7:$A$' + last, products = 'TOCOL(' + P_ + '!$A$2:$A,1)';
  [['商材別 獲得', 18, logCount_('x', '獲得', '$B$2', '$B$3', 'q')],
   ['商材別 開通', 18 + MAX_PRODUCTS + 1, opened_('x', '$B$2', '$B$3', 'q')]].forEach(([title, col, f]) => {
    const block = sh.getRange(7, col, MAX_MEMBERS, MAX_PRODUCTS).getA1Notation();
    sh.getRange(4, col).setValue(title).setFontWeight('bold');
    sh.getRange(5, col, 1, MAX_PRODUCTS).setBackground('#e8eaed').setFontWeight('bold');
    sh.getRange(5, col).setFormula('=IFERROR(TRANSPOSE(' + products + '),"")');
    sh.getRange(6, col, 1, MAX_PRODUCTS).setBackground('#f3f6fc').setFontWeight('bold');
    sh.getRange(6, col).setFormula('=IFERROR(BYCOL(' + block + ',LAMBDA(c,IF(COUNT(c)=0,"",SUM(c)))),"")');
    sh.getRange(7, col).setFormula('=IFERROR(LET(p,' + products + ',n,' + names + ',MAKEARRAY(ROWS(n),ROWS(p),LAMBDA(i,j,LET(x,INDEX(n,i),q,INDEX(p,j),IF(x="","",' + f + '))))),"")');
  });

  AREA_ = null;
  sh.setFrozenRows(5); sh.setFrozenColumns(1);
  sh.setColumnWidth(1, 120);
  sh.protect().setDescription(PROTECT_NOTE).setWarningOnly(true).setUnprotectedRanges([sh.getRange('B1'), sh.getRange('D1')]);
}

// ランキング：上に今日のMVPとチーム目標の達成バー、その下に獲得・開通のランキング（今週・今月・年間）
function setupRanking_(sh) {
  const periods = [['今週', 'TODAY()-WEEKDAY(TODAY(),3)'], ['今月', MONTH_START], ['年間', 'DATE(YEAR(TODAY()),1,1)']];
  const members = membersF_(), products = productsF_();
  const won = (s, q) => logCount_('x', '獲得', s, 'TODAY()', q);
  sh.getRange('A1').setValue('🏆 ランキング').setFontWeight('bold').setFontSize(18);
  areaPicker_(sh, 'G1', 'H1');
  AREA_ = '$H$1';

  // 今日のMVP：今日の獲得がいちばん多い人（同数なら訪問が多い人）
  sh.getRange('A2').setValue('今日のMVP').setFontWeight('bold');
  sh.getRange('B2:K2').merge().setFontSize(16).setFontWeight('bold').setBackground('#fff4c2');
  sh.getRange('B2').setFormula(
    '=IFERROR(LET(n,' + members + ',c,MAP(n,LAMBDA(x,' + logCount_('x', '獲得', 'TODAY()', 'TODAY()') + ')),v,MAP(n,LAMBDA(x,' + logCount_('x', null, 'TODAY()', 'TODAY()') + ')),' +
    's,SORT(HSTACK(n,c,v),2,FALSE,3,FALSE),IF(INDEX(s,1,2)=0,"まだいません（最初に獲得した人がMVP！）","👑 "&INDEX(s,1,1)&"　獲得 "&INDEX(s,1,2)&"件")),"まだいません")');

  // チーム目標（今月）
  sh.getRange('A3').setValue('チーム目標（今月）').setFontWeight('bold');
  [['獲得', logCount_(null, '獲得', MONTH_START, 'TODAY()'), G_ + '!$B$2', 4], ['開通', opened_(null, MONTH_START, 'TODAY()'), G_ + '!$B$3', 5]].forEach(([label, now, goal, r]) => {
    sh.getRange(r, 1).setValue(label);
    sh.getRange(r, 2).setFormula('=LET(a,' + now + ',g,' + goal + ',a&" / "&g&"件（"&IF(N(g)=0,"-",TEXT(a/g,"0%"))&"）")').setFontWeight('bold');
    sh.getRange(r, 4, 1, 8).merge();
    sh.getRange(r, 4).setFormula('=LET(a,' + now + ',g,' + goal + ',IF(N(g)=0,"",SPARKLINE(MIN(a/g,1),{"charttype","bar";"max",1;"color1",IF(a>=g,"#27ae60","#f39c12")})))');
  });

  const blocks = [
    { title: '獲得ランキング', top: 7, count: won },
    { title: '開通ランキング（開通日で数える・キャンセル除く）', top: MAX_MEMBERS + 13, count: (s, q) => opened_('x', s, 'TODAY()', q) },
  ];
  const rules = [];
  blocks.forEach(b => {
    sh.getRange(b.top, 1).setValue(b.title).setFontWeight('bold').setFontSize(14);
    periods.forEach(([label, start], i) => {
      const col = 1 + i * 6, first = b.top + 4;
      sh.getRange(b.top + 1, col).setValue(label).setFontWeight('bold');
      sh.getRange(b.top + 2, col).setFormula('=' + start).setNumberFormat('M/d"〜"');
      sh.getRange(b.top + 3, col, 1, 5).setValues([['順位', '名前', '件数', 'グラフ', '内訳']]).setFontWeight('bold').setBackground('#e8eaed');
      const s = abs_(sh.getRange(b.top + 2, col).getA1Notation());
      const detail = 'MAP(n,LAMBDA(x,TEXTJOIN("・",TRUE,MAP(' + products + ',LAMBDA(q,LET(k,' + b.count(s, 'q') + ',IF(k=0,"",q&" "&k)))))))';
      const bar = 'MAP(c,LAMBDA(k,IF(MAX(c)=0,"",REPT("█",ROUND(k/MAX(c)*10)))))';
      sh.getRange(first, col + 1).setFormula('=IFERROR(LET(n,' + members + ',c,MAP(n,LAMBDA(x,' + b.count(s) + ')),SORT(HSTACK(n,c,' + bar + ',' + detail + '),2,FALSE)),"")');
      const cnt = sh.getRange(first, col + 2, MAX_MEMBERS, 1).getA1Notation();
      // 上位3人はメダル（0件はメダルなし）
      sh.getRange(first, col).setFormula('=ARRAYFORMULA(IF(' + cnt + '="","",LET(r,COUNTIF(' + cnt + ',">"&' + cnt + ')+1,IF(' + cnt + '=0,r&"",IF(r=1,"🥇",IF(r=2,"🥈",IF(r=3,"🥉",r&"")))))))');
      const area = sh.getRange(first, col, MAX_MEMBERS, 5), rankCell = '$' + sh.getRange(first, col).getA1Notation().replace(/\d+/, '') + first;
      Object.keys(MEDAL).forEach(m => rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=' + rankCell + '="' + m + '"')
        .setBackground(MEDAL[m]).setBold(true).setRanges([area]).build()));
      sh.getRange(first, col, MAX_MEMBERS, 1).setHorizontalAlignment('center').setFontSize(13);
      sh.getRange(first, col + 3, MAX_MEMBERS, 1).setFontColor('#f39c12');
    });
  });
  AREA_ = null;
  sh.setConditionalFormatRules(rules);
  [1, 7, 13].forEach(c => { sh.setColumnWidth(c, 50); sh.setColumnWidth(c + 1, 110); sh.setColumnWidth(c + 2, 50); sh.setColumnWidth(c + 3, 110); sh.setColumnWidth(c + 4, 170); sh.setColumnWidth(c + 5, 20); });
  sh.setColumnWidth(2, 110);
  sh.protect().setDescription(PROTECT_NOTE).setWarningOnly(true).setUnprotectedRanges([sh.getRange('H1')]);
}

// KPI一覧：全員の今月（または先月）を目標と並べる。率は 緑＝目標達成・赤＝チーム平均より下
function setupKpiAll_(sh) {
  sh.getRange('A1').setValue('KPI一覧').setFontWeight('bold').setFontSize(16);
  monthPicker_(sh, 'B2', 'B3', 'C3');
  sh.getRange('A2').setValue('対象月').setFontWeight('bold');
  sh.getRange('A3').setValue('期間').setFontWeight('bold');
  areaPicker_(sh, 'D2', 'E2');
  AREA_ = '$E$2';
  const S = '$B$3', E = '$C$3', last = 6 + MAX_MEMBERS;
  sh.getRange('B4:Q4').setFontWeight('bold');
  sh.getRange('B4').setValue('訪問'); sh.getRange('F4').setValue('獲得'); sh.getRange('J4').setValue('開通'); sh.getRange('N4').setValue('率（緑＝目標達成・赤＝チーム平均より下）');
  sh.getRange('A5:Q5').setValues([['名前', '実績', '目標', '達成率', '', '実績', '目標', '達成率', '', '実績', '目標', '達成率', '', '', '', '', '獲得率']])
    .setFontWeight('bold').setBackground('#e8eaed').setWrap(true);
  [['N5', '対面率', 'B6'], ['O5', '提案率', 'B7'], ['P5', '成約率', 'B8']].forEach(([a, l, g]) => sh.getRange(a).setFormula('="' + l + '（目標"&TEXT(' + G_ + '!' + g + ',"0%")&"）"'));

  const blocks = [['B', 3, n => logCount_(n, null, S, E)], ['F', 4, n => logCount_(n, '獲得', S, E)], ['J', 5, n => opened_(n, S, E)]];
  const team = sh.getRange('A6:T6');
  team.setBackground('#f3f6fc').setFontWeight('bold');
  sh.getRange('A6').setValue('チーム');
  sh.getRange('A7').setFormula('=IFERROR(' + membersF_() + ',"")');
  const rows = [];
  for (let r = 6; r <= last; r++) {
    const name = '$A' + r, blank = f => r === 6 ? '=' + f : '=IF(' + name + '="","",' + f + ')', row = [];
    blocks.forEach(([c, goalCol, count]) => {
      const C = col_(c, 0) + r, G = col_(c, 1) + r, P = col_(c, 2) + r;
      const goal = r === 6 ? (c === 'B' ? 'SUM(' + col_(c, 1) + '7:' + col_(c, 1) + last + ')' : G_ + '!$B$' + (c === 'F' ? 2 : 3))
        : goalOf_(name, goalCol);
      row.push(r === 6 ? '=SUM(' + col_(c, 0) + '7:' + col_(c, 0) + last + ')' : blank(count(name)), blank(goal),
        '=IF(N(' + G + ')=0,"",' + C + '/' + G + ')', progress_(P));
    });
    // S＝対面数、T＝提案数（計算用・隠し列）
    const S_ = 'S' + r, T_ = 'T' + r;
    row.push('=IF(N(B' + r + ')=0,"",' + S_ + '/B' + r + ')', '=IF(N(' + S_ + ')=0,"",' + T_ + '/' + S_ + ')', '=IF(N(' + T_ + ')=0,"",F' + r + '/' + T_ + ')', '=IF(N(B' + r + ')=0,"",F' + r + '/B' + r + ')', '',
      r === 6 ? '=SUM(S7:S' + last + ')' : blank('B' + r + '-' + logCount_(name, '不在', S, E) + '-' + logCount_(name, 'インターホンNG', S, E)),
      r === 6 ? '=SUM(T7:T' + last + ')' : blank('F' + r + '+' + logCount_(name, 'トーク後NG', S, E) + '+' + logCount_(name, '検討', S, E)));
    rows.push(row);
  }
  sh.getRange(6, 2, rows.length, 19).setFormulas(rows);
  AREA_ = null;
  sh.getRangeList(['D6:D' + last, 'H6:H' + last, 'L6:L' + last, 'N6:Q' + last]).setNumberFormat('0%');
  sh.hideColumns(19, 2);

  const rules = [];
  [['N', 'B6'], ['O', 'B7'], ['P', 'B8'], ['Q', null]].forEach(([c, g]) => {
    const range = sh.getRange(c + '7:' + c + last), cell = c + '7';
    if (g) rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(' + cell + '<>"",' + cell + '>=INDIRECT("' + G_ + '!' + g + '"))').setBackground('#d4efdf').setRanges([range]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND(' + cell + '<>"",' + cell + '<' + c + '$6)').setBackground('#f8d7da').setRanges([range]).build());
  });
  sh.setConditionalFormatRules(rules);
  sh.setFrozenRows(5); sh.setFrozenColumns(1);
  sh.setColumnWidth(1, 110);
  ['C', 'G', 'K'].forEach(c => sh.setColumnWidth(col_(c, 0, true), 50));
  ['E', 'I', 'M'].forEach(c => sh.setColumnWidth(col_(c, 0, true), 110));
  sh.protect().setDescription(PROTECT_NOTE).setWarningOnly(true).setUnprotectedRanges([sh.getRange('B2'), sh.getRange('E2')]);
}

// KPI個人：名前を選ぶと、目標と達成・率（本人・平均・目標）・結果の内訳・商材別・日ごとの推移グラフ
function setupKpiOne_(sh) {
  sh.getRange('A1').setValue('KPI個人').setFontWeight('bold').setFontSize(16);
  sh.getRange('A2').setValue('メンバー').setFontWeight('bold');
  sh.getRange('B2').setBackground('#fff2cc').setFontSize(14).setFontWeight('bold').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(sh.getParent().getSheetByName(MEMBER_SHEET).getRange('A2:A'), true).build());
  sh.getRange('C2').setValue('← 名前を選ぶ');
  sh.getRange('D2').setValue('対象月').setFontWeight('bold');
  monthPicker_(sh, 'E2', 'B3', 'C3');
  sh.getRange('A3').setValue('期間').setFontWeight('bold');
  areaPicker_(sh, 'F2', 'G2');
  AREA_ = '$G$2';
  const N = '$B$2', S = '$B$3', E = '$C$3', head = r => sh.getRange(r).setFontWeight('bold').setBackground('#e8eaed');

  // 目標と達成
  sh.getRange('A5').setValue('目標と達成').setFontWeight('bold').setFontSize(13);
  head('A6:E6').setValues([['項目', '実績', '目標', '達成率', '']]);
  [['訪問', logCount_(N, null, S, E), 3], ['獲得', logCount_(N, '獲得', S, E), 4], ['開通', opened_(N, S, E), 5]].forEach(([l, f, g], i) => {
    const r = 7 + i;
    sh.getRange(r, 1, 1, 5).setFormulas([[txt_(l), '=' + f, '=' + goalOf_(N, g), '=IF(N(C' + r + ')=0,"",B' + r + '/C' + r + ')', progress_('D' + r)]]);
  });
  sh.getRange('D7:D9').setNumberFormat('0%');

  // 率：本人・チーム平均・目標・判定
  sh.getRange('A11').setValue('率（本人・チーム平均・目標）').setFontWeight('bold').setFontSize(13);
  head('A12:E12').setValues([['項目', '本人', 'チーム平均', '目標', '判定']]);
  const v = n => logCount_(n, null, S, E), face = n => '(' + v(n) + '-' + logCount_(n, '不在', S, E) + '-' + logCount_(n, 'インターホンNG', S, E) + ')';
  const talk = n => '(' + logCount_(n, 'トーク後NG', S, E) + '+' + logCount_(n, '検討', S, E) + '+' + logCount_(n, '獲得', S, E) + ')', won = n => logCount_(n, '獲得', S, E);
  const ratio = (a, b) => '=IFERROR(' + a + '/' + b + ',"")';
  [['対面率', face, v, 'B6'], ['提案率', talk, face, 'B7'], ['成約率', won, talk, 'B8'], ['獲得率', won, v, null]].forEach(([l, a, b, g], i) => {
    const r = 13 + i;
    sh.getRange(r, 1, 1, 5).setFormulas([[txt_(l), ratio(a(N), b(N)), ratio(a(null), b(null)), g ? '=' + G_ + '!' + g : '',
      '=IF(B' + r + '="","",IF(AND(D' + r + '<>"",B' + r + '>=D' + r + '),"◎ 目標達成",IF(B' + r + '>=C' + r + ',"○ 平均以上","△ 平均より下")))']]);
  });
  sh.getRange('B13:D16').setNumberFormat('0.0%');
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('◎').setBackground('#d4efdf').setRanges([sh.getRange('E13:E16')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('△').setBackground('#f8d7da').setRanges([sh.getRange('E13:E16')]).build(),
  ]);

  // 結果の内訳・商材別
  sh.getRange('A18').setValue('結果の内訳').setFontWeight('bold').setFontSize(13);
  head('A19:C19').setValues([['結果', '件数', '割合']]);
  RESULTS.forEach((res, i) => {
    const r = 20 + i;
    sh.getRange(r, 1, 1, 3).setFormulas([[txt_(res), '=' + logCount_(N, res, S, E), '=IFERROR(B' + r + '/B7,"")']]);
  });
  sh.getRange(20, 3, RESULTS.length, 1).setNumberFormat('0.0%');
  sh.getRange('E18').setValue('商材別').setFontWeight('bold').setFontSize(13);
  head('E19:G19').setValues([['商材', '獲得', '開通']]);
  sh.getRange('E20').setFormula('=IFERROR(' + productsF_() + ',"")');
  sh.getRange('F20').setFormula('=IFERROR(MAP(' + productsF_() + ',LAMBDA(q,' + logCount_(N, '獲得', S, E, 'q') + ')),"")');
  sh.getRange('G20').setFormula('=IFERROR(MAP(' + productsF_() + ',LAMBDA(q,' + opened_(N, S, E, 'q') + ')),"")');

  // 日ごとの推移（表とグラフ）
  sh.getRange('A28').setValue('日ごとの推移').setFontWeight('bold').setFontSize(13);
  head('A29:C29').setValues([['日付', '訪問', '獲得']]);
  sh.getRange('A30').setFormula('=ARRAYFORMULA(' + S + '+SEQUENCE(DAY(EOMONTH(' + S + ',0)))-1)');
  sh.getRange('B30').setFormula('=MAP(A30:A60,LAMBDA(d,IF(d="","",' + logCount_(N, null, 'd', 'd') + ')))');
  sh.getRange('C30').setFormula('=MAP(A30:A60,LAMBDA(d,IF(d="","",' + logCount_(N, '獲得', 'd', 'd') + ')))');
  sh.getRange('A30:A60').setNumberFormat('M/d');
  sh.insertChart(sh.newChart().setChartType(Charts.ChartType.COMBO).addRange(sh.getRange('A29:C60')).setNumHeaders(1)
    .setPosition(28, 5, 0, 0).setOption('title', '日ごとの推移（棒＝訪問、線＝獲得）').setOption('seriesType', 'bars')
    .setOption('series', { 1: { type: 'line', targetAxisIndex: 1, color: '#d9534f', pointSize: 5 } })
    .setOption('vAxes', { 0: { title: '訪問' }, 1: { title: '獲得' } }).setOption('legend', { position: 'bottom' })
    .setOption('width', 640).setOption('height', 320).build());

  AREA_ = null;
  sh.setColumnWidth(1, 110); sh.setColumnWidths(2, 4, 100); sh.setColumnWidth(5, 130);
  sh.protect().setDescription(PROTECT_NOTE).setWarningOnly(true).setUnprotectedRanges([sh.getRange('B2'), sh.getRange('E2'), sh.getRange('G2')]);
}

// 対象月（今月／先月）の選択と、期間の開始・終了
function monthPicker_(sh, pick, startCell, endCell) {
  sh.getRange(pick).setValue('今月').setBackground('#fff2cc').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['今月', '先月'], true).build());
  const p = abs_(pick);
  sh.getRange(startCell).setFormula('=IF(' + p + '="先月",EOMONTH(TODAY(),-2)+1,' + MONTH_START + ')');
  sh.getRange(endCell).setFormula('=IF(' + p + '="先月",EOMONTH(TODAY(),-1),TODAY())');
  sh.getRange(startCell + ':' + endCell).setNumberFormat('yyyy/MM/dd');
}

// メンバーシートの目標（col＝3訪問・4獲得・5開通）。空なら空欄
function goalOf_(name, col) {
  return 'IFERROR(LET(g,VLOOKUP(' + name + ',' + M_ + '!$A:$E,' + col + ',FALSE),IF(g="","",g)),"")';
}

// 達成率のバー（100%で緑）
function progress_(cell) {
  return '=IF(' + cell + '="","",SPARKLINE(MIN(' + cell + ',1),{"charttype","bar";"max",1;"color1",IF(' + cell + '>=1,"#27ae60","#2980b9")}))';
}

const MONTH_START = 'EOMONTH(TODAY(),-1)+1';
function membersF_() { return 'FILTER(' + M_ + '!A2:A,' + M_ + '!A2:A<>"",' + M_ + '!B2:B=TRUE)'; }
function productsF_() { return 'TOCOL(' + P_ + '!$A$2:$A,1)'; }
// setFormulas の中で文字をそのまま入れると #NAME? になるので、文字を返す式にする
function txt_(s) { return '="' + s + '"'; }
function abs_(a1) { return a1.replace(/([A-Z]+)(\d+)/, '$$$1$$$2'); }
// 列記号を n 列ずらす（num=true なら列番号を返す）
function col_(c, n, num) {
  let x = 0; for (const ch of c) x = x * 26 + ch.charCodeAt(0) - 64;
  x += n;
  if (num) return x;
  let s = ''; for (; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + (x - 1) % 26) + s;
  return s;
}

// 活動ログを数える式。name・product が null ならしぼらない、result が null なら全部（＝訪問）
function logCount_(name, result, start, end, product) {
  return 'COUNTIFS(' + [name && [L_ + '!$C:$C', name], result && [L_ + '!$D:$D', '"' + result + '"'], product && [L_ + '!$F:$F', product],
    [L_ + '!$B:$B', '">="&' + start], [L_ + '!$B:$B', '"<="&' + end],
    // エリア：「全体」なら "<>全体"（エリアが空の行も含めて全部）、それ以外はそのエリアだけ
    AREA_ && [L_ + '!$G:$G', 'IF(' + AREA_ + '="全体","<>全体",' + AREA_ + ')']].filter(x => x).map(x => x.join(',')).join(',') + ')';
}

// エリアごとの顧客進捗シートの式を足す。エリアを選んでいれば、そのエリアのシートだけ
function bothApps_(one) {
  // このファイルにある顧客進捗だけ（別ファイルの名古屋は入れない）。エリアを選んでいれば「全体」かそのエリアのときだけ足す
  const parts = LOCAL_AREAS.map(a => {
    const f = one("'" + appSheetOf_(a) + "'");
    return AREA_ ? '((' + AREA_ + '="全体")+(' + AREA_ + '="' + a + '"))*' + f : f;
  });
  return '(' + parts.join('+') + ')';
}

// 前確NG：フォローコールNG（申込日で数える）
function ngCount_(name, start, end) {
  return bothApps_(a => 'COUNTIFS(' + a + '!$B:$B,' + name + ',' + a + '!$G:$G,"フォローコールNG",' + a + '!$A:$A,">="&' + start + ',' + a + '!$A:$A,"<="&' + end + ')');
}

// エリアを選ぶ欄（全体／大阪／名古屋）
function areaPicker_(sh, labelCell, pickCell) {
  sh.getRange(labelCell).setValue('エリア').setFontWeight('bold');
  sh.getRange(pickCell).setValue('全体').setBackground('#fff2cc').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(AREA_PICK, true).build())
    .setNote(EXTERNAL_AREAS.join('・') + 'の顧客進捗は別のスプレッドシートなので、このシートの開通・前確NGには入りません（訪問・獲得などは入る）。' + EXTERNAL_AREAS.join('・') + 'の開通・前確NGはアプリで見る');
}

// 率：分母が0なら空欄
function rate_(num, den, r) {
  return '=IF(OR($A' + r + '="",N(' + den + r + ')=0),"",' + num + r + '/' + den + r + ')';
}

// 開通数：開通日が期間内で、キャンセルにチェックがないもの。name が null なら全員、product を渡すとその商材だけ
function opened_(name, start, end, product) {
  return bothApps_(a => {
    const c = col => a + '!$' + col + '$2:$' + col;
    return 'SUMPRODUCT(' + [name && '(' + c('B') + '=' + name + ')', product && '(' + c('F') + '=' + product + ')',
      '(' + c('M') + '<>"")', '(' + c('M') + '>=' + start + ')', '(' + c('M') + '<=' + end + ')', '(' + c('J') + '<>"申込取消")',
      ...CANCEL_ENTRY.map(x => '(' + c('G') + '<>"' + x + '")')].filter(x => x).join('*') + ')';
  });
}

// ===== カウンターアプリ =====

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('光回線カウンター')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('先に setup を実行してください');
  return SpreadsheetApp.openById(id);
}

function getConfig() {
  const ss = ss_(), sh = ss.getSheetByName(MEMBER_SHEET), last = sh.getLastRow();
  const names = last < 2 ? [] : sh.getRange(2, 1, last - 1, 2).getValues().filter(r => r[0] && r[1] === true).map(r => String(r[0]).trim());
  return { names: names, results: RESULTS, products: products_(ss), areas: AREAS };
}

function products_(ss) {
  const sh = ss.getSheetByName(PRODUCT_SHEET), last = sh ? sh.getLastRow() : 0;
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, 1).getValues().flat().map(v => String(v).trim()).filter(v => v);
}

// まとめて記録する（電波がない間にスマホにたまった分も）。items: [{id, name, result, ts, appDate, customer, product}]
// 日時は押した時刻。同じ id は二重に入れない。「獲得」は申込一覧にも1行足す（申込日・お客様名・商材はアプリで入力した分）
function addRecords(items) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = ss_(), log = ss.getSheetByName(LOG_SHEET), last = log.getLastRow();
    const seen = new Set(last > 1 ? log.getRange(Math.max(2, last - 1999), 5, Math.min(2000, last - 1), 1).getValues().flat() : []);
    const rows = [], apps = {};
    items.forEach(it => {
      if (seen.has(it.id) || !RESULTS.includes(it.result) || !it.name) return; // 送信済み・不正な分は入れない
      seen.add(it.id);
      const t = new Date(it.ts), day = dayOf_(t), product = it.result === '獲得' ? String(it.product || '').trim() : '';
      const area = AREAS.includes(it.area) ? it.area : ''; // エリアのない記録（古い画面から）は空。獲得は大阪のシートに入る
      rows.push([t, day, it.name, it.result, it.id, product, area]);
      if (it.result === '獲得') (apps[appSheetOf_(area)] = apps[appSheetOf_(area)] || []).push([appDay_(it.appDate) || day, it.name, String(it.customer || '').trim(), String(it.sei || '').trim(), String(it.mei || '').trim(), product, ...Array(APP_HEAD.length - 7).fill(''), it.id]);
    });
    if (rows.length) log.getRange(last + 1, 1, rows.length, 7).setValues(rows);
    Object.keys(apps).forEach(n => {
      const a = appSheet_(AREAS[APP_SHEETS.indexOf(n)], ss);
      a.getRange(lastFilled_(a) + 1, 1, apps[n].length, APP_HEAD.length).setValues(apps[n]);
    });
    if (rows.length) clearStats_();
    return { ids: items.map(it => it.id) };
  } finally {
    lock.releaseLock();
  }
}

// 直前の自分の記録を1件取り消す（今日の分のみ）。「獲得」なら申込一覧の行も消す
function undoLast(name) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = ss_(), log = ss.getSheetByName(LOG_SHEET);
    const { rows, offset } = recent_(log), today = dateKey_(new Date());
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i][2] !== name || dateKey_(rows[i][1]) !== today) continue;
      log.deleteRow(offset + i);
      // 獲得なら、どちらのエリアのシートでも ID が同じ行を消す
      if (rows[i][3] === '獲得') AREAS.forEach(ar => {
        const a = appSheet_(ar, ss), n = a ? lastFilled_(a) : 0;
        const ids = n > 1 ? a.getRange(2, APP_HEAD.length, n - 1, 1).getValues().flat() : [];
        const j = ids.lastIndexOf(rows[i][4]);
        if (j >= 0) a.deleteRow(j + 2);
      });
      clearStats_();
      break;
    }
  } finally {
    lock.releaseLock();
  }
  return getToday(name);
}

// 今日の数。結果ごとの件数と、products に商材ごとの獲得数
function getToday(name) {
  const { rows } = recent_(ss_().getSheetByName(LOG_SHEET)), today = dateKey_(new Date());
  const counts = { products: {}, goal: dayGoal_(name, today) };
  RESULTS.forEach(r => counts[r] = 0);
  rows.forEach(r => {
    if (r[2] !== name || dateKey_(r[1]) !== today) return;
    counts[r[3]]++;
    if (r[3] === '獲得' && r[5]) counts.products[r[5]] = (counts.products[r[5]] || 0) + 1;
  });
  return counts;
}

// ログの最後の5000行（今日の分はこの中にある）。offset は rows[0] のシート上の行番号
function recent_(log) {
  const last = log.getLastRow();
  if (last < 2) return { rows: [], offset: 2 };
  const offset = Math.max(2, last - 4999);
  return { rows: log.getRange(offset, 1, last - offset + 1, 7).getValues(), offset: offset };
}

// A列（申込日）が入っている最後の行。G列のチェックボックスがあるので getLastRow は使えない
function lastFilled_(sh) {
  const v = sh.getRange('A:A').getValues();
  for (let i = v.length - 1; i >= 0; i--) if (v[i][0] !== '') return i + 1;
  return 1;
}

// アプリから来た申込日（yyyy-MM-dd）を日付にする。おかしな値なら null
function appDay_(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? Utilities.parseDate(s, TZ, 'yyyy-MM-dd') : null;
}

function dayOf_(t) {
  return Utilities.parseDate(Utilities.formatDate(t, TZ, 'yyyy/MM/dd'), TZ, 'yyyy/MM/dd'); // 日本時間の0時
}

function dateKey_(d) {
  return Utilities.formatDate(new Date(d), TZ, 'yyyy-MM-dd');
}

// ===== 通信インフラアプリ（GitHub Pages）から呼ぶ API =====
// アプリは このWebアプリのURL に POST する（text/plain の JSON：{fn, args, pass}）。
// 合言葉（スクリプト プロパティ PASS）が合うときだけ、下の API の関数を呼ぶ
const API = {
  appConfig: () => appConfig(), addRecords: items => addRecords(items), undoLast: name => undoLast(name), getToday: name => getToday(name),
  custList: () => custList(), custUpdate: u => custUpdate(u), stats: () => stats(), statsRange: (st, en) => statsRange(st, en), setDayGoal: g => setDayGoal(g),
  adminCheck: () => true, memberList: () => memberList(), memberSave: u => memberSave(u), goalsGet: () => goalsGet(), goalsSave: g => goalsSave(g), todayBoard: () => todayBoard(),
  // 訪問（Visit.gs）
  visitPull: () => visitPull(), visitPush: ops => visitPush(ops), visitData: have => visitData(have),
};
// 管理者だけが使えるもの（管理者の合言葉＝スクリプト プロパティ ADMIN_PASS が合うとき）
const ADMIN_FNS = ['adminCheck', 'custUpdate', 'memberList', 'memberSave', 'goalsGet', 'goalsSave', 'todayBoard'];

function doPost(e) {
  let out;
  try {
    const q = JSON.parse(e.postData.contents);
    const want = PropertiesService.getScriptProperties().getProperty('PASS');
    if (!want || q.pass !== want) out = { auth: true };
    else if (!API[q.fn]) out = { error: '使えない操作です：' + q.fn };
    else if (ADMIN_FNS.includes(q.fn) && !isAdmin_(q.admin)) out = { adminAuth: true };
    else out = { result: API[q.fn].apply(null, q.args || []) };
  } catch (err) {
    out = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// 合言葉を変えるとき：'新しい合言葉' を書き換えて1回実行（全員アプリで入れ直しになる）。
// プロジェクトの設定 → スクリプト プロパティ の PASS を直接書き換えてもよい
function setPass() {
  PropertiesService.getScriptProperties().setProperty('PASS', '新しい合言葉');
}

function appConfig() {
  const c = getConfig();
  c.entryStatus = ENTRY_STATUS; c.lineStatus = LINE_STATUS;
  return c;
}

// 顧客進捗の列（A〜N）とアプリでの名前
const CUST_KEYS = ['date', 'staff', 'customer', 'sei', 'mei', 'product', 'entry', 'entryDate', 'jumper', 'line', 'netDate', 'billDate', 'done', 'memo'];
const CUST_DATES = ['date', 'entryDate', 'jumper', 'netDate', 'billDate', 'done'];
const CUST_EDIT = ['entry', 'entryDate', 'jumper', 'line', 'netDate', 'billDate', 'done', 'memo']; // G〜N（アプリで直せる列）

function custRow_(v, row, area) {
  const o = { row: row, id: String(v[APP_HEAD.length - 1] || ''), area: area || '' };
  CUST_KEYS.forEach((k, i) => o[k] = v[i] instanceof Date ? dateKey_(v[i]) : String(v[i] === null ? '' : v[i]).trim());
  return o;
}

// 顧客進捗の全部（エリアのシート2枚。area にエリア、row はそのシートの行。新しい順はアプリで並べる）
function custList() {
  const ss = ss_(), out = [];
  AREAS.forEach(ar => {
    const a = appSheet_(ar, ss), n = a ? lastFilled_(a) : 0;
    if (n > 1) a.getRange(2, 1, n - 1, APP_HEAD.length).getValues().forEach((v, i) => out.push(custRow_(v, i + 2, ar)));
  });
  return out;
}

// 1件の G〜N を書き換える。u: {row, id, date, customer, entry, entryDate, ...}
// 行がずれていたら（誰かが行を消した等）ID か 申込日＋お客様名 で探し直す
function custUpdate(u) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // まず u.area のシートの u.row を見て、違えば両方のシートを ID（なければ申込日＋お客様名）で探す
    const ss = ss_(), same = v => u.id ? String(v[APP_HEAD.length - 1]) === u.id : custRow_(v, 0).date === u.date && String(v[2]).trim() === u.customer;
    const order = [u.area].concat(AREAS.filter(x => x !== u.area)).filter(x => AREAS.includes(x));
    let a = null, i = -1, area = '';
    for (const ar of order) {
      const sh = appSheet_(ar, ss), n = sh ? lastFilled_(sh) : 0;
      if (n < 2) continue;
      const all = sh.getRange(2, 1, n - 1, APP_HEAD.length).getValues();
      let k = ar === u.area ? u.row - 2 : -1;
      if (!(all[k] && same(all[k]))) k = all.findIndex(same);
      if (k >= 0) { a = sh; i = k; area = ar; break; }
    }
    if (i < 0) throw new Error('このお客様が見つかりません（一覧を読み直してください）');
    if (u.entry && !ENTRY_STATUS.includes(u.entry)) throw new Error('エントリーステータスが選択肢にありません');
    if (u.line && !LINE_STATUS.includes(u.line)) throw new Error('契約ステータスが選択肢にありません');
    const vals = CUST_EDIT.map(k => {
      const x = String(u[k] || '').trim();
      if (!CUST_DATES.includes(k) || !x) return x;
      const d = appDay_(x);
      if (!d) throw new Error('日付の形がおかしいです：' + x);
      return d;
    });
    a.getRange(i + 2, 7, 1, CUST_EDIT.length).setValues([vals]);
    clearStats_();
    return custRow_(a.getRange(i + 2, 1, 1, APP_HEAD.length).getValues()[0], i + 2, area);
  } finally {
    lock.releaseLock();
  }
}

// ランキング・個人成績・KPI のもと。数え方はシートの数式と同じ（1分だけ覚えておく。記録・更新があれば作り直す）
// 返すもの：
//   periods {day, week, month, prev, year}: {s, e}（yyyy-MM-dd）
//   active: 在籍の名前、products、goals {team:{won, opened}, rate:{face, talk, close}, member:{名前:{visit, won, opened}}}
//   data {名前: {期間: {c:[RESULTSの順の件数], wp:{商材:獲得}, o:開通, op:{商材:開通}, ng:前確NG}}}（ログ・顧客進捗にいる全員）
//   daily {名前: {yyyy-MM-dd: [訪問, 獲得]}}（今月・先月）
function stats() {
  const p = periods_();
  return cached_('stats', () => build_(p, p.prev.s, p.day.s));
}

// 好きな期間（どの月・どの週でも）：s〜e（yyyy-MM-dd、最大62日）。返すものは stats と同じ形で、期間は periods.r
function statsRange(st, en) {
  const ok = x => /^\d{4}-\d{2}-\d{2}$/.test(x || '');
  if (!ok(st) || !ok(en) || st > en) throw new Error('期間の形がおかしいです');
  if ((appDay_(en) - appDay_(st)) / 86400000 > 62) throw new Error('期間が長すぎます（62日まで）');
  return cached_('r' + st + en, () => { const o = build_({ r: { s: st, e: en } }, st, en); o.today = periods_().day.s; return o; });
}

// 集計を1分だけ覚えておく。記録・更新があれば clearStats_ で全部作り直し（ver を変える）
function cached_(key, make) {
  const cache = CacheService.getScriptCache(), k = key + '_' + (cache.get('ver') || '0'), hit = cache.get(k);
  if (hit) return JSON.parse(hit);
  const out = make(), json = JSON.stringify(out);
  if (json.length < 90000) cache.put(k, json, 60);
  return out;
}

// periods の期間ごとに数え、ds〜de は日ごと（訪問・獲得）も数える
function build_(periods, ds, de) {
  const ss = ss_(), keys = Object.keys(periods), prods = products_(ss);
  // data・daily はエリアごと：{全体: {名前: ...}, 大阪: {...}, 名古屋: {...}}。エリアのない記録は「全体」だけに入る
  const data = Object.fromEntries(AREA_PICK.map(x => [x, {}])), daily = Object.fromEntries(AREA_PICK.map(x => [x, {}]));
  const slot = (ar, name) => data[ar][name] || (data[ar][name] = Object.fromEntries(keys.map(k => [k, { c: RESULTS.map(() => 0), wp: {}, o: 0, op: {}, ng: 0 }])));
  const inP = d => keys.filter(k => d >= periods[k].s && d <= periods[k].e);
  const areasOf = ar => AREAS.includes(ar) ? ['全体', ar] : ['全体'];

  // 活動ログ：B日付 C名前 D結果 F商材 Gエリア
  const log = ss.getSheetByName(LOG_SHEET), ln = log.getLastRow();
  if (ln > 1) log.getRange(2, 2, ln - 1, 6).getValues().forEach(v => {
    if (!(v[0] instanceof Date) || !v[1]) return;
    const d = dateKey_(v[0]), ps = inP(d), ri = RESULTS.indexOf(v[2]);
    if ((!ps.length && (d < ds || d > de)) || ri < 0) return;
    const name = String(v[1]).trim(), won = v[2] === '獲得', q = String(v[4] || '').trim();
    areasOf(String(v[5] || '').trim()).forEach(ar => {
      const s = slot(ar, name);
      ps.forEach(k => { s[k].c[ri]++; if (won && q) s[k].wp[q] = (s[k].wp[q] || 0) + 1; });
      if (d >= ds && d <= de) {
        const dl = daily[ar], dd = (dl[name] || (dl[name] = {}))[d] || (dl[name][d] = [0, 0]);
        dd[0]++; if (won) dd[1]++;
      }
    });
  });

  // 顧客進捗（エリアのシート2枚）：開通＝工事完了日（申込取消・キャンセル系を除く）、前確NG＝フォローコールNG（申込日で数える）
  AREAS.forEach(area => {
    const a = appSheet_(area, ss), an = a ? lastFilled_(a) : 0;
    if (an > 1) a.getRange(2, 1, an - 1, 13).getValues().forEach(v => {
      const name = String(v[1] || '').trim();
      if (!name) return;
      const q = String(v[5] || '').trim();
      areasOf(area).forEach(ar => {
        if (v[12] instanceof Date && v[9] !== '申込取消' && !CANCEL_ENTRY.includes(v[6]))
          inP(dateKey_(v[12])).forEach(k => { const s = slot(ar, name)[k]; s.o++; if (q) s.op[q] = (s.op[q] || 0) + 1; });
        if (v[6] === 'フォローコールNG' && v[0] instanceof Date) inP(dateKey_(v[0])).forEach(k => slot(ar, name)[k].ng++);
      });
    });
  });

  // 目標・メンバー
  const g = ss.getSheetByName(GOAL_SHEET), num = x => (x === '' || x === null || isNaN(Number(x))) ? null : Number(x);
  const gv = g ? g.getRange('B1:B8').getValues().flat() : [];
  const m = ss.getSheetByName(MEMBER_SHEET), mn = m.getLastRow();
  const active = [], member = {};
  if (mn > 1) m.getRange(2, 1, mn - 1, 5).getValues().forEach(v => {
    const name = String(v[0]).trim();
    if (!name || v[1] !== true) return;
    active.push(name);
    member[name] = { visit: num(v[2]), won: num(v[3]), opened: num(v[4]) };
  });
  return { today: periods.day ? periods.day.s : '', periods: periods, results: RESULTS, active: active, products: prods,
    goals: { team: { won: num(gv[1]), opened: num(gv[2]) }, rate: { face: num(gv[5]), talk: num(gv[6]), close: num(gv[7]) }, member: member },
    areas: AREAS, data: data, daily: daily };
}

function clearStats_() { CacheService.getScriptCache().put('ver', String(Date.now()), 21600); }

// 期間（日本時間）：今日・今週（月曜から）・今月・先月・年間（1月から）
function periods_() {
  const [y, mo, d] = Utilities.formatDate(new Date(), TZ, 'yyyy-M-d').split('-').map(Number);
  const k = (yy, mm, dd) => { const t = new Date(Date.UTC(yy, mm - 1, dd)); return t.toISOString().slice(0, 10); };
  const today = k(y, mo, d), dow = (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7;
  return { day: { s: today, e: today }, week: { s: k(y, mo, d - dow), e: today }, month: { s: k(y, mo, 1), e: today },
    prev: { s: k(y, mo - 1, 1), e: k(y, mo, 0) }, year: { s: k(y, 1, 1), e: today } };
}

// ===== 日の目標（カウンターを毎日最初に開いたときに入れる） =====
// 「日の目標」シート：A日付 B名前 C訪問の目標 D獲得の目標 E入れた日時。1人1日1行（入れ直すと上書き）

function setupDayGoal_(sh) {
  sh.getRange('A1:E1').setValues([['日付', '名前', '訪問の目標', '獲得の目標', '入れた日時']]).setFontWeight('bold').setBackground('#e8eaed');
  sh.getRange('A:A').setNumberFormat('yyyy/MM/dd');
  sh.getRange('E:E').setNumberFormat('yyyy/MM/dd HH:mm');
  sh.setFrozenRows(1);
  sh.setColumnWidth(2, 120);
  sh.getRange('G1').setValue('アプリのカウンターで、その日最初に開いたときに本人が入れる目標です（入れ直すと上書き）。');
}

function dayGoalSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(DAY_GOAL_SHEET);
  if (!sh) { sh = ss.insertSheet(DAY_GOAL_SHEET); setupDayGoal_(sh); }
  return sh;
}

// その人のその日の目標の行（最後の2000行から探す）。{row, visit, won} か null
function findDayGoal_(sh, name, day) {
  const last = sh.getLastRow();
  if (last < 2) return null;
  const from = Math.max(2, last - 1999), v = sh.getRange(from, 1, last - from + 1, 4).getValues();
  for (let i = v.length - 1; i >= 0; i--)
    if (v[i][0] instanceof Date && dateKey_(v[i][0]) === day && String(v[i][1]).trim() === name) return { row: from + i, visit: Number(v[i][2]) || 0, won: Number(v[i][3]) || 0 };
  return null;
}

function dayGoal_(name, day) {
  const sh = ss_().getSheetByName(DAY_GOAL_SHEET), g = sh && name ? findDayGoal_(sh, String(name).trim(), day) : null;
  return g ? { visit: g.visit, won: g.won } : null;
}

// g: {name, date: yyyy-MM-dd, visit, won}
function setDayGoal(g) {
  const name = String(g.name || '').trim(), d = appDay_(g.date), visit = Math.floor(Number(g.visit)), won = Math.floor(Number(g.won));
  if (!name || !d) throw new Error('名前か日付がありません');
  if (!(visit >= 1) || !(won >= 0) || visit > 9999 || won > 999) throw new Error('目標の数がおかしいです');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = dayGoalSheet_(), hit = findDayGoal_(sh, name, g.date), row = [[d, name, visit, won, new Date()]];
    if (hit) sh.getRange(hit.row, 1, 1, 5).setValues(row);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, 5).setValues(row);
    return { visit: visit, won: won };
  } finally {
    lock.releaseLock();
  }
}

// ===== 管理者（アプリの「管理者」画面） =====
// 管理者の合言葉は スクリプト プロパティ ADMIN_PASS（チームの合言葉 PASS とは別）。入れていないと誰も管理者になれない
function isAdmin_(x) {
  const want = PropertiesService.getScriptProperties().getProperty('ADMIN_PASS');
  return !!want && x === want;
}

const numOrBlank_ = (x, label) => {
  if (x === '' || x === null || x === undefined) return '';
  const n = Number(x);
  if (!Number.isFinite(n) || n < 0) throw new Error(label + 'の数がおかしいです');
  return n;
};

// メンバー全員（在籍していない人も）：[{name, active, visit, won, opened}]
function memberList() {
  const sh = ss_().getSheetByName(MEMBER_SHEET), n = lastFilled_(sh);
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, 5).getValues().filter(v => String(v[0]).trim())
    .map(v => ({ name: String(v[0]).trim(), active: v[1] === true, visit: v[2] === '' ? '' : v[2], won: v[3] === '' ? '' : v[3], opened: v[4] === '' ? '' : v[4] }));
}

// 1人を足す（isNew）か直す。u: {name, active, visit, won, opened, isNew}。名前は変えられない（記録が名前でつながっているため）
function memberSave(u) {
  const name = String(u.name || '').replace(/^[\s　]+|[\s　]+$/g, '');
  if (!name) throw new Error('名前を入れてください');
  const vals = [u.active === true, numOrBlank_(u.visit, '訪問目標'), numOrBlank_(u.won, '獲得目標'), numOrBlank_(u.opened, '開通目標')];
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = ss_().getSheetByName(MEMBER_SHEET), n = lastFilled_(sh);
    const names = n > 1 ? sh.getRange(2, 1, n - 1, 1).getValues().map(v => String(v[0]).trim()) : [];
    let i = names.indexOf(name);
    if (u.isNew) {
      if (i >= 0) throw new Error('「' + name + '」はもういます');
      i = names.length;
      sh.getRange(i + 2, 1).setValue(name);
      const box = sh.getRange(i + 2, 2);
      if (box.getDataValidation() === null) box.insertCheckboxes();
    } else if (i < 0) throw new Error('「' + name + '」が見つかりません');
    sh.getRange(i + 2, 2, 1, 4).setValues([vals]);
    clearStats_();
    return memberList();
  } finally {
    lock.releaseLock();
  }
}

// チーム目標と率の目標（目標シート B2 獲得・B3 開通・B6 対面率・B7 提案率・B8 成約率。率は 0.3＝30%）
function goalsGet() {
  const v = ss_().getSheetByName(GOAL_SHEET).getRange('B1:B8').getValues().flat();
  const b = x => x === '' || x === null ? '' : x;
  return { won: b(v[1]), opened: b(v[2]), face: b(v[5]), talk: b(v[6]), close: b(v[7]) };
}

function goalsSave(g) {
  const rate = (x, l) => { const n = numOrBlank_(x, l); if (n !== '' && n > 1) throw new Error(l + 'は100%までです'); return n; };
  const sh = ss_().getSheetByName(GOAL_SHEET);
  sh.getRange('B2:B3').setValues([[numOrBlank_(g.won, 'チームの獲得目標')], [numOrBlank_(g.opened, 'チームの開通目標')]]);
  sh.getRange('B6:B8').setValues([[rate(g.face, '対面率')], [rate(g.talk, '提案率')], [rate(g.close, '成約率')]]);
  clearStats_();
  return goalsGet();
}

// 全員の今日：在籍のメンバーごとの今日の目標（日の目標シート）と今の訪問・獲得
function todayBoard() {
  const ss = ss_(), today = dateKey_(new Date()), names = getConfig().names;
  const goals = {}, gs = ss.getSheetByName(DAY_GOAL_SHEET);
  if (gs && gs.getLastRow() > 1) {
    const last = gs.getLastRow(), from = Math.max(2, last - 1999);
    gs.getRange(from, 1, last - from + 1, 4).getValues().forEach(v => {
      if (v[0] instanceof Date && dateKey_(v[0]) === today) goals[String(v[1]).trim()] = { visit: Number(v[2]) || 0, won: Number(v[3]) || 0 };
    });
  }
  const cnt = {};
  recent_(ss.getSheetByName(LOG_SHEET)).rows.forEach(r => {
    if (dateKey_(r[1]) !== today) return;
    const n = String(r[2]).trim(), c = cnt[n] || (cnt[n] = { visit: 0, won: 0 });
    c.visit++; if (r[3] === '獲得') c.won++;
  });
  return { today: today, rows: names.map(n => ({ name: n, goal: goals[n] || null, visit: (cnt[n] || {}).visit || 0, won: (cnt[n] || {}).won || 0 })) };
}

