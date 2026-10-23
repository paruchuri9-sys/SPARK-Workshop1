import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, push, onValue, set, update, remove, onDisconnect, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";


const params = new URLSearchParams(location.search);
const previewMode = ["1","true","yes"].includes((params.get("preview") || "").toLowerCase());
const { SCENARIO, RECOMMENDATIONS } = await import(previewMode ? "./scenario.js" : "./scenario-classroom.js");
const sessionId = (params.get("session") || "").replace(/[^a-zA-Z0-9_-]/g, "");
const groupParam = Number(params.get("group") || 1);
if (!previewMode && !sessionId) { location.replace("join.html"); throw Error("A classroom code is required."); }

let db = null, uid = "preview";
let state = { currentTab: previewMode ? SCENARIO.tabs.length - 1 : 0, timerEnd:null, timerPausedRemaining:null, locked:false };
let activeTab = 0; let timerInterval; let myResponses = {};
if (previewMode) { activeTab = 0; myResponses = {}; sessionStorage.removeItem("sparkPreviewTab"); }
let stateRef = null, responseBase = null;
let serverOffset=0, publishedUnsub=null;
let exitStatus="not_started";
const exitKey="spark_exit_completed_"+sessionId;
const isStageSubmitted = r => !!r&&(r.status==="submitted"||(!r.status&&!!r.updatedAt));
const draftKey = id => "spark_draft_"+sessionId+"_"+uid+"_"+id;
const stageWriteQueues = new Map();
const stageDraftTimers = new Map();
const stageDraftErrors = new Map();
const stageDraftFingerprints = new Map();
const AUTO_SAVE_DELAY_MS=900;
function updateSaveMessage(label,stage){
 if(SCENARIO.tabs[activeTab]?.id!==stage)return;
 const node=document.querySelector("#saveMsg");
 if(node)node.textContent=label;
}
function queueStageWrite(stage,work){
 const prior=stageWriteQueues.get(stage)||Promise.resolve();
 const next=prior.catch(()=>{}).then(work);
 stageWriteQueues.set(stage,next);
 return next;
}
function draftPayload(type){
 const checked=n=>document.querySelector('input[name="'+n+'"]:checked')?.value||"";
 const val=id=>document.getElementById(id)?.value?.trim()||"";
 if(type==="initial")return {recommendation:checked("rec"),confidence:Number(val("conf")||50),factors:val("factors")};
 if(type==="questions")return {questions:[1,2,3].map(i=>val("q"+i)).filter(Boolean),sources:val("sources")};
 if(type==="investigation")return {areas:[...document.querySelectorAll('input[name="area"]:checked')].map(n=>n.value),why:val("why"),hope:val("hope")};
 if(type==="evidence-review")return {review:val("review")};
 if(type==="recommendation")return {recommendation:checked("rec"),evidence:val("evidence"),reasoning:val("reasoning"),confidence:Number(val("conf")||50)};
 if(type==="update")return {recommendation:checked("rec"),confidence:Number(val("conf")||50),why:val("why")};
 if(type==="final")return {recommendation:checked("rec"),finalReason:val("finalReason"),reopen:val("reopen"),insufficient:val("insufficient")};
 return {};
}
function hasMeaningfulDraft(t,p){
 if(!p)return false;
 if(t.responseType==="initial")return !!(p.recommendation||p.factors);
 if(t.responseType==="questions")return !!(p.questions?.length||p.sources);
 if(t.responseType==="investigation")return !!(p.areas?.length||p.why||p.hope);
 if(t.responseType==="evidence-review")return !!p.review;
 if(t.responseType==="recommendation")return !!(p.recommendation||p.evidence||p.reasoning);
 if(t.responseType==="update")return !!(p.recommendation||p.why);
 if(t.responseType==="final")return !!(p.recommendation||p.finalReason||p.reopen||p.insufficient);
 return false;
}
function scheduleDraftSave(stage){
 if(previewMode||!db||!responseBase||state.locked||state.archived)return;
 clearTimeout(stageDraftTimers.get(stage));
 updateSaveMessage("Saving draft soon...",stage);
 stageDraftTimers.set(stage,setTimeout(()=>flushStageDraft(stage),AUTO_SAVE_DELAY_MS));
}
function flushStageDraft(stage){
 clearTimeout(stageDraftTimers.get(stage));stageDraftTimers.delete(stage);
 if(previewMode||!db||state.locked||state.archived)return Promise.resolve(false);
 const t=SCENARIO.tabs.find(x=>x.id===stage);
 if(!t||SCENARIO.tabs[activeTab]?.id!==stage)return Promise.resolve(false);
 storeDraftForStage(activeTab);
 const payload=draftPayload(t.responseType);
 if(!hasMeaningfulDraft(t,payload))return Promise.resolve(false);
 const fingerprint=JSON.stringify(payload);
 if(stageDraftFingerprints.get(stage)===fingerprint)return stageWriteQueues.get(stage)||Promise.resolve(true);
 stageDraftFingerprints.set(stage,fingerprint);
 updateSaveMessage("Saving draft...",stage);
 return queueStageWrite(stage,async()=>{
  if(state.archived||state.locked)return false;
  try{
   await update(ref(db,responseBase+"/"+stage),{...payload,status:"draft",autosavedAt:serverTimestamp()});
   stageDraftErrors.delete(stage);
   // Keep the local draft until an explicit submit confirms the response.
   updateSaveMessage("Draft saved automatically · click Save to submit",stage);
   return true;
  }catch(e){
   stageDraftFingerprints.delete(stage);
   stageDraftErrors.set(stage,e?.code||e?.message||"unknown");
   updateSaveMessage("Draft not saved online · retry Save",stage);
   console.error("SPARK autosave failed",{stage,code:e?.code,message:e?.message});
   return false;
  }
 });
}
const getDraft = id => {try{return JSON.parse(sessionStorage.getItem(draftKey(id))||"null");}catch{return null;}};
function discardDraft(id){try{sessionStorage.removeItem(draftKey(id));}catch{}}
function storeDraftForStage(i){if(previewMode)return;const t=SCENARIO.tabs[i];if(!t||!document.querySelector("#form"))return;try{const data={};document.querySelectorAll("#form input,#form textarea").forEach(node=>{if(!node.id&&!node.name)return;const k=node.id||node.name;if(node.type==="radio"&&!node.checked)return;if(node.type==="checkbox"){if(!data[node.name])data[node.name]=[];if(node.checked)data[node.name].push(node.value);}else data[k]=node.value;});sessionStorage.setItem(draftKey(t.id),JSON.stringify(data));}catch{}}
function storeDraft(){storeDraftForStage(activeTab);}
function applyDraft(t){const data=getDraft(t.id);if(!data)return;const f=document.querySelector("#form");if(!f)return;f.querySelectorAll("input,textarea").forEach(node=>{const k=node.id||node.name;if(node.type==="radio")node.checked=data[node.name]===node.value;else if(node.type==="checkbox")node.checked=(data[node.name]||[]).includes(node.value);else if(data[k]!=null)node.value=data[k];});if($("#conf")&&$("#confVal"))$("#confVal").textContent=$("#conf").value;}


