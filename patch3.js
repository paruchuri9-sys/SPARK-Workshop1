(function(){
  // v0.4: bounded local progression. Teachers/players may move at most one stage
  // ahead of their group's moderator. Review mode may inspect all stages.
  const reviewMode=new URLSearchParams(location.search).get('review')==='1';
  const progressKey=()=>`spark_view_stage_${session.participant||'anon'}`;
  let viewStage=Math.max(1,Math.min(10,Number(localStorage.getItem(progressKey())||server.stage||1)));

  function releasedStage(){return server.started===false?0:Number(server.stage||1)}
  function maxParticipantStage(){
    if(reviewMode)return 10;
    const released=releasedStage();
    return released===0?0:Math.min(10,released+1);
  }
  function currentStage(){
    if(!reviewMode && maxParticipantStage()===0)return 0;
    return Math.max(1,Math.min(viewStage,maxParticipantStage()||1));
  }

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
    if(st<=0||st>=10)return false;
    if(st>=maxParticipantStage())return false;
    if(st===1)return !!server.votes?.s1?.[session.participant];
    if(st===3)return (server.selectedEvidence||[]).length===2;
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
    if(st===0){nav.innerHTML='<span class="muted">Waiting for your group moderator to start the scenario.</span>';return;}
    const behind=st>1;
    const ahead=participantCanAdvance(st);
    const waiting=st<10 && st>=maxParticipantStage();
    nav.innerHTML=`${behind?'<button type="button" class="ghost" id="prevParticipant">← Previous</button>':''}<span class="muted" id="participantProgressNote">${waiting?'You are at the furthest page currently available. Waiting for the moderator to start the next phase.':''}</span>${ahead?'<button type="button" class="primary" id="nextParticipant">Next →</button>':''}`;
    document.querySelector('#prevParticipant')?.addEventListener('click',()=>{viewStage=Math.max(1,st-1);localStorage.setItem(progressKey(),viewStage);renderParticipant();});
    document.querySelector('#nextParticipant')?.addEventListener('click',()=>{viewStage=Math.min(10,st+1,maxParticipantStage());localStorage.setItem(progressKey(),viewStage);renderParticipant();});
  }

  const baseRenderParticipant=renderParticipant;
  renderParticipant=function(){
    const actual=server.stage;
    const st=currentStage();
    if(st===0){
      document.querySelector('#stageKicker').textContent='Waiting';
      document.querySelector('#stageTitle').textContent='Scenario has not started';
      document.querySelector('#stageContent').innerHTML='<section class="card stage-card"><h3>Waiting for the moderator</h3><p>Your group moderator will start the scenario. Once it begins, Stage 1 will appear automatically.</p></section>';
      document.querySelector('#timer').textContent='--:--';
      updateNav();
      return;
    }
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
      const priorRelease=releasedStage(),priorStarted=server.started;
      const r=await callApi('state',{group:session.group,participant:session.participant});
      if(!r?.state)return;
      server=r.state;
      session.recorder=false;
      const newRelease=releasedStage();
      if(priorStarted!==server.started){renderParticipant();return;}
      if(viewStage>maxParticipantStage() && maxParticipantStage()>0)viewStage=maxParticipantStage();
      updateSmallRegions(server);
      if(newRelease!==priorRelease)updateNav();
    }catch(e){console.warn('SPARK partial participant poll failed',e)}
  }

  if(session?.role==='participant'){
    if(pollHandle)clearInterval(pollHandle);
    pollHandle=setInterval(partialPoll,C.POLL_MS||3500);
    refreshState=async function(){
      const r=await callApi('state',{group:session.group,participant:session.participant});
      if(r?.state){server=r.state;session.recorder=false;}
      renderParticipant();
    };
    document.querySelector('#readyBtn')?.remove();
    try{renderParticipant()}catch(e){console.warn('SPARK local progression render deferred',e)}
  }
})();
