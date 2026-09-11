// SPARK Workshop 1 manual-flow policy.
// One shared group stage + one shared group deadline. Submission never advances a phase.

MOD_GUIDE[1].do='Let everyone work independently. Submitting does not move the group. Click Next phase when the room is ready.';
MOD_GUIDE[2].do='Keep the discussion moving. Clarify instructions only. Click Next phase when the room is ready.';
MOD_GUIDE[3].do='Do not recommend evidence packets. Let the group choose, then click Next phase when ready.';
MOD_GUIDE[4].do='Keep attention on what the evidence actually supports. Click Next phase when the room is ready.';
MOD_GUIDE[5].do='Do not force consensus. Preserve disagreement. Click Next phase when the room is ready.';
MOD_GUIDE[6].do='Do not imply that participants should change position. Click Next phase when the room is ready.';
MOD_GUIDE[7].do='Encourage a serious case, not a straw man. Click Next phase when the room is ready.';
MOD_GUIDE[8].do='Preserve dissent. Do not push for agreement. Click Next phase when the room is ready.';
MOD_GUIDE[9].do='Focus on authenticity, reasoning opportunities, scaffolds and observability. Click Next phase when ready.';
MOD_GUIDE[10].do='Keep the group concrete: existing activity, decision, uncertainty, evidence, minimal support and observable output.';

// Everyone follows the moderator's authoritative group phase immediately.
syncViewToServer = function(){
  if(REVIEW) return;
  const s=Math.max(1,Math.min(10,Number(server.stage)||1));
  if(viewStage!==s){
    viewStage=s;
    localStorage.setItem(`spark_stage_${session.id}`,viewStage);
  }
};

// Local-test backend mirrors production behavior: moderator starts timing; only moderator advances.
demoApi = async function(action,p={}){
  const d=demoLoad();
  d.controls=d.controls||{}; d.people=d.people||{}; d.votes=d.votes||{}; d.groupData=d.groupData||{}; d.events=d.events||[];
  const g=p.group||session.group||'Owl';
  d.controls[g]=d.controls[g]||blankControl(); d.votes[g]=d.votes[g]||{}; d.groupData[g]=d.groupData[g]||{};
  const c=d.controls[g];

  if(action==='join'){
    const role=p.role||'participant';
    if(role==='moderator'&&p.key!==C.MODERATOR_KEY) return {ok:false,error:'Incorrect moderator code'};
    d.people[p.id]={id:p.id,name:p.name,group:g,role,ts:now()};
    if(role==='moderator'&&!c.started){
      c.started=true; c.stage=Math.max(1,Number(c.stage)||1); c.deadline=now()+STAGES[c.stage-1].mins*60000; c.prompt='';
    }
  }
  if(action==='vote'){
    d.votes[g][`s${p.stage}`]=d.votes[g][`s${p.stage}`]||{};
    d.votes[g][`s${p.stage}`][p.id]={choice:p.choice,confidence:p.confidence,name:p.name,ts:now()};
  }
  if(action==='submit') d.groupData[g][p.key]=p.value;
  if(action==='selectEvidence') d.groupData[g].selectedEvidence=p.ids||[];
  if(action==='event') d.events.push({...p,ts:now()});
  if(action==='moderator'){
    if(p.key!==C.MODERATOR_KEY) return {ok:false,error:'Invalid moderator code'};
    const patch=p.patch||{};
    if(Object.prototype.hasOwnProperty.call(patch,'stage')){
      c.stage=Math.max(1,Math.min(10,Number(patch.stage)||1));
      c.started=true; c.deadline=now()+STAGES[c.stage-1].mins*60000; c.prompt='';
    }
    if(Object.prototype.hasOwnProperty.call(patch,'deadline')) c.deadline=patch.deadline;
    if(Object.prototype.hasOwnProperty.call(patch,'prompt')) c.prompt=patch.prompt||'';
  }
  demoSave(d);
  if(action==='state') return {ok:true,state:{serverNow:now(),...c,selectedEvidence:d.groupData[g].selectedEvidence||[],votes:d.votes[g]||{},groupData:d.groupData[g]||{},participants:demoPeople(d,g,'participant'),moderators:demoPeople(d,g,'moderator')}};
  return {ok:true};
};

// Submitting records the work but deliberately leaves the participant on the same phase.
wireStage = function(){
  wireDrafts();
  $$('input[type=range]').forEach(x=>x.oninput=()=>{const v=$('#'+x.id+'v');if(v)v.textContent=`${x.value} / 100`;saveDraft()});
  if(session.role!=='participant') return;

  $$('.submit-vote').forEach(b=>b.onclick=async()=>{
    const st=+b.dataset.stage;
    const choice=$(`input[name=s${st}decision]:checked`)?.value;
    if(!choice) return alert('Choose a recommendation first.');
    const conf=+($(`#s${st}conf`)?.value||50);
    b.disabled=true; b.textContent='Submitting…';
    await callApi('vote',{group:session.group,id:session.id,name:session.name,stage:st,choice,confidence:conf});
    if(st===1) await callApi('submit',{group:session.group,id:session.id,key:`s1_${session.id}`,value:{name:session.name,factors:$('#s1factors')?.value||'',unknown:$('#s1unknown')?.value||''}});
    if(st===6) await callApi('submit',{group:session.group,id:session.id,key:`s6_${session.id}`,value:{name:session.name,why:$('#s6why')?.value||'',unknown:$('#s6unknown')?.value||''}});
    clearDraft(st);
    if(st===1){ await fetchState(true); return; }
    b.textContent='Submitted ✓';
    b.closest('.stage-card')?.querySelectorAll('input,textarea,select').forEach(el=>el.disabled=true);
    await fetchState(false);
  });

  $$('.group-submit').forEach(b=>b.onclick=async()=>{
    b.disabled=true; b.textContent='Submitting…';
    await callApi('submit',{group:session.group,id:session.id,key:b.dataset.key,value:{...collectScope(b.closest('section')),submittedBy:session.name}});
    clearDraft();
    b.textContent='Submitted ✓';
    await fetchState(false);
  });

  $('#selectEvidenceBtn')?.addEventListener('click',async e=>{
    const b=e.currentTarget,ids=$$('input[name=evidence]:checked').map(x=>x.value);
    if(ids.length!==2) return alert('Choose exactly two evidence packets.');
    b.disabled=true; b.textContent='Submitting…';
    await callApi('selectEvidence',{group:session.group,id:session.id,ids});
    await callApi('submit',{group:session.group,id:session.id,key:'stage3',value:{ids,why:$('#evidenceWhy')?.value||'',questions:$('#evidenceQuestions')?.value||'',submittedBy:session.name}});
    clearDraft();
    b.textContent='Submitted ✓';
    await fetchState(false);
  });
};
