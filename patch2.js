(function(){
  // v0.3.2 participant polling fix: shared-state polling must never rebuild the
  // current stage while a participant is entering data. Only specific live UI
  // elements are updated in place. A full stage render happens only when the
  // facilitator advances to a different stage.

  function updatePromptOnly(next){
    const b=document.querySelector('#promptBanner');
    if(!b)return;
    if(next.prompt){b.textContent=`Thought prompt: ${next.prompt}`;b.classList.remove('hidden');}
    else b.classList.add('hidden');
  }

  function updateSaveStateOnly(text){
    const s=document.querySelector('#saveState');
    if(s)s.textContent=text||'';
  }

  async function participantPollPartial(){
    try{
      const r=await callApi('state',{group:session.group,participant:session.participant});
      if(!r||!r.state)return;
      const next=r.state;
      const priorStage=server?.stage||1;
      const priorRecorder=server?.recorder||'';

      // Update the shared state object first so the existing timer sees a changed
      // deadline without any DOM replacement.
      server=next;
      session.recorder=next.recorder===session.participant;

      // Stage change is the one event allowed to replace stageContent.
      if((next.stage||1)!==priorStage){
        renderParticipant();
        return;
      }

      // Same-stage changes are granular. Never touch #stageContent here.
      updatePromptOnly(next);

      // Recorder assignment normally occurs before Stage 2. Do not rebuild the
      // page when assignment changes because that would destroy in-progress text.
      // The new recorder gets entry controls at the next stage transition.
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

  if(session?.role==='participant'){
    // The original interval captured the old refreshState function before the
    // earlier patch loaded. Explicitly remove it and install the granular poller.
    if(pollHandle)clearInterval(pollHandle);
    pollHandle=setInterval(participantPollPartial,C.POLL_MS||3500);

    // Future joins should also use the granular implementation.
    refreshState=participantPollPartial;
  }
})();
