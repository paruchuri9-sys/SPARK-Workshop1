const C=window.SPARK_CONFIG||{};
const D=window.SPARK_DATA||{};
D.decisions=[
  'Proceed under current requirements',
  'Proceed with project-specific conditions',
  'Defer pending specific studies/information',
  'Oppose the project'
];
if(Array.isArray(D.startingFacts)&&!D.startingFacts.some(x=>String(x).startsWith('Delay could reduce risk'))){
  D.startingFacts.push('Delay could reduce risk, but it could also mean losing the project and potential follow-on investment.');
}
const GROUPS=C.GROUPS||['Owl','Fox','Raven','Dolphin','Octopus'];
const GROUP_META={Owl:'🦉',Fox:'🦊',Raven:'🐦‍⬛',Dolphin:'🐬',Octopus:'🐙'};
const STAGES=[
 {id:1,title:'Starting Record & Individual First Impression',mins:4},
 {id:2,title:'Need to Know',mins:6},
 {id:3,title:'Choose What to Investigate',mins:5},
 {id:4,title:'Review the Evidence',mins:8},
 {id:5,title:'Preliminary Group Recommendation',mins:7},
 {id:6,title:'Evolving Information Update',mins:5},
 {id:7,title:'Perspective Challenge',mins:6},
 {id:8,title:'Final Decision, Conditions & Reconsideration',mins:8},
 {id:9,title:'Reflection & Co-Design',mins:18},
 {id:10,title:'Transfer to Existing Instruction',mins:25}
];
const MOD_GUIDE={
  pre:{say:'You can begin reading the starting record. Please wait to answer until I start the activity.',do:'Confirm everyone is in this room and can see the starting page. Then click Start scenario.'},
  1:{say:'Please complete this first response individually before discussing your recommendation.',do:'Start the scenario. Let everyone submit independently before discussion.'},
  2:{say:'Now compare your starting points and identify what you most need to know.',do:'Keep the discussion moving. Clarify instructions only. Do not suggest what they should notice.'},
  3:{say:'Choose the two evidence areas you think would be most useful to this decision.',do:'Do not recommend evidence packets. Let the group choose.'},
  4:{say:'Review what you selected and discuss what it answers and what remains uncertain.',do:'Keep attention on what the evidence actually supports.'},
  5:{say:'Discuss your recommendation, then everyone will submit their own choice.',do:'Do not force consensus. Preserve disagreement.'},
  6:{say:'Additional information is now available. Consider what, if anything, it changes.',do:'Do not imply that participants should change their position.'},
  7:{say:'Build the strongest case you can for the alternative shown on your screen.',do:'Encourage a serious case, not a straw man.'},
  8:{say:'Make your final judgment and identify what would make it workable or cause you to reconsider.',do:'Preserve dissent where it remains. Do not push for agreement.'},
  9:{say:'Now step out of the scenario and evaluate the experience as educators.',do:'Focus on authenticity, reasoning opportunities, scaffolds, observability and what should change.'},
 10:{say:'Apply the same reasoning-opportunity lens to something you already teach or use.',do:'Help the group stay concrete: existing activity, decision, uncertainty, evidence, minimal support, observable output.'}
};
const q=new URLSearchParams(location.search),REVIEW=q.get('review')==='1';
let session={role:REVIEW?'review':(window.SPARK_BOOT?.role||q.get('role')||'participant'),id:'',name:'',group:window.SPARK_BOOT?.group||q.get('group')||'',key:window.SPARK_BOOT?.key||q.get('key')||''};
let server={started:false,stage:1,deadline:null,prompt:'',selectedEvidence:[],votes:{},groupData:{},participants:[]};
let viewStage=1,pollHandle=null,timerHandle=null,modFingerprint='';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],now=()=>Date.now();
const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
function appsScriptEnabled(){return !!window.SPARK_APPS_SCRIPT&&typeof google!=='undefined'&&google.script&&google.script.run}
function apiEnabled(){return appsScriptEnabled()||!!C.API_URL}
function gas(action,payload={}){return new Promise((resolve,reject)=>google.script.run.withSuccessHandler(resolve).withFailureHandler(e=>reject(new Error(e?.message||e))).api(action,payload))}
async function callApi(action,payload={}){
  if(appsScriptEnabled())return gas(action,payload);
  if(C.API_URL){
    const r=await fetch(C.API_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action,...payload})});
    if(!r.ok)throw new Error(`Backend ${r.status}`);
    return r.json();
  }
  return demoApi(action,payload);
}
function demoKey(){return 'spark_workshop_v2_local'}
function demoLoad(){try{return JSON.parse(localStorage.getItem(demoKey())||'{}')}catch{return {}}}
function demoSave(d){localStorage.setItem(demoKey(),JSON.stringify(d))}
function blankControl(){return {started:false,stage:1,deadline:null,prompt:''}}
async function demoApi(action,p={}){
  const d=demoLoad();d.controls=d.controls||{};d.participants=d.participants||{};d.votes=d.votes||{};d.groupData=d.groupData||{};d.events=d.events||[];
  const g=p.group||session.group||'Owl';d.controls[g]=d.controls[g]||blankControl();d.votes[g]=d.votes[g]||{};d.groupData[g]=d.groupData[g]||{};
  if(action==='join'){d.participants[p.id]={id:p.id,name:p.name,group:g,ts:now()};d.events.push({event:'join',...p,ts:now()});}
  if(action==='vote'){d.votes[g][`s${p.stage}`]=d.votes[g][`s${p.stage}`]||{};d.votes[g][`s${p.stage}`][p.id]={choice:p.choice,confidence:p.confidence,name:p.name,ts:now()};}
  if(action==='submit'){d.groupData[g][p.key]=p.value;d.events.push({event:'submit',...p,ts:now()});}
  if(action==='selectEvidence'){d.groupData[g].selectedEvidence=p.ids;d.events.push({event:'evidence_selected',...p,ts:now()});}
  if(action==='event')d.events.push({...p,ts:now()});
  if(action==='moderator'){
    if(p.key!==C.MODERATOR_KEY)return {ok:false,error:'Invalid moderator key'};
    const patch=p.patch||{},ctrl=d.controls[g];
    if('started' in patch)ctrl.started=!!patch.started;
    if('stage' in patch){ctrl.stage=Math.max(1,Math.min(10,Number(patch.stage)||1));ctrl.deadline=now()+STAGES[ctrl.stage-1].mins*60000;ctrl.prompt='';ctrl.started=true;}
    if('deadline' in patch)ctrl.deadline=patch.deadline;
    if('prompt' in patch)ctrl.prompt=patch.prompt||'';
  }
  demoSave(d);
  if(action==='state'){
    const ctrl=d.controls[g];
    return {ok:true,state:{...ctrl,selectedEvidence:d.groupData[g].selectedEvidence||[],votes:d.votes[g]||{},groupData:d.groupData[g]||{},participants:Object.values(d.participants).filter(x=>x.group===g)}};
  }
  return {ok:true};
}
function groupLabel(g){return `${GROUP_META[g]||''} ${g}`.trim()}
function groupCards(){return `<div class="group-cards">${GROUPS.map(g=>`<button type="button" class="group-card" data-group="${esc(g)}"><span class="group-emoji">${GROUP_META[g]||''}</span><span>${esc(g)}</span></button>`).join('')}</div>`}
function decisionChoices(name){return `<div class="choice-grid">${D.decisions.map(x=>`<label class="choice"><input type="radio" name="${name}" value="${esc(x)}"><span>${esc(x)}</span></label>`).join('')}</div>`}
function confidence(id){return `<label>Confidence<div class="range-row"><input id="${id}" type="range" min="0" max="100" value="50"><span class="confidence-value" id="${id}v">50 / 100</span></div></label>`}
function tableRows(prefix,cols,rows=4){return `<div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${Array.from({length:rows},(_,r)=>`<tr>${cols.map((_,c)=>`<td><textarea data-key="${prefix}_${r}_${c}"></textarea></td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function evidenceCard(id){
  const e=D.evidence?.[id];if(!e)return '';
  const facts=e.facts||[],unknowns=e.unknowns||[];
  return `<article class="evidence-card"><h4>${id}. ${esc(e.title)}</h4><div class="source-note"><strong>Quick read</strong></div><ul>${facts.slice(0,3).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><strong>Questions that still matter</strong><ul>${unknowns.slice(0,2).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>${facts.length>3||unknowns.length>2?`<details><summary>More detail</summary>${facts.length>3?`<ul>${facts.slice(3).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${unknowns.length>2?`<strong>Other unresolved questions</strong><ul>${unknowns.slice(2).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}<div class="source-note"><strong>Source status:</strong> ${esc(e.source||'')}</div></details>`:''}</article>`;
}
function selectedEvidenceHtml(){const ids=server.selectedEvidence||[];return ids.length?`<div class="evidence-grid">${ids.map(evidenceCard).join('')}</div>`:`<div class="callout">No evidence packets selected yet.</div>`}
function voteDistribution(votes){const out=Object.fromEntries(D.decisions.map(x=>[x,0]));Object.values(votes||{}).forEach(v=>{if(v&&out[v.choice]!==undefined)out[v.choice]++});return out}
function resultStatus(votes){
  const total=Object.keys(votes||{}).length;if(!total)return {label:'No submissions',choice:'',max:0,total,dist:voteDistribution(votes)};
  const dist=voteDistribution(votes),max=Math.max(...Object.values(dist)),wins=D.decisions.filter(x=>dist[x]===max&&max>0);
  if(max===total)return {label:'Consensus',choice:wins[0]||'',max,total,dist};
  if(wins.length===1&&max>total/2)return {label:'Strict majority',choice:wins[0],max,total,dist};
  return {label:'No majority / unresolved',choice:'',max,total,dist};
}
function voteSummaryHtml(votes,hide=false){
  const r=resultStatus(votes);
  if(!r.total)return `<div class="card compact vote-summary"><p class="muted">No participant choices submitted yet.</p></div>`;
  if(hide)return `<div class="card compact vote-summary"><strong>${r.total}</strong> response${r.total===1?'':'s'} submitted.</div>`;
  return `<div class="card compact vote-summary"><div class="eyebrow">Current group result</div><p><strong>${r.label}${r.choice?`: ${esc(r.choice)}`:''}</strong>${r.choice?` (${r.max} of ${r.total})`:''}</p><div class="vote-bars">${D.decisions.map(x=>`<div class="vote-row"><span>${esc(x)}</span><div class="bar"><span style="width:${r.total?r.dist[x]/r.total*100:0}%"></span></div><b>${r.dist[x]}</b></div>`).join('')}</div></div>`;
}
function currentGroupChoice(){return resultStatus(server.votes?.s6||{}).choice||resultStatus(server.votes?.s5||{}).choice||''}
function challengeFor(choice){if(choice===D.decisions[0]||choice===D.decisions[1])return D.decisions[2];if(choice===D.decisions[2]||choice===D.decisions[3])return D.decisions[1];return ''}
function collectScope(scope){const v={};scope.querySelectorAll('textarea[data-key]').forEach(el=>v[el.dataset.key]=el.value);scope.querySelectorAll('textarea[id],input[id],select[id]').forEach(el=>{if(!['radio','checkbox','button'].includes(el.type))v[el.id]=el.value});return v}
function startingPointsHtml(){
  const rows=Object.entries(server.groupData||{}).filter(([k,v])=>k.startsWith('s1_')&&v&&typeof v==='object').map(([k,v])=>({name:v.name||'Participant',factors:v.factors||'',unknown:v.unknown||''}));
  if(!rows.length)return '<p class="muted">Responses will appear as group members submit Stage 1.</p>';
  return `<div class="table-wrap"><table><thead><tr><th>Participant</th><th>Important factors</th><th>Important unknown</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.factors)}</td><td>${esc(r.unknown)}</td></tr>`).join('')}</tbody></table></div>`;
}
function allGroupVoted(stage){const joined=(server.participants||[]).length,submitted=Object.keys(server.votes?.[`s${stage}`]||{}).length;return joined>0&&submitted>=joined}
function stage1Html(){
  const old=server.votes?.s1?.[session.id];
  const status=!server.started&&!REVIEW?`<div class="callout"><strong>${groupLabel(session.group)}</strong> · You may read the starting record now. Wait for your moderator to begin before answering.</div>`:'';
  const record=`<section class="card stage-card"><h3>Your role</h3><p>You are part of a Community Advisory Team advising local leaders whether, and under what conditions, the community should support a proposed hyperscale data-center campus in Central Arkansas.</p>${status}<div class="instruction">Starting record: The following information is currently available to the Community Advisory Team.</div><div class="facts">${D.startingFacts.map(x=>`<div class="fact">${esc(x)}</div>`).join('')}</div></section>`;
  if(old)return `${record}<section class="card success-card"><h3>Response submitted ✓</h3><p><strong>${esc(old.choice)}</strong> · Confidence ${esc(old.confidence)}/100</p><p class="muted">Your initial response is locked so the starting judgment remains independent.</p></section>`;
  const form=`<section class="card stage-card"><h3>Individual first impression</h3><p class="muted">Submit before discussing your recommendation with the group.</p><fieldset ${!server.started&&!REVIEW?'disabled':''} style="border:0;padding:0;margin:0">${decisionChoices('s1decision')}${confidence('s1conf')}<label>Two or three factors most important to your recommendation<textarea id="s1factors"></textarea></label><label>Most important thing you still need to know or verify<textarea id="s1unknown"></textarea></label><button class="primary submit-vote" data-stage="1">Submit response</button></fieldset>${!server.started&&!REVIEW?'<p class="muted"><strong>Wait for your moderator to begin.</strong></p>':''}</section>`;
  return record+form;
}
function stageHtml(n){
  if(n===1)return stage1Html();
  if(n===2)return `<section class="card stage-card"><h3>Group starting points</h3><div id="liveStartingPoints">${startingPointsHtml()}</div></section><section class="card stage-card"><h3>Map uncertainty</h3><p>Compare questions and concerns. Distinguish supplied evidence from claims or assumptions that still need verification.</p>${tableRows('ntk',['Evidence we currently have','What we need to know / verify','How or where could we find out?'],4)}<label>Which 2–3 unanswered questions could most change the group's recommendation?<textarea id="priorityUnknowns"></textarea></label><button class="primary group-submit" data-key="stage2">Submit group response</button></section>`;
  if(n===3)return `<section class="card stage-card"><h3>Choose only TWO evidence packets</h3><p>Choose based on what could change or sharpen the decision, not merely what sounds interesting.</p><div class="evidence-grid">${Object.entries(D.evidence||{}).map(([id,e])=>`<label class="evidence-card evidence-select"><input type="checkbox" name="evidence" value="${id}"><span><strong>${id}. ${esc(e.title)}</strong><br><span class="muted">${esc((e.unknowns||[])[0]||'')}</span></span></label>`).join('')}</div><label>Why these two?<textarea id="evidenceWhy"></textarea></label><label>What questions do you hope they answer?<textarea id="evidenceQuestions"></textarea></label><button class="primary" id="selectEvidenceBtn">Submit evidence choice</button></section>`;
  if(n===4)return `<section class="card stage-card"><h3>Review the evidence</h3><p>Focus on what the evidence resolves, what it complicates and what remains uncertain.</p>${selectedEvidenceHtml()}</section><section class="card stage-card">${tableRows('review',['Packet','What did it help answer?','What remains uncertain / needs verification?','How useful was it?'],2)}<label>Did the evidence create any new important question?<textarea id="newQuestion"></textarea></label><button class="primary group-submit" data-key="stage4">Submit evidence review</button></section>`;
  if(n===5)return `<section class="card stage-card"><h3>Preliminary group recommendation</h3><p>Discuss first. Then every participant submits a choice. A group result requires consensus or a strict majority (&gt;50%); otherwise it remains unresolved.</p>${decisionChoices('s5decision')}${confidence('s5conf')}<button class="primary submit-vote" data-stage="5">Submit response</button></section>${voteSummaryHtml(server.votes?.s5||{},!allGroupVoted(5))}<section class="card stage-card"><label>Evidence that matters most<textarea id="s5evidence"></textarea></label><label>Why it matters / group reasoning<textarea id="s5reasoning"></textarea></label><label>Most important remaining uncertainty<textarea id="s5uncertainty"></textarea></label><label>Strongest dissenting rationale, if any<textarea id="s5dissent"></textarea></label><button class="primary group-submit" data-key="stage5">Submit group reasoning</button></section>`;
  if(n===6)return `<section class="card stage-card"><h3>Evolving information update</h3><div class="instruction">Additional information becomes available. Some uncertainty is reduced while other uncertainty grows.</div><div class="facts">${D.stage6Update.map(x=>`<div class="fact">${esc(x)}</div>`).join('')}</div><p><strong>Does this information strengthen, weaken, or leave your recommendation unchanged?</strong></p>${decisionChoices('s6decision')}${confidence('s6conf')}<label>What changed in your reasoning, if anything?<textarea id="s6why"></textarea></label><label>What uncertainty matters most now?<textarea id="s6unknown"></textarea></label><button class="primary submit-vote" data-stage="6">Submit response</button></section>${voteSummaryHtml(server.votes?.s6||{},!allGroupVoted(6))}`;
  if(n===7){const current=currentGroupChoice(),assigned=challengeFor(current);return `<section class="card stage-card"><h3>Perspective challenge</h3><p>Using only the evidence already available, construct the strongest defensible case for a plausible alternative to the group's current recommendation.</p>${assigned?`<div class="instruction">Current group result: <strong>${esc(current)}</strong><br>Assigned alternative: <strong>${esc(assigned)}</strong></div><input id="altChoice" type="hidden" value="${esc(assigned)}">`:`<label>Alternative recommendation<select id="altChoice"><option value="">Choose...</option>${D.decisions.map(x=>`<option>${esc(x)}</option>`).join('')}</select></label>`}<label>Evidence that supports this alternative<textarea id="altEvidence"></textarea></label><label>Which stakeholder interest or risk does it take more seriously?<textarea id="altStakeholder"></textarea></label><label>What assumptions or enforceable conditions would have to be true?<textarea id="altConditions"></textarea></label><label>What is strongest about this alternative?<textarea id="altStrongest"></textarea></label><button class="primary group-submit" data-key="stage7">Submit perspective challenge</button></section>`;}
  if(n===8)return `<section class="card stage-card"><h3>Final individual choice</h3><p>After the evidence update and perspective challenge, every participant submits a final choice.</p>${decisionChoices('s8decision')}${confidence('s8conf')}<button class="primary submit-vote" data-stage="8">Submit response</button></section>${voteSummaryHtml(server.votes?.s8||{},!allGroupVoted(8))}<section class="card stage-card"><h3>Make the decision implementable</h3>${tableRows('cond',['Condition / trigger','How measured or verified?','Who reports / enforces?','What happens if unmet?'],3)}<label>What future evidence/event/condition would make the group reconsider?<textarea id="reconsider"></textarea></label><label>What new information would NOT be enough by itself?<textarea id="notEnough"></textarea></label><label>Strongest dissenting rationale, if any<textarea id="finalDissent"></textarea></label><button class="primary group-submit" data-key="stage8">Submit final group artifact</button></section>`;
  if(n===9)return `<section class="card stage-card"><h3>Reflection & co-design</h3><p>Now step out of the scenario and evaluate the experience as educators.</p><label>Authenticity & usability: What felt realistic or artificial? What must change?<textarea id="rAuthenticity"></textarea></label><label>Reasoning opportunities: Where did meaningful reasoning happen? What emerged without being explicitly prompted?<textarea id="rReasoning"></textarea></label><label>Scaffolds & cognitive load: What helped, constrained, led or confused?<textarea id="rScaffolds"></textarea></label><label>Observability: What student work or behavior could a teacher realistically collect or observe?<textarea id="rObservable"></textarea></label><button class="primary group-submit" data-key="stage9">Submit reflection</button></section>`;
  if(n===10)return `<section class="card stage-card"><h3>Transfer to existing instruction</h3><p>Identify one activity you already use and apply the same reasoning-opportunity lens.</p><label>Existing activity<textarea id="tActivity"></textarea></label><label>Consequential judgment or decision students make<textarea id="tDecision"></textarea></label><label>What is uncertain / incomplete?<textarea id="tUncertainty"></textarea></label><label>What evidence could matter?<textarea id="tEvidence"></textarea></label><label>Minimal change that could strengthen the reasoning opportunity<textarea id="tMinimal"></textarea></label><label>What could a teacher realistically observe?<textarea id="tObserve"></textarea></label><label>Where else could the same reasoning pattern transfer?<textarea id="tTransfer"></textarea></label><button class="primary group-submit" data-key="stage10">Submit transfer map</button></section>`;
  return '';
}
function maxViewStage(){if(REVIEW)return 10;if(!server.started)return 1;const r=Number(server.stage||1),candidate=Math.min(10,r+1);return candidate===6&&r<6?5:candidate}
function participantCanNext(){if(!server.started&&!REVIEW)return false;if(viewStage>=10||viewStage>=maxViewStage())return false;if(viewStage===1&&!server.votes?.s1?.[session.id])return false;if(viewStage===3&&(server.selectedEvidence||[]).length!==2)return false;if([5,6,8].includes(viewStage)&&!server.votes?.[`s${viewStage}`]?.[session.id])return false;return true}
function updateParticipantNav(){
  const nav=$('#participantNav');if(!nav)return;
  const waiting=server.started&&viewStage>=maxViewStage()&&viewStage<10;
  nav.innerHTML=`<span class="muted">${waiting?'Waiting for the moderator to start the next phase.':''}</span>${participantCanNext()?'<button class="primary" id="nextParticipant">Next →</button>':''}`;
  $('#nextParticipant')?.addEventListener('click',()=>{viewStage++;localStorage.setItem(`spark_stage_${session.id}`,viewStage);renderParticipant(true)});
}
function startTimer(){
  clearInterval(timerHandle);
  const tick=()=>{const el=$('#timer');if(!el)return;if(!server.started||!server.deadline){el.textContent='--:--';return}const left=Math.max(0,server.deadline-now()),m=Math.floor(left/60000),s=Math.floor((left%60000)/1000);el.textContent=`${m}:${String(s).padStart(2,'0')}`};
  tick();timerHandle=setInterval(tick,1000);
}
function draftKey(){return `spark_draft_${session.id}_${viewStage}`}
function saveDraft(){if(session.role!=='participant')return;const root=$('#stageContent');if(!root)return;const v={};root.querySelectorAll('textarea[id],textarea[data-key],input[type=range],input[type=radio]:checked,input[type=checkbox]:checked,select[id]').forEach(el=>{const k=el.id||el.dataset.key||el.name;if(!k)return;if(el.type==='radio'||el.type==='checkbox'){v[k]=v[k]||[];v[k].push(el.value)}else v[k]=el.value});try{localStorage.setItem(draftKey(),JSON.stringify(v))}catch(e){}}
function restoreDraft(){let v={};try{v=JSON.parse(localStorage.getItem(draftKey())||'{}')}catch(e){};const root=$('#stageContent');if(!root)return;Object.entries(v).forEach(([k,val])=>{const byId=root.querySelector(`#${CSS.escape(k)}`);if(byId&&byId.type!=='radio'&&byId.type!=='checkbox'){byId.value=val;if(byId.type==='range'){const out=$('#'+byId.id+'v');if(out)out.textContent=`${byId.value} / 100`;}return}const nodes=[...root.querySelectorAll(`[data-key="${k}"],[name="${k}"]`)];nodes.forEach(el=>{if(el.type==='radio'||el.type==='checkbox')el.checked=Array.isArray(val)&&val.includes(el.value);else el.value=val})});}
function clearDraft(stage=viewStage){try{localStorage.removeItem(`spark_draft_${session.id}_${stage}`)}catch(e){}}
function bindDrafts(){const root=$('#stageContent');if(!root)return;root.addEventListener('input',saveDraft);root.addEventListener('change',saveDraft);}
function renderParticipant(scroll=false){
  $('#waitingView')?.classList.add('hidden');$('#workshopView').classList.remove('hidden');
  viewStage=Math.max(1,Math.min(viewStage||1,maxViewStage()));
  $('#stageKicker').textContent=`Phase ${viewStage} of ${STAGES.length} · ${groupLabel(session.group)}`;
  $('#stageTitle').textContent=STAGES[viewStage-1].title;
  $('#stageContent').innerHTML=stageHtml(viewStage);
  if(server.prompt){$('#promptBanner').textContent=`Thought prompt: ${server.prompt}`;$('#promptBanner').classList.remove('hidden')}else $('#promptBanner').classList.add('hidden');
  restoreDraft();wireStage();bindDrafts();updateParticipantNav();startTimer();
  if(scroll)scrollTo({top:0,behavior:'smooth'});
}
function markSubmitted(button){if(!button)return;button.disabled=false;button.className='secondary-btn';button.textContent=participantCanNext()?'Response submitted ✓ · Next →':'Response submitted ✓';button.onclick=()=>{$('#nextParticipant')?.click()}}
function wireStage(){
  $$('input[type=range]').forEach(x=>x.oninput=()=>{const v=$('#'+x.id+'v');if(v)v.textContent=`${x.value} / 100`});
  $$('.submit-vote').forEach(b=>b.onclick=async()=>{
    if(!server.started&&!REVIEW)return;
    const st=+b.dataset.stage,choice=$(`input[name=s${st}decision]:checked`)?.value;if(!choice)return alert('Choose a recommendation first.');
    const conf=+($(`#s${st}conf`)?.value||50);b.disabled=true;b.textContent='Submitting…';
    await callApi('vote',{group:session.group,id:session.id,name:session.name,stage:st,choice,confidence:conf});
    if(st===1)await callApi('submit',{group:session.group,id:session.id,key:`s1_${session.id}`,value:{name:session.name,factors:$('#s1factors')?.value||'',unknown:$('#s1unknown')?.value||''}});
    if(st===6)await callApi('submit',{group:session.group,id:session.id,key:`s6_${session.id}`,value:{name:session.name,why:$('#s6why')?.value||'',unknown:$('#s6unknown')?.value||''}});
    clearDraft(st);await fetchParticipantState(false);renderParticipant(false);markSubmitted($('.submit-vote'));
  });
  $$('.group-submit').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Submitting…';await callApi('submit',{group:session.group,id:session.id,key:b.dataset.key,value:{...collectScope(b.closest('section')),submittedBy:session.name}});clearDraft(viewStage);await fetchParticipantState(false);markSubmitted(b)});
  $('#selectEvidenceBtn')?.addEventListener('click',async e=>{const b=e.currentTarget,ids=$$('input[name=evidence]:checked').map(x=>x.value);if(ids.length!==2)return alert('Choose exactly two evidence packets.');b.disabled=true;b.textContent='Submitting…';await callApi('selectEvidence',{group:session.group,id:session.id,ids});await callApi('submit',{group:session.group,id:session.id,key:'stage3',value:{ids,why:$('#evidenceWhy')?.value||'',questions:$('#evidenceQuestions')?.value||'',submittedBy:session.name}});clearDraft(3);await fetchParticipantState(false);renderParticipant(false);markSubmitted($('#selectEvidenceBtn'))});
}
async function fetchParticipantState(renderOnRelease=true){
  const priorStage=server.stage,priorStarted=server.started,r=await callApi('state',{group:session.group,id:session.id});if(!r?.state)return;server=r.state;
  const newMax=maxViewStage();if(viewStage>newMax)viewStage=newMax;
  if(renderOnRelease&&(priorStage!==server.stage||priorStarted!==server.started)){renderParticipant(false);return;}
  if(viewStage===2){const box=$('#liveStartingPoints');if(box)box.innerHTML=startingPointsHtml();}
  if([5,6,8].includes(viewStage)){const card=$('.vote-summary');if(card){const holder=document.createElement('div');holder.innerHTML=voteSummaryHtml(server.votes?.[`s${viewStage}`]||{},!allGroupVoted(viewStage));card.replaceWith(holder.firstElementChild);}}
  if(server.prompt){$('#promptBanner').textContent=`Thought prompt: ${server.prompt}`;$('#promptBanner').classList.remove('hidden')}else $('#promptBanner')?.classList.add('hidden');
  updateParticipantNav();startTimer();
}
function setGroupSelection(root,group){root.querySelectorAll('.group-card').forEach(b=>b.classList.toggle('selected',b.dataset.group===group))}
async function initParticipant(){
  session.id=localStorage.getItem('spark_id')||((window.crypto&&crypto.randomUUID)?crypto.randomUUID():`p_${Date.now()}_${Math.random().toString(36).slice(2)}`);localStorage.setItem('spark_id',session.id);
  session.name=localStorage.getItem('spark_name')||'';session.group=localStorage.getItem('spark_group')||'';
  const join=$('#joinView');$('#participantName').value=session.name;$('#groupCards').innerHTML=groupCards();if(session.group)setGroupSelection($('#groupCards'),session.group);
  $$('#groupCards .group-card').forEach(b=>b.onclick=()=>{session.group=b.dataset.group;setGroupSelection($('#groupCards'),session.group)});
  const enter=async()=>{join.classList.add('hidden');await fetchParticipantState(false);viewStage=Math.max(1,Math.min(Number(localStorage.getItem(`spark_stage_${session.id}`)||1),maxViewStage()));renderParticipant(false);pollHandle=setInterval(()=>fetchParticipantState(true),C.POLL_MS||2500)};
  if(session.name&&session.group){await callApi('join',{id:session.id,name:session.name,group:session.group});await enter();return;}
  $('#joinBtn').onclick=async()=>{const name=$('#participantName').value.trim();if(!name)return alert('Enter your full name.');if(!session.group)return alert('Select the breakout group assigned to you.');session.name=name;localStorage.setItem('spark_name',name);localStorage.setItem('spark_group',session.group);await callApi('join',{id:session.id,name,group:session.group});viewStage=1;await enter();};
}
function guideForModerator(){return server.started?(MOD_GUIDE[server.stage]||MOD_GUIDE[1]):MOD_GUIDE.pre}
function moderatorHtml(){
  const st=server.stage||1,ps=D.prompts?.[st]||[],votes=server.votes?.[`s${st}`]||{},r=resultStatus(votes),guide=guideForModerator();
  return `<div class="stagebar card compact"><div><div class="eyebrow">Moderator · ${groupLabel(session.group)}</div><h2>${server.started?`Phase ${st}: ${esc(STAGES[st-1].title)}`:'Ready to start'}</h2></div><div class="timerbox"><span class="timer-label">Time remaining</span><span id="timer">--:--</span></div></div>
  <section class="card"><h3 style="margin-top:0">Say</h3><div class="instruction">“${esc(guide.say)}”</div><h3>Do</h3><p>${esc(guide.do)}</p></section>
  <section class="card"><div class="fac-toolbar"><button class="primary" id="nextStage">${!server.started?'Start scenario →':st<10?'Start next phase →':'Final phase active'}</button><button class="secondary-btn" id="plusMinute">+1 minute</button><button class="secondary-btn" id="resetTimer">Reset timer</button></div><div class="status-grid"><div class="metric"><strong id="modParticipants">${server.participants?.length||0}</strong>participants</div><div class="metric"><strong id="modVotes">${Object.keys(votes).length}</strong>responses this phase</div><div class="metric"><strong id="modEvidence">${server.selectedEvidence?.join(', ')||'—'}</strong>evidence selected</div><div class="metric"><strong id="modResult">${esc(r.label)}</strong>group result</div></div></section>
  <section class="card"><h3>Participants</h3><div id="participantList">${(server.participants||[]).map(p=>`<span class="stakeholder">${esc(p.name)}</span>`).join('')||'<span class="muted">No participants joined yet.</span>'}</div></section>
  <details class="card"><summary>Neutral prompt if the group is stuck</summary><p class="muted">Use only when needed.</p><div class="fac-toolbar">${ps.map((p,i)=>`<button class="ghost showPrompt" data-prompt="${esc(p)}">Prompt ${i+1}</button>`).join('')||'<span class="muted">No prompt for this phase.</span>'}<button class="ghost" id="hidePrompt">Hide prompt</button></div>${server.prompt?`<div class="prompt-banner">Visible now: ${esc(server.prompt)}</div>`:''}</details>
  ${voteSummaryHtml(votes,false)}
  <details class="card"><summary>Private moderator note</summary><textarea id="modNote" placeholder="Confusion, spontaneous reasoning, prompting, timing, technology friction..."></textarea><button id="saveModNote" class="secondary-btn">Save observation</button></details>`;
}
function wireModerator(){
  const st=server.stage||1,next=$('#nextStage');if(next){next.disabled=server.started&&st>=10;next.onclick=async()=>{const patch=!server.started?{started:true,stage:1}:{stage:Math.min(10,st+1)};await moderatorPatch(patch,true)}}
  $('#plusMinute')?.addEventListener('click',()=>moderatorPatch({deadline:(server.deadline||now())+60000},true));
  $('#resetTimer')?.addEventListener('click',()=>moderatorPatch({deadline:now()+STAGES[st-1].mins*60000},true));
  $$('.showPrompt').forEach(b=>b.onclick=()=>moderatorPatch({prompt:b.dataset.prompt},true));
  $('#hidePrompt')?.addEventListener('click',()=>moderatorPatch({prompt:''},true));
  $('#saveModNote')?.addEventListener('click',async()=>{await callApi('event',{group:session.group,event:'moderator_note',stage:st,note:$('#modNote').value,key:session.key});$('#saveModNote').textContent='Saved ✓'});
}
function renderModerator(){document.title=`SPARK · ${groupLabel(session.group)} Moderator`;$('#roleBadge').textContent='Moderator';$('#facilitatorView').innerHTML=moderatorHtml();wireModerator();startTimer();modFingerprint=JSON.stringify({started:server.started,stage:server.stage})}
async function moderatorState(force=false){
  const r=await callApi('state',{group:session.group});if(!r?.state)return;const old=modFingerprint;server=r.state;const fp=JSON.stringify({started:server.started,stage:server.stage});
  if(force||fp!==old){renderModerator();return;}
  const votes=server.votes?.[`s${server.stage}`]||{};$('#modParticipants').textContent=server.participants?.length||0;$('#modVotes').textContent=Object.keys(votes).length;$('#modEvidence').textContent=server.selectedEvidence?.join(', ')||'—';$('#modResult').textContent=resultStatus(votes).label;$('#participantList').innerHTML=(server.participants||[]).map(p=>`<span class="stakeholder">${esc(p.name)}</span>`).join('')||'<span class="muted">No participants joined yet.</span>';startTimer();
}
async function moderatorPatch(patch,force=false){const r=await callApi('moderator',{group:session.group,key:session.key,patch});if(r&&!r.ok)return alert(r.error||'Moderator action failed.');await moderatorState(force)}
async function initModerator(){if(!GROUPS.includes(session.group)||session.key!==C.MODERATOR_KEY){location.href='moderator.html';return}$('#joinView').classList.add('hidden');$('#workshopView').classList.add('hidden');$('#waitingView')?.classList.add('hidden');$('#facilitatorView').classList.remove('hidden');await moderatorState(true);pollHandle=setInterval(()=>moderatorState(false),C.POLL_MS||2500)}
function renderReview(){
  session.name='Reviewer';session.id='reviewer';session.group='Owl';server={started:true,stage:10,deadline:null,prompt:'',selectedEvidence:['A','B'],participants:[{id:'1',name:'Sample Teacher 1'},{id:'2',name:'Sample Teacher 2'}],votes:{s1:{a:{choice:D.decisions[0],confidence:65},b:{choice:D.decisions[1],confidence:70}},s5:{a:{choice:D.decisions[2]},b:{choice:D.decisions[2]}},s6:{a:{choice:D.decisions[2]},b:{choice:D.decisions[1]}},s8:{a:{choice:D.decisions[1]},b:{choice:D.decisions[1]}}},groupData:{}};viewStage=1;
  $('#joinView').classList.add('hidden');$('#waitingView')?.classList.add('hidden');$('#workshopView').classList.remove('hidden');$('#roleBadge').textContent='Review';
  const ctl=document.createElement('section');ctl.className='card review-controls';ctl.innerHTML=`<strong>Core educator / PI review</strong><div class="fac-toolbar"><button class="ghost" id="reviewPrev">← Previous</button><select id="reviewStage">${STAGES.map(s=>`<option value="${s.id}">${s.id}. ${esc(s.title)}</option>`).join('')}</select><button class="primary" id="reviewNext">Next →</button></div>`;$('#workshopView').prepend(ctl);
  const go=n=>{viewStage=Math.max(1,Math.min(10,n));$('#reviewStage').value=viewStage;renderParticipant(false)};$('#reviewPrev').onclick=()=>go(viewStage-1);$('#reviewNext').onclick=()=>go(viewStage+1);$('#reviewStage').onchange=e=>go(+e.target.value);go(1);
}
(async function boot(){
  $('#connectionBadge').textContent=apiEnabled()?(appsScriptEnabled()?'Live backend':'Connected backend'):'Local test mode';
  if(session.role==='review'){renderReview();return;}
  if(session.role==='moderator'){await initModerator();return;}
  await initParticipant();
})();
