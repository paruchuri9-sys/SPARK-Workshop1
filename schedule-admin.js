import {initializeApp} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {getAuth,signInAnonymously} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {getDatabase,ref,get,set,onValue,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import {firebaseConfig} from "./v2/firebase-config.js";
const $=s=>document.querySelector(s),app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
let uid="",pollId="",cfg=null,entries={},votes={};
const params=new URLSearchParams(location.search);
const existing=(params.get("poll")||"").replace(/[^a-zA-Z0-9_-]/g,"");
const status=m=>$("#organizerStatus").textContent=m;
function time(h){return (h%12||12)+(h<12?" AM":" PM")}
function day(d){return new Intl.DateTimeFormat("en-US",{timeZone:"UTC",weekday:"short",month:"short",day:"numeric"}).format(new Date(d+"T12:00:00Z"))}
function rows(){return Object.entries(entries).sort((a,b)=>(a[1]?.name||"").localeCompare(b[1]?.name||""))}
function slotLabel(slot){return day(slot.date)+" "+time(slot.start)+"–"+time(slot.start+1)}
function draw(){
 if(!cfg)return;
 $("#pollTitle").textContent=cfg.title;
 const base=new URL("schedule.html",location.href);base.searchParams.set("poll",pollId);
 $("#publicLink").value=base.href;
 $("#responseCount").textContent=rows().length+" named response(s). Only this organizer browser can read names.";
 const totals=$("#totals");totals.replaceChildren();
 for(const dayDate of cfg.dates){
  const h=document.createElement("h3");h.textContent=day(dayDate)+(cfg.preferredDate===dayDate?" · preferred":"");totals.appendChild(h);
  for(const key of cfg.slotOrder){const sl=cfg.slots[key];if(sl.date!==dayDate)continue;
   const line=document.createElement("div");line.className="slot";
   const name=document.createElement("span");name.className="time";name.textContent=time(sl.start)+"–"+time(sl.start+1);
   const count=document.createElement("span");count.className="count";count.textContent=Object.values(votes).filter(v=>v?.slots?.[key]).length+" available";
   line.append(name,count);totals.appendChild(line);
  }
 }
 const head=$("#responseHead"),body=$("#responseRows");head.replaceChildren();body.replaceChildren();
 const tr=document.createElement("tr");
 for(const field of ["Name","Available slots","Scenario test before Thursday?"]){const th=document.createElement("th");th.textContent=field;tr.appendChild(th)}head.appendChild(tr);
 for(const [id,row] of rows()){
  const tr=document.createElement("tr"),fields=[row.name||"",cfg.slotOrder.filter(k=>row.slots?.[k]).map(k=>slotLabel(cfg.slots[k])).join("; "),row.answer||""];
  for(const field of fields){const td=document.createElement("td");td.textContent=field;tr.appendChild(td)}body.appendChild(tr);
 }
}
async function openPoll(id){
 const owner=await get(ref(db,"meetingPolls/"+id+"/owner"));
 if(!owner.exists()||owner.val()!==uid)throw Error("This browser is not the poll organizer. Reopen the browser that created the poll.");
 const c=await get(ref(db,"meetingPolls/"+id+"/config"));
 if(!c.exists())throw Error("The poll owner exists, but setup is incomplete.");
 pollId=id;cfg=c.val();
 $("#createPanel").hidden=true;$("#managePanel").hidden=false;
 status("Organizer access confirmed · "+pollId);
 onValue(ref(db,"meetingPolls/"+id+"/entries"),s=>{entries=s.val()||{};draw()},e=>status("Could not load names: "+(e.code||e.message)));
 onValue(ref(db,"meetingPolls/"+id+"/votes"),s=>{votes=s.val()||{};draw()},e=>status("Could not load totals: "+(e.code||e.message)));
 draw();
}
function buildConfig(){
 const dates=[$("#date1").value,$("#date2").value];
 const start=Number($("#start").value),end=Number($("#end").value);
 if(!dates[0]||!dates[1]||dates[0]===dates[1])throw Error("Choose two different dates.");
 if(end<start||end>22||start<0)throw Error("Last start time must follow the first.");
 const slots={},slotOrder=[];
 dates.forEach((date,d)=>{for(let h=start;h<=end;h++){const key="d"+d+"h"+h;slots[key]={date,start:h};slotOrder.push(key)}});
 return {title:$("#title").value.trim(),question:$("#question").value.trim(),dates,preferredDate:$("#preferred").value==="none"?"":dates[$("#preferred").value==="first"?0:1],slots,slotOrder,timezone:"America/Chicago",closed:false,createdAt:Date.now()};
}
$("#createForm").addEventListener("submit",async e=>{
 e.preventDefault();const btn=$("#createButton");btn.disabled=true;$("#createStatus").textContent="Creating...";
 try{
  const conf=buildConfig();if(!conf.title||!conf.question)throw Error("Enter title and question.");
  const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);
  const id=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
  // Claim an unguessable poll owner first, then publish its configuration.
  await set(ref(db,"meetingPolls/"+id+"/owner"),uid);
  await set(ref(db,"meetingPolls/"+id+"/config"),conf);
  location.search="?poll="+encodeURIComponent(id);
 }catch(error){$("#createStatus").textContent="Not created: "+(error.code||error.message);btn.disabled=false}
});
$("#copyLink").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("#publicLink").value);$("#copyStatus").textContent="Copied."}catch{$("#publicLink").select();$("#copyStatus").textContent="Select and copy the link."}});
function csvField(s){const v=String(s??"");const safe=/^\s*[=+@-]/.test(v)?"'"+v:v;return '"'+safe.replace(/"/g,'""')+'"'}
$("#exportCSV").addEventListener("click",()=>{
 if(!cfg)return;
 const headers=["name",...cfg.slotOrder.map(k=>slotLabel(cfg.slots[k])),"scenario_test_before_thursday"];
 const data=rows().map(([,v])=>[v.name||"",...cfg.slotOrder.map(k=>v.slots?.[k]?"Yes":""),v.answer||""]);
 const csv="\ufeff"+[headers,...data].map(row=>row.map(csvField).join(",")).join("\r\n")+"\r\n";
 const u=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");a.href=u;a.download="spark-meeting-"+pollId+"-responses.csv";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
});
(async()=>{try{uid=(await signInAnonymously(auth)).user.uid;if(existing)await openPoll(existing);else{$("#createPanel").hidden=false;status("Signed in as poll organizer. Create a poll below.")}}catch(e){status("Organizer access failed: "+(e.code||e.message));}})();
