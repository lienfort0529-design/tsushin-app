// 料金シミュレーション（訪問のとき、お客様の今の光回線とauひかりを比べる）
// ・物件ページの「料金シミュレーション」から開く。物件のauひかりのタイプ（?ty=V など）と物件名（?n=）を受け取る
// ・お客様の情報はどこにも送らない・残さない（この画面の中で計算するだけ）
// ・金額は公式ページなどで調べた目安。変わったら LINES・AU と CHECKED（調べた日）を直す
// ・2022年7月以降の申込みは、法律で解約金が「月額料金1か月分ほど」までになった。それより前は高いことがある
"use strict";

const CHECKED = "2026年11月23日";

// 今の回線。mon：月額 {h: 戸建て, m: マンション}（null＝調べきれていない）
// fee：解約金 {new: 2022年7月以降の申込み, old: それより前}。kouji：工事費の分割 [{from: この月以降の開通, total, n}]
// tekkyo：撤去工事費、ok：公式ページで確かめた
const LINES = [
  { id: "docomo", n: "ドコモ光", ok: true,
    mon: { h: 5720, m: 4400 },
    fee: { new: { h: 5500, m: 4180 }, old: { h: 14300, m: 8800 } },
    kouji: [{ from: "", total: 28600, n: 24 }],
    note: "工事費は12回か24回払い（24回で月1,191円）。2026年6月より前の申込みは額が違うことがある",
    src: "https://www.docomo.ne.jp/internet/hikari/construction_costs/" },
  { id: "softbank", n: "ソフトバンク光", ok: true,
    mon: { h: 5720, m: 4180 },
    fee: { new: { h: 5720, m: 4180 }, old: { h: 10450, m: 10450 } },
    kouji: [{ from: "", total: 31680, n: 24 }, { from: "2026-06", total: 47520, n: 24 }],
    note: "解約金は月額料金1か月分。2026年12月から月額が330円上がる（更新月の次の月から）。工事費は2026年6月の申込みから47,520円",
    src: "https://www.softbank.jp/internet/sbhikari/price/" },
  { id: "nuro", n: "NURO光", ok: false, mon: null,
    fee: { new: { h: 0, m: 0 }, old: null },
    kouji: [{ from: "", total: 44000, n: 24 }], tekkyo: 11000,
    note: "2025年10月以降の解約は解約金なしとされる。工事費は割引で相殺される形なので、途中でやめると残りを払う" },
  { id: "commufa", n: "コミュファ光", ok: false,
    mon: { h: 5720, m: 4620 },
    fee: { new: { h: 5720, m: 4620 }, old: { h: 11000, m: 11000 } },
    kouji: null, tekkyo: 13200,
    note: "賃貸は撤去工事（13,200円ほど）が要ることがある" },
  { id: "eo", n: "eo光", ok: false, mon: null, fee: null, kouji: null, note: "解約は1か月前までに電話が要るとされる" },
  { id: "flets", n: "フレッツ光（NTT西日本）", ok: false, mon: null, fee: null, kouji: null, note: "プロバイダの料金と解約金が別にかかることがある" },
  { id: "biglobe", n: "ビッグローブ光", ok: false, mon: null, fee: null, kouji: null, note: "" },
  { id: "sonet", n: "So-net光", ok: false, mon: null, fee: null, kouji: null, note: "" },
  { id: "rakuten", n: "楽天ひかり", ok: false, mon: null, fee: null, kouji: null, note: "" },
  { id: "other", n: "そのほかの光回線", ok: false, mon: null, fee: null, kouji: null, note: "" }
];

// auひかりの月額（税込・目安）。物件ページのタイプ（typeOf）と同じ名前
const AU = [
  { id: "V", n: "マンション タイプV", mon: 4180, note: "16契約以上・ネットだけの額。2027年1月から4,510円",
    src: "https://www.au.com/internet/mansion/typeV/charge/" },
  { id: "G", n: "マンション タイプG", mon: 4950, note: "16契約以上・お得プラン（ネット＋電話）の額。2027年1月から5,280円",
    src: "https://www.au.com/internet/mansion/typeG/" },
  { id: "E", n: "マンション タイプE", mon: 4510, note: "16契約以上・お得プラン（ネット＋電話）の額",
    src: "https://www.au.com/internet/mansion/typeE/charge/" },
  { id: "UR", n: "都市機構（UR）", mon: null, note: "額は物件ごとに確かめる" },
  { id: "GIGA", n: "マンション ギガ", mon: null, note: "額は物件ごとに確かめる" },
  { id: "HOME", n: "ホーム（戸建て）", mon: 5610, note: "ずっとギガ得プラン1年目の目安（2年目5,500円・3年目から5,390円）。2027年1月から330円上がる" },
  { id: "", n: "分からない・そのほか", mon: null, note: "" }
];

const $ = s => document.querySelector(s);
const yen = v => (v < 0 ? "−" : "") + Math.abs(v || 0).toLocaleString("ja-JP") + "円";
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ym = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
const mIdx = s => { const [y, m] = s.split("-").map(Number); return y * 12 + m; };

