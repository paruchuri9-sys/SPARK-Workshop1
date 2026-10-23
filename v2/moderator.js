import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, get, onValue, update, set } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { SCENARIO } from "./scenario-classroom.js";

const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getDatabase(app);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const steps = SCENARIO.tabs;
let sessionId = "", isOwner = false, serverOffset = 0, state = {currentTab:0,timerEnd:null,timerPausedRemaining:null,locked:false};
let viewTab = null, summary = null, summaryRequest = 0, timerInterval, unsubs = [];
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
 $("#groupDescription").textContent=Number(st.val().groupCount||1)===1?"One whole-class group, individual responses":st.val().groupCount+" groups, individual responses";
 $("#joinLink").value=new URL("join.html?session="+encodeURIComponent(code),location.href).href;
 renderJoinQr();
 $("#authStatus").textContent="Class "+code;
 if(!isOwner){
   $("#syncStatus").textContent="Teacher controls unavailable in this browser. Return to the browser that created this session, or contact the SPARK team.";
   document.querySelectorAll("#startTimer,#pauseTimer,#addMinute,#resetTimer,#lockResponses,#openStep,#publishSummary,#refreshSummary").forEach(x=>x.disabled=true);
 }
 bind();
}
$("#copyJoin").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("#joinLink").value);$("#copyStatus").textContent="Student link copied.";}catch{$("#joinLink").select();$("#copyStatus").textContent="Select and copy the link above."; }});
$("#openStudent").addEventListener("click",()=>window.open($("#joinLink").value,"_blank","noopener"));
function makeQr(target,size){
 target.textContent="";
 if(typeof QRCode!=="function"){target.textContent="QR unavailable. Use the student link.";return;}
 new QRCode(target,{text:$("#joinLink").value,width:size,height:size,correctLevel:QRCode.CorrectLevel.M});
}
function renderJoinQr(){makeQr($("#qrCode"),128);$("#qrSessionLabel").textContent="Class code: "+sessionId;}
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
  unsubs.push(onValue(ref(db,"sessions/"+sessionId+"/presence"),s=>{$("#presence").textContent=Object.keys(s.val()||{}).length;},e=>fail("students online",e)));
  unsubs.push(onValue(ref(db,"responses/"+sessionId),s=>{$("#responseCount").textContent=Object.keys(s.val()||{}).length;},e=>fail("saved records",e)));
 }
}
function remaining(){return state.timerPausedRemaining!=null?state.timerPausedRemaining:(state.timerEnd?state.timerEnd-now():null);}
function renderLive(){
 $("#liveLabel").textContent=steps[state.currentTab]?.label||"Unknown step";
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
   rows.forEach(r=>{const x=r[step]?.recommendation;if(x)items[x]=(items[x]||0)+1;});
 else if(step==="investigate")
   rows.forEach(r=>(r[step]?.areas||[]).forEach(x=>{items[x]=(items[x]||0)+1;}));
 const text=step==="need-to-know"?rows.filter(r=>r[step]?.questions?.length).length+" students submitted questions.":
   step!=="investigate"&&!["first-impression","preliminary","new-information","final"].includes(step)?rows.filter(r=>r[step]).length+" students submitted notes.":null;
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
