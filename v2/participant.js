import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, onValue, set, update, remove, onDisconnect, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { SCENARIO, RECOMMENDATIONS } from "./scenario.js";

const params = new URLSearchParams(location.search);
const previewMode = ["1","true","yes"].includes((params.get("preview") || "").toLowerCase());
const sessionId = (params.get("session") || "demo").replace(/[^a-zA-Z0-9_-]/g, "");

let db = null, uid = "preview";
let state = { currentTab: previewMode ? SCENARIO.tabs.length - 1 : 0, timerEnd:null, timerPausedRemaining:null, locked:false };
let activeTab = 0; let timerInterval; let myResponses = {};
if (previewMode) { activeTab = 0; myResponses = {}; sessionStorage.removeItem("sparkPreviewTab"); }
let stateRef = null, responseBase = null;

if (!previewMode) {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  db = getDatabase(app);
  await setPersistence(auth, browserSessionPersistence);
  const cred = await signInAnonymously(auth);
  uid = cred.user.uid;
  stateRef = ref(db, `sessions/${sessionId}/state`);
  responseBase = `responses/${sessionId}/${uid}`;
  const presenceRef = ref(db, `sessions/${sessionId}/presence/${uid}`);
  await set(presenceRef, { online:true, joinedAt:serverTimestamp() });
  onDisconnect(presenceRef).remove();
}
const $ = s => document.querySelector(s);
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));

if (previewMode) {
  $("#status").textContent = "PREVIEW MODE";
  renderTabs(); render(); startTimer();
} else {
  onValue(ref(db,responseBase), snap => { myResponses = snap.val() || {}; render(); });
  onValue(stateRef, snap => {
    const nextState = { ...state, ...(snap.val() || {}) };
    if (nextState.currentTab > state.currentTab) activeTab = nextState.currentTab;
    if (activeTab > nextState.currentTab) activeTab = nextState.currentTab;
    state = nextState;
    renderTabs(); render(); startTimer();
    $("#status").textContent = "Connected";
  }, () => { $("#status").textContent = "Connection interrupted"; });
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
  document.querySelectorAll('.tab:not(.locked)').forEach(b=>b.addEventListener('click',()=>{activeTab=Number(b.dataset.i); renderTabs(); render();}));
}

