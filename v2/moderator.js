import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, onValue, update, set } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { SCENARIO } from "./scenario-classroom.js";

const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getDatabase(app);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const steps = SCENARIO.tabs;
const downloadState={responses:null,exits:null};
const isSubmitted = r => !!r && (r.status==="submitted" || (!r.status && !!r.updatedAt));
let sessionId = "", isOwner = false, serverOffset = 0, state = {currentTab:0,timerEnd:null,timerPausedRemaining:null,locked:false};
let viewTab = null, summary = null, summaryRequest = 0, timerInterval, unsubs = [];
let groupCount=1, activeGroup=1, presenceRows={}, responseRows={};
const now = () => Date.now()+serverOffset;
const requested = (new URLSearchParams(location.search).get("session")||"").toUpperCase().replace(/[^A-F0-9]/g,"");
const showError = m => {$("#setupError").textContent=m;$("#authStatus").textContent="Action needed";};
const connect = async () => {if(!auth.currentUser)await signInAnonymously(auth);};

$("#createSession").addEventListener("click",async()=>{
 const btn=$("#createSession");btn.disabled=true;$("#setupError").textContent="";
 let operation="signing in", code="", ownerSaved=false, sessionSaved=false;
 try{
   await connect();
   let exists=true;
   for(let i=0;i<8&&exists;i++){
     const bytes=new Uint8Array(3);crypto.getRandomValues(bytes);
     code=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("").slice(0,5).toUpperCase();
     operation="checking classroom code availability";
     exists=(await get(ref(db,"sessions/"+code+"/owner"))).exists();
   }
   if(exists)throw Error("Unable to find an unused classroom code.");
   operation="creating classroom owner record";
   await set(ref(db,"sessions/"+code+"/owner"),auth.currentUser.uid);
   ownerSaved=true;
   operation="creating classroom session state";
   await set(ref(db,"sessions/"+code+"/state"),{currentTab:0,timerEnd:null,timerPausedRemaining:null,locked:false,groupCount:Number($("#groupCount").value),createdAt:Date.now()});
   sessionSaved=true;
   location.assign("moderator.html?session="+encodeURIComponent(code));
 }catch(e){
   console.error("SPARK classroom creation failed", {operation,code,errorCode:e?.code,message:e?.message,ownerSaved,sessionSaved});
   const permission=e?.code==="PERMISSION_DENIED"||e?.code==="permission-denied"||/permission.denied/i.test(e?.message||"");
   const details=permission?" Firebase denied this operation. The deployed database rules may not match the repository.":" "+(e?.code||e?.message||"Unknown error")+".";
   const partial=ownerSaved&&!sessionSaved?" A session owner record was created, but the classroom could not be initialized. Keep this code for support: "+code+".":"";
   showError("Could not create class while "+operation+"."+details+partial);
   btn.disabled=false;
 }
});
async function openSession(code){
 await connect();
 const [st,owner]=await Promise.all([get(ref(db,"sessions/"+code+"/state")),get(ref(db,"sessions/"+code+"/owner"))]);
 if(!st.exists())throw Error("Session unavailable. Open your original teacher link or create a new session.");
 sessionId=code;isOwner=owner.val()===auth.currentUser.uid;
 $("#setup").hidden=true;$("#classroom").hidden=false;$("#sessionId").textContent=code;
 $("#sessionLabel").textContent=isOwner?"Classroom ready":"View only";
 groupCount=Math.max(1,Number(st.val().groupCount||1));
 $("#groupDescription").textContent=groupCount===1?"One whole-class group, individual responses":groupCount+" groups, individual responses";
 $("#joinLink").value=new URL("join.html?session="+encodeURIComponent(code),location.href).href;
 setupGroupLinks();
 renderJoinQr();
 $("#authStatus").textContent="Class "+code;
 if(!isOwner){
   $("#syncStatus").textContent="Teacher controls unavailable in this browser. Return to the browser that created this session, or contact the SPARK team.";
   document.querySelectorAll("#startTimer,#pauseTimer,#addMinute,#resetTimer,#lockResponses,#openStep,#openAndTime,#advanceLive,#advanceTimed,#publishSummary,#refreshSummary,#exportResponses,#exportExitTickets,#inspectData").forEach(x=>x.disabled=true);
 }
 bind();
}
$("#copyJoin").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("#joinLink").value);$("#copyStatus").textContent="Student link copied.";}catch{$("#joinLink").select();$("#copyStatus").textContent="Select and copy the link above."; }});
$("#openStudent").addEventListener("click",()=>window.open($("#joinLink").value,"_blank","noopener"));
function groupUrl(g){const url=new URL("join.html",location.href);url.searchParams.set("session",sessionId);if(groupCount>1)url.searchParams.set("group",String(g));return url.href;}
function setupGroupLinks(){
 const el=$("#groupLinks");el.innerHTML="";
 if(groupCount===1){el.hidden=true;return;}el.hidden=false;
 const label=document.createElement("label");label.textContent="Choose a group link";label.htmlFor="groupLinkSelect";el.appendChild(label);
 const select=document.createElement("select");select.id="groupLinkSelect";
 for(let i=1;i<=groupCount;i++){const o=document.createElement("option");o.value=String(i);o.textContent="Group "+i;select.appendChild(o);}
 select.addEventListener("change",()=>{activeGroup=Number(select.value);$("#joinLink").value=groupUrl(activeGroup);renderJoinQr();});
 el.appendChild(select);
 activeGroup=1;$("#joinLink").value=groupUrl(1);
}
function renderGroupProgress(){
 const groups=Array.from({length:groupCount},(_,i)=>({group:i+1,online:0,saved:0}));
 Object.values(presenceRows).forEach(p=>{const g=Number(p?.group||1);if(groups[g-1])groups[g-1].online++;});
 Object.values(responseRows).forEach(r=>{const g=Number(r?.participant?.group||1);if(groups[g-1]&&steps.some(t=>r[t.id]&&r[t.id].updatedAt!=null))groups[g-1].saved++;});
 $("#presence").textContent=groups.reduce((a,g)=>a+g.online,0);
 $("#responseCount").textContent=groups.reduce((a,g)=>a+g.saved,0);
 $("#groupProgress").innerHTML=groupCount===1?"":groups.map(g=>'<span class="group-stat"><strong>Group '+g.group+'</strong> '+g.online+' online · '+g.saved+' saved</span>').join("");
}
function makeQr(target,size){
 target.textContent="";
 if(typeof QRCode!=="function"){target.textContent="QR unavailable. Use the student link.";return;}
 new QRCode(target,{text:$("#joinLink").value,width:size,height:size,correctLevel:QRCode.CorrectLevel.M});
}
function renderJoinQr(){makeQr($("#qrCode"),128);$("#qrSessionLabel").textContent="Class code: "+sessionId+(groupCount>1?" · Group "+activeGroup:"");}
$("#enlargeQr").addEventListener("click",()=>{makeQr($("#qrLarge"),300);$("#qrDialog").showModal();});
if(requested)openSession(requested).catch(e=>{showError(e.message);$("#setup").hidden=false;$("#classroom").hidden=true;});
else $("#authStatus").textContent="Create a class to begin";