if (!previewMode) {
 try {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  db = getDatabase(app);
  const cred = await signInAnonymously(auth);
  uid = cred.user.uid;
  stateRef = ref(db, `sessions/${sessionId}/state`);
  const sessionSnapshot = await new Promise(resolve => onValue(stateRef, resolve, {onlyOnce:true}));
  const groupCount = Number(sessionSnapshot.val()?.groupCount || 0);
  if(!sessionSnapshot.exists() || groupCount < 1 || !Number.isInteger(groupParam) || groupParam < 1 || groupParam > groupCount) { location.replace("join.html?session="+encodeURIComponent(sessionId)); throw new Error("Invalid classroom session/group."); }
  responseBase = `responses/${sessionId}/${uid}`;
  const presenceRef = ref(db, `sessions/${sessionId}/presence/${uid}`);
  const aliasKey = "sparkAlias_"+sessionId;
  let alias = sessionStorage.getItem(aliasKey);
  if(!alias){ const animals=["Heron","Fox","Owl","Otter","Raven","Falcon","Turtle","Robin"];const bytes=new Uint8Array(3);crypto.getRandomValues(bytes);alias=animals[bytes[0]%animals.length]+"-"+String((bytes[1]*256+bytes[2])%900+100);sessionStorage.setItem(aliasKey,alias); }
  await update(ref(db, responseBase+"/participant"), {nickname:alias,group:groupParam});
  onValue(ref(db, ".info/connected"), async snap => {
    if(snap.val()!==true)return;
    try { await onDisconnect(presenceRef).remove();
      await set(presenceRef, { online:true, group:groupParam, nickname:alias, joinedAt:serverTimestamp() });
    } catch(e){document.querySelector("#status").textContent="Cannot register class attendance ("+(e?.code||"error")+"). Tell your teacher.";}
  });
 } catch(e) { document.querySelector("#status").textContent="Unable to join class: "+(e?.message||"Connection error")+". Tell your teacher.";db=null;stateRef=null; }
}
const $ = s => document.querySelector(s);
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));

