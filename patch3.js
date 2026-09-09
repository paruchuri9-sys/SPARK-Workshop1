(function(){
  // v0.3.3: bounded local progression. Participants may move one stage ahead of
  // the facilitator's released stage. Same-stage polling only updates small live regions.
  const progressKey=()=>`spark_view_stage_${session.participant||'anon'}`;
  let viewStage=Math.max(1,Math.min(10,Number(localStorage.getItem(progressKey())||server.stage||1)));

  function releasedStage(){return Number(server.stage||1)}
  function maxParticipantStage(){
    // Static GitHub preview is intentionally freer for testing. Live synchronized
    // workshop participants can be at most one stage ahead of the facilitator.
    return apiEnabled()?Math.min(10,releasedStage()+1):10;
  }
  function currentStage(){return Math.max(1,Math.min(viewStage,maxParticipantStage()))}

  function groupStartingPoints(){
    const gd=server.groupData||{};
    const rows=Object.entries(gd)
      .filter(([k,v])=>k.startsWith('s1_') && v && typeof v==='object')
      .map(([k,v])=>({participant:k.slice(3),factors:v.factors||'',unknown:v.unknown||''}));
    if(!rows.length)return '<p class="muted">Individual responses will appear here as group members submit them.</p>';
    return `<div class="table-wrap"><table><thead><tr><th>Participant</th><th>Important factors</th><th>Important unknown / verification need</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.participant)}</td><td>${esc(r.factors)}</td><td>${esc(r.unknown)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  const baseStageHtml=stageHtml;
  stageHtml=function(n){
    let html=baseStageHtml(n);
    if(n===2){
      html=`<section class="card stage-card"><h3>Group starting points</h3><p>As individual Stage 1 responses are submitted, they appear here for the group discussion.</p><div id="liveStartingPoints">${groupStartingPoints()}</div></section>`+html;
    }
    return html;
  };

  function participantCanAdvance(st){
    if(st>=10)return false;
    if(st>=maxParticipantStage())return false;
    // Stage 1 requires this participant's submitted vote before moving ahead.
    if(st===1)return !!server.votes?.s1?.[session.participant];
    // Stage 3 cannot advance until the group recorder has locked exactly two packets.
    if(st===3)return (server.selectedEvidence||[]).length===2;
    // Decision stages require this participant's own submission first.
    if([5,6,8].includes(st))return !!server.votes?.[`s${st}`]?.[session.participant];
    return true;
  }

  function updateNav(){
    let nav=document.querySelector('#participantNav');
    if(!nav){
      nav=document.createElement('div');nav.id='participantNav';nav.className='stage-actions';
      const old=document.querySelector('#workshopView .stage-actions');
      if(old)old.replaceWith(nav);else document.querySelector('#workshopView')?.appendChild(nav);
    }
    const st=currentStage();
    const behind=st>1;
    const ahead=participantCanAdvance(st);
    const waiting=st<10 && st>=maxParticipantStage();
    nav.innerHTML=`${behind?'<button type="button" class="ghost" id="prevParticipant">← Previous</button>':''}<span class="muted" id="participantProgressNote">${waiting?'Waiting for the facilitator to release the next stage.':''}</span>${ahead?'<button type="button" class="primary" id="nextParticipant">Next →</button>':''}`;
    document.querySelector('#prevParticipant')?.addEventListener('click',()=>{viewStage=Math.max(1,st-1);localStorage.setItem(progressKey(),viewStage);renderParticipant();});
    document.querySelector('#nextParticipant')?.addEventListener('click',()=>{viewStage=Math.min(10,st+1,maxParticipantStage());localStorage.setItem(progressKey(),viewStage);renderParticipant();});
  }

  const baseRenderParticipant=renderParticipant;
  renderParticipant=function(){
    const actual=server.stage;
    const st=currentStage();
    // Render the participant's local stage without changing the shared facilitator state.
    server.stage=st;
    baseRenderParticipant();
    server.stage=actual;
    document.querySelector('#stageKicker').textContent=`Stage ${st} of ${STAGES.length}`;
    document.querySelector('#stageTitle').textContent=STAGES[st-1].title;
    document.querySelector('#readyBtn')?.remove();
    updateNav();
  };

  function updateSmallRegions(next){
    const prompt=document.querySelector('#promptBanner');
    if(prompt){if(next.prompt){prompt.textContent=`Thought prompt: ${next.prompt}`;prompt.classList.remove('hidden')}else prompt.classList.add('hidden');}
    if(currentStage()===2){const box=document.querySelector('#liveStartingPoints');if(box)box.innerHTML=groupStartingPoints();}
    if([5,6,8].includes(currentStage())){
      const voteCard=document.querySelector('#stageContent .card.compact');
      if(voteCard){
        const holder=document.createElement('div');holder.innerHTML=voteSummaryHtml(next.votes?.[`s${currentStage()}`]||{});
        const fresh=holder.firstElementChild;if(fresh)voteCard.replaceWith(fresh);
      }
    }
    updateNav();
  }

  async function partialPoll(){
    try{
      const priorRelease=releasedStage();
      const r=await callApi('state',{group:session.group,participant:session.participant});
      if(!r?.state)return;
      server=r.state;
      session.recorder=server.recorder===session.participant;
      const newRelease=releasedStage();
      // Never rebuild merely because data arrived. If release advances, only rebuild
      // if the participant was waiting at the bounded edge and now has a new page available.
      updateSmallRegions(server);
      if(viewStage>maxParticipantStage())viewStage=maxParticipantStage();
      if(newRelease!==priorRelease)updateNav();
    }catch(e){console.warn('SPARK partial participant poll failed',e)}
  }

  if(session?.role==='participant'){
    if(pollHandle)clearInterval(pollHandle);
    pollHandle=setInterval(partialPoll,C.POLL_MS||3500);
    refreshState=async function(){
      const r=await callApi('state',{group:session.group,participant:session.participant});
      if(r?.state){server=r.state;session.recorder=server.recorder===session.participant;}
      updateSmallRegions(server);
      updateNav();
    };
    // Remove stale generic Ready control immediately.
    document.querySelector('#readyBtn')?.remove();
    try{renderParticipant()}catch(e){console.warn('SPARK local progression render deferred',e)}
  }
})();