function clearSummary(){
 summaryRequest++;summary=null;$("#summary").textContent="";$("#publishSummary").disabled=true;
}
function bind(){
 unsubs.forEach(x=>x());unsubs=[];
 const fail=(where,e)=>{$("#syncStatus").textContent="Cannot read "+where+" ("+(e?.code||"connection error")+").";};
 unsubs.push(onValue(ref(db,".info/serverTimeOffset"),s=>{serverOffset=s.val()||0;}));
 unsubs.push(onValue(ref(db,"sessions/"+sessionId+"/state"),s=>{
   if(!s.exists()){fail("class state");return;}
   state={currentTab:0,...s.val()};
   if(viewTab===null)viewTab=state.currentTab;
   renderLive();renderView();
   if(isOwner)$("#syncStatus").textContent="Connected to class "+sessionId;
 },e=>fail("class state",e)));
 if(isOwner){
  unsubs.push(onValue(ref(db,"sessions/"+sessionId+"/presence"),s=>{presenceRows=s.val()||{};renderGroupProgress();},e=>fail("students online",e)));
  unsubs.push(onValue(ref(db,"responses/"+sessionId),s=>{responseRows=s.val()||{};renderGroupProgress();},e=>fail("saved records",e)));
 }
}
function remaining(){return state.timerPausedRemaining!=null?state.timerPausedRemaining:(state.timerEnd?state.timerEnd-now():null);}
function renderLive(){
 $("#liveLabel").textContent=steps[state.currentTab]?.label||"Unknown step";
 const hasNext=state.currentTab<steps.length-1;
 $("#advanceLive").disabled=!isOwner||!hasNext;
 $("#advanceTimed").disabled=!isOwner||!hasNext;
 $("#nextLiveLabel").textContent=hasNext?"Next: "+steps[state.currentTab+1].label:"All seven steps are open.";
 $("#advanceTimed").textContent=hasNext?"Open next + "+(steps[state.currentTab+1].minutes||5)+" min timer":"All steps opened";
 $("#lockResponses").checked=!!state.locked;
 clearInterval(timerInterval);
 const draw=()=>{let ms=remaining();if(ms==null){$("#timer").textContent="--:--";$("#timerNote").textContent="";return;}let secs=Math.ceil(Math.max(0,ms)/1000);$("#timer").textContent=Math.floor(secs/60)+":"+String(secs%60).padStart(2,"0");$("#timerNote").textContent=state.timerPausedRemaining!=null?"Paused":ms<=0?"Time is up":"Running";};
 draw();timerInterval=setInterval(draw,500);
}
async function patch(next){if(!isOwner||!sessionId)return false;try{await update(ref(db,"sessions/"+sessionId+"/state"),next);return true;}catch(e){$("#syncStatus").textContent="Could not update class: "+(e.code||e.message);return false;}}
$("#startTimer").addEventListener("click",()=>{
 if(state.timerPausedRemaining!=null)return patch({timerEnd:now()+state.timerPausedRemaining,timerPausedRemaining:null});
 if(state.timerEnd&&state.timerEnd>now())return;
 return patch({timerEnd:now()+(steps[state.currentTab].minutes||5)*60000,timerPausedRemaining:null});
});
$("#pauseTimer").addEventListener("click",()=>{if(state.timerEnd)patch({timerEnd:null,timerPausedRemaining:Math.max(0,state.timerEnd-now())});});
$("#addMinute").addEventListener("click",()=>{if(state.timerEnd)patch({timerEnd:state.timerEnd+60000});else if(state.timerPausedRemaining!=null)patch({timerPausedRemaining:state.timerPausedRemaining+60000});else patch({timerEnd:now()+60000,timerPausedRemaining:null});});
$("#resetTimer").addEventListener("click",()=>patch({timerEnd:null,timerPausedRemaining:null}));
$("#lockResponses").addEventListener("change",e=>patch({locked:e.target.checked}));