if (previewMode) {
  $("#status").textContent = "PREVIEW MODE";
  renderTabs(); render(); startTimer();
} else if(db && stateRef) {
  onValue(ref(db,responseBase), snap => { myResponses = snap.val() || {}; if(!document.querySelector("#form"))render(); else if(SCENARIO.tabs[activeTab]?.id==="final" && isStageSubmitted(myResponses.final) && !document.querySelector("#exitTicketForm") && exitStatus!=="submitted" && exitStatus!=="skipped"){storeDraft();render();} }, e => { $("#status").textContent="Cannot load saved answers ("+(e?.code||"connection error")+"). Tell your teacher."; });
  onValue(ref(db,".info/serverTimeOffset"), snap => {serverOffset=snap.val()||0;});
  onValue(stateRef, snap => {
    if(snap.val()?.archived){ $("#status").textContent="This class is finished and submissions are closed.";return; }
    if(!snap.exists()) { $("#status").textContent="Session not found";return; }
    const nextState = { ...state, ...(snap.val() || {}) };
    const previous=activeTab;
    const incomingTab=nextState.currentTab>state.currentTab?nextState.currentTab:
      activeTab>nextState.currentTab?nextState.currentTab:activeTab;
    if(previous!==incomingTab){
      // Capture form while it is still on screen, before switching to the new stage.
      flushStageDraft(SCENARIO.tabs[previous].id);
      storeDraftForStage(previous);
    }
    activeTab=incomingTab;
    const changed=previous!==activeTab;
    state = nextState;
    if(changed){renderTabs();render();}
    const saveButton=document.querySelector("[data-save]");if(saveButton)saveButton.disabled=!!state.locked;
    startTimer();
    $("#status").textContent = "Joined class "+sessionId+" · Group "+groupParam;
  }, e => { $("#status").textContent = "Cannot read classroom session ("+(e?.code||"connection error")+"). Check code or tell your teacher."; });
}


$("#resetParticipant").addEventListener("click", async () => {
  const ok = window.confirm(previewMode
    ? "Reset this preview and return to Stage 1?"
    : "Delete your saved responses for this session and return to Stage 1?");
  if (!ok) return;

  activeTab = 0;
  myResponses = {};
  window.scrollTo({ top: 0, behavior: "instant" });

  if (previewMode) {
    sessionStorage.removeItem("sparkPreviewTab");
    renderTabs();
    render();
    return;
  }

  try {
    // Wait for outstanding autosaves before removing responses, so a late write
    // cannot recreate a record after the student has reset it.
    for(const t of stageDraftTimers.values())clearTimeout(t);
    stageDraftTimers.clear();
    await Promise.all([...stageWriteQueues.values()].map(p=>p.catch(()=>{})));
    await remove(ref(db, responseBase));
    stageDraftFingerprints.clear();
    stageDraftErrors.clear();
    for(const t of SCENARIO.tabs)discardDraft(t.id);
    renderTabs();
    render();
    const n = document.querySelector("#status");
    if (n) n.textContent = "Reset complete";
    setTimeout(() => { if (n) n.textContent = "Connected"; }, 1200);
  } catch (e) {
    alert("Could not reset saved responses. Check the connection and try again.");
  }
});