function startTimer(){
  clearInterval(timerInterval);
  if (previewMode) { $("#timer").textContent="PREVIEW"; return; }
  const draw=()=>{
    let ms = state.timerPausedRemaining ?? (state.timerEnd ? state.timerEnd-Date.now() : null);
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
  try { await update(ref(db, `${responseBase}/${stage}`), {...payload, updatedAt:serverTimestamp()}); const n=document.querySelector('#saveMsg'); if(n){n.textContent='Saved'; n.className='saved';} }
  catch(e){ const n=document.querySelector('#saveMsg'); if(n){n.textContent='Not saved yet. Check connection and try again.';} }
  finally { if(btn) btn.disabled=false; }
}

function recOptions(name){ return RECOMMENDATIONS.map(x=>`<label class="choice"><input type="radio" name="${name}" value="${esc(x)}"> <span>${esc(x)}</span></label>`).join(''); }
function cardHeader(t){ return `<div class="card"><h1>${esc(t.title)}</h1><p class="muted">${esc(t.intro||'')}</p>${(t.body||[]).length?`<ul>${t.body.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</div>`; }

function render(){
 const t=SCENARIO.tabs[activeTab]; if(!t) return; let html=(previewMode ? '<div class="notice"><strong>Preview mode:</strong> all stages are unlocked. Responses entered here stay only in this browser and are not recorded.</div>' : '') + cardHeader(t);
 if(t.responseType==='initial') html += `<form class="card" id="form"><h2>Your first impression</h2>${recOptions('rec')}<label>Confidence: <span id="confVal">50</span>%</label><input id="conf" type="range" min="0" max="100" value="50"><label>Two or three factors most important to your recommendation</label><textarea id="factors"></textarea><div class="actions"><button class="primary" data-save>Save response</button><span id="saveMsg"></span></div></form>`;
 if(t.responseType==='questions') html += `<form class="card" id="form"><h2>Your three most important unanswered questions</h2>${[1,2,3].map(i=>`<label>Question ${i}</label><textarea id="q${i}"></textarea>`).join('')}<label>Where might useful evidence come from?</label><textarea id="sources"></textarea><div class="actions"><button class="primary" data-save>Save response</button><span id="saveMsg"></span></div></form><div class="card"><h2>What the room wanted to know</h2><div id="publishedSummary" class="muted">The moderator has not published a summary yet.</div></div>`;
 if(t.responseType==='investigation') html += `<form class="card" id="form"><h2>Select two areas</h2>${t.options.map(x=>`<label class="choice"><input type="checkbox" name="area" value="${esc(x)}"> <span>${esc(x)}</span></label>`).join('')}<label>Why did you select them?</label><textarea id="why"></textarea><label>What questions do you hope they will answer?</label><textarea id="hope"></textarea><div class="actions"><button class="primary" data-save>Save selection</button><span id="saveMsg"></span></div></form>`;
 if(t.responseType==='evidence-review') {
   const packets = previewMode
     ? t.packets.map((p,i)=>`<button type="button" class="packet-reveal" data-packet="${i}" aria-expanded="false"><span class="packet-label">${esc(p.key)}</span><span class="packet-hint">Click to reveal</span></button><section class="packet packet-hidden" id="packet-${i}" hidden><p>${esc(p.text)}</p></section>`).join('')
     : t.packets.map(p=>`<section class="packet"><h3>${esc(p.key)}</h3><p>${esc(p.text)}</p></section>`).join('');
   html += `<div class="card"><h2>Information packets</h2>${previewMode?'<p class="muted">Open a packet when you are ready to inspect that evidence.</p>':''}${packets}</div><form class="card" id="form"><label>What did you learn? What remains unresolved or became newly uncertain?</label><textarea id="review"></textarea><div class="actions"><button class="primary" data-save>Save notes</button><span id="saveMsg"></span></div></form>`;
 }
 if(t.responseType==='recommendation') html += `<form class="card" id="form"><h2>Recommendation</h2>${recOptions('rec')}<label>What evidence matters most?</label><textarea id="evidence"></textarea><label>Why does that evidence matter, and what important uncertainty remains?</label><textarea id="reasoning"></textarea><label>Confidence: <span id="confVal">50</span>%</label><input id="conf" type="range" min="0" max="100" value="50"><div class="actions"><button class="primary" data-save>Save preliminary recommendation</button><span id="saveMsg"></span></div></form><div class="card"><h2>Room snapshot</h2><div id="publishedSummary" class="muted">The moderator has not published a snapshot yet.</div></div>`;
 if(t.responseType==='update') html += `<form class="card" id="form"><h2>What does this mean for your recommendation?</h2>${recOptions('rec')}<label>Confidence: <span id="confVal">50</span>%</label><input id="conf" type="range" min="0" max="100" value="50"><label>Why are you maintaining or changing your recommendation?</label><textarea id="why"></textarea><div class="actions"><button class="primary" data-save>Save update</button><span id="saveMsg"></span></div></form>`;
 if(t.responseType==='final') html += `<form class="card" id="form"><h2>Current recommendation</h2>${recOptions('rec')}<label>What specific future evidence, event, or change in conditions would make you reconsider?</label><textarea id="reopen"></textarea><label>What type of new information would not, by itself, be enough to make you reconsider?</label><textarea id="insufficient"></textarea><div class="actions"><button class="primary" data-save>Save final response</button><span id="saveMsg"></span></div></form>`;
 $("#app").innerHTML=html;
 hydrate(t);
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
 if(document.querySelector('#publishedSummary')) {
   const el=document.querySelector('#publishedSummary');
   if (previewMode) el.textContent='Live room summaries are not shown in preview mode.';
   else onValue(ref(db,`sessions/${sessionId}/published/${t.id}`),snap=>{if(el) el.innerHTML=snap.exists()?renderPublished(snap.val()):'The moderator has not published a summary yet.';});
 }
}

function hydrate(t){
 const r=myResponses[t.id]; if(!r) return;
 if(r.recommendation){ const radio=[...document.querySelectorAll('input[name="rec"]')].find(x=>x.value===r.recommendation); if(radio) radio.checked=true; }
 if(r.confidence!=null && $('#conf')){ $('#conf').value=r.confidence; $('#confVal').textContent=r.confidence; }
 const fields=['factors','sources','why','hope','review','evidence','reasoning','reopen','insufficient']; fields.forEach(k=>{ if(r[k]!=null && $(`#${k}`)) $(`#${k}`).value=r[k]; });
 if(Array.isArray(r.questions)) r.questions.slice(0,3).forEach((q,i)=>{if($(`#q${i+1}`)) $(`#q${i+1}`).value=q;});
 if(Array.isArray(r.areas)) document.querySelectorAll('input[name="area"]').forEach(x=>x.checked=r.areas.includes(x.value));
 if($('#saveMsg')){ $('#saveMsg').textContent='Previously saved'; $('#saveMsg').className='saved'; }
}

function collect(type){
 const checked=n=>document.querySelector(`input[name="${n}"]:checked`)?.value || '';
 if(type==='initial') return { recommendation:checked('rec'), confidence:Number($('#conf').value), factors:$('#factors').value.trim() };
 if(type==='questions') return { questions:[1,2,3].map(i=>$(`#q${i}`).value.trim()).filter(Boolean), sources:$('#sources').value.trim() };
 if(type==='investigation'){ const areas=[...document.querySelectorAll('input[name="area"]:checked')].map(x=>x.value); if(areas.length!==2) return {error:'Please select exactly two areas.'}; return {areas,why:$('#why').value.trim(),hope:$('#hope').value.trim()}; }
 if(type==='evidence-review') return { review:$('#review').value.trim() };
 if(type==='recommendation') return { recommendation:checked('rec'), evidence:$('#evidence').value.trim(), reasoning:$('#reasoning').value.trim(), confidence:Number($('#conf').value) };
 if(type==='update') return { recommendation:checked('rec'), confidence:Number($('#conf').value), why:$('#why').value.trim() };
 if(type==='final') return { recommendation:checked('rec'), reopen:$('#reopen').value.trim(), insufficient:$('#insufficient').value.trim() };
 return {};
}
function renderPublished(v){ if(typeof v==='string') return `<p>${esc(v)}</p>`; if(v && v.text) return `<p>${esc(v.text)}</p>`; if(v && v.items) return `<div class="summary">${Object.entries(v.items).map(([k,n])=>`<div>${esc(k)}</div><div><strong>${Number(n)||0}</strong></div>`).join('')}</div>`; return `<pre>${esc(JSON.stringify(v,null,2))}</pre>`; }