// 物件ページから受け取る（物件の情報だけ。お客様の情報ではない）
const Q = new URLSearchParams(location.search);
const qTy = Q.get("ty") || "";
const AU_ID = { V: "V", VG: "G", G: "G", E: "E", UR: "UR", URG: "UR", GIGA: "GIGA" }[qTy] || "";

// 選んだこと（お客様の情報なので保存しない）
const st = { line: "docomo", home: "m", era: "new", start: "", renew: false, tekkyo: false, au: AU_ID, years: "2" };

const line = () => LINES.find(l => l.id === st.line);
const au = () => AU.find(a => a.id === st.au);
function koujiOf(l) {
  if (!l.kouji) return null;
  let k = l.kouji[0];
  l.kouji.forEach(x => { if (x.from && st.start && st.start >= x.from) k = x; });
  return k;
}
// 開通してから払った回数（開通の翌月が1回目とする）
const paidN = () => st.start ? Math.max(0, mIdx(ym(new Date())) - mIdx(st.start)) : null;

function defaults() {
  const l = line(), f = l.fee && l.fee[st.era], k = koujiOf(l), paid = paidN();
  return {
    mon: l.mon ? l.mon[st.home] : null,
    fee: f ? f[st.home] : null,
    km: k ? Math.floor(k.total / k.n) : null,
    kl: k && paid != null ? Math.max(0, k.n - paid) : null,
    tka: l.tekkyo || null,
    aum: au() ? au().mon : null
  };
}

function draw() {
  const l = line(), a = au(), d = defaults(), k = koujiOf(l), paid = paidN();
  const sel = (id, list, cur) => `<select id="${id}">${list.map(x => `<option value="${x.id}"${x.id === cur ? " selected" : ""}>${esc(x.n)}</option>`).join("")}</select>`;
  const seg = (key, items) => `<div class="seg">${items.map(([v, t]) => `<button type="button" data-k="${key}" data-v="${v}" aria-pressed="${st[key] === v}">${t}</button>`).join("")}</div>`;
  const num = (id, v, ph) => `<input type="number" inputmode="numeric" min="0" id="${id}" value="${v == null ? "" : v}" placeholder="${ph}">`;
  const ask = t => `<div class="hint warn">${t}</div>`;
  const name = Q.get("n");

  $("#app").innerHTML = `
  ${name ? `<div class="bname">🏢 ${esc(name)}${qTy ? `<span class="small">（auひかり ${esc(a ? a.n : qTy)}）</span>` : ""}</div>` : ""}
  <p class="lead">お客様の今の光回線とauひかりの料金を比べた<b>目安</b>です。ここで入れたことは、どこにも残りません。</p>

  <div class="cbox">
    <h2>今の回線</h2>
    <div class="cq"><label for="line">回線</label>${sel("line", LINES, st.line)}</div>
    <div class="cq"><span class="ql">住まい</span>${seg("home", [["m", "マンション"], ["h", "戸建て"]])}</div>
    <div class="crow"><label for="mon">今の月額</label>${num("mon", d.mon, "例 4400")}</div>
    ${d.mon == null ? ask("今の月額は調べきれていません。お客様の請求書の額を入れてください。") : `<div class="hint">目安の額です。請求書の額がわかればそちらを入れてください。</div>`}
    <div class="crow"><label for="mset">今のセット割（月）<br><span class="small">やめるとなくなるスマホの割引</span></label>${num("mset", null, "例 1100")}</div>
  </div>

  <div class="cbox au">
    <h2>auひかり</h2>
    <div class="cq"><label for="aut">タイプ</label>${sel("aut", AU, st.au)}</div>
    <div class="crow"><label for="aum">auひかりの月額</label>${num("aum", d.aum, "例 4180")}</div>
    ${a && a.note ? `<div class="hint">${esc(a.note)}</div>` : ""}
    ${d.aum == null ? ask("このタイプの額は物件ごとに違います。確かめて入れてください。") : ""}
    <div class="crow"><label for="aset">auのセット割（月）<br><span class="small">auスマートバリューなど</span></label>${num("aset", null, "例 1100")}</div>
  </div>

  <div class="cbox">
    <h2>今の回線をやめるときの費用</h2>
    <div class="cq"><label for="start">開通した月（わかれば）</label><input type="month" id="start" value="${esc(st.start)}" max="${ym(new Date())}"></div>
    <div class="cq"><span class="ql">申し込んだ時期</span>${seg("era", [["new", "2022年7月以降"], ["old", "2022年6月以前"]])}</div>
    <div class="crow"><label for="fee">解約金</label>${num("fee", d.fee, "例 5500")}</div>
    ${d.fee == null ? ask("解約金は調べきれていません。目安：2022年7月以降の申込みなら月額料金1か月分ほど。") : ""}
    <label class="ck"><input type="checkbox" id="renew"${st.renew ? " checked" : ""}><span>今は<b>更新月</b>なので解約金はかからない</span></label>
    <div class="crow"><label for="km">工事費の分割（月）</label>${num("km", d.km, "例 1191")}</div>
    <div class="crow"><label for="kl">工事費の残りの回数</label>${num("kl", d.kl, "例 12")}</div>
    ${k ? `<div class="hint">目安：総額 ${yen(k.total)}を${k.n}回払い${paid != null ? `。開通から ${paid}回払ったとして計算` : "。開通した月を入れると残りの回数が出ます"}。「実質0円」でも途中でやめると残りを払うのがふつうです</div>`
      : ask("工事費の額は調べきれていません。請求書の「工事費 分割」の月額と残りの回数を入れてください。")}
    <label class="ck"><input type="checkbox" id="tk"${st.tekkyo ? " checked" : ""}><span>撤去工事をする（賃貸で求められたときなど）</span></label>
    <div class="crow"><label for="tka">撤去工事費</label>${num("tka", d.tka, "例 11000")}</div>
  </div>

  <div class="cbox">
    <h2>乗り換えの特典</h2>
    <div class="crow"><label for="back">還元<br><span class="small">違約金の負担・キャッシュバック</span></label>${num("back", null, "例 30000")}</div>
  </div>

  <div class="cq"><span class="ql">比べる期間</span>${seg("years", [["1", "1年"], ["2", "2年"], ["3", "3年"]])}</div>
  <div class="ctot" id="tot"></div>

  ${l.note ? `<div class="note"><b>${esc(l.n)}</b>　${esc(l.note)}</div>` : ""}
  <div class="src">${l.ok ? `${esc(l.n)}の額は公式ページで確かめた目安` : `${esc(l.n)}の額は比べるサイトなどで調べた目安（公式では確かめていない）`}。auひかりの額は公式ページの目安（${CHECKED}）。
  プランやキャンペーン、契約した時期で変わります。<b>正確な額はお客様のマイページか請求書で確かめてもらってください。</b>
  ${l.src ? `<br><a href="${l.src}" target="_blank" rel="noopener">${esc(l.n)}の公式ページ</a>` : ""}${a && a.src ? `${l.src ? "・" : "<br>"}<a href="${a.src}" target="_blank" rel="noopener">auひかり ${esc(a.n)}の公式ページ</a>` : ""}</div>`;

  $("#line").onchange = e => { st.line = e.target.value; st.renew = false; st.tekkyo = false; draw(); };
  $("#aut").onchange = e => { st.au = e.target.value; draw(); };
  $("#start").onchange = e => { st.start = e.target.value; if (st.start) st.era = st.start >= "2022-07" ? "new" : "old"; draw(); };
  document.querySelectorAll("[data-k]").forEach(b => b.onclick = () => {
    if (b.dataset.k === "years") { st.years = b.dataset.v; document.querySelectorAll('[data-k="years"]').forEach(x => x.setAttribute("aria-pressed", x === b)); total(); return; }
    st[b.dataset.k] = b.dataset.v; draw();
  });
  $("#renew").onchange = e => { st.renew = e.target.checked; total(); };
  $("#tk").onchange = e => { st.tekkyo = e.target.checked; total(); };
  ["mon", "mset", "aum", "aset", "fee", "km", "kl", "tka", "back"].forEach(id => $("#" + id).oninput = total);
  total();
}