function setView(i){viewTab=Math.max(0,Math.min(steps.length-1,i));clearSummary();renderView();}
function renderView(){
 if(viewTab===null)return;
 const t=steps[viewTab],live=state.currentTab;
 $("#stepNav").innerHTML=steps.map((s,i)=>'<button type="button" data-step="'+i+'" class="step-chip '+(i===viewTab?"viewing ":"")+(i===live?"live ":"")+(i>live?"future":"")+'">'+esc(s.label)+'</button>').join("");
 $("#stepNav").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>setView(Number(b.dataset.step))));
 $("#viewState").textContent=viewTab===live?"STUDENTS ARE HERE NOW":viewTab<live?"STUDENTS HAVE ALREADY SEEN THIS":"NOT YET OPEN TO STUDENTS";
 $("#viewTitle").textContent=t.title;
 $("#readAloud").innerHTML=(t.readAloud||[]).map(x=>"<li>"+esc(x)+"</li>").join("");
 $("#modNote").textContent=t.modNote||"";
 $("#viewMeta").textContent="Suggested time: "+(t.minutes||5)+" min. Prompts are optional; allow different evidence-based decisions.";
 $("#prevView").disabled=viewTab===0;$("#nextView").disabled=viewTab===steps.length-1;
 $("#openStep").textContent=viewTab===live?"Students are on this step":viewTab<live?"Students already have this step":"Open this step for students";
 $("#openStep").disabled=!isOwner||viewTab<=live;
 $("#openAndTime").disabled=!isOwner||viewTab!==live+1;
 $("#openAndTime").textContent=viewTab===live+1?"Open next step + start "+(t.minutes||5)+" min timer":"Select the next unopened step to start timer";
}
function advanceLiveStep(withTimer){
 if(!isOwner||state.currentTab>=steps.length-1)return;
 const next=state.currentTab+1;
 const data={currentTab:next,locked:false,timerEnd:withTimer?now()+(steps[next].minutes||5)*60000:null,timerPausedRemaining:null};
 $("#advanceLive").disabled=true;$("#advanceTimed").disabled=true;
 patch(data).then(ok=>{if(ok){setView(next);}else{$("#advanceLive").disabled=false;$("#advanceTimed").disabled=false;}});
}
$("#advanceLive").addEventListener("click",()=>advanceLiveStep(false));
$("#advanceTimed").addEventListener("click",()=>advanceLiveStep(true));
$("#openAndTime").addEventListener("click",async()=>{
 if(!isOwner||viewTab!==state.currentTab+1)return;
 const button=$("#openAndTime");button.disabled=true;
 const ok=await patch({currentTab:viewTab,locked:false,timerEnd:now()+(steps[viewTab].minutes||5)*60000,timerPausedRemaining:null});
 if(!ok)button.disabled=false;
});
$("#prevView").addEventListener("click",()=>setView(viewTab-1));
$("#nextView").addEventListener("click",()=>setView(viewTab+1));
$("#openStep").addEventListener("click",async()=>{
 if(!isOwner||viewTab<=state.currentTab)return;
 if(viewTab>state.currentTab+1&&!confirm("This will skip "+(viewTab-state.currentTab-1)+" step(s) and expose later information to students. Continue?"))return;
 await patch({currentTab:viewTab,locked:false,timerEnd:null,timerPausedRemaining:null});
});
async function computeSummary(){
 if(!isOwner)return null;
 const token=++summaryRequest,step=steps[viewTab].id,code=sessionId;
 $("#publishSummary").disabled=true;$("#summary").textContent="Loading answers...";
 try{
 const snap=await get(ref(db,"responses/"+code));
 if(token!==summaryRequest||steps[viewTab].id!==step||sessionId!==code)return null;
 const rows=Object.values(snap.val()||{}),items={};
 if(["first-impression","preliminary","new-information","final"].includes(step))
   rows.forEach(r=>{const x=isSubmitted(r[step])?r[step]?.recommendation:null;if(x)items[x]=(items[x]||0)+1;});
 else if(step==="investigate")
   rows.forEach(r=>(isSubmitted(r[step])?r[step]?.areas||[]:[]).forEach(x=>{items[x]=(items[x]||0)+1;}));
 const text=step==="need-to-know"?rows.filter(r=>isSubmitted(r[step])&&r[step]?.questions?.length).length+" students submitted questions.":
   step!=="investigate"&&!["first-impression","preliminary","new-information","final"].includes(step)?rows.filter(r=>isSubmitted(r[step])).length+" students submitted notes.":null;
 summary={step,session:code,payload:text?{text}:{items}};
 $("#summary").innerHTML=text?esc(text):Object.entries(items).sort((a,b)=>b[1]-a[1]).map(([k,v])=>"<div>"+esc(k)+": <strong>"+v+"</strong></div>").join("")||"No responses yet.";
 $("#publishSummary").disabled=false;return summary;
 }catch(e){if(token===summaryRequest)$("#summary").textContent="Cannot load summary: "+(e.code||e.message);return null;}
}
$("#refreshSummary").addEventListener("click",computeSummary);
$("#publishSummary").addEventListener("click",async()=>{
 if(!isOwner||!summary||summary.step!==steps[viewTab].id||summary.session!==sessionId){$("#summary").textContent="Refresh this step's summary before sharing.";return;}
 const picked=summary;
 try{await set(ref(db,"sessions/"+picked.session+"/published/"+picked.step),picked.payload);$("#summary").insertAdjacentText("beforeend"," Shared with class.");}
 catch(e){$("#summary").textContent="Cannot share summary: "+(e.code||e.message);}
});


