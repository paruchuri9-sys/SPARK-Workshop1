import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, onValue, set, update, remove, onDisconnect, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
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
const draftKey = id => "spark_draft_"+sessionId+"_"+uid+"_"+id;
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
  onValue(ref(db,responseBase), snap => { myResponses = snap.val() || {}; if(!document.querySelector("#form"))render(); }, e => { $("#status").textContent="Cannot load saved answers ("+(e?.code||"connection error")+"). Tell your teacher."; });
  onValue(ref(db,".info/serverTimeOffset"), snap => {serverOffset=snap.val()||0;});
  onValue(stateRef, snap => {
    if(!snap.exists()) { $("#status").textContent="Session not found";return; }
    const nextState = { ...state, ...(snap.val() || {}) };
    const previous=activeTab;
    if (nextState.currentTab > state.currentTab) activeTab = nextState.currentTab;
    if (activeTab > nextState.currentTab) activeTab = nextState.currentTab;
    if(previous!==activeTab)storeDraftForStage(previous);
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
    await remove(ref(db, responseBase));
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
  document.querySelectorAll('.tab:not(.locked)').forEach(b=>b.addEventListener('click',()=>{storeDraft();activeTab=Number(b.dataset.i); renderTabs(); render();}));
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
  try { await update(ref(db, `${responseBase}/${stage}`), {...payload, updatedAt:serverTimestamp()}); discardDraft(stage); const n=document.querySelector('#saveMsg'); if(n){n.textContent='Saved'; n.className='saved';} }
  catch(e){ const n=document.querySelector('#saveMsg'); if(n){n.textContent='Not saved yet. Check connection and try again.';} }
  finally { if(btn) btn.disabled=false; }
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
   const packets = previewMode
     ? t.packets.map((p,i)=>`<button type="button" class="packet-reveal" data-packet="${i}" aria-expanded="false"><span class="packet-label">${esc(p.key)}</span><span class="packet-hint">Click to reveal</span></button><section class="packet packet-hidden" id="packet-${i}" hidden><p>${esc(p.text)}</p></section>`).join('')
     : t.packets.map(p=>`<details class="packet"><summary><strong>${esc(p.key)}</strong></summary><p>${esc(p.text)}</p></details>`).join('');
   html += `<div class="card"><h2>Evidence to explore</h2><p class="muted">Open one topic at a time. These are short scenario summaries, not full source documents.</p>${previewMode?'<p class="muted">Open a packet when you are ready to inspect that evidence.</p>':''}${packets}</div><form class="card" id="form"><label>What did the evidence tell you? What questions remain?</label><textarea id="review"></textarea><div class="actions"><button class="primary" data-save>Save notes</button><span id="saveMsg"></span></div></form>`;
 }
 if(t.responseType==='recommendation') html += `<form class="card" id="form"><h2>What do you recommend now?</h2>${recOptions('rec')}<label>Which evidence matters most to your choice?</label><textarea id="evidence"></textarea><label>Why does that evidence matter? What are you still unsure about?</label><textarea id="reasoning"></textarea><label>Confidence: <span id="confVal">50</span>%</label><input id="conf" type="range" min="0" max="100" value="50"><div class="actions"><button class="primary" data-save>Save preliminary recommendation</button><span id="saveMsg"></span></div></form><div class="card"><h2>Room snapshot</h2><div id="publishedSummary" class="muted">The moderator has not published a snapshot yet.</div></div>`;
 if(t.responseType==='update') html += `<form class="card" id="form"><h2>Does the new information matter to your decision?</h2>${recOptions('rec')}<label>Confidence: <span id="confVal">50</span>%</label><input id="conf" type="range" min="0" max="100" value="50"><label>Why are you keeping or changing your recommendation?</label><textarea id="why"></textarea><div class="actions"><button class="primary" data-save>Save update</button><span id="saveMsg"></span></div></form>`;
 if(t.responseType==='final') html += `<form class="card" id="form"><h2>Your decision after considering the evidence</h2>${recOptions('rec')}<label>Why is this your choice now?</label><textarea id="finalReason"></textarea><label>What could happen or what could you learn that would make you reconsider?</label><textarea id="reopen"></textarea><label>What new information would NOT be enough to change your mind by itself?</label><textarea id="insufficient"></textarea><div class="actions"><button class="primary" data-save>Save final response</button><span id="saveMsg"></span></div></form>`;
 $("#app").innerHTML=html;
 hydrate(t);
 applyDraft(t);
 if(!previewMode){const f=document.querySelector("#form");if(f)f.addEventListener("input",storeDraft);}
 const sb=document.querySelector("[data-save]");if(sb)sb.disabled=!!state.locked;
 const conf=$("#conf"); if(conf) conf.addEventListener('input',()=>$("#confVal").textContent=conf.value);
 const form=$("#form"); if(form) form.addEventListener('submit',async e=>{e.preventDefault(); if(state.locked){$("#saveMsg").textContent='Responses are currently locked.';return;} const payload=collect(t.responseType); if(payload.error){$("#saveMsg").textContent=payload.error;return;} await save(t.id,payload);});
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

function hydrate(t){
 const r=myResponses[t.id]; if(!r) return;
 if(r.recommendation){ const radio=[...document.querySelectorAll('input[name="rec"]')].find(x=>x.value===r.recommendation); if(radio) radio.checked=true; }
 if(r.confidence!=null && $('#conf')){ $('#conf').value=r.confidence; $('#confVal').textContent=r.confidence; }
 const fields=['factors','sources','why','hope','review','evidence','reasoning','reopen','insufficient','finalReason']; fields.forEach(k=>{ if(r[k]!=null && $(`#${k}`)) $(`#${k}`).value=r[k]; });
 if(Array.isArray(r.questions)) r.questions.slice(0,3).forEach((q,i)=>{if($(`#q${i+1}`)) $(`#q${i+1}`).value=q;});
 if(Array.isArray(r.areas)) document.querySelectorAll('input[name="area"]').forEach(x=>x.checked=r.areas.includes(x.value));
 if($('#saveMsg')){ $('#saveMsg').textContent='Previously saved'; $('#saveMsg').className='saved'; }
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
