import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getDatabase, ref, onValue, get, update, set } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { SCENARIO } from "./scenario-classroom.js";

const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getDatabase(app); const $=s=>document.querySelector(s);
let sessionId='', state={currentTab:0,timerEnd:null,timerPausedRemaining:null,locked:false}, focusTab=0, timerInterval, latestSummary=null;
const notes=[
  "Capture the unaided individual first impression before group discussion. Do not reward any recommendation direction.",
  "Let participants distinguish what is known from what needs to be known. Ask why a missing fact could matter.",
  "The restriction to two areas is deliberate: it forces prioritization. Ask why those two were chosen.",
  "Do not resolve every uncertainty. Ask which packet answered a question, which complicated it, and which was less useful than expected.",
  "Ask groups to connect specific evidence to the recommendation and name important uncertainty that remains.",
  "Do not imply that the new information should cause revision. Ask what changed, what did not, and why.",
  "Focus on reopening conditions: what future evidence would warrant reconsideration, and what would be insufficient by itself?"
];


const params=new URLSearchParams(location.search);
const remembered=(params.get('session')||'').toUpperCase().replace(/[^A-F0-9]/g,'');
const showError=message=>{ $('#setupError').textContent=message; $('#authStatus').textContent='Action needed'; };
async function connectTeacher(){ if(!auth.currentUser) await signInAnonymously(auth); }
async function openSession(code){
  await connectTeacher();
  const snap=await get(ref(db,`sessions/${code}/state`));
  if(!snap.exists()) throw Error('Session not found. Create a new one.');
  sessionId=code;
  $('#setup').hidden=true; $('#classroom').hidden=false;
  $('#sessionId').textContent=code;
  $('#sessionLabel').textContent='Ready for students';
  $('#groupDescription').textContent=Number(snap.val().groupCount||1)===1?'Whole class, with individual responses':snap.val().groupCount+' groups, each student has an individual response';
  $('#joinLink').value=new URL('join.html?session='+encodeURIComponent(code),location.href).href;
  $('#authStatus').textContent='Class session '+code;
  bindSession();
}
$('#createSession').addEventListener('click',async()=>{
 const button=$('#createSession');button.disabled=true;$('#setupError').textContent='';
 try{
  await connectTeacher();
  let code,exists=true;
  for(let i=0;i<8&&exists;i++){const bytes=new Uint8Array(5);crypto.getRandomValues(bytes);code=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();exists=(await get(ref(db,`sessions/${code}/state`))).exists();}
  if(exists)throw Error('Could not create a unique session. Try again.');
  await set(ref(db,`sessions/${code}/state`),{currentTab:0,timerEnd:null,timerPausedRemaining:null,locked:false,groupCount:Number($('#groupCount').value),createdAt:Date.now()});
  location.assign('moderator.html?session='+encodeURIComponent(code));
 }catch(e){showError('Could not create a classroom session: '+e.message);button.disabled=false;}
});
$('#copyJoin').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#joinLink').value);$('#copyStatus').textContent='Student link copied.';}catch(e){$('#joinLink').select();$('#copyStatus').textContent='Select and copy the link above.';}});
$('#openStudent').addEventListener('click',()=>window.open($('#joinLink').value,'_blank','noopener'));
if(remembered)openSession(remembered).catch(e=>{showError(e.message);$('#setup').hidden=false;$('#classroom').hidden=true;});
else $('#authStatus').textContent='Create a class to begin';