function csvCell(v){
 const raw=String(v==null?"":Array.isArray(v)?v.join(" | "):v);
 // Prevent spreadsheet formula execution from student-supplied free text.
 const safe=/^[\s]*[=+@-]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replace(/"/g,'""')+'"';
}
function downloadCsv(filename,columns,rows){
 const csv="\ufeff"+[columns,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n";
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function verifyOwner(){
 if(!sessionId||!auth.currentUser)throw new Error("No authorized classroom session.");
 const snapshot=await get(ref(db,"sessions/"+sessionId+"/owner"));
 if(snapshot.val()!==auth.currentUser.uid)throw new Error("Only the session owner may export this data.");
}
$("#exportResponses").addEventListener("click",async()=>{
 const button=$("#exportResponses");button.disabled=true;$("#exportStatus").textContent="Preparing scenario CSV...";
 try{
  await verifyOwner();
  const data=(await get(ref(db,"responses/"+sessionId))).val()||{};
  const stages=["first-impression","need-to-know","investigate","evidence","preliminary","new-information","final"];
  const fields={
   "first-impression":["recommendation","confidence","factors"],
   "need-to-know":["questions","sources"],
   "investigate":["areas","why","hope"],
   "evidence":["review"],
   "preliminary":["recommendation","evidence","reasoning","confidence"],
   "new-information":["recommendation","confidence","why"],
   "final":["recommendation","finalReason","reopen","insufficient"]
  };
  const fieldNames=stages.flatMap(stage=>[...fields[stage].map(f=>stage+"."+f),stage+".saved"]);
  const columns=["anonymous_row",...fieldNames];
  const rows=Object.entries(data).sort(([a],[b])=>a.localeCompare(b)).map(([key,r],i)=>["R"+String(i+1).padStart(3,"0"),
    ...stages.flatMap(stage=>[...fields[stage].map(f=>r?.[stage]?.[f]??""),isSubmitted(r?.[stage])?"yes":r?.[stage]?.status==="draft"?"draft":""])
  ]);
  downloadCsv("spark-"+sessionId+"-scenario-responses.csv",columns,rows);
  downloadState.responses=JSON.stringify(data);refreshPurgeEnabled();
  $("#exportStatus").textContent=rows.length+" records downloaded without Firebase IDs, nicknames or exact save times. Open the file and check free text for identifying details.";
 }catch(e){$("#exportStatus").textContent="Export failed: "+(e?.code||e?.message||"unknown error");}
 finally{button.disabled=false;}
});
$("#exportExitTickets").addEventListener("click",async()=>{
 const button=$("#exportExitTickets");button.disabled=true;$("#exportStatus").textContent="Preparing exit ticket CSV...";
 try{
  await verifyOwner();
  const data=(await get(ref(db,"exitTickets/"+sessionId))).val()||{};
  const rows=Object.values(data).map(v=>[v.q1||"",v.q2||"",v.q3||"",v.q4||"",v.q5||""]);
  downloadCsv("spark-"+sessionId+"-exit-tickets.csv",["thinking_hardest","confusion","one_change","missing_information","another_scenario"],rows);
  downloadState.exits=JSON.stringify(data);refreshPurgeEnabled();
  $("#exportStatus").textContent=rows.length+" unlinked feedback entries exported. No participant IDs included.";
 }catch(e){$("#exportStatus").textContent="Exit-ticket export failed: "+(e?.code||e?.message||"unknown error");}
 finally{button.disabled=false;}
});


async function getSavedCounts(){
 await verifyOwner();
 const [responses,tickets]=await Promise.all([
  get(ref(db,"responses/"+sessionId)),get(ref(db,"exitTickets/"+sessionId))
 ]);
 const students=Object.values(responses.val()||{});
 const counts=Object.fromEntries(steps.map(t=>[t.id,students.filter(r=>isSubmitted(r?.[t.id])).length]));
 return {participants:students.length,stages:counts,tickets:Object.keys(tickets.val()||{}).length};
}
$("#inspectData").addEventListener("click",async()=>{
 const button=$("#inspectData");button.disabled=true;$("#dataCounts").textContent="Reading Firebase...";
 try{
  const c=await getSavedCounts();
  $("#dataCounts").textContent=c.participants+" participant records; "+
    c.stages.final+" final decisions saved; "+c.tickets+" exit tickets. "+
    "Stage saves: "+steps.map(t=>t.label.split(". ")[0]+": "+c.stages[t.id]).join(", ");
 }catch(e){$("#dataCounts").textContent="Could not verify records: "+(e.code||e.message);}
 finally{button.disabled=false;}
});
function refreshPurgeEnabled(){
 const ready=!!(isOwner && downloadState.responses!==null && downloadState.exits!==null &&
  $("#confirmReviewed").checked && $("#confirmCompleted").checked &&
  $("#confirmCode").value.trim().toUpperCase()===sessionId && !state.purgedAt);
 $("#purgeStudentData").disabled=!ready;
}
["#confirmReviewed","#confirmCompleted","#confirmCode"].forEach(selector=>{
 $(selector).addEventListener("input",refreshPurgeEnabled);
 $(selector).addEventListener("change",refreshPurgeEnabled);
});
$("#purgeStudentData").addEventListener("click",async()=>{
 const button=$("#purgeStudentData");refreshPurgeEnabled();if(button.disabled)return;
 if(!confirm("Permanently delete ALL student responses, exit tickets and presence data from class "+sessionId+"? This cannot be undone. Confirm your files are safely stored."))return;
 button.disabled=true;
 $("#purgeStatus").textContent="Comparing current Firebase records with downloaded exports...";
 try{
  await verifyOwner();
  const st=await get(ref(db,"sessions/"+sessionId+"/state"));
  if(st.val()?.purgedAt)throw Error("Student data was already cleared.");
  if(st.val()?.separateModerators)throw Error("Independent group data paths require a separate audited export and purge. Do not delete this session here.");
  if(!st.val()?.archived){
   $("#purgeStatus").textContent="Archiving session to stop new submissions...";
   await update(ref(db,"sessions/"+sessionId+"/state"),{archived:true,locked:true,timerEnd:null,timerPausedRemaining:null});
  }
  const [frozenResponses,frozenTickets]=await Promise.all([get(ref(db,"responses/"+sessionId)),get(ref(db,"exitTickets/"+sessionId))]);
  if(JSON.stringify(frozenResponses.val()||{})!==downloadState.responses ||
     JSON.stringify(frozenTickets.val()||{})!==downloadState.exits){
   downloadState.responses=null;downloadState.exits=null;
   throw Error("Data changed since export. Collection is now frozen; download and inspect BOTH current files again, then repeat the deletion confirmation.");
  }
  $("#purgeStatus").textContent="Removing student records...";
  await update(ref(db),{
   ["responses/"+sessionId]:null,
   ["exitTickets/"+sessionId]:null,
   ["sessions/"+sessionId+"/presence"]:null,
   ["sessions/"+sessionId+"/published"]:null
  });
  const [a,b,c]=await Promise.all([
   get(ref(db,"responses/"+sessionId)),
   get(ref(db,"exitTickets/"+sessionId)),
   get(ref(db,"sessions/"+sessionId+"/presence"))
  ]);
  if(a.exists()||b.exists()||c.exists())throw Error("Deletion verification failed. Do not assume records were cleared.");
  await update(ref(db,"sessions/"+sessionId+"/state"),{purgedAt:Date.now()});
  $("#purgeStatus").textContent="Verified: student responses, exit tickets and presence records removed. This class is archived; keep your approved CSV files in secure storage.";
  $("#exportResponses").disabled=true;$("#exportExitTickets").disabled=true;
  $("#purgeStudentData").disabled=true;
 }catch(e){
  $("#purgeStatus").textContent="Cleanup incomplete: "+(e.code||e.message)+
   ". If session was archived, contact SPARK for supervised cleanup; do not create a new live session to replace lost data.";
 }
});
