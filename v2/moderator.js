import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, onValue, get, update, set } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { SCENARIO } from "./scenario.js";

const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getDatabase(app); const $=s=>document.querySelector(s);
let sessionId='demo', state={currentTab:0,timerEnd:null,timerPausedRemaining:null,locked:false}, focusTab=0, timerInterval, latestSummary=null;
const notes=[
  "Capture the unaided individual first impression before group discussion. Do not reward any recommendation direction.",
  "Let participants distinguish what is known from what needs to be known. Ask why a missing fact could matter.",
  "The restriction to two areas is deliberate: it forces prioritization. Ask why those two were chosen.",
  "Do not resolve every uncertainty. Ask which packet answered a question, which complicated it, and which was less useful than expected.",
  "Ask groups to connect specific evidence to the recommendation and name important uncertainty that remains.",
  "Do not imply that the new information should cause revision. Ask what changed, what did not, and why.",
  "Focus on reopening conditions: what future evidence would warrant reconsideration, and what would be insufficient by itself?"
];

$('#pinSignIn').addEventListener('click', unlock);
$('#moderatorPin').addEventListener('keydown',e=>{if(e.key==='Enter')unlock();});
async function unlock(){
  const expected=['1','2','3','4'].join('');
  if($('#moderatorPin').value.trim()!==expected){$('#pinError').textContent='Incorrect PIN.';return;}
  try{
    if(!auth.currentUser) await signInAnonymously(auth);
    $('#pinError').textContent=''; $('#authStatus').textContent='Moderator unlocked'; $('#controls').hidden=false; $('#moderatorPin').value=''; bindSession();
  }catch(e){console.error(e);$('#pinError').textContent='Could not connect. Confirm Anonymous Authentication is enabled.';}
}
$('#sessionId').addEventListener('change',()=>{if(!$('#controls').hidden)bindSession();});
function bindSession(){ sessionId=$('#sessionId').value.replace(/[^a-zA-Z0-9_-]/g,'')||'demo'; const sref=ref(db,`sessions/${sessionId}/state`); onValue(sref,snap=>{const next={currentTab:0,...(snap.val()||{})}; if(next.currentTab>state.currentTab)focusTab=next.currentTab; state=next;if(focusTab>state.currentTab)focusTab=state.currentTab;render();}); onValue(ref(db,`sessions/${sessionId}/presence`),snap=>{$('#presence').textContent=snap.size||Object.keys(snap.val()||{}).length;}); onValue(ref(db,`responses/${sessionId}`),snap=>{$('#responseCount').textContent=snap.size||Object.keys(snap.val()||{}).length;}); }
function render(){const t=SCENARIO.tabs[focusTab]||SCENARIO.tabs[0];$('#currentTabLabel').textContent=`${t.label} (unlocked through ${SCENARIO.tabs[state.currentTab]?.label||'Stage 1'})`;$('#facilitation').innerHTML=`<h3>${t.title}</h3><p>${notes[focusTab]}</p>`;$('#lockResponses').checked=!!state.locked;startTimer();$('#next').disabled=state.currentTab>=SCENARIO.tabs.length-1;$('#prev').disabled=focusTab<=0;}
async function patch(p){await update(ref(db,`sessions/${sessionId}/state`),p);}
$('#next').addEventListener('click',async()=>{const n=Math.min(SCENARIO.tabs.length-1,state.currentTab+1);focusTab=n;await patch({currentTab:n,locked:false,timerEnd:null,timerPausedRemaining:null});});
$('#prev').addEventListener('click',()=>{focusTab=Math.max(0,focusTab-1);render();});
$('#lockResponses').addEventListener('change',e=>patch({locked:e.target.checked}));
$('#startTimer').addEventListener('click',()=>{const min=SCENARIO.tabs[focusTab].minutes||5;patch({timerEnd:Date.now()+min*60000,timerPausedRemaining:null});});
$('#pauseTimer').addEventListener('click',()=>{const remain=state.timerEnd?Math.max(0,state.timerEnd-Date.now()):(state.timerPausedRemaining||0);patch({timerEnd:null,timerPausedRemaining:remain});});
$('#addMinute').addEventListener('click',()=>{if(state.timerEnd)patch({timerEnd:state.timerEnd+60000});else patch({timerPausedRemaining:(state.timerPausedRemaining||0)+60000});});
$('#resetTimer').addEventListener('click',()=>patch({timerEnd:null,timerPausedRemaining:null}));
function startTimer(){clearInterval(timerInterval);const draw=()=>{let ms=state.timerPausedRemaining??(state.timerEnd?state.timerEnd-Date.now():null);if(ms==null){$('#timer').textContent='--:--';return;}ms=Math.max(0,ms);let s=Math.ceil(ms/1000);$('#timer').textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};draw();timerInterval=setInterval(draw,500);}
$('#refreshSummary').addEventListener('click',computeSummary);
$('#publishSummary').addEventListener('click',async()=>{if(!latestSummary)await computeSummary();const t=SCENARIO.tabs[focusTab];await set(ref(db,`sessions/${sessionId}/published/${t.id}`),latestSummary);});
async function computeSummary(){const snap=await get(ref(db,`responses/${sessionId}`)),rows=Object.values(snap.val()||{}),t=SCENARIO.tabs[focusTab],items={};if(t.id==='first-impression'||t.id==='preliminary'||t.id==='new-information'||t.id==='final'){rows.forEach(r=>{const v=r[t.id]?.recommendation;if(v)items[v]=(items[v]||0)+1;});}else if(t.id==='investigate'){rows.forEach(r=>(r[t.id]?.areas||[]).forEach(v=>items[v]=(items[v]||0)+1));}else if(t.id==='need-to-know'){latestSummary={text:`${rows.filter(r=>r[t.id]?.questions?.length).length} participants submitted unanswered questions. Open-ended questions should be discussed or manually categorized before publishing.`};$('#summary').textContent=latestSummary.text;return latestSummary;}else{latestSummary={text:`${rows.filter(r=>r[t.id]).length} participants submitted notes for this stage.`};$('#summary').textContent=latestSummary.text;return latestSummary;}latestSummary={items};$('#summary').innerHTML=Object.entries(items).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div>${k}: <strong>${v}</strong></div>`).join('')||'<span class="muted">No responses yet.</span>';return latestSummary;}