// 結果（数字を打つたびに、ここだけ書き直す）
function total() {
  const n = id => { const v = Number($("#" + id).value); return isFinite(v) && v > 0 ? Math.round(v) : 0; };
  const has = id => $("#" + id).value !== "";
  const nowM = n("mon") - n("mset"), auM = n("aum") - n("aset"), diff = nowM - auM;
  const months = Number(st.years) * 12;
  const fee = st.renew ? 0 : n("fee"), rest = n("km") * n("kl"), tk = st.tekkyo ? n("tka") : 0, cost = fee + rest + tk;
  const back = n("back"), gain = diff * months - cost + back;
  const miss = [!has("mon") && "今の月額", !has("aum") && "auひかりの月額", !st.renew && !has("fee") && "解約金"].filter(Boolean);
  const line = (t, v, cls) => `<div class="line ${cls || ""}"><span>${t}</span><b class="yen">${v}</b></div>`;
  $("#tot").innerHTML = `
    ${line("今の月額（セット割を引く）", yen(nowM))}
    ${line("auひかりの月額（セット割を引く）", yen(auM))}
    ${line("1か月の差", yen(Math.abs(diff)) + (diff >= 0 ? " 安くなる" : " 高くなる"), diff >= 0 ? "good" : "bad")}
    ${line(st.years + "年の差（" + months + "か月）", yen(diff * months))}
    ${line("やめるときの費用（解約金・工事費の残り" + (st.tekkyo ? "・撤去" : "") + "）", "−" + yen(cost))}
    ${back ? line("乗り換えの特典", "＋" + yen(back)) : ""}
    <div class="line big ${gain >= 0 ? "" : "neg"}"><span>${st.years}年で</span><b class="yen">${gain >= 0 ? yen(gain) + " おトク" : yen(-gain) + " 高くなる"}</b></div>
    ${miss.length ? `<div class="hint warn">${miss.join("・")}が空なので、0円として計算しています。</div>` : ""}`;
}

draw();
