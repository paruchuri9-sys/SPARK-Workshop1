// SPARK MVP bridge: Apps Script hosts the live session.
// Top-level GitHub visits hand off to Apps Script; embedded visits use parent postMessage.
(function(){
  'use strict';
  const params=new URLSearchParams(location.search);
  const embedded=params.get('embedded')==='1' && window.parent!==window;
  const BACKEND='https://script.google.com/macros/s/AKfycbyB05iGL0akpTF5l-vq9aeCdCLlOMSFgegmXYsmyaqSUvclHtnzM-otGPY4tKOdtv7c/exec';
  const TIMEOUT_MS=90000;
  const pending=new Map();
  let seq=0;

  if(!embedded){
    location.replace(BACKEND);
    return;
  }

  function Runner(success,failure){this.success=success||null;this.failure=failure||null}
  Runner.prototype.withSuccessHandler=function(fn){return new Runner(fn,this.failure)};
  Runner.prototype.withFailureHandler=function(fn){return new Runner(this.success,fn)};
  Runner.prototype.api=function(action,payload){
    const id='spark_mvp_'+Date.now()+'_'+(++seq);
    const timeout=setTimeout(function(){
      const p=pending.get(id);
      if(!p)return;
      pending.delete(id);
      if(p.failure)p.failure(new Error('SPARK backend timed out.'));
    },TIMEOUT_MS);
    pending.set(id,{success:this.success,failure:this.failure,timeout});
    window.parent.postMessage({type:'spark-mvp-api',id,action,payload:payload||{}},'*');
  };

  window.google=window.google||{};
  window.google.script=window.google.script||{};
  window.google.script.run=new Runner();

  window.addEventListener('message',function(ev){
    if(ev.source!==window.parent)return;
    const d=ev.data||{};
    if(d.type!=='spark-mvp-api-result'||!d.id)return;
    const p=pending.get(d.id);
    if(!p)return;
    pending.delete(d.id);
    clearTimeout(p.timeout);
    if(d.ok){if(p.success)p.success(d.result)}
    else if(p.failure)p.failure(new Error(d.error||'SPARK backend request failed'));
  });
})();