function renderTabs(){
  $("#tabs").innerHTML = SCENARIO.tabs.map((t,i)=>`<button class="tab ${i===activeTab?'active':''} ${i>state.currentTab?'locked':''}" data-i="${i}" ${i>state.currentTab?'disabled':''}>${t.label}</button>`).join("");
  document.querySelectorAll('.tab:not(.locked)').forEach(b=>b.addEventListener('click',()=>{flushStageDraft(SCENARIO.tabs[activeTab].id);storeDraft();activeTab=Number(b.dataset.i);renderTabs();render();}));
}

function startTimer(){
  clearInterval(timerInterval);
  if (previewMode) { $("#timer").textContent="PREVIEW"; return; }
  const draw=()=>{
    let ms = state.timerPausedRemaining ?? (state.timerEnd ? state.timerEnd-(Date.now()+serverOffset) : null);
    if(ms==null){ $("#timer").textContent="--:--"; return; }
    ms=Math.max(0,ms); const s=Math.ceil(ms/1000); $("#timer").textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  }; draw(); timerInterval=setInterval(draw,500);
}

async function save(stage, payload){
  const btn=document.querySelector('[data-save]'); if(btn) btn.disabled=true;
  if (previewMode) {
    myResponses[stage] = payload;
    const n=document.querySelector('#saveMsg');
    if(n){n.textContent='Preview only — not recorded.'; n.className='saved';}
    if(btn) btn.disabled=false;
    return;
  }
  clearTimeout(stageDraftTimers.get(stage));stageDraftTimers.delete(stage);
  // An explicit submission follows any pending autosave write.
  try {
   updateSaveMessage("Submitting...",stage);
   await queueStageWrite(stage,async()=>{
     if(state.archived||state.locked)throw Error("Classroom responses are closed.");
     await update(ref(db,responseBase+"/"+stage),{...payload,status:"submitted",updatedAt:serverTimestamp()});
   });
   myResponses[stage]={...payload,status:"submitted",updatedAt:Date.now()};
   stageDraftFingerprints.set(stage,JSON.stringify(payload));
   stageDraftErrors.delete(stage);
   discardDraft(stage);
   updateSaveMessage("Submitted · saved online",stage);
   if(stage==="final"){
     render();
     requestAnimationFrame(()=>document.querySelector("#exitSection")?.scrollIntoView({behavior:"smooth",block:"start"}));
   }
  }catch(e){
   updateSaveMessage("Submission failed · your draft is retained; try Save again",stage);
   console.error("SPARK submission failed",{stage,code:e?.code,message:e?.message});
  }finally{if(btn)btn.disabled=false;}
}

function recOptions(name){ return RECOMMENDATIONS.map(x=>`<label class="choice"><input type="radio" name="${name}" value="${esc(x)}"> <span>${esc(x)}</span></label>`).join(''); }
function cardHeader(t){
 let html=`<section class="card stage-intro"><h1>${esc(t.title)}</h1><p class="step-intro">${esc(t.intro||'')}</p></section>`;
 const facts=t.body||[];
 if(facts.length){
  const groups=[];
  for(let i=0;i<facts.length;i+=3)groups.push(facts.slice(i,i+3));
  const titles=t.id==='first-impression'?['The proposed project','Jobs and land','Taxes and open questions']:null;
  html+=`<div class="fact-grid">`+groups.map((items,i)=>`<section class="card fact-card fact-tone-${i%3}" aria-label="${esc(titles?.[i]||'Key information '+(i+1))}"><h2>${esc(titles?.[i]||'Key information '+(i+1))}</h2><ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`).join('')+'</div>';
 }
 return html;
}

