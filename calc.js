// 解約金の計算（訪問のときに、お客様の今の光回線をやめたらいくらかかるかの目安を出す）
// ・お客様の情報はどこにも送らない・残さない（この画面の中で計算するだけ）
// ・金額は各社の公式ページなどで調べた目安。変わったら下の LINES を直す（調べた日も直す）
// ・2022年7月以降の申込みは、法律で解約金が「月額料金1か月分ほど」までになった。それより前は高いことがある
"use strict";

const CHECKED = "2026年11月23日";

// fee：解約金 {new: 2022年7月以降の申込み, old: それより前}、{h: 戸建て, m: マンション}。null＝調べきれていない（お客様に確認）
// kouji：工事費の分割 [{from: この月以降の開通, total: 総額, n: 回数}]。null＝調べきれていない
// tekkyo：撤去工事費（撤去するときだけ）、ok：公式ページで確かめた
const LINES = [
  { id: "docomo", n: "ドコモ光", ok: true,
    fee: { new: { h: 5500, m: 4180 }, old: { h: 14300, m: 8800 } },
    kouji: [{ from: "", total: 28600, n: 24 }],
    note: "工事費は12回か24回払い（24回で月1,191円）。2026年6月より前の申込みは額が違うことがある",
    src: "https://www.docomo.ne.jp/internet/hikari/construction_costs/" },
  { id: "softbank", n: "ソフトバンク光", ok: true,
    fee: { new: { h: 5720, m: 4180 }, old: { h: 10450, m: 10450 } },
    kouji: [{ from: "", total: 31680, n: 24 }, { from: "2026-06", total: 47520, n: 24 }],
    note: "解約金は月額料金1か月分（2026年12月以降に更新した人は330円上がる）。工事費は2026年6月の申込みから47,520円",
    src: "https://www.softbank.jp/internet/sbhikari/price/" },
  { id: "au", n: "auひかり（ほかの代理店）", ok: true,
    fee: { new: { h: 4730, m: null }, old: null },
    kouji: [{ from: "", total: 48950, n: 35 }], tekkyo: 31680,
    note: "ずっとギガ得プラン（ホーム）の額。マンションは額が違う。途中でやめると工事費の残りは契約期間に応じて少し安くなる",
    src: "https://www.au.com/internet/auhikari_1g/charge/zuttogigatoku/" },
  { id: "nuro", n: "NURO光", ok: false,
    fee: { new: { h: 0, m: 0 }, old: null },
    kouji: [{ from: "", total: 44000, n: 24 }], tekkyo: 11000,
    note: "2025年10月以降の解約は解約金なしとされる。工事費は割引で相殺される形なので、途中でやめると残りを払う" },
  { id: "commufa", n: "コミュファ光", ok: false,
    fee: { new: { h: 5720, m: 4620 }, old: { h: 11000, m: 11000 } },
    kouji: null, tekkyo: 13200,
    note: "賃貸は撤去工事（13,200円ほど）が要ることがある" },
  { id: "eo", n: "eo光", ok: false, fee: null, kouji: null,
    note: "解約は1か月前までに電話が要るとされる" },
  { id: "flets", n: "フレッツ光（NTT西日本）", ok: false, fee: null, kouji: null,
    note: "プロバイダの解約金が別にかかることがある" },
  { id: "biglobe", n: "ビッグローブ光", ok: false, fee: null, kouji: null, note: "" },
  { id: "sonet", n: "So-net光", ok: false, fee: null, kouji: null, note: "" },
  { id: "rakuten", n: "楽天ひかり", ok: false, fee: null, kouji: null, note: "" },
  { id: "other", n: "そのほかの光回線", ok: false, fee: null, kouji: null, note: "" }
];

const $ = s => document.querySelector(s);
const yen = v => (v || 0).toLocaleString("ja-JP") + "円";
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ym = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
const mIdx = s => { const [y, m] = s.split("-").map(Number); return y * 12 + m; };

// 選んだこと（お客様の情報なので保存しない）
const st = { line: "docomo", home: "h", era: "new", start: "", renew: false, tekkyo: false };

function line() { return LINES.find(l => l.id === st.line); }
function koujiOf(l) {
  if (!l.kouji) return null;
  let k = l.kouji[0];
  l.kouji.forEach(x => { if (x.from && st.start && st.start >= x.from) k = x; });
  return k;
}
// 開通してから払った回数（開通の翌月が1回目とする）
function paidN() {
  if (!st.start) return null;
  return Math.max(0, mIdx(ym(new Date())) - mIdx(st.start));
}

// 選び直したときに入れ直す数字
function defaults() {
  const l = line(), f = l.fee && l.fee[st.era], k = koujiOf(l), paid = paidN();
  const fee = f ? f[st.home] : null;
  const monthly = k ? Math.floor(k.total / k.n) : null;
  const left = k && paid != null ? Math.max(0, k.n - paid) : null;
  return { fee, monthly, left, tekkyo: l.tekkyo || null };
}

