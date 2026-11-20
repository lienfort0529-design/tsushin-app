// 訪問（au光のマンション訪問）の画面。モック（au光訪問アプリ）から移したもの。
// 物件データと記録は visit-sync.js が Apps Script（visitData・visitPull・visitPush）とやりとりする
// 結果はカウンター（通信インフラ）に合わせる：不在/インターホンNG/フロントNG/トーク後NG/検討/契約(=獲得)/加入済み(=対象外)/空室(数えない)
// ke(即ケコ)・dg(⚠危険)は前の版の記録を表示するためだけに残す。⚠危険は結果ではなく部屋の印（DGR）
const RES={mi:{l:"未訪問",c:"s-mi"},fu:{l:"不在",c:"s-fu"},ih:{l:"インターホンNG",c:"s-ih"},fr:{l:"フロントNG",c:"s-fr"},so:{l:"トーク後NG",c:"s-so"},kn:{l:"検討",c:"s-kn"},ok:{l:"契約",c:"s-ok"},ka:{l:"加入済み",c:"s-ka"},ak:{l:"空室",c:"s-ak"},ke:{l:"即ケコ（旧）",c:"s-ke"},dg:{l:"⚠危険（旧）",c:"s-dg"}};
const PICK=["fu","ih","fr","so","kn","ok","ka","ak"];
let ME=VS.me();
// BLD: [id, 市区町村, 建物名, 住所, 棟数, 棟(・区切り), 種別 n=無い/p=一部だけ/c=現場で確認, 補足]
const B=window.BLD.map(a=>({id:a[0],city:a[1],name:a[2],addr:a[3],nt:a[4],tou:a[5]?a[5].split("・"):[""],kind:a[6],note:a[7],lat:a[8],lng:a[9],no:a[10]||"",est:a[11]||"",web:a[12]||{}}));
// DBX: [id, 市区町村, 建物名, 住所, 緯度, 経度, 物件番号, {間取り等}, 最終更新, フォルダ]
// フォルダに入っていないDropboxの物件は city にファイル名が入るので、住所から市区町村を取り出す
const cityFix=(c,a)=>{if(c&&!/\.txt$/.test(c))return c;const m=String(a||"").replace(/^〒?\s*\d{3}-?\d{4}\s*/,"").replace(/^大阪府/,"").match(/^(大阪市.+?区|堺市.+?区|.+?[市町村])/);return m?m[1]:"市区町村が不明"};
(window.DBX||[]).forEach(a=>B.push({id:a[0],city:cityFix(a[1],a[3]),name:a[2],addr:a[3],nt:1,tou:[""],kind:"d",note:"",lat:a[4],lng:a[5],no:a[6]||"",dm:a[7]||{},up:a[8]||"",dir:a[9]||""}));
const META=window.META||{updated:"2026-11-15"};
const BY={};B.forEach(b=>BY[b.id]=b);
// 市区町村の並び：大阪市の区 → 堺市の区 → ほかの市町村（あいうえお順）→ 不明。件数つき
const CITY_N={};B.forEach(b=>CITY_N[b.city]=(CITY_N[b.city]||0)+1);
const cityRank=c=>/^大阪市/.test(c)?0:/^堺市/.test(c)?1:c==="市区町村が不明"?3:2;
// 区はいつもの順（区のコード順）
const WARD_ORDER={大阪:["北","都島","福島","此花","中央","西","港","大正","天王寺","浪速","西淀川","淀川","東淀川","東成","生野","旭","城東","鶴見","阿倍野","住之江","住吉","東住吉","平野","西成"],堺:["堺","中","東","西","南","北","美原"]};
const wardIx=c=>{const m=c.match(/^(大阪|堺)市(.+)区$/);const i=m?WARD_ORDER[m[1]].indexOf(m[2]):-1;return i<0?99:i};
const CITIES=Object.keys(CITY_N).sort((a,b)=>cityRank(a)-cityRank(b)||wardIx(a)-wardIx(b)||a.localeCompare(b,"ja"));
const VTAG=b=>"";
const KIND={d:'<span class="tag as">Dropboxにあり</span>',n:"",p:'<span class="tag part">一部だけDropboxにあり</span>',c:'<span class="tag chk">現場で確認</span>'};
// 保存：記録(H)と部屋の形(L)。モックなので端末のlocalStorage。
function load(k,d){if(VS.has(k))return VS.get(k);try{return JSON.parse(localStorage.getItem("hkV_"+k))||d}catch(e){return d}}
function save(k,v){if(VS.has(k))return VS.save(k,v);try{localStorage.setItem("hkV_"+k,JSON.stringify(v))}catch(e){}}
const MEMOF=[["madori","間取り"],["menseki","広さ（㎡）"],["yachin","家賃（万円）"],["kosu","戸数","number"],["kai","階建","number"],["shubetsu","種別"],["jp","JP"],["port","空ポ/全ポ"],["shunko","竣工（年）","year"],["lock","オートロック"],["kanri","管理会社"],["type","住居タイプ分賃"],["biko","備考","wide"]];
const MM=load("au_memo",{});
const H=load("au_hist",{}), LAY=load("au_layout",{}), PUB=load("au_pub",{});
const DGR=load("au_danger",{});
(()=>{let ch=false;Object.keys(H).forEach(k=>H[k].forEach(h=>{if(h.s==="dg"&&!DGR[k]){DGR[k]={w:h.w,d:h.d,t:h.t||0,m:h.m||""};ch=true}}));if(ch)save("au_danger",DGR)})();
let ROLE="own";
const isPub=b=>b.kind==="d"||!!PUB[b.id];
const memOf=b=>{const w=Object.assign({},b.web||{});delete w.src;return Object.assign(w,b.dm||{},MM[b.id]||{})};
const VIS=()=>ROLE==="agency"?B.filter(isPub):B;
const st={view:"list",v:"list",f:"all",q:"",city:"",b:null,t:0,mode:"list",room:null,pick:null,lim:50,near:false,pos:null,auto:true};
Object.assign(st,load("au_view",{}));st.pos=null;st.near=false;
const keep=()=>save("au_view",{estOn:st.estOn,src:st.src,f:st.f,city:st.city,auto:st.auto,view:st.view,base:st.base,mg:st.mg,lk:st.lk,adv:st.adv});
function km(b){if(!st.pos||b.lat==null)return 1e9;const R=6371,r=Math.PI/180,dl=(b.lat-st.pos[0])*r,dg=(b.lng-st.pos[1])*r;const x=Math.sin(dl/2)**2+Math.cos(st.pos[0]*r)*Math.cos(b.lat*r)*Math.sin(dg/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function dtxt(d){return d>=1e8?"":d<1?Math.round(d*1000/10)*10+"m":d.toFixed(1)+"km"}
function cityCenter(){const a=VIS().filter(b=>b.city===st.city&&b.lat!=null);if(!a.length)return null;return [a.reduce((s,b)=>s+b.lat,0)/a.length,a.reduce((s,b)=>s+b.lng,0)/a.length]}
function fallbackNear(msg){const c=st.city&&cityCenter();if(c){st.pos=c;st.posCity=true;st.near=true;st.lim=50;render();toast(msg+"。"+st.city+"の中心から近い順に出しています")}else toast(msg+"。市区町村を選ぶと、その中心から近い順に出せます")}
function locate(){if(!navigator.geolocation)return fallbackNear("この画面では現在地が使えません");toast("現在地を取得中…");navigator.geolocation.getCurrentPosition(p=>{st.pos=[p.coords.latitude,p.coords.longitude];st.posCity=false;st.near=true;st.lim=50;render()},e=>fallbackNear(e.code===1?"位置情報が許可されていません":"現在地を取得できませんでした"),{enableHighAccuracy:true,timeout:15000,maximumAge:60000})}
function hereCity(){let m=null,d=1e9;VIS().forEach(b=>{const x=km(b);if(x<d){d=x;m=b}});return m?m.city:""}
try{st.mode=localStorage.getItem("mode")||"list"}catch(e){}
const $=s=>document.querySelector(s);
const tk=(b,t)=>b.id+"#"+t;
const hist=k=>H[k]||[];
const last=k=>{const h=hist(k);return h.length?h[h.length-1]:null};
const cnt=(lay,f)=>lay.fp&&lay.fp[f]!=null?lay.fp[f]:lay.p;
const gone=(lay,no)=>!!(lay&&lay.x&&lay.x.includes(no));
function rooms(b,t){const lay=LAY[tk(b,t)];if(!lay)return[];const a=[];for(let f=lay.f;f>=1;f--)for(let r=1;r<=cnt(lay,f);r++){const no=f+String(r).padStart(2,"0");if(!gone(lay,no))a.push(tk(b,t)+"-"+no)}return a}
function allRooms(b){return b.tou.flatMap((_,t)=>rooms(b,t))}
function touched(b){return allRooms(b).some(k=>hist(k).length)}
const isHot=b=>b.kind!=="d"&&!touched(b);
function stats(ks){const c={};Object.keys(RES).forEach(s=>c[s]=0);ks.forEach(k=>{const l=last(k);c[l?l.s:"mi"]++});c.dg=ks.filter(k=>DGR[k]).length;return c}
const hm=t=>t>1e12?(d=>String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"))(new Date(t)):"";
const when=h=>h.d+(hm(h.t)?" "+hm(h.t):"");
function esc(t){return String(t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function chip(s){return `<span class="st ${RES[s].c}">${RES[s].l}</span>`}
function barHTML(ks){const c=stats(ks),t=ks.length||1;const col={fu:"--r-fu-t",ih:"--r-ih-t",fr:"--r-ke-t",ke:"--r-ke-t",so:"--r-so-t",kn:"--r-kn-t",ok:"--r-ok"};
 return `<div class="bar" aria-hidden="true">${Object.keys(col).map(s=>c[s]?`<span style="width:${c[s]/t*100}%;background:var(${col[s]})"></span>`:"").join("")}</div>`}
let MAP=null;
function drawMap(){const el=$("#map");if(!el||!window.L)return;if(MAP){MAP.remove();MAP=null}
 MAP=L.map(el,{preferCanvas:true,zoomControl:true});
 const att='<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';
 const base={map:L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",{maxZoom:18,attribution:att}),
  sat:L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",{maxZoom:18,attribution:att})};
 base[st.base||"map"].addTo(MAP);
 const Sw=L.Control.extend({options:{position:"bottomleft"},onAdd(){const d=L.DomUtil.create("div","mapsw");d.innerHTML=`<button data-base="map" aria-pressed="${(st.base||"map")==="map"}">地図</button><button data-base="sat" aria-pressed="${st.base==="sat"}">航空写真</button>`;L.DomEvent.disableClickPropagation(d);
  d.onclick=e=>{const k=e.target.dataset.base;if(!k)return;MAP.removeLayer(base[st.base||"map"]);st.base=k;base[k].addTo(MAP);d.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x.dataset.base===k));keep()};return d}});
 new Sw().addTo(MAP);
 const a=filtered().filter(b=>b.lat!=null),pts=[];
 a.forEach(b=>{const col=b.kind==="c"?"#c92a2a":b.kind==="p"?"#c99a00":touched(b)?"#1f4e79":"#e8590c";
  L.circleMarker([b.lat,b.lng],{radius:Math.min(12,5+Math.sqrt(b.nt)),color:"#fff",weight:1.5,fillColor:col,fillOpacity:.9}).addTo(MAP)
   .bindPopup(`<b>${esc(b.name)}</b><br>${esc(b.addr)}${b.nt>1?"・"+b.nt+"棟":""}${roomTxt(b)&&(ROLE==="own"||isPub(b))?"<br>🏠 "+esc(roomTxt(b)):""}${st.pos?"<br>現在地から "+dtxt(km(b)):""}<button class="pop" data-b="${b.id}">この物件を開く</button><a class="gm" href="https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}" target="_blank" rel="noopener">Googleマップで道案内</a>`);pts.push([b.lat,b.lng])});
 if(st.pos){L.circleMarker(st.pos,{radius:8,color:"#fff",weight:3,fillColor:"#2f9e44",fillOpacity:1}).addTo(MAP);MAP.setView(st.pos,15)}
 else if(pts.length)MAP.fitBounds(pts,{padding:[20,20],maxZoom:16});else MAP.setView([34.69,135.5],10)}
function rowsFor(b){const m=memOf(b),ks=allRooms(b),c=stats(ks);const hs=ks.flatMap(k=>hist(k));const lastD=hs.map(h=>h.d).sort().pop()||"";const g=age(m);
 return {"市区町村":b.city,"物件名":b.name,"住所":b.addr,"棟数":b.nt,"Dropbox":b.kind==="d"?"あり":b.kind==="p"?"一部だけ":b.kind==="c"?"現場で確認":"無い","間取り":m.madori||"","広さ㎡":m.menseki||"","家賃万円":m.yachin||"","竣工":m.shunko||"","築年数":g!=null?g:"","オートロック":m.lock||"","管理会社":m.kanri||"","戸数":m.kosu||"","作成部屋数":ks.length,"訪問済み部屋":ks.filter(k=>hist(k).length).length,"検討":c.kn,"契約":c.ok,"最終訪問":lastD,"メモ":m.free||"","物件番号":b.no}}
function admRows(){let a=B;const A=st.adm||{};if(A.city)a=a.filter(b=>b.city===A.city);if(A.k==="memo")a=a.filter(b=>MM[b.id]);if(A.k==="go")a=a.filter(touched);if(A.k==="pub")a=a.filter(isPub);if(A.k==="p")a=a.filter(b=>b.kind==="p");
 if(A.q){const q=A.q.normalize("NFKC").toLowerCase();a=a.filter(b=>(b.name+b.addr+Object.values(memOf(b)).join(" ")).normalize("NFKC").toLowerCase().includes(q))}return a}
function csvDown(name,objs){if(!objs.length)return toast("出力する行がありません");const hd=Object.keys(objs[0]);const e=v=>{v=String(v??"");return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
 const txt="\ufeff"+[hd.join(","),...objs.map(o=>hd.map(h=>e(o[h])).join(","))].join("\r\n");(async()=>{const dl=window.claude&&window.claude.use?await window.claude.use("downloads"):null;if(dl){try{await dl.save({filename:name,data:new Blob([txt],{type:"text/csv"})});toast(objs.length+"行を書き出しました")}catch(e){toast("保存をやめました")}return}const u=URL.createObjectURL(new Blob([txt],{type:"text/csv"}));const a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);toast(objs.length+"行を書き出しました")})()}
function askName(after){$("#layer").innerHTML=`<div class="shade" id="shade"></div><div class="sheet" role="dialog" aria-label="名前の登録"><div class="in"><div class="grab"></div><b style="font-size:17px">あなたの名前</b><p class="small">記録に「誰が・いつ」を残すために使います。一度入れれば、この端末では次から聞きません。</p><input class="search" id="mename" placeholder="名前" value="${esc(ME)}" autocomplete="name"><button class="save" id="savename">この名前で記録する</button></div></div>`;window.__afterName=after;setTimeout(()=>{const i=$("#mename");i&&i.focus()},200)}
let skipH=false;const listY={};const STK=[];
// 戻るボタンの文字：一個前の画面の名前
function backLabel(){const pv=STK[STK.length-1];if(!pv)return st.view==="map"?"地図へ戻る":"物件一覧へ戻る";if(pv.b)return "前の物件へ戻る";return pv.v==="news"?"お知らせへ戻る":pv.v==="my"?"マイページへ戻る":pv.v==="admin"?"管理者画面へ戻る":st.view==="map"?"地図へ戻る":"物件一覧へ戻る"}
function curH(){return st.b?"b"+st.b:(st.v==="list"?"list":st.v)}
function pushH(){const h=curH();if(location.hash.slice(1)!==h){skipH=true;location.hash=h}}
function applyH(){const h=location.hash.slice(1);if(st.room)closeRoom();if(!/^b\d+$/.test(h))STK.length=0;
 if(/^b\d+$/.test(h)&&BY[+h.slice(1)]){st.v="list";st.b=+h.slice(1)}else if(h==="news"||h==="admin"||h==="my"){st.v=h;st.b=null}else{st.v="list";st.b=null}
 render();if(st.v==="list"&&!st.b&&listY.y)setTimeout(()=>scrollTo(0,listY.y),0)}
window.addEventListener("hashchange",()=>{if(skipH){skipH=false;return}applyH()});
// 画面を作り直しても、今見ている位置のままにする（棟・リスト・マス目などの切り替え用）
function keepY(f){const y=scrollY;f();scrollTo(0,y)}
function render(){document.body.classList.toggle("wide",st.v==="admin");if((ROLE==="agency"||!VS.admin())&&st.v==="admin")st.v="list";
 document.querySelector('[data-v="admin"]').hidden=ROLE==="agency"||!VS.admin();
 $("#whobar").innerHTML=`記録する人：<b>${ME?esc(ME):"未登録"}</b><a class="chg" href="./">${ME?"変更":"名前を選ぶ"}</a>`;
 $("#role").innerHTML="";$("#role").hidden=true;
 document.querySelectorAll(".tab").forEach(t=>t.setAttribute("aria-selected",t.dataset.v===st.v));
 const nn=ROLE==="agency"?0:allRecs().filter(h=>h.s==="ok"&&h.t&&Date.now()-h.t<7*864e5).length;$("#nb").textContent=nn;$("#nb").hidden=!nn;
 const app=$("#app");
 if(st.v==="news")app.innerHTML=news();else if(st.v==="my")app.innerHTML=my();else if(st.v==="admin")app.innerHTML=admin();else app.innerHTML=st.b?detail():list();
 window.scrollTo(0,0);if(st.v==="list"&&!st.b&&st.view==="map")drawMap();else if(MAP){MAP.remove();MAP=null}}
function emptyMsg(){const L={f:{hot:"🔥未着手",part:"一部だけ",chk:"現場で確認",go:"訪問中"},mg:{s:"1R・1K",d1:"1DK・1LDK",f2:"2K〜2LDK",f3:"3DK以上",fam:"ファミリー"},lk:{yes:"オートロックあり",no:"オートロックなし"}};const on=["f","mg","lk"].filter(k=>st[k]&&st[k]!=="all").map(k=>L[k][st[k]]||st[k]);if(advN())on.push("詳細条件");if(!on.length)return '<p class="lead">該当する物件がありません。</p>';const keep={f:st.f,mg:st.mg,lk:st.lk,adv:st.adv};st.f="";st.mg="";st.lk="";st.adv=null;const n=filtered().length;Object.assign(st,keep);return `<div class="note"><b>該当する物件がありません</b><div class="small" style="margin:4px 0 8px">いま「${on.map(esc).join("・")}」で絞り込んでいます。${n?`この絞り込みを外すと ${n}件 あります。`:""}</div><button class="save" id="clr">絞り込みを外す</button></div>`}
function filtered(){let a=VIS();const src=st.src||"t";if(src==="t")a=a.filter(b=>b.kind!=="d");else if(src==="d")a=a.filter(b=>b.kind==="d");
 if(st.city)a=a.filter(b=>b.city===st.city);
 if(st.f==="hot")a=a.filter(isHot);if(st.f==="part")a=a.filter(b=>b.kind==="p");if(st.f==="chk")a=a.filter(b=>b.kind==="c");if(st.f==="go")a=a.filter(touched);
 const G=b=>{const g=mgOf(memOf(b));return g||(st.estOn!==false?(b.est==="s"?"s~":b.est==="f"?"fam~":""):"")};
 if(st.mg==="fam")a=a.filter(b=>["f2","f3","fam~"].includes(G(b)));else if(st.mg==="s")a=a.filter(b=>["s","s~"].includes(G(b)));else if(st.mg)a=a.filter(b=>G(b)===st.mg);
 if(st.lk)a=a.filter(b=>{const x=lockOf(memOf(b));return x===st.lk||(st.lk==="no"&&x==="est")});
 if(st.q){const qs=st.q.normalize("NFKC").toLowerCase().split(/\s+/).filter(x=>x);a=a.filter(b=>{const m=memOf(b);const hay=(b.name+" "+b.city+" "+b.addr+" "+(ROLE==="own"||isPub(b)?Object.values(m).join(" "):"")).normalize("NFKC").toLowerCase();return qs.every(q=>hay.includes(q))})}
 const D=ADV();
 if(D.mgs.length){const M={s:["s","s~"],d1:["d1"],f2:["f2","fam~"],f3:["f3","fam~"]};const ok=D.mgs.flatMap(k=>M[k]||[k]);a=a.filter(b=>ok.includes(G(b)))}
 if(D.kosu)a=a.filter(b=>{const n=kosuOf(b);return n==null?D.unk:n>=D.kosu});
 if(D.left)a=a.filter(b=>{const ks=allRooms(b);return !ks.length||ks.filter(k=>!hist(k).length).length*2>=ks.length});
 if(D.kn)a=a.filter(b=>allRooms(b).some(k=>{const l=last(k);return l&&l.s==="kn"}));
 if(st.near&&st.pos)a=a.slice().sort((x,y)=>km(x)-km(y));
 return a}
// 詳細条件（間取りの複数選択・戸数・まだ回っていない部屋が多い・検討あり）
const ADV=()=>Object.assign({mgs:[],kosu:0,left:false,kn:false,unk:true},st.adv||{});
const kosuOf=b=>{const m=String(memOf(b).kosu||"").normalize("NFKC").match(/\d+/);return m?+m[0]:null};
const advN=()=>{const D=ADV();return (D.mgs.length?1:0)+(D.kosu?1:0)+(D.left?1:0)+(D.kn?1:0)};
function advBox(){const D=ADV(),n=filtered().length;const ck=(on,attr,l)=>`<button class="chip" ${attr} aria-pressed="${on}">${l}</button>`;
 return `<div class="adv"><div class="advh">間取り（いくつでも）</div><div class="chips">${MG.slice(1).map(([k,l])=>ck(D.mgs.includes(k),`data-advmg="${k}"`,l)).join("")}</div>
 <div class="advh">戸数</div><div class="chips">${[[0,"指定なし"],[20,"20戸以上"],[50,"50戸以上"],[100,"100戸以上"]].map(([k,l])=>ck(D.kosu===k,`data-advk="${k}"`,l)).join("")}</div>
 ${D.kosu?`<label class="auto" style="margin:0 0 4px"><input type="checkbox" id="advUnk" ${D.unk?"checked":""}>戸数が分からない物件も出す</label>`:""}
 <div class="advh">訪問の状況</div><div class="chips">${ck(D.left,'data-advb="left"',"まだ回っていない部屋が半分以上")}${ck(D.kn,'data-advb="kn"',"検討の部屋がある")}</div>
 <div class="advf"><button class="advclr" id="advClr">条件をクリア</button><button class="save" id="advGo">${n.toLocaleString()}件の物件を見る</button></div></div>`}
function list(){const a=filtered();const hc=st.near&&st.pos?hereCity():"";
 const F=[["all","すべて"],["hot","🔥未着手"],["go","訪問中"],["part","一部だけ"],["chk","現場で確認"]];
 return `<button class="near" id="near" aria-pressed="${st.near}">${st.near?"📍 近い順で表示中（タップで解除）":"📍 現在地から近い物件"}</button>
 ${hc?`<div class="here"><span>${st.posCity?"基準":"いまいる場所"}：<b>${st.posCity?st.city+"の中心":hc}</b></span>${st.city!==hc?`<button data-city="${hc}">${hc}だけ見る</button>`:""}</div>`:""}
 <input class="search" id="q" type="search" enterkeyhint="search" placeholder="物件名・住所・メモで検索（例：大正区 1DK）" value="${esc(st.q)}">
 <select class="sel" id="city" aria-label="市区町村"><option value="">大阪府すべて（${VIS().length.toLocaleString()}件）</option>${CITIES.map(c=>`<option value="${esc(c)}" ${c===st.city?"selected":""}>${esc(c)}（${CITY_N[c].toLocaleString()}）</option>`).join("")}</select>
 <div class="seg" style="margin-top:10px">${[["t","自社リスト物件","Dropboxに無い"],["d","上位店の公開物件","Dropboxにある"],["a","すべて",""]].map(([k,l,n])=>`<button data-src="${k}" aria-pressed="${(st.src||"t")===k}">${l}${n?`<small class="segn">${n}</small>`:""}</button>`).join("")}</div>
 <button class="advbtn" id="advBtn" aria-expanded="${!!st.advOpen}">🔎 詳細条件${advN()?`<span class="advn">${advN()}件</span>`:""}<span class="ar">${st.advOpen?"▲":"▼"}</span></button>
 ${st.advOpen?advBox():""}
 <div class="chips">${F.map(([k,l])=>`<button class="chip" data-f="${k}" aria-pressed="${st.f===k}">${l}</button>`).join("")}</div>
 <div class="chips" style="margin-top:-4px">${MG.map(([k,l])=>`<button class="chip" data-mg="${k}" aria-pressed="${(st.mg||"")===k}">${l}</button>`).join("")}<button class="chip" data-mg="fam" aria-pressed="${st.mg==="fam"}">ファミリー（2K以上）</button></div>
 <div class="chips" style="margin-top:-4px">${[["","オートロック：指定なし"],["yes","🔒あり"],["no","なし"]].map(([k,l])=>`<button class="chip" data-lk="${k}" aria-pressed="${(st.lk||"")===k}">${l}</button>`).join("")}</div>
 ${(()=>{const [k,t]=timeHint();return st.mg===k?"":`<div class="here"><span>🕒 ${t}</span><button data-mg="${k}">この条件で出す</button></div>`})()}
 ${st.mg||st.lk||ADV().mgs.length?`<label class="auto" style="margin:2px 0 6px"><input type="checkbox" id="estOn" ${st.estOn!==false?"checked":""}>名前から推定した物件も出す（「推定」の印つき）</label>`:""}
 <div class="seg"><button data-view="list" aria-pressed="${st.view==="list"}">リスト</button><button data-view="map" aria-pressed="${st.view==="map"}">地図</button></div>
 <div id="res">${listRes(a)}</div>`}
function listRes(a){return ` ${st.view==="map"?`<div id="map" role="region" aria-label="物件の地図"></div><div class="legend"><span><i style="background:#e8590c"></i>未着手</span><span><i style="background:#1f4e79"></i>訪問中</span><span><i style="background:#c99a00"></i>一部だけ</span><span><i style="background:#c92a2a"></i>現場で確認</span><span><i style="background:#2f9e44"></i>現在地</span></div><div class="small" style="margin-top:4px">${a.filter(b=>b.lat!=null).length.toLocaleString()}件を表示中</div>`:`<div class="small" style="margin-bottom:6px">${a.length.toLocaleString()}件（${st.near&&st.pos?"近い順":"棟数の多い順"}）</div>
 <div class="list">${a.slice(0,st.lim).map(b=>bCard(b)).join("")||emptyMsg()}</div>
 ${a.length>st.lim?`<button class="more" id="more">さらに表示（残り ${(a.length-st.lim).toLocaleString()}件）</button>`:""}`}`}
const age=m=>{const y=m&&String(m.shunko||"").match(/(19|20)\d\d/);return y?new Date().getFullYear()-+y[0]:null};
const lockOf=m=>{const l=m&&m.lock||"";if(/^不明/.test(l))return "est";if(!l||/不確実|棟により/.test(l))return "";if(/^なし|オートロックなし/.test(l))return "no";return "yes"};
function roomTxt(b){const m=memOf(b);if(!Object.keys(m).length)return b.est==="s"?"単身向け（推定）":b.est==="f"?"ファミリー向け（推定）":"";const g=age(m);const a=[m.madori||(b.est==="s"?"単身向け（推定）":b.est==="f"?"ファミリー向け（推定）":""),m.menseki?m.menseki+"㎡":"",m.yachin?String(m.yachin).replace(/万円?$/,"")+"万円":"",g!=null?"築"+g+"年":"",lockOf(m)==="yes"?"🔒オートロック":lockOf(m)==="no"?"オートロックなし":lockOf(m)==="est"?"オートロックなし（推定）":""].filter(x=>x);return a.join("・")}
// 間取りのグループ
const MG=[["","間取り：すべて"],["s","1R・1K"],["d1","1DK・1LDK"],["f2","2K〜2LDK"],["f3","3DK以上"]];
function mgOf(m){const t=(m&&m.madori||"").toUpperCase().normalize("NFKC");if(!t)return "";if(/^1(R|K)\b|^1R|^1K$/.test(t)||t==="1R"||t==="1K")return "s";if(/^1(DK|LDK|SLDK)/.test(t))return "d1";if(/^2/.test(t))return "f2";if(/^[3-9]/.test(t))return "f3";if(/ファミリー/.test(t))return "f2";return ""}
function timeHint(){const h=new Date().getHours();return h>=16||h<5?["s","夕方〜夜は1R・1Kがねらい目"]:["fam","日中はファミリー向け（2K以上）がねらい目"]}
function memoBox(b){const m=MM[b.id]||{};const can=ROLE==="own";
 if(!can&&!isPub(b))return "";
 if(st.editMemo&&can)return `<div class="setup"><b>自社メモ</b><div class="small" style="margin-bottom:8px">Dropboxに無い物件なので、ここに分かったことを書いておきます。</div>
  <div class="memo-f">${MEMOF.map(([k,l,t])=>`<label class="${t==="wide"?"w":""}">${l}${k==="madori"?`<input id="m_${k}" list="madoriList" placeholder="例：1K・1LDK" value="${esc(m[k]||"")}">`:k==="menseki"?`<input id="m_${k}" inputmode="decimal" placeholder="例：22〜25" value="${esc(m[k]||"")}">`:k==="yachin"?`<input id="m_${k}" inputmode="decimal" placeholder="例：6.5〜7.2" value="${esc(m[k]||"")}">`:k==="lock"?`<select id="m_${k}"><option></option>${["オートロックあり","カメラありオート","カメラなしオート","オートロックなし"].map(o=>`<option ${m[k]===o?"selected":""}>${o}</option>`).join("")}</select>`:k==="shubetsu"?`<select id="m_${k}"><option></option>${["ａｕひかり　タイプＶ","ａｕひかり　タイプＧ","ａｕひかり　タイプＥ","ａｕひかり"].map(o=>`<option ${m[k]===o?"selected":""}>${o}</option>`).join("")}</select>`:`<input id="m_${k}" ${t==="number"||t==="year"?'type="number" inputmode="numeric"':""} ${t==="year"?'placeholder="例：2002" min="1950" max="2030"':""} value="${esc(m[k]||"")}">`}</label>`).join("")}
  <datalist id="madoriList">${["1R","1K","1DK","1LDK","2K","2DK","2LDK","3DK","3LDK","4LDK","ファミリー混在"].map(o=>`<option value="${o}">`).join("")}</datalist>
  <label class="w">メモ（自由に）<textarea id="m_free" placeholder="例：管理人は平日9-17時。裏口から入れる。">${esc(m.free||"")}</textarea></label></div>
  <button class="save" id="savememo">メモを保存</button><button class="more" id="cancelmemo" style="margin-top:6px">やめる</button></div>`;
 const has=MEMOF.some(([k])=>m[k])||m.free;
 return `<div class="note">${can?'<button class="edit" id="editmemo">'+(has?"編集":"書く")+'</button>':""}<b>自社メモ</b>${has?`<dl class="mv">${MEMOF.filter(([k])=>m[k]).map(([k,l])=>`<dt>${l}</dt><dd>${esc(m[k])}</dd>`).join("")}</dl>${m.free?`<div style="margin-top:6px;white-space:pre-wrap">${esc(m.free)}</div>`:""}${m.at?`<div class="small" style="margin-top:6px">${m.at} ${esc(m.by)} 更新</div>`:""}`:'<span style="color:var(--sub)">まだありません。オートロック・管理会社・戸数など分かったことを書けます。</span>'+(b.web&&b.web.src?`<button class="more" data-webmemo="${b.id}">ネット情報のとおりなら、ワンタップで入れる</button>`:"")}</div>`}
function sizeOf(b){const m=memOf(b);const n=v=>{const x=parseInt(String(v||"").normalize("NFKC"),10);return isNaN(x)?0:x};const kai=n(m.kai),kosu=n(m.kosu);const per=kai&&kosu?Math.max(1,Math.round(kosu/Math.max(1,b.nt)/Math.max(1,kai-((kai>3)?1:0)))):0;return {kai,kosu,per}}
function edBar(b,lay){return `<div class="edbar"><button class="edbtn" id="edt" aria-pressed="${!!st.ed}">${st.ed?"部屋数の変更を終わる":"部屋数を直す"}</button>${st.ed?`<span class="small">階ごとに ＋／− で直せます。無い部屋は「存在しない」を押すと一覧から消えます（「戻す」で元に戻せます）。記録がある部屋は消せません。</span><div class="edrow"><span>階数 ${lay.f}階</span><button data-ef="-1">−階</button><button data-ef="1">＋階</button></div>`:""}</div>`}
function edFl(f,n){return `<span class="edfl"><span>${n}部屋</span><button data-er="${f}" data-d="-1" aria-label="${f}階の部屋を1つ減らす">−</button><button data-er="${f}" data-d="1" aria-label="${f}階の部屋を1つ増やす">＋</button></span>`}
function setupForm(b){const lab=b.tou[st.t]||"";const z=sizeOf(b);
 return `<div class="setup"><b>${lab?esc(lab)+"の":""}部屋を作成</b><div class="small">${z.kai?`ネット等の情報：${z.kai}階建${z.kosu?"・"+z.kosu+"戸":""}${z.per?`（1フロア約${z.per}戸の目安）`:""}。数字を入れておいたので、現地で見て直してください。`:"部屋数のデータはまだありません。現地で見て、階数と1フロアの戸数を入れてください。"}</div>
 <div class="row"><label>階数<input id="lf" type="number" inputmode="numeric" min="1" max="60" value="${z.kai||5}"></label><label>1フロアの戸数<input id="lp" type="number" inputmode="numeric" min="1" max="40" value="${z.per||4}"></label></div>
 <button class="save" id="mk">部屋を作る</button></div>`}
function bHist(b){const out=[];b.tou.forEach((t,ti)=>{Object.keys(H).forEach(k=>{if(!k.startsWith(b.id+"#"+ti+"-"))return;H[k].forEach(h=>out.push({...h,room:k.split("-").pop(),tou:b.tou.length>1?t:""}))})});return out.sort((x,y)=>(y.t||0)-(x.t||0))}
function detail(){const b=BY[st.b];if(RECENT[0]!==b.id){const i=RECENT.indexOf(b.id);if(i>=0)RECENT.splice(i,1);RECENT.unshift(b.id);if(RECENT.length>10)RECENT.length=10;save("au_recent",RECENT)}if(st.t>=b.tou.length)st.t=0;
 const ks=rooms(b,st.t),lay=LAY[tk(b,st.t)],c=stats(allRooms(b));
 let body="";
 if(!lay)body=setupForm(b);
 else if(st.mode==="list"){body+=edBar(b,lay);for(let f=lay.f;f>=1;f--){body+=`<div class="fl">${f}F${st.ed?edFl(f,cnt(lay,f)):""}</div>`;for(let r=1;r<=cnt(lay,f);r++){const no=f+String(r).padStart(2,"0"),k=tk(b,st.t)+"-"+no,l=last(k);const n=hist(k).filter(h=>h.s==="fu").length;
  if(gone(lay,no)){if(st.ed)body+=`<div class="room gone"><span class="no">${no}</span><span class="small">存在しない部屋</span><button class="rmb" data-back="${no}">戻す</button></div>`;continue}
  if(st.ed){body+=`<div class="room"><span class="no">${no}</span>${chip(l?l.s:"mi")}${hist(k).length?`<span class="small">記録あり</span>`:`<button class="rmb" data-gone="${no}">存在しない</button>`}</div>`;continue}
  body+=`<button class="room" data-k="${k}"><span class="no">${no}</span>${chip(l?l.s:"mi")}<span class="memo ${DGR[k]?"dg":""}">${DGR[k]?"⚠危険 ":""}${l?`${when(l)}${n>1&&l.s==="fu"?` 不在×${n}`:""}${l.m?"「"+esc(l.m)+"」":""}`:""}</span></button>`}}}
 else{const mx=Math.max(1,...Array.from({length:lay.f},(_,i)=>cnt(lay,i+1)));body=edBar(b,lay)+(st.ed?`<div class="small" style="margin:4px 0">部屋数は「リスト」表示で直せます。</div>`:"")+`<div class="grid" style="grid-template-columns:32px repeat(${mx},1fr)">`;for(let f=lay.f;f>=1;f--){body+=`<div class="gfl">${f}F</div>`;for(let r=1;r<=mx;r++){const no=f+String(r).padStart(2,"0");if(r>cnt(lay,f)||gone(lay,no)){body+=`<div></div>`;continue}const k=tk(b,st.t)+"-"+no,l=last(k),s=l?l.s:"mi";body+=`<button class="cell ${RES[s].c}" data-k="${k}">${no}<small>${DGR[k]?"⚠":""}${s==="mi"?"":RES[s].l}</small></button>`}}body+="</div>"}
 const touHTML=b.tou.length>1?`<div class="small" style="margin-top:10px">棟を選ぶ（${b.tou.length}棟）</div><div class="tous">${b.tou.map((t,i)=>`<button data-t="${i}" aria-pressed="${i===st.t}" class="${LAY[tk(b,i)]?"done":""}">${esc(t)}</button>`).join("")}</div>`:"";
 return `<button class="back" id="back"><span class="ar">‹</span><span>${backLabel()}</span><span class="bn">${esc(b.name)}</span></button><div class="dt">
 <div class="top" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px">${isHot(b)?'<span class="tag hot">🔥未着手</span>':""}${KIND[b.kind]}${VTAG(b)}</div>
 <div class="h2row"><h2>${esc(b.name)}</h2><button class="fav" id="favb" aria-pressed="${!!FAV[b.id]}">${FAV[b.id]?"★ 気になる":"☆ 気になる"}</button></div><div class="tyrow">${(()=>{const t=typeOf(b);return t?`auひかり <b class="ty ty-${t}">${TYPE_TXT[t]}</b>`:`auひかり タイプ：<b>現場で確認</b>（分かったら自社メモの「種別」に V か G）`})()}</div><div class="addr">${esc(b.addr)}${b.nt>1?`・${b.nt}棟`:""}${(()=>{const z=sizeOf(b);return z.kai?`・${z.kai}階建${z.kosu?"・"+z.kosu+"戸":""}${z.per?`（1フロア約${z.per}戸）`:""}`:""})()}</div>${roomTxt(b)&&(ROLE==="own"||isPub(b))?`<div style="font-weight:700;margin-top:4px">🏠 ${esc(roomTxt(b))}</div>`:""}
 ${allRooms(b).length?barHTML(allRooms(b))+`<div class="nums" style="margin-top:4px">${["mi",...PICK,"ke"].filter(s=>s==="mi"||c[s]).map(s=>RES[s].l+" "+c[s]).join("／")}${c.dg?`／<span style="color:var(--r-ke-t);font-weight:700">⚠危険 ${c.dg}</span>`:""}</div>`:""}
 <details id="bdet" class="det" ${st.detOpen||st.editMemo?"open":""}><summary>物件の詳細（ネット情報・メモ・地図）</summary>
 <div class="nums" style="margin-top:4px"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.addr+" "+b.name)}" target="_blank" rel="noopener">Googleマップで見る</a>　<a href="https://www.google.com/search?q=${encodeURIComponent(b.name+" "+b.city+" site:suumo.jp")}" target="_blank" rel="noopener">SUUMOで探す</a>　<a href="https://www.google.com/search?q=${encodeURIComponent(b.name+" "+b.city+" site:homes.co.jp")}" target="_blank" rel="noopener">HOME'Sで探す</a>　<a href="https://www.google.com/search?q=${encodeURIComponent(b.name+" "+b.addr+" 間取り")}" target="_blank" rel="noopener">Googleで探す</a>${b.lat!=null?`　<a href="https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}" target="_blank" rel="noopener">道案内</a>`:""}</div>
 ${b.note?`<div class="note"><b>確認メモ</b>${esc(b.note)}</div>`:""}
 ${b.kind==="d"?`<div class="note"><b>Dropboxの情報${b.up?"（"+b.up+" 更新）":""}</b><dl class="mv">${[["戸数","kosu"],["種別","shubetsu"],["竣工","shunko"],["オートロック","lock"],["備考","biko"],["管理会社","kanri"],["住居タイプ","type"],["加入","ka"]].filter(([,k])=>b.dm[k]).map(([l,k])=>`<dt>${l}</dt><dd>${esc(b.dm[k])}</dd>`).join("")}</dl><div class="small" style="margin-top:6px">Dropbox：大阪/${esc(b.dir)}</div></div>`:""}
 ${b.web&&b.web.src&&(ROLE==="own"||isPub(b))?`<div class="note"><b>ネットで確認した情報</b><dl class="mv">${[["間取り","madori"],["広さ㎡","menseki"],["家賃(万円)","yachin"],["竣工","shunko"],["階建","kai"],["戸数","kosu"],["オートロック","lock"]].filter(([,k])=>b.web[k]).map(([l,k])=>`<dt>${l}</dt><dd>${esc(k==="lock"&&/^不明/.test(b.web[k])?"なし（推定・掲載に記載なし）":b.web[k])}</dd>`).join("")}</dl>${(()=>{const x=lockOf(memOf(b));return x==="est"?`<div class="small" style="margin-top:6px">オートロックは掲載に書かれていないため「なし（推定）」です。現場で確認したら、下の自社メモの「オートロック」で確定してください。</div>`:""})()}<div class="small" style="margin-top:6px"><a href="${esc(b.web.src)}" target="_blank" rel="noopener">出典を開く</a>（掲載情報のため、現地で確認してください）</div>${ROLE==="own"?`<button class="save" data-webmemo="${b.id}" style="margin-top:8px">現地もこのとおり → 自社メモに入れる</button>`:""}</div>`:b.web&&b.web.genba?`<div class="note"><b>ネットで情報が見つかりませんでした</b><div class="small" style="margin-top:4px">間取り・階数・オートロックなどは現場で確認してください。</div></div>`:""}
 ${memoBox(b)}
 </details>
 ${touHTML}
 ${lay?`<div class="seg"><button data-m="list" aria-pressed="${st.mode==="list"}">リスト</button><button data-m="grid" aria-pressed="${st.mode==="grid"}">マス目</button></div>`:""}
 ${body}
 ${(()=>{const hs=bHist(b);return hs.length?`<details id="hdet" class="det" ${st.hOpen?"open":""}><summary>この物件の訪問記録（${hs.length}件）</summary><ul class="hist2">${hs.slice(0,30).map(h=>`<li><span class="who">${when(h)}</span><b>${esc(h.w)}</b><span>${h.tou?esc(h.tou)+" ":""}${h.room}</span><span>${chip(h.s)} ${esc(h.m||"")}</span></li>`).join("")}</ul></details>`:""})()}</div>`}
function allRecs(){const out=[];Object.keys(H).forEach(k=>{const b=BY[k.split("#")[0]];if(!b)return;const ti=+k.split("#")[1].split("-")[0];H[k].forEach(h=>out.push({...h,b,room:k.split("-").pop(),tou:b.tou.length>1?b.tou[ti]:""}))});return out.sort((x,y)=>(y.t||0)-(x.t||0))}
// auひかりのタイプ：Dropboxの「種別」か、自社メモの「種別」から読む（KDDIのデータには入っていない）
// V＝最大100M、G＝速い（1G）。両方書いてあるものは「V・G」
function typeOf(b){const s=((MM[b.id]||{}).shubetsu||"")+" "+((b.dm||{}).shubetsu||"")+" "+(b.kind==="d"?b.name:"");const u=s.normalize("NFKC").toUpperCase().replace(/\s/g,"");
 const v=/タイプV|TYPE-?V|VG|V\d|V個別|V型/.test(u),g=/タイプG|TYPE-?V?G|VG|G\d|G個別|G型/.test(u);return v&&g?"VG":v?"V":g?"G":""}
const TYPE_TXT={V:"タイプV（最大100M）",G:"タイプG（1G・速い）",VG:"タイプV・G"};
const typeTag=b=>{const t=typeOf(b);return t?`<span class="tag ty ty-${t}">${t==="VG"?"V・G":t}</span>`:""};
// 物件のカード（一覧・マイページで使う）
function bCard(b){const ks=allRooms(b),c=stats(ks);return `<button class="bcard" data-b="${b.id}">
  <div class="top"><b>${esc(b.name)}</b>${typeTag(b)}${FAV[b.id]?'<span class="tag favt">★</span>':""}${isHot(b)?'<span class="tag hot">🔥未着手</span>':""}${KIND[b.kind]}${VTAG(b)}${MM[b.id]&&ROLE==="own"?'<span class="tag as">📝メモ</span>':""}${st.near&&st.pos?`<span class="dist">${dtxt(km(b))}</span>`:""}</div>
  <div class="addr">${esc(b.addr)}${b.nt>1?`・${b.nt}棟`:""}</div>${roomTxt(b)&&(ROLE==="own"||isPub(b))?`<div class="nums" style="color:var(--fg)">🏠 ${esc(roomTxt(b))}</div>`:""}${ks.length?barHTML(ks)+`<div class="nums">未訪問 ${c.mi}／不在 ${c.fu}／検討 ${c.kn}／契約 ${c.ok}${c.dg?`／<span style="color:var(--r-ke-t);font-weight:700">⚠${c.dg}</span>`:""}</div>`:""}</button>`}
// ===== マイページ（自分の記録・気になる・最近見た物件）=====
// ★気になる（au_fav）と最近見た物件（au_recent）は、このスマホにだけ保存する
const FAV=load("au_fav",{}),RECENT=load("au_recent",[]);
function my(){if(!ME)return `<div class="note"><b>名前が選ばれていません</b>通信インフラの画面で名前を選ぶと、自分の記録が出ます。<div style="margin-top:8px"><a class="chg" href="./">名前を選ぶ</a></div></div>`;
 const R=allRecs().filter(h=>h.w===ME),now=new Date(),m0=new Date(now.getFullYear(),now.getMonth(),1).getTime(),td=now.toDateString();
 const sum=a=>({v:a.length,kn:a.filter(h=>h.s==="kn").length,ok:a.filter(h=>h.s==="ok").length});
 const T=sum(R.filter(h=>h.t&&new Date(h.t).toDateString()===td)),M=sum(R.filter(h=>(h.t||0)>=m0));
 // 自分の検討：その部屋のいちばん新しい記録が、自分の「検討」
 const kn=[];Object.keys(H).forEach(k=>{const l=last(k),b=BY[+k.split("#")[0]];if(l&&l.s==="kn"&&l.w===ME&&b)kn.push({k,b,l,no:k.split("-").pop(),tou:b.tou.length>1?b.tou[+k.split("#")[1].split("-")[0]]:""})});kn.sort((a,b)=>(a.l.t||0)-(b.l.t||0));
 // 自分が回った物件（新しい順）
 const byB={};R.forEach(h=>{const x=byB[h.b.id]||(byB[h.b.id]={b:h.b,t:0,rooms:new Set(),ok:0,kn:0});x.t=Math.max(x.t,h.t||0);x.rooms.add(h.tou+"-"+h.room);if(h.s==="ok")x.ok++;if(h.s==="kn")x.kn++});
 const went=Object.values(byB).sort((a,b)=>b.t-a.t);
 const favs=Object.keys(FAV).map(id=>BY[+id]).filter(Boolean),rec=RECENT.map(id=>BY[id]).filter(Boolean);
 const sec=(title,n,body,empty)=>`<h3 class="myh">${title}${n?` <span class="myn">${n}</span>`:""}</h3>${n?body:`<p class="lead">${empty}</p>`}`;
 const ago=t=>{const d=Math.floor((Date.now()-t)/864e5);return d<=0?"今日":d+"日前"};
 return `<div class="mytop"><b>${esc(ME)} さん</b><div class="mystat"><div><span>今日</span><b>${T.v}</b>部屋<small>検討 ${T.kn}・契約 ${T.ok}</small></div><div><span>今月</span><b>${M.v}</b>部屋<small>検討 ${M.kn}・契約 ${M.ok}</small></div></div></div>`
 +sec("🔁 自分の検討（もう一度行く部屋）",kn.length,`<div class="list">${kn.slice(0,30).map(x=>`<button class="bcard" data-b="${x.b.id}"><div class="top"><b>${esc(x.b.name)}</b><span class="tag">${esc(x.tou?x.tou+" ":"")}${esc(x.no)}号室</span></div><div class="nums">${when(x.l)}（${ago(x.l.t||0)}）${x.l.m?"「"+esc(x.l.m)+"」":""}</div></button>`).join("")}</div>`,"検討のままの部屋はありません。")
 +sec("★ 気になる",favs.length,`<div class="list">${favs.map(bCard).join("")}</div>`,"物件ページの「☆ 気になる」を押すと、ここに集まります。")
 +sec("🚶 自分が回った物件",went.length,`<div class="list">${went.slice(0,30).map(x=>`<button class="bcard" data-b="${x.b.id}"><div class="top"><b>${esc(x.b.name)}</b>${FAV[x.b.id]?'<span class="tag favt">★</span>':""}</div><div class="addr">${esc(x.b.addr)}</div><div class="nums">最後に行った日 ${x.t?md(x.t):"-"}（${x.t?ago(x.t):"-"}）／${x.rooms.size}部屋${x.kn?"・検討 "+x.kn:""}${x.ok?"・契約 "+x.ok:""}</div></button>`).join("")}</div>`,"まだ記録がありません。")
 +sec("🕘 最近見た物件",rec.length,`<div class="list">${rec.map(bCard).join("")}</div>`,"まだありません。")}
const md=t=>{const d=new Date(t);return (d.getMonth()+1)+"/"+d.getDate()};
function news(){if(ROLE==="agency")return `<p class="lead">公開された物件は「物件」タブに出ます（いま ${VIS().length}件）。</p>`;
 const R=allRecs(),now=Date.now(),D=864e5;const ok=R.filter(h=>h.s==="ok");const ok30=ok.filter(h=>h.t&&now-h.t<30*D);
 const byB={};ok30.forEach(h=>{(byB[h.b.id]=byB[h.b.id]||{b:h.b,n:0,who:new Set()}).n++;byB[h.b.id].who.add(h.w)});const hotB=Object.values(byB).sort((a,b)=>b.n-a.n).slice(0,10);
 const byW={};ok30.forEach(h=>byW[h.w]=(byW[h.w]||0)+1);const rank=Object.entries(byW).sort((a,b)=>b[1]-a[1]);
 const p=B.filter(b=>b.kind==="p").length,c=B.filter(b=>b.kind==="c").length;
 return `<h3 style="font-size:15px">🎉 最近の成約</h3>${ok.length?`<div class="list">${ok.slice(0,15).map(h=>`<button class="ntc" data-b="${h.b.id}"><div class="when">${h.d}　${esc(h.w)}さんが獲得</div><b>${esc(h.b.name)}</b> ${h.tou?esc(h.tou)+" ":""}${h.room}号室<div class="addr">${esc(h.b.city)}${h.m?"・「"+esc(h.m)+"」":""}</div></button>`).join("")}</div>`:'<p class="small">まだ成約の記録はありません。記録で「契約」を選ぶとここに出ます。</p>'}
 <h3 style="font-size:15px">🔥 成約が上がっている物件（30日）</h3>${hotB.length?`<div class="list">${hotB.map(x=>`<button class="ntc" data-b="${x.b.id}"><b>${esc(x.b.name)}</b>　契約 ${x.n}件<div class="addr">${esc(x.b.city)}・獲得：${[...x.who].map(esc).join("・")}</div></button>`).join("")}</div>`:'<p class="small">30日以内の成約はまだありません。</p>'}
 <h3 style="font-size:15px">🏆 メンバー別の獲得（30日）</h3>${rank.length?rank.map(([w,n],i)=>`<div class="rank"><span>${i+1}. ${esc(w)}</span><b>${n}件</b></div>`).join(""):'<p class="small">まだありません。</p>'}
 <h3 style="font-size:15px">データのお知らせ</h3><p class="small">11/15 取り込み：Dropboxに無い物件 ${B.filter(b=>b.kind==="n").length.toLocaleString()}件。一部の棟だけDropboxにある物件 ${p}件、現場で確認してほしい物件 ${c}件は「物件」タブの絞り込みで見られます。</p>`}
// 部屋の形を保存し、全部の棟の部屋ができていれば自社メモの戸数・階建を合わせる（手で入れた値は上書きしない）
function saveLay(){save("au_layout",LAY);const b=BY[st.b];if(!b||!b.tou.every((_,t)=>LAY[tk(b,t)]))return;const m=Object.assign({},MM[b.id]||{}),kosu=String(allRooms(b).length),kai=String(Math.max(...b.tou.map((_,t)=>LAY[tk(b,t)].f)));let ch=false;if(!m.kosu||m.kosuAuto){if(m.kosu!==kosu){m.kosu=kosu;ch=true}m.kosuAuto=1}if(!m.kai||m.kaiAuto){if(m.kai!==kai){m.kai=kai;ch=true}m.kaiAuto=1}if(!ch)return;const d=new Date();m.at=(d.getMonth()+1)+"/"+d.getDate();m.by=ME;MM[b.id]=m;save("au_memo",MM)}
function roomRecs(){const out=[];Object.keys(H).forEach(k=>{const b=BY[k.split("#")[0]];if(!b||!H[k].length)return;const ti=+k.split("#")[1].split("-")[0],no=k.split("-").pop();if(gone(LAY[tk(b,ti)],no))return;out.push({k,b,no,tou:b.tou.length>1?b.tou[ti]:"",h:H[k],l:H[k][H[k].length-1]})});return out}
function band(t){if(!(t>1e12))return "";const d=new Date(t),h=d.getHours();return "日月火水木金土"[d.getDay()]+(h<12?"朝":h<16?"昼":h<19?"夕":"夜")}
function admin(){const all=[];Object.keys(H).forEach(k=>H[k].forEach(h=>all.push({k,...h})));
 const by={};all.forEach(h=>{const x=by[h.w]||(by[h.w]={n:0,ok:0,kn:0,dg:0});x.n++;if(h.s==="ok")x.ok++;if(h.s==="kn")x.kn++;});Object.values(DGR).forEach(g=>{const x=by[g.w]||(by[g.w]={n:0,ok:0,kn:0,dg:0});x.dg++});
 const cityN={};B.forEach(b=>{const x=cityN[b.city]||(cityN[b.city]={n:0,t:0,go:0});x.n++;x.t+=b.nt;if(touched(b))x.go++});
 const bn=k=>{const b=BY[k.split("#")[0]];return b?b.name:k};
 return `<div class="adm"><p class="lead">PCで開く管理者画面のイメージです（スマホでも見られます）。</p>
 <div class="kpis"><div class="kpi"><div class="v">${B.length.toLocaleString()}</div><div class="l">対象物件</div></div><div class="kpi"><div class="v">${B.reduce((s,b)=>s+b.nt,0).toLocaleString()}</div><div class="l">対象棟数</div></div><div class="kpi"><div class="v">${B.filter(touched).length}</div><div class="l">訪問を始めた物件</div></div><div class="kpi"><div class="v">${all.filter(h=>h.s==="ok").length}</div><div class="l">契約</div></div></div>
 <h3>物件一覧（PC向け）</h3>${(()=>{const A=st.adm||{},a=admRows(),pg=A.n||100;const cols=["市区町村","物件名","棟数","Dropbox","間取り","家賃万円","築年数","オートロック","訪問済み部屋","契約","最終訪問"];
 return `<div class="tbar"><select id="a_city"><option value="">市区町村：すべて</option>${CITIES.map(c=>`<option ${c===A.city?"selected":""}>${c}</option>`).join("")}</select>
 <select id="a_k">${[["","すべての物件"],["memo","メモあり"],["go","訪問中"],["p","一部だけDropbox"]].map(([k,l])=>`<option value="${k}" ${k===(A.k||"")?"selected":""}>${l}</option>`).join("")}</select>
 <input id="a_q" type="search" placeholder="名前・住所・メモで検索" value="${esc(A.q||"")}">
 <button class="dl" id="csvB">スプレッドシート用に書き出す（${a.length.toLocaleString()}件）</button><button class="dl" id="csvH" style="background:var(--accent)">訪問記録を書き出す</button></div>
 <div class="tw big"><table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead><tbody>${a.slice(0,pg).map(b=>{const r=rowsFor(b);return `<tr>${cols.map(c=>`<td>${c==="物件名"?`<a href="#" data-ob="${b.id}">${esc(r[c])}</a>`:esc(r[c])}</td>`).join("")}</tr>`}).join("")}</tbody></table></div>
 ${a.length>pg?`<button class="more" id="a_more">さらに表示（残り ${(a.length-pg).toLocaleString()}件）</button>`:""}
 <p class="small">書き出したファイル（CSV）は、Googleスプレッドシートの「ファイル→インポート」やExcelでそのまま開けます。</p>`})()}
 <h3>データ更新とDropbox連携</h3>${(()=>{const S=load("au_set",{iv:"month",app:true});const dd=new Date(META.updated),nx=new Date(dd);if(S.iv==="week")nx.setDate(nx.getDate()+7);else if(S.iv==="2week")nx.setDate(nx.getDate()+14);else nx.setMonth(nx.getMonth()+1);
 const q=pendingApp();const fmt=d=>d.getFullYear()+"/"+(d.getMonth()+1)+"/"+d.getDate();
 return `<div class="setup"><div class="tbar"><label class="small">更新の間隔 <select id="iv">${[["month","毎月"],["2week","隔週"],["week","毎週"]].map(([k,l])=>`<option value="${k}" ${S.iv===k?"selected":""}>${l}</option>`).join("")}</select></label><span class="small">前回の更新：${fmt(dd)}　次回の予定：<b>${fmt(nx)}</b>（ジャービスでお知らせ）</span></div>
 <div class="small">更新する内容：KDDIの対応物件CSV（ダウンロードし直し）と、Dropboxの物件ファイルの読み直し。</div>
 <label class="auto"><input type="checkbox" id="app" ${S.app?"checked":""}>Dropboxにある物件の訪問記録を、毎晩まとめてDropboxに追記する</label>
 <div class="tbar"><span class="small">今夜の追記待ち：<b>${q.length}物件</b></span>${q.length?'<button class="dl" id="showapp" style="background:var(--accent)">追記する内容を見る</button>':""}</div></div>`})()}
 <h3>区域別の成果</h3>${(()=>{const per=st.per||"all",mo=String(new Date().getMonth()+1).padStart(2,"0");const C={};
 B.forEach(b=>{const x=C[b.city]||(C[b.city]={n:0,t:0,go:0,v:0,kn:0,ok:0,ka:0});x.n++;x.t+=b.nt;if(touched(b))x.go++;
  allRooms(b).forEach(k=>{const h=hist(k).filter(e=>per==="all"||e.d.startsWith(mo+"/"));if(!h.length)return;x.v++;const s=h[h.length-1].s;if(s==="kn")x.kn++;if(s==="ok")x.ok++;if(s==="ka")x.ka++})});
 const L2=Object.entries(C).sort((a,b)=>b[1].ok-a[1].ok||b[1].v-a[1].v||b[1].t-a[1].t),mx=Math.max(1,...L2.map(([,x])=>x.ok));
 const tot=L2.reduce((s,[,x])=>({v:s.v+x.v,ok:s.ok+x.ok}),{v:0,ok:0});
 return `<div class="tbar"><select id="per"><option value="all" ${per==="all"?"selected":""}>全期間</option><option value="mo" ${per==="mo"?"selected":""}>今月</option></select><span class="small">訪問 ${tot.v}部屋・契約 ${tot.ok}件${tot.v?"・契約率 "+(tot.ok/tot.v*100).toFixed(1)+"%":""}</span></div>
 <div class="tw big"><table><thead><tr><th>市区町村</th><th>契約</th><th></th><th>契約率</th><th>検討</th><th>訪問部屋</th><th>訪問中の物件</th><th>対象物件</th><th>対象棟数</th></tr></thead><tbody>${L2.map(([c,x])=>`<tr><td><a href="#" data-gocity="${c}">${c}</a></td><td><b>${x.ok}</b></td><td style="min-width:90px"><div style="height:8px;border-radius:4px;background:var(--r-ok);width:${x.ok/mx*100}%"></div></td><td>${x.v?(x.ok/x.v*100).toFixed(1)+"%":"—"}</td><td>${x.kn}</td><td>${x.v}</td><td>${x.go}</td><td>${x.n}</td><td>${x.t}</td></tr>`).join("")}</tbody></table></div>
 <p class="small">契約は各部屋の最新の結果で数えています。市区町村名を押すと、その区域の物件一覧に移ります。</p>`})()}
 <h3>再訪リスト（検討のままの部屋）</h3>${(()=>{const a=roomRecs().filter(x=>x.l.s==="kn").sort((p,q)=>(p.l.t||0)-(q.l.t||0));return a.length?`<p class="small">古い順です。追いかけ漏れがないか確認できます。</p><div class="tw big"><table><thead><tr><th>最後の訪問</th><th>経過</th><th>物件・部屋</th><th>担当</th><th>備考</th></tr></thead><tbody>${a.slice(0,100).map(x=>`<tr><td>${when(x.l)}</td><td>${x.l.t>1e12?Math.floor((Date.now()-x.l.t)/864e5)+"日":""}</td><td><a href="#" data-ob="${x.b.id}">${esc(x.b.name)}</a> ${x.tou?esc(x.tou)+" ":""}${x.no}</td><td>${esc(x.l.w)}</td><td>${esc(x.l.m||"")}</td></tr>`).join("")}</tbody></table></div>`:'<p class="small">検討のままの部屋はありません。</p>'})()}
 <h3>不在が続く部屋（3回以上つづけて不在）</h3>${(()=>{const a=roomRecs().map(x=>{let n=0;for(let i=x.h.length-1;i>=0&&x.h[i].s==="fu";i--)n++;return Object.assign(x,{n,fu:x.h.slice(-n)})}).filter(x=>x.n>=3).sort((p,q)=>q.n-p.n);
 return a.length?`<p class="small">居留守の場合もあります。行った曜日・時間帯がかたよっていないか見て、次は変えて訪問してください。</p><div class="tw big"><table><thead><tr><th>物件・部屋</th><th>不在</th><th>行った曜日・時間帯</th><th></th></tr></thead><tbody>${a.slice(0,100).map(x=>{const bs=x.fu.map(h=>band(h.t));const same=bs.length&&bs.every(v=>v&&v.slice(-1)===bs[0].slice(-1));return `<tr><td><a href="#" data-ob="${x.b.id}">${esc(x.b.name)}</a> ${x.tou?esc(x.tou)+" ":""}${x.no}</td><td>${x.n}回</td><td>${bs.map(v=>v||"時刻なし").join("・")}</td><td>${same?'<span class="tag part">時間帯が同じ</span>':""}</td></tr>`}).join("")}</tbody></table></div>`:'<p class="small">3回以上つづけて不在の部屋はありません。</p>'})()}
 <h3>物件ごとの担当状況（直近7日）</h3>${(()=>{const now=Date.now(),by={};roomRecs().forEach(x=>x.h.forEach(h=>{if(!(h.t>1e12&&now-h.t<7*864e5))return;const y=by[x.b.id]||(by[x.b.id]={b:x.b,w:{},n:0,t:0,l:null});y.n++;y.w[h.w]=(y.w[h.w]||0)+1;if(h.t>y.t){y.t=h.t;y.l=h}}));const a=Object.values(by).sort((p,q)=>q.t-p.t);
 return a.length?`<p class="small">同じ物件に何人も入っていないか確認できます。2人以上は「重なり」と出ます。</p><div class="tw big"><table><thead><tr><th>物件</th><th>市区町村</th><th>入った人（記録数）</th><th>最後</th><th></th></tr></thead><tbody>${a.map(y=>{const ws=Object.entries(y.w);return `<tr><td><a href="#" data-ob="${y.b.id}">${esc(y.b.name)}</a></td><td>${esc(y.b.city)}</td><td>${ws.map(([w,n])=>esc(w)+"（"+n+"）").join("・")}</td><td>${when(y.l)}</td><td>${ws.length>1?'<span class="tag chk">重なり</span>':""}</td></tr>`}).join("")}</tbody></table></div>`:'<p class="small">直近7日の記録はありません。</p>'})()}</div>`}
const WD="日月火水木金土";
function dbxText(b){const ks=allRooms(b),c=stats(ks),today=new Date(),ymd=today.getFullYear()+"/"+String(today.getMonth()+1).padStart(2,"0")+"/"+String(today.getDate()).padStart(2,"0");
 const ka=ks.filter(k=>{const l=last(k);return l&&l.s==="ka"}).map(k=>k.split("-").pop());
 const m=memOf(b);const lines=[b.name,"大阪府"+b.addr,"【戸数】"+(m.kosu||ks.length||""),"【種別】"+(m.shubetsu||"ａｕひかり"),"【JP】"+(m.jp||"")," 【空ポ/全ポ】"+(m.port||""),"【竣工】"+(m.shunko||""),"【オートロック】"+(m.lock||""),"【備考】"+[m.madori,m.menseki?m.menseki+"㎡":"",m.yachin?m.yachin+"万":"",m.biko].filter(x=>x).join(" "),"【管理会社】"+(m.kanri||"/"),"【住居タイプ分賃】"+(m.type||""),"",b.no,...(m.free?["",m.free]:[]),"","🔸加入　"+(ka.length?ka.join("・")+"・":""),"",ymd+" "+WD[today.getDay()]+"曜日 アプリから記載",""];
 const M={fu:"留守",ih:"❌インターホンNG",fr:"❌フロントNG",ke:"❌即ケコ",so:"❌トーク後NG",kn:"△検討",ok:"⭕契約",dg:"⚠注意",ka:"🔸加入",ak:"■空室"},N="❶❷❸❹❺❻❼❽❾";
 b.tou.forEach((t,ti)=>{const rs=rooms(b,ti);if(!rs.length)return;if(b.tou.length>1)lines.push("【"+t+"】");
  rs.forEach(k=>{const h=hist(k);if(!h.length)return;let n=0;lines.push(k.split("-").pop()+" "+h.filter(x=>x.s!=="dg").map(x=>(x.s==="fu"?M.fu+N[Math.min(8,n++)]:x.s==="ak"?"→"+M.ak:M[x.s])+(x.m?" "+x.m:"")).join(" ")+(DGR[k]?" ⚠注意"+(DGR[k].m?" "+DGR[k].m:""):""))});lines.push("")});
 return lines.join("\n")}
function pendingApp(){const out=[];B.forEach(b=>{if(b.kind!=="d")return;const ks=allRooms(b).filter(k=>hist(k).length);if(ks.length)out.push([b,ks])});return out}
function appText(b,ks){const d=new Date(),M={fu:"留守",ih:"❌インターホンNG",fr:"❌フロントNG",ke:"❌即ケコ",so:"❌トーク後NG",kn:"△検討",ok:"⭕契約",dg:"⚠注意",ka:"🔸加入",ak:"■空室"},N="❶❷❸❹❺❻❼❽❾";
 const ws=[...new Set(ks.flatMap(k=>hist(k).map(h=>h.w)))].join("・");
 return [d.getFullYear()+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+String(d.getDate()).padStart(2,"0")+" "+"日月火水木金土"[d.getDay()]+"曜日 "+ws+"（アプリから）",...ks.map(k=>{let n=0;return k.split("-").pop()+" "+hist(k).filter(x=>x.s!=="dg").map(x=>(x.s==="fu"?M.fu+N[Math.min(8,n++)]:x.s==="ak"?"→"+M.ak:M[x.s])+(x.m?" "+x.m:"")).join(" ")+(DGR[k]?" ⚠注意"+(DGR[k].m?" "+DGR[k].m:""):"")})].join("\n")}
function openApp(){const q=pendingApp();
 $("#layer").innerHTML=`<div class="shade" id="shade"></div><div class="sheet" role="dialog" aria-label="Dropboxへの追記"><div class="in"><div class="grab"></div><b style="font-size:17px">今夜Dropboxに追記する内容（${q.length}物件）</b>
 <p class="small">各物件のファイルの末尾に、下の内容を追記します（モックでは実際には書き込みません）。</p>${q.map(([b,ks])=>`<div class="small" style="margin-top:8px">大阪/${esc(b.dir)}/${esc(b.name)}.txt</div><pre class="txt">${esc(appText(b,ks))}</pre>`).join("")}</div></div>`}
function openPub(id){const b=BY[id];
 $("#layer").innerHTML=`<div class="shade" id="shade"></div><div class="sheet" role="dialog" aria-label="Dropboxに記載"><div class="in"><div class="grab"></div>
 <b style="font-size:17px">${esc(b.name)} を代理店にも公開</b>
 <p class="small">公開すると、系列の代理店にもこの物件が見えるようになります。あわせて、Dropboxの「大阪/${esc(b.city)}」に下の内容で「${esc(b.name)}.txt」を記載します（モックでは実際には記載しません）。</p>
 <pre class="txt">${esc(dbxText(b))}</pre>
 <button class="save" id="dopub" data-id="${b.id}">公開してDropboxに記載する</button></div></div>`}
function openRoom(k){if(!ME)return askName(()=>openRoom(k));st.room=k;st.pick=null;st.dgAsk=null;st.delAsk=null;st.goneAsk=null;const b=BY[k.split("#")[0]],no=k.split("-").pop(),h=hist(k);
 $("#layer").innerHTML=`<div class="shade" id="shade"></div><div class="sheet" role="dialog" aria-label="${no}号室"><div class="in"><div class="grab"></div>
 <b style="font-size:18px">${no}号室</b> <span class="addr">${esc(b.name)}${b.tou.length>1?" "+esc(b.tou[st.t]):""}</span>
 <div class="btns">${PICK.map(s=>`<button class="${RES[s].c}" data-s="${s}" aria-pressed="false">${RES[s].l}</button>`).join("")}</div>
 <div id="custBox" class="cust" hidden><b>契約（カウンターの「獲得」と同じ）</b><label>申込日<input type="date" id="vdate" value="${new Date().toLocaleDateString("sv-SE")}"></label><label>商材<select id="vprod"><option value="">選んでください</option>${VS.products().map(p=>`<option ${p==="au光"?"selected":""}>${esc(p)}</option>`).join("")}</select></label><label>お客様名<input id="vcust" autocomplete="off"></label><div class="two"><label>セイ（カナ）<input id="vsei" autocomplete="off"></label><label>メイ（カナ）<input id="vmei" autocomplete="off"></label></div><div class="err" id="custErr"></div></div>
 <button class="dgbtn" id="dgflag" aria-pressed="${!!DGR[k]}">${DGR[k]?`⚠危険 ${esc(DGR[k].d)} ${esc(DGR[k].w)}（タップで外す）`:"⚠危険の印を付ける（次の人への注意）"}</button>
 <label for="memo" class="addr">備考（任意）</label><textarea id="memo" placeholder="例：夜なら在宅、妻と相談"></textarea>
 <button class="save" id="save" disabled>結果を選んでください</button>
 <label class="auto"><input type="checkbox" id="auto" ${st.auto?"checked":""}>記録したら次の部屋をすぐ開く</label>
 <div class="addr" style="margin-top:14px">これまでの記録</div><ul class="hist">${h.length?h.map((x,i)=>[x,i]).reverse().map(([x,i])=>`<li>${chip(x.s)}<span class="who">${when(x)} ${esc(x.w)}</span><span>${esc(x.m||"")}${x.w===ME?` <button class="undo" data-del="${i}">取り消す</button>`:""}</span></li>`).join(""):'<li style="display:block;color:var(--sub)">まだ記録がありません</li>'}</ul>${h.length?"":`<button class="gonebtn" id="gonek">この部屋は存在しない（一覧から消す）</button>`}</div></div>`}
function closeRoom(){$("#layer").innerHTML="";st.room=null}
function undoToast(msg,k,i){document.querySelectorAll(".toast.u").forEach(e=>e.remove());const e=document.createElement("div");e.className="toast u";e.innerHTML=esc(msg)+` <button class="undo" data-undo="${esc(k)}" data-i="${i}">取り消す</button>`;document.body.appendChild(e);setTimeout(()=>e.remove(),6000)}
function delRec(k,i){document.querySelectorAll(".toast.u").forEach(e=>e.remove());const h=H[k];if(!h||!h[i]||h[i].w!==ME)return toast("自分の記録だけ取り消せます");h.splice(i,1);if(!h.length)delete H[k];save("au_hist",H);const y=scrollY;render();scrollTo(0,y);toast("記録を取り消しました")}
function toast(t){const e=document.createElement("div");e.className="toast";e.textContent=t;document.body.appendChild(e);setTimeout(()=>e.remove(),1600)}
document.addEventListener("click",e=>{const gc=e.target.closest("[data-gocity]");if(gc){e.preventDefault();st.v="list";st.b=null;st.city=gc.dataset.gocity;st.lim=50;keep();return render()}
 const ob=e.target.closest("[data-ob]");if(ob){e.preventDefault();st.v="list";st.b=+ob.dataset.ob;st.t=0;return render()}
 const t=e.target.closest("button,#shade");if(!t)return;
 if(t.id==="shade")return closeRoom();
 if(t.dataset.undo){t.closest(".toast").remove();const k=t.dataset.undo;if(st.room&&st.room!==k)closeRoom();delRec(k,+t.dataset.i);if(st.room===k)openRoom(k);return}
 if(t.dataset.del!=null&&st.room){const k=st.room,i=+t.dataset.del;if(st.delAsk!==k+"/"+i){st.delAsk=k+"/"+i;t.textContent="もう一度で取り消し";return}st.delAsk=null;delRec(k,i);return openRoom(k)}
 if(t.classList.contains("tab")&&t.dataset.v){STK.length=0;const fromB=st.b&&t.dataset.v==="list";st.editMemo=false;st.ed=false;st.v=t.dataset.v;st.b=null;render();pushH();if(fromB&&listY.y)setTimeout(()=>scrollTo(0,listY.y),0);return}
 if(t.dataset.src){st.src=t.dataset.src;st.lim=50;keep();return render()}
 if(t.dataset.mg!==undefined){st.mg=t.dataset.mg;if(st.mg&&st.adv)st.adv.mgs=[];st.lim=50;keep();return render()}
 if(t.dataset.lk!==undefined){st.lk=t.dataset.lk;st.lim=50;keep();return render()}
 if(t.dataset.f){st.f=t.dataset.f;st.lim=50;keep();return render()}
 if(t.id==="editmemo"){st.editMemo=true;const y=scrollY;render();scrollTo(0,y);return}
 if(t.id==="cancelmemo"){st.editMemo=false;const y=scrollY;render();scrollTo(0,y);return}
 if(t.dataset.webmemo){const b=BY[+t.dataset.webmemo],w=b.web||{},m=Object.assign({},MM[b.id]||{});let n=0;const put=(k,v)=>{if(v&&!m[k]){m[k]=String(v);n++}};["madori","menseki","yachin","kosu","kai","shunko"].forEach(k=>put(k,w[k]));const l=String(w.lock||"");put("lock",/^あり/.test(l)?"オートロックあり":/^なし/.test(l)?"オートロックなし":"");if(!n)return toast("入れる項目がありません（すでに自社メモにあります）");const d=new Date();m.at=(d.getMonth()+1)+"/"+d.getDate();m.by=ME;MM[b.id]=m;save("au_memo",MM);const y=scrollY;render();scrollTo(0,y);return toast(n+"項目を自社メモに入れました"+(/^あり|^なし/.test(l)?"":"（オートロックは現地で確認してください）"))}
 if(t.id==="savememo"){const m={};MEMOF.forEach(([k])=>{const v=$("#m_"+k).value.trim();if(v)m[k]=v});const f=$("#m_free").value.trim();if(f)m.free=f;const d=new Date();m.at=(d.getMonth()+1)+"/"+d.getDate();m.by=ME;MM[st.b]=m;save("au_memo",MM);st.editMemo=false;const y=scrollY;render();scrollTo(0,y);return toast("メモを保存しました")}
 if(t.id==="csvB"){const d=new Date();return csvDown("訪問物件_"+(d.getMonth()+1)+(""+d.getDate()).padStart(2,"0")+".csv",admRows().map(rowsFor))}
 if(t.id==="csvH"){const out=[];Object.keys(H).forEach(k=>{const b=BY[k.split("#")[0]];if(!b)return;const ti=+k.split("#")[1].split("-")[0];H[k].forEach(h=>out.push({"日付":h.d,"時刻":hm(h.t),"メンバー":h.w,"市区町村":b.city,"物件名":b.name,"棟":b.tou[ti]||"","部屋":k.split("-").pop(),"結果":RES[h.s].l,"備考":h.m||""}))});return csvDown("訪問記録.csv",out)}
 if(t.id==="a_more"){st.adm=Object.assign(st.adm||{},{n:((st.adm||{}).n||100)+200});const y=scrollY;render();scrollTo(0,y);return}
 if(t.id==="showapp")return openApp();
 if(t.id==="chgname")return askName(null);
 if(t.id==="savename"){const v=$("#mename").value.trim();if(!v)return toast("名前を入れてください");ME=v;try{localStorage.setItem("au_me",v)}catch(e){}closeRoom();render();const f=window.__afterName;window.__afterName=null;if(f)f();return}
 if(t.dataset.role){ROLE=t.dataset.role;save("au_role",ROLE);st.b=null;return render()}
 if(t.dataset.pub)return openPub(+t.dataset.pub);
 if(t.id==="dopub"){const d=new Date();PUB[t.dataset.id]=(d.getMonth()+1)+"/"+d.getDate();save("au_pub",PUB);closeRoom();render();return toast("公開しました（Dropboxに記載）")}
 if(t.dataset.unpub){delete PUB[t.dataset.unpub];save("au_pub",PUB);render();return toast("自社のみに戻しました")}
 if(t.dataset.view){st.view=t.dataset.view;keep();return render()}
 if(t.id==="advBtn"){st.advOpen=!st.advOpen;const y=scrollY;render();scrollTo(0,y);return}
 if(t.dataset.advmg||t.dataset.advk!==undefined||t.dataset.advb||t.id==="advClr"){const D=ADV();
  if(t.dataset.advmg){const k=t.dataset.advmg;D.mgs=D.mgs.includes(k)?D.mgs.filter(x=>x!==k):D.mgs.concat(k);if(D.mgs.length)st.mg=""}
  if(t.dataset.advk!==undefined)D.kosu=+t.dataset.advk;
  if(t.dataset.advb)D[t.dataset.advb]=!D[t.dataset.advb];
  if(t.id==="advClr")Object.assign(D,{mgs:[],kosu:0,left:false,kn:false,unk:true});
  st.adv=D;st.lim=50;keep();const y=scrollY;render();scrollTo(0,y);return}
 if(t.id==="advGo"){st.advOpen=false;keep();render();const r=document.getElementById("res");if(r)r.scrollIntoView();return}
 if(t.id==="near"){if(st.near){st.near=false;return render()}return locate()}
 if(t.dataset.city){st.city=t.dataset.city;st.lim=50;keep();return render()}
 if(t.id==="more"){st.lim+=100;const y=scrollY;render();scrollTo(0,y);return}
 if(t.dataset.b){if(+t.dataset.b===st.b)return;if(st.v==="list"&&!st.b)listY.y=scrollY;STK.push({v:st.v,b:st.b,t:st.t,y:scrollY});if(STK.length>20)STK.shift();st.v="list";st.b=+t.dataset.b;st.t=0;render();return pushH()}
 if(t.dataset.t){st.t=+t.dataset.t;return keepY(render)}
 if(t.id==="favb"&&st.b){if(FAV[st.b])delete FAV[st.b];else FAV[st.b]=Date.now();save("au_fav",FAV);const y=scrollY;render();scrollTo(0,y);return toast(FAV[st.b]?"★ 気になるに入れました（マイページで見られます）":"気になるから外しました")}
 if(t.id==="back"){st.editMemo=false;st.ed=false;const pv=STK.pop();if(pv){st.v=pv.v;st.b=pv.b;st.t=pv.t||0}else{st.v="list";st.b=null}render();pushH();const y=pv?pv.y:listY.y;if(y)setTimeout(()=>scrollTo(0,y),0);return}
 if(t.id==="clr"){st.f="";st.mg="";st.lk="";st.adv=null;keep();return render()}
 if(t.id==="edt"){st.ed=!st.ed;st.mode="list";return keepY(render)}
 if(t.id==="gonek"&&st.room){const k=st.room;if(hist(k).length)return toast("記録がある部屋は消せません");if(st.goneAsk!==k){st.goneAsk=k;t.textContent="もう一度タップすると一覧から消します";return}st.goneAsk=null;const key=k.slice(0,k.lastIndexOf("-")),no=k.split("-").pop(),lay=LAY[key];if(!lay)return;(lay.x=lay.x||[]).push(no);saveLay();closeRoom();const y=scrollY;render();scrollTo(0,y);return toast(no+"号室を一覧から消しました（「部屋数を直す」で戻せます）")}
 if(t.dataset.gone||t.dataset.back){const key=tk(BY[st.b],st.t),lay=LAY[key];if(!lay)return;lay.x=lay.x||[];if(t.dataset.gone){const no=t.dataset.gone;if(hist(key+"-"+no).length)return toast(no+"号室は記録があるので消せません");lay.x.push(no);toast(no+"号室を「存在しない」にしました")}else{lay.x=lay.x.filter(x=>x!==t.dataset.back);toast(t.dataset.back+"号室を戻しました")}if(!lay.x.length)delete lay.x;saveLay();const y=scrollY;render();scrollTo(0,y);return}
 if(t.dataset.er||t.dataset.ef){const b=BY[st.b],key=tk(b,st.t),lay=LAY[key];if(!lay)return;lay.fp=lay.fp||{};const used=no=>hist(key+"-"+no).length>0;
  if(t.dataset.er){const f=+t.dataset.er,d=+t.dataset.d,n=cnt(lay,f);if(d>0){if(n>=40)return toast("1フロア40部屋までです");lay.fp[f]=n+1}else{if(n<=0)return;const no=f+String(n).padStart(2,"0");if(used(no))return toast(no+"号室は訪問記録があるので消せません");lay.fp[f]=n-1}}
  else{const d=+t.dataset.ef;if(d>0){if(lay.f>=60)return;lay.f++;lay.fp[lay.f]=lay.p}else{if(lay.f<=1)return toast("1階は消せません");const f=lay.f,n=cnt(lay,f);for(let r=1;r<=n;r++){const no=f+String(r).padStart(2,"0");if(used(no))return toast(f+"階に訪問記録がある部屋があるので消せません")}if(n>0&&st.flAsk!==key+"/"+f){st.flAsk=key+"/"+f;return toast("もう一度「−階」を押すと "+f+"階（"+n+"部屋）を消します")}st.flAsk=null;delete lay.fp[f];lay.f--}}
  saveLay();return keepY(render)}
 if(t.id==="mk"){const f=Math.max(1,Math.min(60,+$("#lf").value||0)),p=Math.max(1,Math.min(40,+$("#lp").value||0));LAY[tk(BY[st.b],st.t)]={f,p};saveLay();keepY(render);return toast(f*p+"部屋を作りました")}
 if(t.dataset.m){st.mode=t.dataset.m;try{localStorage.setItem("mode",st.mode)}catch(e){}return keepY(render)}
 if(t.dataset.k)return openRoom(t.dataset.k);
 if(t.id==="dgflag"&&st.room){const k=st.room;if(DGR[k]){if(st.dgAsk!==k){st.dgAsk=k;t.textContent="もう一度タップすると⚠の印を外します";return}st.dgAsk=null;delete DGR[k];toast("⚠の印を外しました")}else{const d=new Date();DGR[k]={w:ME,d:String(d.getMonth()+1).padStart(2,"0")+"/"+String(d.getDate()).padStart(2,"0"),t:Date.now(),m:""};toast("⚠危険の印を付けました")}save("au_danger",DGR);const y=scrollY;render();scrollTo(0,y);openRoom(k);return}
 if(t.dataset.s){st.pick=t.dataset.s;$("#custBox").hidden=st.pick!=="ok";document.querySelectorAll(".btns button").forEach(x=>x.setAttribute("aria-pressed",x===t));const s=$("#save");s.disabled=false;s.textContent=RES[st.pick].l+" で記録する"+(VS.counted(st.pick)?"（カウンターにも入ります）":"");return}
 if(t.id==="save"&&st.pick){let cust=null;if(st.pick==="ok"){const kana=v=>v.replace(/[\s　]/g,"").replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60));const c={appDate:$("#vdate").value,product:$("#vprod").value,customer:$("#vcust").value.trim(),sei:kana($("#vsei").value),mei:kana($("#vmei").value)};$("#vsei").value=c.sei;$("#vmei").value=c.mei;const err=!c.appDate?"申込日を入れてください":!c.product?"商材を選んでください":!c.customer?"お客様名を入れてください":!c.sei||!c.mei?"セイ・メイ（カナ）を入れてください":!/^[ァ-ヶー]+$/.test(c.sei+c.mei)?"セイ・メイはカタカナで入れてください":"";if(err){$("#custErr").textContent=err;return}cust=c}
 const d=new Date(),k0=st.room;(H[st.room]=H[st.room]||[]).push({id:VS.id(),cust:cust,s:st.pick,d:String(d.getMonth()+1).padStart(2,"0")+"/"+String(d.getDate()).padStart(2,"0"),w:ME,t:Date.now(),m:$("#memo").value.trim()});save("au_hist",H);const no=st.room.split("-").pop();const ks=rooms(BY[st.room.split("#")[0]],st.t),nx=ks[ks.indexOf(st.room)+1];closeRoom();const y=scrollY;render();scrollTo(0,y);undoToast(no+"号室を記録しました"+(VS.counted(st.pick)?"（カウンターにも）":""),k0,H[k0].length-1);if(st.auto&&nx)setTimeout(()=>openRoom(nx),250)}
});
document.addEventListener("focusin",e=>{const t=e.target;if(t.matches('input:not([type=checkbox]),textarea')){document.body.classList.add("typing");setTimeout(()=>{try{t.scrollIntoView({block:"center"})}catch(x){}},300)}});
document.addEventListener("focusout",e=>{setTimeout(()=>{const a=document.activeElement;if(!a||!a.matches('input:not([type=checkbox]),textarea'))document.body.classList.remove("typing")},100)});
document.addEventListener("change",e=>{if(e.target.id==="estOn"){st.estOn=e.target.checked;keep();return render()}if(e.target.id==="advUnk"){st.adv=Object.assign(ADV(),{unk:e.target.checked});keep();const y=scrollY;render();scrollTo(0,y);return}if(e.target.id==="iv"||e.target.id==="app"){const S=load("au_set",{iv:"month",app:true});if(e.target.id==="iv")S.iv=e.target.value;else S.app=e.target.checked;save("au_set",S);return render()}if(e.target.id==="per"){st.per=e.target.value==="mo"?"mo":"all";return render()}if(e.target.id==="a_city"||e.target.id==="a_k"){st.adm=Object.assign(st.adm||{},{[e.target.id==="a_city"?"city":"k"]:e.target.value,n:100});return render()}if(e.target.id==="city"){st.city=e.target.value;st.lim=50;keep();render()}if(e.target.id==="auto"){st.auto=e.target.checked;keep()}});
document.addEventListener("toggle",e=>{if(e.target.id==="bdet")st.detOpen=e.target.open;if(e.target.id==="hdet")st.hOpen=e.target.open},true);
let qT=null;
function qUpdate(v){st.q=v;st.lim=50;clearTimeout(qT);qT=setTimeout(()=>{const a=filtered();const r=$("#res");if(!r)return render();r.innerHTML=listRes(a);if(st.view==="map")drawMap()},250)}
document.addEventListener("compositionend",e=>{if(e.target.id==="q")return qUpdate(e.target.value);if(e.target.id==="a_q"||e.target.id==="pq")e.target.dispatchEvent(new Event("input",{bubbles:true}))});
document.addEventListener("keydown",e=>{if(e.target.id==="q"&&e.key==="Enter"){e.target.blur()}});
document.addEventListener("input",e=>{if(e.target.id==="a_q"){if(e.isComposing)return;st.adm=Object.assign(st.adm||{},{q:e.target.value,n:100});const p=e.target.selectionStart;render();const q=$("#a_q");q.focus();q.setSelectionRange(p,p);return}if(e.target.id==="pq"){if(e.isComposing)return;st.pq=e.target.value;const p=e.target.selectionStart;render();const q=$("#pq");q.focus();q.setSelectionRange(p,p);return}if(e.target.id==="q"){if(e.isComposing)return;qUpdate(e.target.value)}});
if(location.hash.length>1)applyH();else render();
// 名前の登録は通信インフラで（訪問の画面では聞かない）
askName=()=>{location.href="./"};
VS.start(()=>{const a=document.activeElement;if(st.room||(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)))return false;const y=scrollY;render();scrollTo(0,y);return true});