function render(){
 const t=SCENARIO.tabs[activeTab]; if(!t) return; let html=(previewMode ? '<div class="notice"><strong>Preview mode:</strong> all stages are unlocked. Responses entered here stay only in this browser and are not recorded.</div>' : '') + cardHeader(t);
 if(t.responseType==='initial') html += `<form class="card" id="form"><h2>What would you recommend right now?</h2>${recOptions('rec')}<label>Confidence: <span id="confVal">50</span>%</label><input id="conf" type="range" min="0" max="100" value="50"><label>What are two or three reasons for your choice?</label><textarea id="factors"></textarea><div class="actions"><button class="primary" data-save>Save response</button><span id="saveMsg"></span></div></form>`;
 if(t.responseType==='questions') html += `<form class="card" id="form"><h2>What do you still need to know?</h2>${[1,2,3].map(i=>`<label>Question ${i}</label><textarea id="q${i}"></textarea>`).join('')}<label>Where could you find trustworthy answers?</label><textarea id="sources"></textarea><div class="actions"><button class="primary" data-save>Save response</button><span id="saveMsg"></span></div></form><div class="card"><h2>What the room wanted to know</h2><div id="publishedSummary" class="muted">The moderator has not published a summary yet.</div></div>`;
 if(t.responseType==='investigation') html += `<form class="card" id="form"><h2>Pick two topics to explore first</h2>${t.options.map(x=>`<label class="choice"><input type="checkbox" name="area" value="${esc(x)}"> <span>${esc(x)}</span></label>`).join('')}<label>Why did you choose these topics?</label><textarea id="why"></textarea><label>What are you hoping to learn?</label><textarea id="hope"></textarea><div class="actions"><button class="primary" data-save>Save selection</button><span id="saveMsg"></span></div></form>`;
 if(t.responseType==='evidence-review') {
   const selected=myResponses.investigate?.areas || [];
   const primary=t.packets.filter(p=>selected.includes(p.key));
   const remaining=t.packets.filter(p=>!selected.includes(p.key));
   const packetCard=(p,i,chosen)=>{
     const bullets=esc(p.text).split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean).map(line=>'<li>'+line+'</li>').join('');
     return '<details class="evidence-card evidence-tone-'+(i%4)+(chosen?' chosen':'')+'" '+(chosen?'open':'')+'><summary>'+esc(p.key)+(chosen?'<span class="selected-tag">Your choice</span>':'')+'</summary><ul>'+bullets+'</ul></details>';
   };
   const introduction=selected.length===2?'Start with the two topics you chose. You may inspect other evidence if needed.':'Explore the evidence. To prioritize two topics, return to Step 3 and save your choices.';
   html+='<section class="card"><h2>Explore the evidence</h2><p class="muted">'+introduction+'</p>';
   if(primary.length)html+='<h3>Your two chosen topics</h3><div class="evidence-grid">'+primary.map((p,i)=>packetCard(p,i,true)).join('')+'</div>';
   html+='<h3>'+(primary.length?'Other available evidence':'Available evidence')+'</h3><div class="evidence-grid">'+remaining.map((p,i)=>packetCard(p,i+2,false)).join('')+'</div></section>';
   html+='<form class="card" id="form"><label>What did the evidence tell you? What questions remain?</label><textarea id="review"></textarea><div class="actions"><button class="primary" data-save>Save notes</button><span id="saveMsg"></span></div></form>';
 }
 if(t.responseType==='recommendation') html += `<form class="card" id="form"><h2>What do you recommend now?</h2>${recOptions('rec')}<label>Which evidence matters most to your choice?</label><textarea id="evidence"></textarea><label>Why does that evidence matter? What are you still unsure about?</label><textarea id="reasoning"></textarea><label>Confidence: <span id="confVal">50</span>%</label><input id="conf" type="range" min="0" max="100" value="50"><div class="actions"><button class="primary" data-save>Save preliminary recommendation</button><span id="saveMsg"></span></div></form><div class="card"><h2>Room snapshot</h2><div id="publishedSummary" class="muted">The moderator has not published a snapshot yet.</div></div>`;
 if(t.responseType==='update') html += `<form class="card" id="form"><h2>Does the new information matter to your decision?</h2>${recOptions('rec')}<label>Confidence: <span id="confVal">50</span>%</label><input id="conf" type="range" min="0" max="100" value="50"><label>Why are you keeping or changing your recommendation?</label><textarea id="why"></textarea><div class="actions"><button class="primary" data-save>Save update</button><span id="saveMsg"></span></div></form>`;
 if(t.id==="final"&&isStageSubmitted(myResponses.final)&&exitStatus!=="submitted"&&sessionStorage.getItem(exitKey)!=="yes")html+='<div class="notice"><strong>Final decision saved.</strong> <a href="#exitSection">Continue to optional student feedback ↓</a></div>';
 if(t.responseType==='final') html += `<form class="card" id="form"><h2>Your decision after considering the evidence</h2>${recOptions('rec')}<label>Why is this your choice now?</label><textarea id="finalReason"></textarea><label>What could happen or what could you learn that would make you reconsider?</label><textarea id="reopen"></textarea><label>What new information would NOT be enough to change your mind by itself?</label><textarea id="insufficient"></textarea><div class="actions"><button class="primary" data-save>Save final response</button><span id="saveMsg"></span></div></form>`;
 if(t.id==="final")html+=exitTicketHtml();
 $("#app").innerHTML=html;
 hydrate(t);
 applyDraft(t);
 if(!previewMode){
  const f=document.querySelector("#form");
  if(f){
   const stage=t.id;
   const changed=()=>{storeDraft();scheduleDraftSave(stage);};
   f.addEventListener("input",changed);
   f.addEventListener("change",changed);
  }
 }
 const sb=document.querySelector("[data-save]");if(sb)sb.disabled=!!state.locked;
 const conf=$("#conf"); if(conf) conf.addEventListener('input',()=>$("#confVal").textContent=conf.value);
 const form=$("#form"); if(form) form.addEventListener('submit',async e=>{e.preventDefault(); if(state.locked){$("#saveMsg").textContent='Responses are currently locked.';return;} const payload=collect(t.responseType); if(payload.error){$("#saveMsg").textContent=payload.error;return;} await save(t.id,payload);});
 wireExitTicket();
 if(previewMode && t.responseType==='evidence-review'){
   document.querySelectorAll('.packet-reveal').forEach(btn=>btn.addEventListener('click',()=>{
     const panel=document.querySelector('#packet-'+btn.dataset.packet);
     const opening=panel.hasAttribute('hidden');
     if(opening) panel.removeAttribute('hidden'); else panel.setAttribute('hidden','');
     btn.setAttribute('aria-expanded', String(opening));
     const hint=btn.querySelector('.packet-hint'); if(hint) hint.textContent=opening?'Hide information':'Click to reveal';
   }));
 }
 if(publishedUnsub){publishedUnsub();publishedUnsub=null;}
 if(document.querySelector('#publishedSummary')) {
   const el=document.querySelector('#publishedSummary');
   if (previewMode) el.textContent='Live room summaries are not shown in preview mode.';
   else publishedUnsub=onValue(ref(db,`sessions/${sessionId}/published/${t.id}`),snap=>{if(el.isConnected)el.innerHTML=snap.exists()?renderPublished(snap.val()):'The teacher has not shared a summary yet.';});
 }
}