function draw() {
  const l = line(), d = defaults(), k = koujiOf(l), paid = paidN();
  const opt = LINES.map(x => `<option value="${x.id}"${x.id === st.line ? " selected" : ""}>${esc(x.n)}</option>`).join("");
  const seg = (key, items) => `<div class="seg">${items.map(([v, t]) => `<button type="button" data-k="${key}" data-v="${v}" aria-pressed="${st[key] === v}">${t}</button>`).join("")}</div>`;
  const val = v => v == null ? "" : v;
  const feeHint = d.fee == null
    ? `<div class="hint warn">この回線の額は調べきれていません。お客様の請求書かマイページで確かめて入れてください。目安：2022年7月以降の申込みなら月額料金1か月分ほど。</div>` : "";
  const kHint = k ? `<div class="hint">目安：総額 ${yen(k.total)}を${k.n}回払い${paid != null ? `。開通から ${paid}回払ったとして計算` : "。開通した月を入れると残りの回数が出ます"}</div>`
    : `<div class="hint warn">工事費の額は調べきれていません。請求書の「工事費 分割」の月額と残りの回数を入れてください。</div>`;

  $("#app").innerHTML = `
  <p class="lead">お客様の今の光回線をやめたときにかかるお金の<b>目安</b>です。ここで入れたことは、どこにも残りません。</p>

  <div class="cq"><label for="line">今の回線</label><select id="line">${opt}</select></div>
  <div class="cq"><span class="ql">住まい</span>${seg("home", [["h", "戸建て"], ["m", "マンション"]])}</div>
  <div class="cq"><label for="start">開通した月（わかれば）</label><input type="month" id="start" value="${esc(st.start)}" max="${ym(new Date())}"></div>
  <div class="cq"><span class="ql">申し込んだ時期</span>${seg("era", [["new", "2022年7月以降"], ["old", "2022年6月以前"]])}</div>

  <div class="cbox">
    <h2>解約金</h2>
    <div class="crow"><label for="fee">解約金</label><input type="number" inputmode="numeric" min="0" id="fee" value="${val(d.fee)}" placeholder="例 5500"></div>
    ${feeHint}
    <label class="ck"><input type="checkbox" id="renew"${st.renew ? " checked" : ""}><span>今は<b>更新月</b>（契約が終わる月とその後2か月ほど）なので解約金はかからない</span></label>
  </div>

  <div class="cbox">
    <h2>工事費の残り</h2>
    <div class="crow"><label for="km">1か月の分割の額</label><input type="number" inputmode="numeric" min="0" id="km" value="${val(d.monthly)}" placeholder="例 1191"></div>
    <div class="crow"><label for="kl">残りの回数</label><input type="number" inputmode="numeric" min="0" id="kl" value="${val(d.left)}" placeholder="例 12"></div>
    ${kHint}
    <div class="hint">「工事費実質0円」でも、途中でやめると残りをまとめて払うのがふつうです。一括で払い終わっていれば 0 にします。</div>
  </div>

  <div class="cbox">
    <h2>そのほか</h2>
    <label class="ck"><input type="checkbox" id="tk"${st.tekkyo ? " checked" : ""}><span>撤去工事をする（賃貸で大家さんに求められたときなど）</span></label>
    <div class="crow"><label for="tka">撤去工事費</label><input type="number" inputmode="numeric" min="0" id="tka" value="${val(d.tekkyo)}" placeholder="例 11000"></div>
    <div class="crow"><label for="back">こちらで出せる還元<br><span class="small">違約金の負担・キャッシュバック</span></label><input type="number" inputmode="numeric" min="0" id="back" placeholder="例 30000"></div>
  </div>

  <div class="ctot" id="tot"></div>

  ${l.note ? `<div class="note">${esc(l.note)}</div>` : ""}
  <div class="src">${l.ok ? `額は${esc(l.n)}の公式ページで確かめた目安（${CHECKED}）。` : `額は比べるサイトなどで調べた目安で、公式ページでは確かめていません（${CHECKED}）。`}
  プランやキャンペーン、契約した時期で変わります。<b>正確な額はお客様のマイページか請求書で確かめてもらってください。</b>
  ${l.src ? `<br><a href="${l.src}" target="_blank" rel="noopener">${esc(l.n)}の公式ページ</a>` : ""}</div>`;

  $("#line").onchange = e => { st.line = e.target.value; st.renew = false; st.tekkyo = false; draw(); };
  $("#start").onchange = e => { st.start = e.target.value; if (st.start) st.era = st.start >= "2022-07" ? "new" : "old"; draw(); };
  document.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { st[b.dataset.k] = b.dataset.v; draw(); });
  $("#renew").onchange = e => { st.renew = e.target.checked; total(); };
  $("#tk").onchange = e => { st.tekkyo = e.target.checked; total(); };
  ["fee", "km", "kl", "tka", "back"].forEach(id => $("#" + id).oninput = total);
  total();
}

// 合計（数字を打つたびに、ここだけ書き直す）
function total() {
  const n = id => { const v = Number($("#" + id).value); return isFinite(v) && v > 0 ? Math.round(v) : 0; };
  const fee = st.renew ? 0 : n("fee"), rest = n("km") * n("kl"), tk = st.tekkyo ? n("tka") : 0, back = n("back");
  const sum = fee + rest + tk;
  const unknown = !st.renew && $("#fee").value === "";
  $("#tot").innerHTML = `
    <div class="line"><span>解約金${st.renew ? "（更新月なので0）" : ""}</span><b class="yen">${yen(fee)}</b></div>
    <div class="line"><span>工事費の残り（${n("km").toLocaleString()}円×${n("kl")}回）</span><b class="yen">${yen(rest)}</b></div>
    ${st.tekkyo ? `<div class="line"><span>撤去工事費</span><b class="yen">${yen(tk)}</b></div>` : ""}
    <div class="line big"><span>やめるときにかかる合計</span><b class="yen">${yen(sum)}</b></div>
    ${back ? `<div class="line net"><span>還元を引いたお客様の負担</span><b class="yen">${sum - back > 0 ? yen(sum - back) : "0円（" + yen(back - sum) + "おトク）"}</b></div>` : ""}
    ${unknown ? `<div class="hint warn">解約金が空なので、合計に入っていません。</div>` : ""}`;
}

draw();
