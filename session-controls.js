// Small session/navigation controls for workshop testing and role/group changes.
(function(){
  const headerRight=document.querySelector('.header-right');
  const joinView=document.getElementById('joinView');
  const workshopView=document.getElementById('workshopView');
  const waitingView=document.getElementById('waitingView');
  const facilitatorView=document.getElementById('facilitatorView');
  if(!headerRight||!joinView||!workshopView) return;

  const btn=document.createElement('button');
  btn.type='button';
  btn.id='changeSessionBtn';
  btn.className='secondary-btn hidden';
  btn.textContent='Change name / role / group';
  btn.style.marginLeft='8px';
  headerRight.appendChild(btn);

  function syncButton(){
    btn.classList.toggle('hidden',workshopView.classList.contains('hidden'));
  }

  btn.addEventListener('click',function(){
    try{ if(typeof pollHandle!=='undefined'&&pollHandle){clearInterval(pollHandle);pollHandle=null;} }catch(e){}
    try{ if(typeof timerHandle!=='undefined'&&timerHandle){clearInterval(timerHandle);timerHandle=null;} }catch(e){}

    workshopView.classList.add('hidden');
    if(waitingView) waitingView.classList.add('hidden');
    if(facilitatorView) facilitatorView.classList.add('hidden');
    joinView.classList.remove('hidden');

    // Preserve the current name as a convenience, but require role/group selection again.
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
    if(role) role.value='participant';
    const modWrap=document.getElementById('moderatorCodeWrap');
    if(modWrap) modWrap.classList.add('hidden');
    const modCode=document.getElementById('moderatorCode');
    if(modCode) modCode.value='';
    syncButton();
  });

  const obs=new MutationObserver(syncButton);
  obs.observe(workshopView,{attributes:true,attributeFilter:['class']});
  syncButton();
})();