function exitTicketHtml(){
 if(previewMode)return '<section class="card"><h2>Help us improve SPARK</h2><p class="muted">In a live class, this separate optional feedback form appears after you save your final decision. Preview responses are not recorded.</p></section>';
 if(exitStatus==="submitted"||sessionStorage.getItem(exitKey)==="yes")return '<section class="card"><h2>Thank you for your feedback!</h2><p>You have completed the optional exit ticket.</p></section>';
 if(exitStatus==="skipped")return '<section class="card"><h2>Scenario complete</h2><p>You skipped the optional feedback questions. Your scenario answers are unchanged.</p></section>';
 const prompts=[
 "Which part made you think hardest about your decision? What made it hard?",
 "What was confusing, difficult to read, or hard to use?",
 "If you could change one thing about this activity, what would it be?",
 "What important information or viewpoint was missing?",
 "Would you want to do another scenario like this? Why or why not?"
 ];
 const unlocked=isStageSubmitted(myResponses.final);
 return '<section class="card exit-ticket" id="exitSection"><h2>Help us improve SPARK</h2><p class="muted">Optional feedback. We do not ask for your name, and this form is saved separately from your scenario answers. Please do not include names or identifying details. You can skip it.</p>'+
 (unlocked?'<form id="exitTicketForm">'+prompts.map((q,i)=>'<label for="exitQ'+(i+1)+'">'+(i+1)+'. '+esc(q)+'</label><textarea id="exitQ'+(i+1)+'" maxlength="1200" rows="3"></textarea>').join('')+
 '<div class="actions"><button class="primary" type="submit" id="exitSubmit">Send feedback</button><button class="secondary" type="button" id="exitSkip">Skip feedback</button><span id="exitMessage" role="status"></span></div></form>':
 '<p class="muted">First save your final decision above. Then these optional feedback questions will appear.</p>')+'</section>';
}
function wireExitTicket(){
 const form=document.querySelector("#exitTicketForm");
 if(!form)return;
 document.querySelector("#exitSkip").addEventListener("click",()=>{exitStatus="skipped";render();});
 form.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!isStageSubmitted(myResponses.final)){document.querySelector("#exitMessage").textContent="Save your final decision first.";return;}
  const btn=document.querySelector("#exitSubmit");btn.disabled=true;
  const answers=Object.fromEntries([1,2,3,4,5].map(i=>["q"+i,document.querySelector("#exitQ"+i).value.trim()]));
  try{
   // No UID, nickname, group, saved stage or client timestamp is included.
   // A Firebase connection still sends auth information to the service; this is pseudonymous collection.
   await set(push(ref(db,"exitTickets/"+sessionId)),answers);
   exitStatus="submitted";sessionStorage.setItem(exitKey,"yes");
   render();
  }catch(error){
   document.querySelector("#exitMessage").textContent="Feedback not saved. Try again, or skip it.";
   btn.disabled=false;
  }
 });
}
function hydrate(t){
 const r=myResponses[t.id]; if(!r) return;
 if(r.recommendation){ const radio=[...document.querySelectorAll('input[name="rec"]')].find(x=>x.value===r.recommendation); if(radio) radio.checked=true; }
 if(r.confidence!=null && $('#conf')){ $('#conf').value=r.confidence; $('#confVal').textContent=r.confidence; }
 const fields=['factors','sources','why','hope','review','evidence','reasoning','reopen','insufficient','finalReason']; fields.forEach(k=>{ if(r[k]!=null && $(`#${k}`)) $(`#${k}`).value=r[k]; });
 if(Array.isArray(r.questions)) r.questions.slice(0,3).forEach((q,i)=>{if($(`#q${i+1}`)) $(`#q${i+1}`).value=q;});
 if(Array.isArray(r.areas)) document.querySelectorAll('input[name="area"]').forEach(x=>x.checked=r.areas.includes(x.value));
 if($('#saveMsg')){
   $('#saveMsg').textContent=r.status==="draft"?"Draft saved automatically · click Save to submit":"Previously submitted";
   $('#saveMsg').className='saved';
 }
}

