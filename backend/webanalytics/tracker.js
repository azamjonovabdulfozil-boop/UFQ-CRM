/**
 * webanalytics/tracker.js — saytga o'rnatiladigan yengil skript (~3 KB).
 *
 * Nima yig'adi: sahifa yo'li va sarlavhasi, referrer domeni, UTM, ekran
 * kengligi, brauzer tili, sahifada qolish vaqti, scroll chuqurligi,
 * belgilangan tugmalar bosilishi, forma yuborilgani (faqat forma nomi —
 * MAYDON QIYMATLARI HECH QACHON o'qilmaydi), lead/purchase/conversion.
 *
 * Maxfiylik: tashrif buyuruvchi — shu saytning localStorage'idagi tasodifiy
 * psevdonim. Cookie ishlatilmaydi. "Do Not Track"/GPC hurmat qilinadi (sayt
 * sozlamasida o'chirilmagan bo'lsa). Rozilik talab qilinsa — `ufq('consent', true)`
 * chaqirilmaguncha hech narsa yuborilmaydi.
 *
 * Yuborish: navigator.sendBeacon (text/plain) — sahifa yopilayotganda ham
 * yetib boradi, CORS preflight yo'q, saytni sekinlashtirmaydi.
 */
export function trackerScript({ endpoint, trackingId, config }) {
  const cfg = JSON.stringify({ e: endpoint, id: trackingId, ...config });
  return `/* UFQ Analytics — ${trackingId} */
(function(w,d){"use strict";
if(w.__ufqA)return;w.__ufqA=1;
var C=${cfg};var N=w.navigator,L=w.localStorage,Q=[],T=null,LS="_ufq_"+C.id;
function st(k,v){try{if(v===undefined)return L.getItem(LS+k);if(v===null)L.removeItem(LS+k);else L.setItem(LS+k,v)}catch(e){return null}}
function rid(){var a=new Uint8Array(12);(w.crypto||w.msCrypto).getRandomValues(a);return Array.prototype.map.call(a,function(x){return("0"+x.toString(16)).slice(-2)}).join("")}
if(C.dnt&&(N.doNotTrack=="1"||w.doNotTrack=="1"||N.globalPrivacyControl===true))return;
var consent=!C.consent||st("c")==="1";
var vid=st("v");if(!vid){vid=rid();}
var sid=null,last=+(st("l")||0),now=Date.now();
function sess(){var t=Date.now();if(!sid){sid=st("s");}if(!sid||t-last>C.to*60000){sid=rid();Q.push(ev("session_start"));}last=t;}
function ev(type,x){x=x||{};return{e:type,id:rid(),ts:Date.now(),u:x.u||location.href,t:(d.title||"").slice(0,150),r:x.r!==undefined?x.r:"",n:x.n||"",v:x.v,sd:x.sd,du:x.du}}
function flush(){if(!consent||!Q.length)return;var b=JSON.stringify({tid:C.id,vid:vid,sid:sid,sw:w.screen?w.screen.width:0,lng:(N.language||"").slice(0,12),now:Date.now(),ev:Q.splice(0,20)});
try{st("v",vid);st("s",sid);st("l",String(last));}catch(e){}
var ok=false;try{if(N.sendBeacon)ok=N.sendBeacon(C.e,new Blob([b],{type:"text/plain"}))}catch(e){}
if(!ok){try{fetch(C.e,{method:"POST",body:b,keepalive:true,mode:"no-cors",headers:{"Content-Type":"text/plain"}})}catch(e){}}
if(Q.length)flush();}
function soon(){clearTimeout(T);T=setTimeout(flush,800)}
function push(type,x){sess();Q.push(ev(type,x));soon();}
var pageStart=Date.now(),visible=0,visFrom=d.visibilityState==="visible"?Date.now():0,maxScroll=0,sent={},curPath=location.pathname,curUrl=location.href,exited=false;
function vt(){return visible+(visFrom?Date.now()-visFrom:0)}
function pv(ref){pageStart=Date.now();visible=0;visFrom=d.visibilityState==="visible"?Date.now():0;maxScroll=0;sent={};exited=false;curPath=location.pathname;curUrl=location.href;push("page_view",{r:ref});}
function exit(){if(exited)return;exited=true;Q.push(ev("page_exit",{u:curUrl,du:Math.round(vt()),sd:maxScroll}));flush();}
var ref0=d.referrer||"";try{if(ref0&&new URL(ref0).host===location.host)ref0=""}catch(e){}
pv(ref0);
// SPA: history o'zgarishi — yangi sahifa ko'rishi
function hook(m){var o=history[m];if(!o)return;history[m]=function(){var r=o.apply(this,arguments);if(location.pathname!==curPath){exit();pv("");}return r}}
hook("pushState");hook("replaceState");w.addEventListener("popstate",function(){if(location.pathname!==curPath){exit();pv("");}});
d.addEventListener("visibilitychange",function(){if(d.visibilityState==="hidden"){if(visFrom){visible+=Date.now()-visFrom;visFrom=0;}exit();}else{visFrom=Date.now();}});
w.addEventListener("pagehide",exit);
w.addEventListener("scroll",function(){var h=d.documentElement,b=d.body,sh=Math.max(h.scrollHeight,b?b.scrollHeight:0)-h.clientHeight;if(sh<=0)return;var p=Math.min(100,Math.round((w.scrollY||h.scrollTop)/sh*100));if(p>maxScroll)maxScroll=p;[25,50,75,100].forEach(function(m){if(p>=m&&!sent[m]){sent[m]=1;push("scroll",{sd:m})}})},{passive:true});
d.addEventListener("click",function(e){var el=e.target&&e.target.closest?e.target.closest("[data-ufq-event]"+(C.sel?","+C.sel:"")):null;if(!el)return;var n=el.getAttribute("data-ufq-event")||el.id||(el.textContent||"").trim().slice(0,60)||el.tagName;push("click",{n:n.slice(0,80)});if(el.getAttribute("data-ufq-lead")!==null)push("lead",{n:n.slice(0,80)});},true);
d.addEventListener("submit",function(e){var f=e.target;if(!f||f.tagName!=="FORM")return;var n=f.getAttribute("data-ufq-form")||f.getAttribute("name")||f.id||"forma";push("form_submit",{n:String(n).slice(0,80)});if(f.getAttribute("data-ufq-lead")!==null)push("lead",{n:String(n).slice(0,80)});},true);
w.ufq=function(cmd,a,b){
if(cmd==="consent"){consent=!!a;st("c",a?"1":null);if(a)flush();else Q.length=0;return}
if(cmd==="track"&&typeof a==="string"){b=b||{};var t=["lead","purchase","conversion","form_submit","click"].indexOf(a)>=0?a:"conversion";push(t,{n:String(b.name||a).slice(0,80),v:typeof b.value==="number"&&isFinite(b.value)?b.value:undefined})}};
var q=w.ufqQ||[];for(var i=0;i<q.length;i++)w.ufq.apply(null,q[i]);
})(window,document);`;
}
