// SPARK Workshop 1: shared group control overlay and simplified breakout flow.
// One group = one authoritative phase + one authoritative deadline.
// Participants never advance the phase. The moderator does.

if (STAGES.length > 9) STAGES.splice(9);
delete MOD_GUIDE[10];
MOD_GUIDE[9] = {
  say: 'Now step out of the scenario and evaluate the experience as educators.',
  do: 'Focus on authenticity, reasoning opportunities, scaffolds, observability and what should change. When finished, ask everyone to return to the main Zoom room.'
};

// Everyone follows the group phase immediately. A participant is never held back
// because they have not submitted a response.
syncViewToServer = function(){
  if (REVIEW) return;
  const target = Math.max(1, Math.min(STAGES.length, Number(server.stage || 1)));
  if (viewStage !== target) {
    viewStage = target;
    localStorage.setItem(`spark_stage_${session.id}`, viewStage);
  }
};

// Local GitHub Pages simulation follows the same rule as production:
// the moderator starts Phase 1; participant joins do not start/reset the timer.
demoApi = async function(action,p={}){
  const d=demoLoad();
  d.controls=d.controls||{}; d.people=d.people||{}; d.votes=d.votes||{};
  d.groupData=d.groupData||{}; d.events=d.events||[];
  const g=p.group||session.group||'Owl';
  d.controls[g]=d.controls[g]||blankControl();
  d.votes[g]=d.votes[g]||{}; d.groupData[g]=d.groupData[g]||{};
  const c=d.controls[g];

  if(action==='join'){
    if(p.role==='moderator'&&p.key!==C.MODERATOR_KEY) return {ok:false,error:'Incorrect moderator code'};
    d.people[p.id]={id:p.id,name:p.name,group:g,role:p.role||'participant',ts:now()};
    if((p.role||'participant')==='moderator'&&!c.started){
      c.started=true; c.stage=1; c.deadline=now()+STAGES[0].mins*60000; c.prompt='';
    }
  }
  if(action==='vote'){
    d.votes[g][`s${p.stage}`]=d.votes[g][`s${p.stage}`]||{};
    d.votes[g][`s${p.stage}`][p.id]={choice:p.choice,confidence:p.confidence,name:p.name,ts:now()};
  }
  if(action==='submit') d.groupData[g][p.key]=p.value;
  if(action==='selectEvidence') d.groupData[g].selectedEvidence=p.ids;
  if(action==='event') d.events.push({...p,ts:now()});
  if(action==='moderator'){
    if(p.key!==C.MODERATOR_KEY) return {ok:false,error:'Invalid moderator code'};
    const patch=p.patch||{};
    if('stage' in patch){
      c.stage=Math.max(1,Math.min(STAGES.length,Number(patch.stage)||1));
      c.started=true; c.deadline=now()+STAGES[c.stage-1].mins*60000; c.prompt='';
    }
    if('deadline' in patch) c.deadline=patch.deadline;
    if('prompt' in patch) c.prompt=patch.prompt||'';
  }
  demoSave(d);
  if(action==='state') return {ok:true,state:{
    serverNow:now(),...c,
    selectedEvidence:d.groupData[g].selectedEvidence||[],
    votes:d.votes[g]||{},groupData:d.groupData[g]||{},
    participants:demoPeople(d,g,'participant'),moderators:demoPeople(d,g,'moderator')
  }};
  return {ok:true};
};

moderatorOverlayHtml = function(){
  if(session.role!=='moderator') return '';
  const st=Math.min(server.stage||1,STAGES.length);
  const guide=MOD_GUIDE[st]||{say:'',do:''};
  const ps=server.participants||[];
  const votes=server.votes?.[`s${st}`]||{};
  const gd=server.groupData||{};

  let progress='';
  if([1,6].includes(st)) progress=`${Object.keys(votes).length}/${ps.length} submitted`;
  else if(st===2) progress=gd.stage2?'Submitted':'Group response pending';
  else if(st===3) progress=gd.stage3?'Submitted':'Evidence choice pending';
  else if(st===4) progress=gd.stage4?'Submitted':'Evidence review pending';
  else if(st===5) progress=`${Object.keys(votes).length}/${ps.length} choices${gd.stage5?' · reasoning submitted':' · reasoning pending'}`;
  else if(st===7) progress=gd.stage7?'Submitted':'Challenge pending';
  else if(st===8) progress=`${Object.keys(votes).length}/${ps.length} choices${gd.stage8?' · artifact submitted':' · artifact pending'}`;
  else if(st===9) progress=gd.stage9?'Reflection submitted':'Reflection pending';

  return `<section id="moderatorOverlay" class="card compact" style="padding:10px 14px;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <strong>Moderator · ${groupLabel(session.group)}</strong>
      <span class="muted" style="margin-right:auto">${esc(progress)}</span>
      <button class="secondary-btn" id="plusMinute" style="padding:7px 11px">+1 min</button>
      ${st<9?`<button class="primary" id="nextStage" style="padding:7px 11px">Next phase →</button>`:'<span class="badge secondary">Breakout final phase</span>'}
      <details style="margin:0">
        <summary style="cursor:pointer;font-weight:700">Guide</summary>
        <div style="margin-top:9px;max-width:760px">
          <div><strong>Say:</strong> ${esc(guide.say)}</div>
          <div style="margin-top:5px"><strong>Do:</strong> ${esc(guide.do)}</div>
        </div>
      </details>
    </div>
  </section>`;
};

// Phase 9 is the end of the breakout web activity. Phase 10 occurs verbally
// after everyone returns to the main Zoom room.
const _stageHtmlBreakout = stageHtml;
stageHtml = function(n){
  const html=_stageHtmlBreakout(n);
  if(n!==9) return html;
  return html + `<section class="card compact"><strong>Breakout activity ends here.</strong><p class="muted">When your moderator asks, return to the main Zoom room for the whole-group discussion and transfer activity.</p></section>`;
};
