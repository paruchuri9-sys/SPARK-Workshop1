// SPARK Workshop 1 - consolidated workshop controller
(function(){
'use strict';

const C=window.SPARK_CONFIG||{};
const D=window.SPARK_DATA||{};
const GROUPS=C.GROUPS||['Owl','Fox','Raven','Dolphin','Octopus'];
const ICON={Owl:'🦉',Fox:'🦊',Raven:'🐦‍⬛',Dolphin:'🐬',Octopus:'🐙'};
const DECISIONS=['Proceed under current requirements','Proceed with project-specific conditions','Defer pending specific studies/information','Oppose the project'];
const STAGES=[
  {id:1,title:'Starting Record & Individual First Impression',mins:4},
  {id:2,title:'Need to Know',mins:6},
  {id:3,title:'Choose What to Investigate',mins:5},
  {id:4,title:'Review the Evidence',mins:8},
  {id:5,title:'Preliminary Recommendation',mins:7},
  {id:6,title:'Evolving Information Update',mins:5},
  {id:7,title:'Perspective Challenge',mins:6},
  {id:8,title:'Final Decision, Conditions & Reconsideration',mins:8},
  {id:9,title:'Reflection & Co-Design',mins:10}
];
const GUIDE={
  1:{say:'Please read the starting record and complete your first response individually before discussing it.',do:'Every participant submits individually. Watch the response count below. Advance when the room is ready.'},
  2:{say:'Now compare your starting points and identify what you most need to know.',do:'This is a group response. Ask the group to choose one person to submit.'},
  3:{say:'Choose the two evidence areas you think would be most useful to this decision.',do:'This is a group response. Do not recommend evidence packets. One participant submits.'},
  4:{say:'Review what you selected and discuss what it answers and what remains uncertain.',do:'This is a group response. Keep attention on what the evidence actually supports.'},
  5:{say:'Discuss your recommendation, then ask every participant to submit an individual choice.',do:'Participants do not need the majority rule. Use the response panel below. If useful, after a few minutes tell the group whether there is clear agreement or unresolved disagreement.'},
  6:{say:'Additional information is now available. Consider what, if anything, it changes.',do:'Every participant submits individually. Do not imply that participants should change position.'},
  7:{say:'Build the strongest case you can for the alternative shown on the screen.',do:'This is a group response. The system selects a common challenge position for the group.'},
  8:{say:'Make your final judgment and identify what would make it workable or cause you to reconsider.',do:'Every participant submits individually. Preserve dissent. Do not push for agreement.'},
  9:{say:'Now step out of the scenario and evaluate the experience from an educator perspective.',do:'Complete this reflection in the breakout room as a group. One participant submits. Then return to the main Zoom room when finished.'}
};

const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const SESSION_KEY='spark_live_session_v3';
const POLL_MS=C.POLL_MS||5000;
let session={id:'',name:'',group:'',role:'participant',key:''};
let state={serverNow:Date.now(),started:false,stage:1,deadline:null,prompt:'',selectedEvidence:[],votes:{},groupData:{},participants:[],moderators:[]};
let selectedGroup='',pollHandle=null,timerHandle=null,retryHandle=null,clockOffset=0,renderedStage=0,renderedStarted=null,guideOpen=false,stateRequestInFlight=false,stateFailures=0;

function backendAvailable(){return !!(window.google&&google.script&&google.script.run&&typeof google.script.run.withSuccessHandler==='function');}
function api(action,payload={}){
  return new Promise((resolve,reject)=>{
    if(!backendAvailable())return reject(new Error('Workshop backend is not available. Open the workshop from the Apps Script link.'));
    let done=false;
    const timeout=setTimeout(()=>{if(!done){done=true;reject(new Error('Backend did not respond within 25 seconds.'));}},25000);
    try{
      google.script.run.withSuccessHandler(r=>{if(done)return;done=true;clearTimeout(timeout);resolve(r);})
        .withFailureHandler(e=>{if(done)return;done=true;clearTimeout(timeout);reject(new Error((e&&e.message)||String(e)));})
        .api(action,payload);
    }catch(e){if(!done){done=true;clearTimeout(timeout);reject(e);}}
  });
}

function saveSession(){sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));}
function loadSession(){try{const x=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');if(x&&x.id&&x.group&&x.name&&GROUPS.includes(x.group))session=x;}catch(e){}}
function clearSession(){sessionStorage.removeItem(SESSION_KEY);session={id:'',name:'',group:'',role:'participant',key:''};selectedGroup='';}
function newId(){return (window.crypto&&crypto.randomUUID)?crypto.randomUUID():'p_'+Date.now()+'_'+Math.random().toString(36).slice(2);}
function setConnection(text,ok){const b=$('#connectionBadge');if(!b)return;b.textContent=text;b.classList.toggle('secondary',!ok);}
function showError(msg){let e=$('#joinError');if(!e){e=document.createElement('div');e.id='joinError';e.className='callout';e.style.marginTop='12px';$('#joinView')?.appendChild(e);}e.textContent=msg||'';}
function clearError(){const e=$('#joinError');if(e)e.remove();}
function responseLabel(type){return `<div class="callout"><strong>${type==='individual'?'Individual response':'Group response'}:</strong> ${type==='individual'?'Everyone submits their own response.':'Discuss together. Choose one participant to submit for the group.'}</div>`;}

function renderGroupCards(){const host=$('#groupCards');if(!host)return;host.innerHTML=`<div class="group-cards">${GROUPS.map(g=>`<button type="button" class="group-card${selectedGroup===g?' selected':''}" data-group="${g}"><span class="group-emoji">${ICON[g]}</span><span>${g}</span></button>`).join('')}</div>`;$$('.group-card').forEach(b=>b.onclick=()=>{selectedGroup=b.dataset.group;renderGroupCards();});}
function showJoin(prefill=true){stopPolling();renderedStage=0;renderedStarted=null;$('#workshopView')?.classList.add('hidden');$('#waitingView')?.classList.add('hidden');$('#facilitatorView')?.classList.add('hidden');$('#joinView')?.classList.remove('hidden');if(prefill&&session.name)$('#participantName').value=session.name;else $('#participantName').value='';$('#entryRole').value='participant';$('#moderatorCodeWrap').classList.add('hidden');$('#moderatorCode').value='';selectedGroup='';renderGroupCards();$('#roleBadge').textContent='Participant';setConnection(backendAvailable()?'Backend ready':'Backend unavailable',backendAvailable());}

async function joinWorkshop(){
  clearError();
  const name=$('#participantName').value.trim(),role=$('#entryRole').value,key=role==='moderator'?$('#moderatorCode').value.trim():'';
  if(!name)return showError('Enter your name.');
  if(!selectedGroup)return showError('Choose your assigned breakout group.');
  if(role==='moderator'&&!key)return showError('Enter the moderator code.');
  const btn=$('#joinBtn');btn.disabled=true;btn.textContent='Joining…';
  const candidate={id:newId(),name,group:selectedGroup,role,key};
  try{
    const r=await api('join',{id:candidate.id,name:candidate.name,group:candidate.group,role:candidate.role,key:candidate.key});
    if(!r||r.ok===false)throw new Error((r&&r.error)||'Could not join workshop.');
    session=candidate;saveSession();enterWorkshop();
  }catch(e){showError(e.message||String(e));setConnection('Join failed',false);}
  finally{btn.disabled=false;btn.textContent='Enter workshop';}
}
async function resumeSession(){
  if(!session.id)return showJoin(false);
  try{
    const r=await api('join',{id:session.id,name:session.name,group:session.group,role:session.role,key:session.key});
    if(!r||r.ok===false)throw new Error((r&&r.error)||'Could not resume.');
    enterWorkshop();
  }catch(e){clearSession();showJoin(false);showError('Could not resume the previous session: '+(e.message||e));}
}
function enterWorkshop(){
  $('#joinView').classList.add('hidden');$('#workshopView').classList.remove('hidden');
  $('#roleBadge').textContent=session.role==='moderator'?`Moderator · ${ICON[session.group]} ${session.group}`:`Participant · ${ICON[session.group]} ${session.group}`;
  setConnection('Joined · loading group state…',false);
  renderLoadingState();
  startPolling();
  fetchState(true);
}
function renderLoadingState(){
  $('#stageKicker').textContent='Connected';
  $('#stageTitle').textContent=`${ICON[session.group]} ${session.group} group`;
  $('#timer').textContent='--:--';
  $('#stageContent').innerHTML='<section class="card stage-card"><h3>Loading group state…</h3><p class="muted">You are connected. The workshop will appear as soon as the group state is received.</p></section>';
}
function startPolling(){
  stopPolling();
  pollHandle=setInterval(()=>fetchState(false),POLL_MS);
  timerHandle=setInterval(updateTimer,250);
}
function stopPolling(){
  if(pollHandle){clearInterval(pollHandle);pollHandle=null;}
  if(timerHandle){clearInterval(timerHandle);timerHandle=null;}
  if(retryHandle){clearTimeout(retryHandle);retryHandle=null;}
  stateRequestInFlight=false;
}

async function fetchState(forceRender){
  if(stateRequestInFlight)return;
  stateRequestInFlight=true;
  try{
    const r=await api('state',{group:session.group,id:session.id});
    if(!r||r.ok===false)throw new Error((r&&r.error)||'State request failed');
    const oldStage=state.stage,oldStarted=state.started;
    state=r.state||state;
    clockOffset=(Number(state.serverNow)||Date.now())-Date.now();
    stateFailures=0;
    setConnection('Live',true);
    if(forceRender||renderedStage!==state.stage||renderedStarted!==state.started||oldStage!==state.stage||oldStarted!==state.started)renderStage();
    else refreshLiveElements();
    updateTimer();
  }catch(e){
    stateFailures++;
    setConnection(stateFailures===1?'Joined · retrying group state…':'Retrying connection…',false);
    console.error(e);
    if(!retryHandle)retryHandle=setTimeout(()=>{retryHandle=null;fetchState(true);},1500);
  }finally{stateRequestInFlight=false;}
}
function refreshLiveElements(){
  if(!state.started){const resp=$('#moderatorResponses');if(resp)resp.innerHTML=moderatorResponseStatusHtml();return;}
  if(state.stage===2){const el=$('#liveStartingPoints');if(el)el.innerHTML=startingPointsHtml();}
  const mod=$('#moderatorProgress');if(mod)mod.textContent=`Phase ${state.stage} of 9`;
  const resp=$('#moderatorResponses');if(resp)resp.innerHTML=moderatorResponseStatusHtml();
}
function updateTimer(){const el=$('#timer');if(!el)return;if(!state.started||!state.deadline){el.textContent='--:--';return;}const ms=Math.max(0,Number(state.deadline)-(Date.now()+clockOffset)),sec=Math.ceil(ms/1000);el.textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;}

function renderStage(){
  renderedStarted=!!state.started;
  if(!state.started){
    renderedStage=0;
    $('#stageKicker').textContent='Waiting to start';
    $('#stageTitle').textContent=`${ICON[session.group]} ${session.group} group`;
    $('#timer').textContent='--:--';
    $('#stageContent').innerHTML=session.role==='moderator'
      ?'<section class="card stage-card"><h3>Group is ready when you are</h3><p>Participants may join before the activity starts. When the room is ready, use <strong>Start Phase 1</strong> above. The Phase 1 timer will begin then.</p></section>'
      :'<section class="card stage-card"><h3>Waiting for the moderator</h3><p>You are connected. Phase 1 will appear automatically when your moderator starts the activity.</p></section>';
    renderModeratorStrip();
    return;
  }
  renderedStage=Math.max(1,Math.min(9,Number(state.stage)||1));
  const st=STAGES[renderedStage-1];
  $('#stageKicker').textContent=`Phase ${st.id} of 9`;$('#stageTitle').textContent=st.title;$('#stageContent').innerHTML=stageHtml(st.id);
  renderModeratorStrip();wireStage();if(session.role==='moderator')disableParticipantInputs();updateTimer();
}
function renderModeratorStrip(){
  const old=$('#moderatorStrip');if(old)old.remove();if(session.role!=='moderator')return;
  const host=$('#workshopView'),strip=document.createElement('section');strip.id='moderatorStrip';strip.className='card compact';strip.style.marginBottom='12px';
  if(!state.started){
    strip.innerHTML=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><strong style="margin-right:auto">Moderator · ${ICON[session.group]} ${session.group}</strong><span class="badge secondary">Connected · waiting</span><button id="modStart" class="primary">Start Phase 1</button></div><div id="moderatorResponses" style="margin-top:10px">${moderatorResponseStatusHtml()}</div>`;
    host.insertBefore(strip,host.firstChild);
    $('#modStart').onclick=startPhaseOne;
    return;
  }
  const next=state.stage<9?'<button id="modNext" class="primary">Next phase →</button>':'<span class="badge">Breakout final phase</span>',g=GUIDE[state.stage]||GUIDE[9];
  strip.innerHTML=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><strong style="margin-right:auto">Moderator · ${ICON[session.group]} ${session.group}</strong><span id="moderatorProgress" class="badge secondary">Phase ${state.stage} of 9</span><button id="modPlus" class="secondary-btn">+1 min</button>${next}<button id="modGuide" class="secondary-btn">Guide</button></div><div id="moderatorResponses" style="margin-top:10px">${moderatorResponseStatusHtml()}</div><div id="modGuidePanel" class="${guideOpen?'':'hidden'}" style="margin-top:10px"><p><strong>SAY:</strong> ${esc(g.say)}</p><p><strong>DO:</strong> ${esc(g.do)}</p></div>`;
  host.insertBefore(strip,host.firstChild);
  $('#modGuide').onclick=()=>{guideOpen=!guideOpen;$('#modGuidePanel').classList.toggle('hidden',!guideOpen);};
  $('#modPlus').onclick=async()=>{const dl=(Number(state.deadline)||Date.now()+clockOffset)+60000;await moderatorPatch({deadline:dl});};
  if($('#modNext'))$('#modNext').onclick=async()=>{const b=$('#modNext');b.disabled=true;b.textContent='Moving…';await moderatorPatch({stage:Math.min(9,state.stage+1)});};
}
async function startPhaseOne(){
  const b=$('#modStart');if(b){b.disabled=true;b.textContent='Starting…';}
  setConnection('Starting Phase 1…',false);
  try{
    const r=await api('startGroup',{group:session.group,id:session.id,key:session.key});
    if(!r||r.ok===false)throw new Error((r&&r.error)||'Could not start the group.');
    await fetchState(true);
  }catch(e){alert(e.message||e);if(b){b.disabled=false;b.textContent='Start Phase 1';}setConnection('Live · start failed',true);}
}
async function moderatorPatch(patch){try{const r=await api('moderator',{group:session.group,id:session.id,key:session.key,patch});if(!r||r.ok===false)throw new Error((r&&r.error)||'Moderator action failed');await fetchState(true);}catch(e){alert(e.message||e);}}
function disableParticipantInputs(){$$('#stageContent input,#stageContent textarea,#stageContent select,#stageContent button').forEach(el=>{el.disabled=true;});}

function decisionChoices(name,old){return `<div class="choice-grid">${DECISIONS.map(x=>`<label class="choice"><input type="radio" name="${name}" value="${esc(x)}" ${old===x?'checked':''}><span>${esc(x)}</span></label>`).join('')}</div>`;}
function confidence(id,value=50){return `<label>Confidence<div class="range-row"><input id="${id}" type="range" min="0" max="100" value="${Number(value)||50}"><span class="confidence-value" id="${id}v">${Number(value)||50} / 100</span></div></label>`;}
function tableRows(prefix,cols,rows=4){return `<div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${Array.from({length:rows},(_,r)=>`<tr>${cols.map((_,c)=>`<td><textarea data-key="${prefix}_${r}_${c}"></textarea></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function collectScope(scope){const v={};scope.querySelectorAll('textarea[data-key]').forEach(el=>v[el.dataset.key]=el.value);scope.querySelectorAll('textarea[id],input[id],select[id]').forEach(el=>{if(!['radio','checkbox','button','range'].includes(el.type))v[el.id]=el.value;});return v;}
function voteResult(votes){const vals=Object.values(votes||{});if(!vals.length)return {label:'No submissions',choice:'',total:0,max:0};const counts={};vals.forEach(v=>counts[v.choice]=(counts[v.choice]||0)+1);const max=Math.max(...Object.values(counts)),wins=Object.keys(counts).filter(k=>counts[k]===max);if(max===vals.length)return {label:'Consensus',choice:wins[0],total:vals.length,max};if(wins.length===1&&max>vals.length/2)return {label:'Strict majority',choice:wins[0],total:vals.length,max};return {label:'No majority / unresolved',choice:'',total:vals.length,max};}
function currentVotes(){const v6=state.votes?.s6||{},v5=state.votes?.s5||{};return Object.keys(v6).length?v6:v5;}
function currentGroupChoice(){const r=voteResult(currentVotes());return r.choice||'';}
function challengeFor(choice){if(choice===DECISIONS[0]||choice===DECISIONS[1])return DECISIONS[2];if(choice===DECISIONS[2]||choice===DECISIONS[3])return DECISIONS[1];return '';}
function fallbackChallenge(){const votes=currentVotes(),vals=Object.values(votes||{}),stats=DECISIONS.map((choice,i)=>{const arr=vals.filter(v=>v.choice===choice);return {choice,count:arr.length,avg:arr.length?arr.reduce((a,v)=>a+(Number(v.confidence)||0),0)/arr.length:-1,i};});const min=Math.min(...stats.map(s=>s.count));let tied=stats.filter(s=>s.count===min);const low=Math.min(...tied.map(s=>s.avg));tied=tied.filter(s=>s.avg===low);if(tied.length===1)return tied[0].choice;const seed=Array.from(session.group||'').reduce((a,c)=>a+c.charCodeAt(0),0);return tied[seed%tied.length].choice;}
function challengeTarget(){const base=currentGroupChoice();return base?challengeFor(base):fallbackChallenge();}
function startingPointsHtml(){const rows=Object.entries(state.groupData||{}).filter(([k,v])=>k.startsWith('s1_')&&v&&typeof v==='object').map(([,v])=>({name:v.name||'Participant',factors:v.factors||'',unknown:v.unknown||''}));if(!rows.length)return '<p class="muted">Responses will appear here as participants submit Phase 1.</p>';return `<div class="table-wrap"><table><thead><tr><th>Participant</th><th>Important factors</th><th>Important unknown</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.factors)}</td><td>${esc(r.unknown)}</td></tr>`).join('')}</tbody></table></div>`;}
function evidenceCard(id){const e=D.evidence&&D.evidence[id];if(!e)return '';return `<article class="evidence-card"><h4>${esc(id)}. ${esc(e.title)}</h4><div class="source-note"><strong>Quick read</strong></div><ul>${(e.facts||[]).slice(0,3).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><strong>Questions that still matter</strong><ul>${(e.unknowns||[]).slice(0,2).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><details><summary>More detail</summary>${(e.facts||[]).slice(3).length?`<ul>${e.facts.slice(3).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${(e.unknowns||[]).slice(2).length?`<strong>Other unresolved questions</strong><ul>${e.unknowns.slice(2).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}<div class="source-note"><strong>Source status:</strong> ${esc(e.source||'')}</div></details></article>`;}
function selectedEvidenceHtml(){const ids=state.selectedEvidence||[];return ids.length?`<div class="evidence-grid">${ids.map(evidenceCard).join('')}</div>`:'<div class="callout">No evidence packets selected yet.</div>';}
function submittedCard(stage){const v=state.votes?.[`s${stage}`]?.[session.id];if(!v)return '';return `<section class="card success-card"><h3>Individual response submitted ✓</h3><p><strong>${esc(v.choice)}</strong> · Confidence ${esc(v.confidence)}/100</p><p class="muted">Stay on this phase until the moderator advances the group.</p></section>`;}
function groupAlready(key){const v=state.groupData?.[key];if(!v)return '';return `<div class="success-card card compact"><strong>Group response submitted ✓</strong>${v.submittedBy?` by ${esc(v.submittedBy)}`:''}</div>`;}

function moderatorResponseStatusHtml(){
  const joined=(state.participants||[]).length;
  if(!state.started)return `<div class="callout"><strong>Waiting to start.</strong> ${joined} participant${joined===1?'':'s'} currently connected in this run. Start Phase 1 when the room is ready.</div>`;
  const stage=Number(state.stage)||1;
  if([1,5,6,8].includes(stage)){const votes=state.votes?.[`s${stage}`]||{},arr=Object.values(votes),r=voteResult(votes);return `<div class="callout"><strong>Individual responses:</strong> ${arr.length} of ${joined||'?'} submitted.${arr.length?` <span class="muted">${arr.map(v=>`${esc(v.name||'Participant')}: ${esc(v.choice)} (${Number(v.confidence)||0})`).join(' · ')}</span>`:''}${stage===5&&arr.length?`<br><strong>Moderator-only group status:</strong> ${esc(r.label)}${r.choice?`: ${esc(r.choice)}`:''}`:''}</div>`;}
  const key=stage===3?'stage3':`stage${stage}`,v=state.groupData?.[key];if(stage===3&&state.selectedEvidence?.length)return `<div class="callout"><strong>Group response:</strong> submitted${v?.submittedBy?` by ${esc(v.submittedBy)}`:''}. Evidence: ${state.selectedEvidence.map(esc).join(', ')}</div>`;return `<div class="callout"><strong>Group response:</strong> ${v?`submitted${v.submittedBy?` by ${esc(v.submittedBy)}`:''}`:'not submitted yet'}.</div>`;
}

function stageHtml(n){
  if(n===1){const own=state.votes?.s1?.[session.id],record=`<section class="card stage-card">${responseLabel('individual')}<div class="callout"><strong>${ICON[session.group]} ${session.group}</strong> · Complete your first response before discussing it.</div><h3>Your role</h3><p>You are part of a Community Advisory Team advising local leaders whether, and under what conditions, the community should support a proposed hyperscale data-center campus in Central Arkansas.</p><div class="instruction">Starting record</div><div class="facts">${(D.startingFacts||[]).map(x=>`<div class="fact">${esc(x)}</div>`).join('')}<div class="fact">Delay could reduce risk, but it could also mean losing the project and potential follow-on investment.</div></div></section>`;if(own)return record+submittedCard(1);return record+`<section class="card stage-card"><h3>Individual first impression</h3>${decisionChoices('s1decision')}${confidence('s1conf')}<label>Two or three factors most important to your recommendation<textarea id="s1factors"></textarea></label><label>Most important thing you still need to know or verify<textarea id="s1unknown"></textarea></label><button class="primary submit-vote" data-stage="1">Submit individual response</button></section>`;}
  if(n===2)return `<section class="card stage-card">${responseLabel('group')}<h3>Group starting points</h3><div id="liveStartingPoints">${startingPointsHtml()}</div></section><section class="card stage-card"><h3>Map uncertainty</h3><p>Compare questions and concerns. Distinguish supplied evidence from claims or assumptions that still need verification.</p>${tableRows('ntk',['Evidence we currently have','What we need to know / verify','How or where could we find out?'],4)}<label>Which 2–3 unanswered questions could most change the group's recommendation?<textarea id="priorityUnknowns"></textarea></label>${groupAlready('stage2')}<button class="primary group-submit" data-key="stage2" ${state.groupData?.stage2?'disabled':''}>Submit group response</button></section>`;
  if(n===3)return `<section class="card stage-card">${responseLabel('group')}<h3>Choose exactly TWO evidence packets</h3><p>Choose based on what could change or sharpen the decision, not merely what sounds interesting.</p><div class="evidence-grid">${Object.entries(D.evidence||{}).map(([id,e])=>`<label class="evidence-card evidence-select"><input type="checkbox" name="evidence" value="${esc(id)}" ${state.selectedEvidence?.includes(id)?'checked':''}><span><strong>${esc(id)}. ${esc(e.title)}</strong><br><span class="muted">${esc((e.unknowns||[])[0]||'')}</span></span></label>`).join('')}</div><label>Why these two?<textarea id="evidenceWhy"></textarea></label><label>What questions do you hope they answer?<textarea id="evidenceQuestions"></textarea></label>${groupAlready('stage3')}<button class="primary" id="selectEvidenceBtn" ${state.groupData?.stage3?'disabled':''}>Submit group evidence choice</button></section>`;
  if(n===4)return `<section class="card stage-card">${responseLabel('group')}<h3>Review the evidence</h3><p>Focus on what the evidence resolves, what it complicates and what remains uncertain.</p>${selectedEvidenceHtml()}</section><section class="card stage-card">${tableRows('review',['Packet','What did it help answer?','What remains uncertain / needs verification?','How useful was it?'],2)}<label>Did the evidence create any new important question?<textarea id="newQuestion"></textarea></label>${groupAlready('stage4')}<button class="primary group-submit" data-key="stage4" ${state.groupData?.stage4?'disabled':''}>Submit group response</button></section>`;
  if(n===5){if(state.votes?.s5?.[session.id])return `<section class="card stage-card">${responseLabel('individual')}<h3>Preliminary recommendation</h3><p class="muted">Your own response is recorded. The moderator will guide any group discussion.</p></section>`+submittedCard(5);return `<section class="card stage-card">${responseLabel('individual')}<h3>Preliminary recommendation</h3><p>Discuss the evidence first. Then submit your own recommendation.</p>${decisionChoices('s5decision')}${confidence('s5conf')}<label>What evidence matters most to your recommendation?<textarea id="s5why"></textarea></label><label>What important uncertainty remains?<textarea id="s5unknown"></textarea></label><button class="primary submit-vote" data-stage="5">Submit individual recommendation</button></section>`;}
  if(n===6){if(state.votes?.s6?.[session.id])return `<section class="card stage-card">${responseLabel('individual')}<h3>Evolving information</h3>${updateFacts()}</section>`+submittedCard(6);return `<section class="card stage-card">${responseLabel('individual')}<h3>Evolving information</h3>${updateFacts()}<p>Consider whether this information actually changes your earlier reasoning. Maintaining your position can be as defensible as revising it.</p>${decisionChoices('s6decision')}${confidence('s6conf')}<label>Why does this information change or not change your recommendation?<textarea id="s6why"></textarea></label><label>What uncertainty matters most now?<textarea id="s6unknown"></textarea></label><button class="primary submit-vote" data-stage="6">Submit individual update</button></section>`;}
  if(n===7){const target=challengeTarget(),base=currentGroupChoice();return `<section class="card stage-card">${responseLabel('group')}<h3>Perspective Challenge</h3><div class="callout">${base?`<strong>Current group direction:</strong> ${esc(base)}<br>`:''}<strong>Your group's challenge:</strong> Build the strongest defensible case for <em>${esc(target)}</em>.${!base?'<br><span class="muted">There was no strict majority, so the system selected a least-supported position to test. Ties are resolved by lower average confidence, then a stable group tie-break.</span>':''}</div><input type="hidden" id="challengeTarget" value="${esc(target)}"><label>Strongest case for the alternative<textarea id="challengeCase"></textarea></label><label>What would have to be true for that alternative to be defensible?<textarea id="challengeConditions"></textarea></label><label>What evidence would discriminate between the competing positions?<textarea id="challengeEvidence"></textarea></label>${groupAlready('stage7')}<button class="primary group-submit" data-key="stage7" ${state.groupData?.stage7?'disabled':''}>Submit group perspective challenge</button></section>`;}
  if(n===8){if(state.votes?.s8?.[session.id])return `<section class="card stage-card">${responseLabel('individual')}<h3>Final decision</h3></section>`+submittedCard(8);return `<section class="card stage-card">${responseLabel('individual')}<h3>Final decision, conditions & reconsideration</h3><p>Make your final judgment. A change is not inherently better than maintaining a position.</p>${decisionChoices('s8decision')}${confidence('s8conf')}<label>Conditions or safeguards needed, if any<textarea id="s8conditions"></textarea></label><label>What should be monitored after the decision?<textarea id="s8monitor"></textarea></label><label>What future evidence would make you reopen this decision?<textarea id="s8reopen"></textarea></label><button class="primary submit-vote" data-stage="8">Submit individual final decision</button></section>`;}
  return `<section class="card stage-card">${responseLabel('group')}<h3>Reflection & Co-Design</h3><p><strong>Complete this here in your breakout room.</strong> Discuss the questions together and choose one participant to submit the group's reflection. After this phase, your moderator will ask you to return to the main Zoom room.</p><p class="muted">For Workshop 1, answer from your educator perspective.</p><label>What felt authentic or inauthentic?<textarea id="authenticity"></textarea></label><label>Where did consequential reasoning actually occur?<textarea id="reasoningMoments"></textarea></label><label>Which scaffolds helped, and which felt leading or unnecessary?<textarea id="scaffolds"></textarea></label><label>What participant reasoning could you realistically observe or collect?<textarea id="observable"></textarea></label><label>What should we change before classroom use?<textarea id="changes"></textarea></label>${groupAlready('stage9')}<button class="primary group-submit" data-key="stage9" ${state.groupData?.stage9?'disabled':''}>Submit group reflection</button><div class="callout" style="margin-top:16px"><strong>Breakout activity complete after submission.</strong> Stay in the breakout room until your moderator asks you to return to the main Zoom room.</div></section>`;
}
function updateFacts(){return `<div class="facts">${(D.stage6Update||[]).map(x=>`<div class="fact">${esc(x)}</div>`).join('')}</div>`;}

function votePayload(st){const choice=$(`input[name=s${st}decision]:checked`)?.value,confidence=Number($(`#s${st}conf`)?.value||50);let responseKey='',responseValue=null;if(st===1){responseKey=`s1_${session.id}`;responseValue={name:session.name,factors:$('#s1factors')?.value||'',unknown:$('#s1unknown')?.value||''};}if(st===5){responseKey=`s5_${session.id}`;responseValue={name:session.name,why:$('#s5why')?.value||'',unknown:$('#s5unknown')?.value||''};}if(st===6){responseKey=`s6_${session.id}`;responseValue={name:session.name,why:$('#s6why')?.value||'',unknown:$('#s6unknown')?.value||''};}if(st===8){responseKey=`s8_${session.id}`;responseValue={name:session.name,conditions:$('#s8conditions')?.value||'',monitor:$('#s8monitor')?.value||'',reopen:$('#s8reopen')?.value||''};}return {choice,confidence,responseKey,responseValue};}
function wireStage(){$$('input[type=range]').forEach(x=>x.oninput=()=>{const v=$('#'+x.id+'v');if(v)v.textContent=`${x.value} / 100`;});if(session.role!=='participant')return;$$('.submit-vote').forEach(b=>b.onclick=async()=>{const st=Number(b.dataset.stage),p=votePayload(st);if(!p.choice)return alert('Choose a recommendation first.');b.disabled=true;b.textContent='Submitting…';try{const r=await api('vote',{group:session.group,id:session.id,name:session.name,stage:st,choice:p.choice,confidence:p.confidence,responseKey:p.responseKey,responseValue:p.responseValue});if(!r||r.ok===false)throw new Error((r&&r.error)||'Submission failed');await fetchState(true);}catch(e){alert(e.message||e);b.disabled=false;b.textContent='Submit individual response';}});$$('.group-submit').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Submitting…';try{const value={...collectScope(b.closest('section')),submittedBy:session.name};const r=await api('submit',{group:session.group,id:session.id,key:b.dataset.key,value,once:true});if(!r||r.ok===false)throw new Error((r&&r.error)||'Submission failed');await fetchState(true);}catch(e){alert(e.message||e);b.disabled=false;b.textContent='Submit group response';}});const eb=$('#selectEvidenceBtn');if(eb)eb.onclick=async()=>{const ids=$$('input[name=evidence]:checked').map(x=>x.value);if(ids.length!==2)return alert('Choose exactly two evidence packets.');eb.disabled=true;eb.textContent='Submitting…';try{const r=await api('selectEvidence',{group:session.group,id:session.id,ids,value:{ids,why:$('#evidenceWhy').value,questions:$('#evidenceQuestions').value,submittedBy:session.name},once:true});if(!r||r.ok===false)throw new Error((r&&r.error)||'Evidence selection failed');await fetchState(true);}catch(e){alert(e.message||e);eb.disabled=false;eb.textContent='Submit group evidence choice';}};}

function bindStaticControls(){renderGroupCards();$('#entryRole').onchange=()=>$('#moderatorCodeWrap').classList.toggle('hidden',$('#entryRole').value!=='moderator');$('#joinBtn').onclick=joinWorkshop;$('#changeSessionBtn').onclick=()=>{clearSession();showJoin(false);};}
function boot(){bindStaticControls();loadSession();if(new URLSearchParams(location.search).get('fresh')==='1'){clearSession();showJoin(false);return;}if(session.id)resumeSession();else showJoin(false);}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();