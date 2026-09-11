// Workshop session/navigation controls.
(function(){
  const joinView=document.getElementById('joinView');
  const workshopView=document.getElementById('workshopView');
  const waitingView=document.getElementById('waitingView');
  const facilitatorView=document.getElementById('facilitatorView');
  if(!joinView||!workshopView) return;

  function stopTimers(){
    try{ if(typeof pollHandle!=='undefined'&&pollHandle){clearInterval(pollHandle);pollHandle=null;} }catch(e){}
    try{ if(typeof timerHandle!=='undefined'&&timerHandle){clearInterval(timerHandle);timerHandle=null;} }catch(e){}
  }

  function returnToJoin(){
    stopTimers();
    workshopView.classList.add('hidden');
    if(waitingView) waitingView.classList.add('hidden');
    if(facilitatorView) facilitatorView.classList.add('hidden');
    joinView.classList.remove('hidden');

    const name=document.getElementById('participantName');
    try{ if(name&&typeof session!=='undefined'&&session.name) name.value=session.name; }catch(e){}

    document.querySelectorAll('.group-card').forEach(x=>x.classList.remove('selected'));
    try{
      if(typeof session!=='undefined'){
        session.role='participant';
        session.group='';
        session.key='';
      }
    }catch(e){}

    const role=document.getElementById('entryRole');
    if(role){
      role.value='participant';
      role.dispatchEvent(new Event('change'));
    }
    const modWrap=document.getElementById('moderatorCodeWrap');
    if(modWrap) modWrap.classList.add('hidden');
    const modCode=document.getElementById('moderatorCode');
    if(modCode) modCode.value='';
    window.scrollTo({top:0,behavior:'instant'});
  }

  const back=document.getElementById('backToJoinBtn');
  if(back) back.addEventListener('click',returnToJoin);

  // Secondary copy in the header for wide screens.
  const headerRight=document.querySelector('.header-right');
  if(headerRight){
    const btn=document.createElement('button');
    btn.type='button';
    btn.id='changeSessionBtn';
    btn.className='secondary-btn hidden';
    btn.textContent='Change group';
    btn.style.marginLeft='8px';
    headerRight.appendChild(btn);
    btn.addEventListener('click',returnToJoin);
    const sync=()=>btn.classList.toggle('hidden',workshopView.classList.contains('hidden'));
    new MutationObserver(sync).observe(workshopView,{attributes:true,attributeFilter:['class']});
    sync();
  }
})();
