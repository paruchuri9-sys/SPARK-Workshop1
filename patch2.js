(function(){
  // v0.3.3 participant polling fix. The earlier fix could still lose a race with
  // the async boot sequence: app.js could install its old full-render interval
  // after this patch had loaded. We take ownership of polling after boot settles.

  function updatePromptOnly(next){
    const b=document.querySelector('#promptBanner');
    if(!b)return;
    if(next.prompt){
      b.textContent=`Thought prompt: ${next.prompt}`;
      b.classList.remove('hidden');
    }else{
      b.textContent='';
      b.classList.add('hidden');
    }
  }

  function updateSaveStateOnly(text){
    const s=document.querySelector('#saveState');
    if(s)s.textContent=text||'';
  }

  function updateVoteSummaryOnly(stage,next){
    if(![5,6,8].includes(stage))return;
    const cards=[...document.querySelectorAll('#stageContent .card')];
    const current=cards.find(card=>card.querySelector('.eyebrow')?.textContent.trim()==='Current group result');
    if(!current)return;
    const temp=document.createElement('div');
    temp.innerHTML=voteSummaryHtml(next.votes?.[`s${stage}`]||{});
    const replacement=temp.firstElementChild;
    if(replacement)current.replaceWith(replacement);
  }

  async function participantPollPartial(){
    try{
      if(!session?.participant)return;
      const r=await callApi('state',{group:session.group,participant:session.participant});
      if(!r||!r.state)return;

      const next=r.state;
      const priorStage=server?.stage||1;
      const priorRecorder=server?.recorder||'';
      const priorVotes=JSON.stringify(server?.votes?.[`s${priorStage}`]||{});

      // Replacing the entire stage is permitted only when the facilitator advances
      // to a different stage. All normal polling updates mutate small DOM regions.
      server=next;
      session.recorder=next.recorder===session.participant;

      if((next.stage||1)!==priorStage){
        renderParticipant();
        return;
      }

      updatePromptOnly(next);

      // The timer loop reads server.deadline directly, so updating server above is
      // sufficient. No timer DOM or stage DOM replacement is needed here.

      const nextVotes=JSON.stringify(next.votes?.[`s${priorStage}`]||{});
      if(nextVotes!==priorVotes)updateVoteSummaryOnly(priorStage,next);

      // Recorder assignment is intentionally non-destructive. We tell the user now;
      // shared-entry controls become active on the next stage render.
      if((next.recorder||'')!==priorRecorder){
        const msg=session.recorder
          ? 'You are now the group recorder. Shared-entry controls will appear at the next stage.'
          : (next.recorder?`${next.recorder} is the group recorder.`:'Recorder not yet assigned.');
        updateSaveStateOnly(msg);
      }
    }catch(e){
      console.warn('SPARK participant state poll failed',e);
    }
  }

  function takeOwnershipOfParticipantPolling(){
    if(session?.role!=='participant')return;
    refreshState=participantPollPartial;
    if(pollHandle)clearInterval(pollHandle);
    pollHandle=setInterval(participantPollPartial,C.POLL_MS||3500);
  }

  // Run immediately, then again after the async boot/join path has had time to
  // install any legacy interval. The delayed takeover is what closes the race.
  takeOwnershipOfParticipantPolling();
  setTimeout(takeOwnershipOfParticipantPolling,750);
  setTimeout(takeOwnershipOfParticipantPolling,2000);
})();
