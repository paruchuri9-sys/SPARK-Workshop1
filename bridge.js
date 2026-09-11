// Bridge between GitHub-hosted UI and the Apps Script parent shell.
(function(){
  const q=new URLSearchParams(location.search);
  const embedded=q.get('embedded')==='1' && window.parent!==window;
  if(!embedded) return;

  window.SPARK_APPS_SCRIPT=true;
  const pending=new Map();
  let seq=0;

  function Runner(success,failure){
    this.success=success||null;
    this.failure=failure||null;
  }
  Runner.prototype.withSuccessHandler=function(fn){return new Runner(fn,this.failure)};
  Runner.prototype.withFailureHandler=function(fn){return new Runner(this.success,fn)};
  Runner.prototype.api=function(action,payload){
    const id='spark_'+Date.now()+'_'+(++seq);
    pending.set(id,{success:this.success,failure:this.failure});
    window.parent.postMessage({type:'spark-api',id,action,payload:payload||{}},'*');
  };

  window.google=window.google||{};
  window.google.script=window.google.script||{};
  window.google.script.run=new Runner();

  window.addEventListener('message',function(ev){
    if(ev.source!==window.parent) return;
    const d=ev.data||{};
    if(d.type!=='spark-api-result'||!d.id) return;
    const p=pending.get(d.id);
    if(!p) return;
    pending.delete(d.id);
    if(d.ok){ if(p.success) p.success(d.result); }
    else if(p.failure) p.failure(new Error(d.error||'Apps Script request failed'));
  });
})();