function collect(type){
 const checked=n=>document.querySelector(`input[name="${n}"]:checked`)?.value || '';
 if(type==='initial'){if(!checked('rec')) return {error:'Choose a recommendation first.'};return { recommendation:checked('rec'), confidence:Number($('#conf').value), factors:$('#factors').value.trim() };}
 if(type==='questions') return { questions:[1,2,3].map(i=>$(`#q${i}`).value.trim()).filter(Boolean), sources:$('#sources').value.trim() };
 if(type==='investigation'){ const areas=[...document.querySelectorAll('input[name="area"]:checked')].map(x=>x.value); if(areas.length!==2) return {error:'Please select exactly two areas.'}; return {areas,why:$('#why').value.trim(),hope:$('#hope').value.trim()}; }
 if(type==='evidence-review') return { review:$('#review').value.trim() };
 if(type==='recommendation'){if(!checked('rec')) return {error:'Choose a recommendation first.'};return { recommendation:checked('rec'), evidence:$('#evidence').value.trim(), reasoning:$('#reasoning').value.trim(), confidence:Number($('#conf').value) };}
 if(type==='update'){if(!checked('rec')) return {error:'Choose a recommendation first.'};return { recommendation:checked('rec'), confidence:Number($('#conf').value), why:$('#why').value.trim() };}
 if(type==='final'){if(!checked('rec'))return {error:'Choose a recommendation first.'};return { recommendation:checked('rec'), finalReason:$('#finalReason').value.trim(), reopen:$('#reopen').value.trim(), insufficient:$('#insufficient').value.trim() };}
 return {};
}
function renderPublished(v){ if(typeof v==='string') return `<p>${esc(v)}</p>`; if(v && v.text) return `<p>${esc(v.text)}</p>`; if(v && v.items) return `<div class="summary">${Object.entries(v.items).map(([k,n])=>`<div>${esc(k)}</div><div><strong>${Number(n)||0}</strong></div>`).join('')}</div>`; return `<pre>${esc(JSON.stringify(v,null,2))}</pre>`; }