let unsubs=[];
function bindSession(){
 unsubs.forEach(fn=>fn());unsubs=[];
 const fail=(name,e)=>{$('#syncStatus').textContent='Cannot read '+name+'. Check Firebase rules and connection ('+(e?.code||'unknown error')+').';};
 const sref=ref(db,`sessions/${sessionId}/state`);
 unsubs.push(onValue(sref,snap=>{if(!snap.exists()){fail('session state');return;}state={currentTab:0,...snap.val()};focusTab=state.currentTab;render();$('#syncStatus').textContent='Teacher connected to session '+sessionId;},e=>fail('session state',e)));
 unsubs.push(onValue(ref(db,`sessions/${sessionId}/presence`),snap=>{$('#presence').textContent=Object.keys(snap.val()||{}).length;},e=>fail('students online',e)));
 unsubs.push(onValue(ref(db,`responses/${sessionId}`),snap=>{$('#responseCount').textContent=Object.keys(snap.val()||{}).length;},e=>fail('student answers',e)));
}
function render(){
 const t=SCENARIO.tabs[focusTab]||SCENARIO.tabs[0];
 $('#currentTabLabel').textContent=t.label+' · '+t.title;
 $('#facilitation').innerHTML='<h3>'+t.title+'</h3><p>'+notes[focusTab]+'</p>';
 $('#lockResponses').checked=!!state.locked;startTimer();
 $('#next').disabled=state.currentTab>=SCENARIO.tabs.length-1;
 $('#nextHint').textContent=$('#next').disabled?'All steps are available. Students can revisit earlier steps.':'Next: '+SCENARIO.tabs[state.currentTab+1].title;
}
async function patch(p){if(!sessionId)throw Error('Create a session first');try{await update(ref(db,`sessions/${sessionId}/state`),p);}catch(e){$('#syncStatus').textContent='Update failed: '+e.message;}}
$('#next').addEventListener('click',async()=>{if(state.currentTab>=SCENARIO.tabs.length-1)return;await patch({currentTab:state.currentTab+1,locked:false,timerEnd:null,timerPausedRemaining:null});});
$('#lockResponses').addEventListener('change',e=>patch({locked:e.target.checked}));
$('#startTimer').addEventListener('click',()=>{const min=SCENARIO.tabs[focusTab].minutes||5;patch({timerEnd:Date.now()+min*60000,timerPausedRemaining:null});});
$('#pauseTimer').addEventListener('click',()=>{const remain=state.timerEnd?Math.max(0,state.timerEnd-Date.now()):(state.timerPausedRemaining||0);patch({timerEnd:null,timerPausedRemaining:remain});});
$('#addMinute').addEventListener('click',()=>{if(state.timerEnd)patch({timerEnd:state.timerEnd+60000});else patch({timerPausedRemaining:(state.timerPausedRemaining||0)+60000});});
$('#resetTimer').addEventListener('click',()=>patch({timerEnd:null,timerPausedRemaining:null}));
function startTimer(){clearInterval(timerInterval);const draw=()=>{let ms=state.timerPausedRemaining??(state.timerEnd?state.timerEnd-Date.now():null);if(ms==null){$('#timer').textContent='--:--';return;}ms=Math.max(0,ms);let s=Math.ceil(ms/1000);$('#timer').textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};draw();timerInterval=setInterval(draw,500);}
$('#refreshSummary').addEventListener('click',computeSummary);
$('#publishSummary').addEventListener('click',async()=>{if(!latestSummary)await computeSummary();const t=SCENARIO.tabs[focusTab];await set(ref(db,`sessions/${sessionId}/published/${t.id}`),latestSummary);});
async function computeSummary(){const snap=await get(ref(db,`responses/${sessionId}`)),rows=Object.values(snap.val()||{}),t=SCENARIO.tabs[focusTab],items={};if(t.id==='first-impression'||t.id==='preliminary'||t.id==='new-information'||t.id==='final'){rows.forEach(r=>{const v=r[t.id]?.recommendation;if(v)items[v]=(items[v]||0)+1;});}else if(t.id==='investigate'){rows.forEach(r=>(r[t.id]?.areas||[]).forEach(v=>items[v]=(items[v]||0)+1));}else if(t.id==='need-to-know'){latestSummary={text:`${rows.filter(r=>r[t.id]?.questions?.length).length} participants submitted unanswered questions. Open-ended questions should be discussed or manually categorized before publishing.`};$('#summary').textContent=latestSummary.text;return latestSummary;}else{latestSummary={text:`${rows.filter(r=>r[t.id]).length} participants submitted notes for this stage.`};$('#summary').textContent=latestSummary.text;return latestSummary;}latestSummary={items};$('#summary').innerHTML=Object.entries(items).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div>${k}: <strong>${v}</strong></div>`).join('')||'<span class="muted">No responses yet.</span>';return latestSummary;}
