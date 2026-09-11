// Bridge between the GitHub-hosted UI and the Apps Script backend.
(function(){
  const q=new URLSearchParams(location.search);
  const embedded=q.get('embedded')==='1' && window.parent!==window;
  const backend=(window.SPARK_CONFIG&&window.SPARK_CONFIG.API_URL)||'';

  window.SPARK_APPS_SCRIPT=embedded||!!backend;

  const pending=new Map();
  const queued=[];
  let seq=0;
  let relay=null;
  let relayReady=false;

  function Runner(success,failure){
    this.success=success||null;
    this.failure=failure||null;
  }
  Runner.prototype.withSuccessHandler=function(fn){return new Runner(fn,this.failure)};
  Runner.prototype.withFailureHandler=function(fn){return new Runner(this.success,fn)};
  Runner.prototype.api=function(action,payload){
    const id='spark_'+Date.now()+'_'+(++seq);
    pending.set(id,{success:this.success,failure:this.failure});
    const msg={type:'spark-api',id,action,payload:payload||{}};
    if(embedded){
      window.parent.postMessage(msg,'*');
      return;
    }
    if(!backend){
      finish(id,false,null,'No Apps Script backend URL configured');
      return;
    }
    if(relayReady&&relay&&relay.contentWindow){
      relay.contentWindow.postMessage(msg,'*');
    }else{
      queued.push(msg);
    }
  };

  function finish(id,ok,result,error){
    const p=pending.get(id);
    if(!p) return;
    pending.delete(id);
    if(ok){ if(p.success) p.success(result); }
    else if(p.failure) p.failure(new Error(error||'Apps Script request failed'));
  }

  window.google=window.google||{};
  window.google.script=window.google.script||{};
  window.google.script.run=new Runner();

  window.addEventListener('message',function(ev){
    const d=ev.data||{};
    if(embedded){
      if(ev.source!==window.parent) return;
      if(d.type==='spark-api-result'&&d.id) finish(d.id,!!d.ok,d.result,d.error);
      return;
    }
    if(!relay||ev.source!==relay.contentWindow) return;
    if(d.type==='spark-relay-ready'){
      relayReady=true;
      while(queued.length) relay.contentWindow.postMessage(queued.shift(),'*');
      return;
    }
    if(d.type==='spark-api-result'&&d.id) finish(d.id,!!d.ok,d.result,d.error);
  });

  if(!embedded&&backend){
    relay=document.createElement('iframe');
    relay.src=backend+(backend.includes('?')?'&':'?')+'bridge=1';
    relay.setAttribute('aria-hidden','true');
    relay.tabIndex=-1;
    relay.style.cssText='position:fixed;width:1px;height:1px;border:0;opacity:0;pointer-events:none;left:-9999px;top:-9999px';
    document.documentElement.appendChild(relay);
  }
})();
