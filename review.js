(function(){
  // Review mode: allows PI/core educators to inspect every participant-facing stage
  // without facilitator timing, disclosure gates, or data-submission prerequisites.
  // This is a visual/content review surface, not the live workshop runtime.
  if(!new URLSearchParams(location.search).has('review')) return;

  if(pollHandle) clearInterval(pollHandle);
  pollHandle=null;
  if(timerHandle) clearInterval(timerHandle);
  timerHandle=null;

  session.role='reviewer';
  session.participant='REVIEWER';
  session.group='1';
  session.recorder=true; // show every group-entry control for content review

  server={
    stage:1,
    deadline:null,
    prompt:'',
    recorder:'REVIEWER',
    selectedEvidence:['A','B'],
    votes:{
      s5:{R1:{choice:'Defer pending more information',confidence:65},R2:{choice:'Proceed with conditions',confidence:60}},
      s6:{R1:{choice:'Defer pending more information',confidence:72},R2:{choice:'Proceed with conditions',confidence:68}},
      s8:{R1:{choice:'Proceed with conditions',confidence:75},R2:{choice:'Defer pending more information',confidence:70}}
    },
    groupData:{},participants:[],ready:[]
  };

  const join=document.querySelector('#joinView');
  const work=document.querySelector('#workshopView');
  const fac=document.querySelector('#facilitatorView');
  const syn=document.querySelector('#synthesisView');
  if(join) join.classList.add('hidden');
  if(fac) fac.classList.add('hidden');
  if(syn) syn.classList.add('hidden');
  if(work) work.classList.remove('hidden');

  const roleBadge=document.querySelector('#roleBadge');
  if(roleBadge) roleBadge.textContent='Content Review';
  const connection=document.querySelector('#connectionBadge');
  if(connection) connection.textContent='Review only · no live sync';

  const shell=document.querySelector('.shell');
  const reviewBar=document.createElement('section');
  reviewBar.id='reviewControls';
  reviewBar.className='card compact';
  reviewBar.style.position='sticky';
  reviewBar.style.top='92px';
  reviewBar.style.zIndex='15';
  reviewBar.innerHTML=`
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:space-between">
      <div>
        <div class="eyebrow">Core educator / PI review mode</div>
        <strong>Inspect every stage exactly as a participant/recorder could see it.</strong>
        <div class="muted">Inputs are for interface testing only. Use the stage controls to move freely; no facilitator release is required.</div>
      </div>
      <div class="fac-toolbar">
        <button type="button" class="ghost" id="reviewPrev">← Previous</button>
        <select id="reviewStage" aria-label="Review stage">${STAGES.map(s=>`<option value="${s.id}">${s.id}. ${esc(s.title)}</option>`).join('')}</select>
        <button type="button" class="primary" id="reviewNext">Next →</button>
      </div>
    </div>`;
  shell.insertBefore(reviewBar,work);

  const stageActions=document.querySelector('.stage-actions');
  if(stageActions){
    stageActions.innerHTML='<span class="muted">Review mode: responses are not part of the live workshop dataset.</span>';
  }

  // In review mode, submissions should never block inspection or depend on backend state.
  const originalCallApi=callApi;
  callApi=async function(action,payload={}){
    if(action==='vote'){
      const k=`s${payload.stage}`;
      server.votes[k]=server.votes[k]||{};
      server.votes[k][session.participant]={choice:payload.choice,confidence:payload.confidence,ts:Date.now()};
      return {ok:true};
    }
    if(action==='selectEvidence'){
      server.selectedEvidence=payload.ids||[];
      return {ok:true};
    }
    if(action==='submit'||action==='event'||action==='ready'||action==='join') return {ok:true};
    if(action==='state') return {ok:true,state:server};
    return originalCallApi(action,payload);
  };

  // Prevent review-mode refresh calls from replacing the reviewer's manually selected stage.
  refreshState=async function(){ return {ok:true,state:server}; };

  function renderReviewStage(n){
    server.stage=Math.max(1,Math.min(STAGES.length,Number(n)||1));
    const kicker=document.querySelector('#stageKicker');
    const title=document.querySelector('#stageTitle');
    const content=document.querySelector('#stageContent');
    const timer=document.querySelector('#timer');
    if(kicker) kicker.textContent=`Stage ${server.stage} of ${STAGES.length} · REVIEW`;
    if(title) title.textContent=STAGES[server.stage-1].title;
    if(timer) timer.textContent='Review';
    if(content) content.innerHTML=stageHtml(server.stage);
    const select=document.querySelector('#reviewStage');
    if(select) select.value=String(server.stage);
    wireStage();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  document.querySelector('#reviewPrev').addEventListener('click',()=>renderReviewStage(server.stage-1));
  document.querySelector('#reviewNext').addEventListener('click',()=>renderReviewStage(server.stage+1));
  document.querySelector('#reviewStage').addEventListener('change',e=>renderReviewStage(e.target.value));

  renderReviewStage(1);
})();
