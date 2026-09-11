// Bridge between the GitHub-hosted UI and the Apps Script backend.
// Supports both the v2.1 dedicated ?bridge=1 relay and the older v2.0 shell.
(function(){
  const q=new URLSearchParams(location.search);
  const embedded=q.get('embedded')==='1' && window.parent!==window;
  const DEFAULT_BACKEND='https://script.google.com/macros/s/AKfycbydRLKhrr2McY3IeZ9T0Pe1lA9a3BNoL7Rz-Hd557_clOwEiwL1kFwcuqCu48tdOA6V8Q/exec';
  const backend=(window.SPARK_CONFIG&&window.SPARK_CONFIG.API_URL)||DEFAULT_BACKEND;
  const GH_ORIGIN=location.origin;

  window.SPARK_APPS_SCRIPT=embedded||!!backend;

  const pending=new Map();
  const queued=[];
  let seq=0;
  let relay=null;
  let relayReady=false;
  let fallbackReadyTimer=null;

  function Runner(success,failure){
    this.success=success||null;
    this.failure=failure||null;
  }
  Runner.prototype.withSuccessHandler=function(fn){return new Runner(fn,this.failure)};
  Runner.prototype.withFailureHandler=function(fn){return new Runner(this.success,fn)};
  Runner.prototype.api=function(action,payload){
    const id='spark_'+Date.now()+'_'+(++seq)+'_'+Math.random().toString(36).slice(2,8);
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
    if(!p) return false;
    pending.delete(id);
    if(ok){ if(p.success) p.success(result); }
    else if(p.failure) p.failure(new Error(error||'Apps Script request failed'));
    return true;
  }

  function markReady(){
    if(relayReady) return;
    relayReady=true;
    if(fallbackReadyTimer){clearTimeout(fallbackReadyTimer);fallbackReadyTimer=null;}
    while(queued.length&&relay&&relay.contentWindow){
      relay.contentWindow.postMessage(queued.shift(),'*');
    }
  }

  window.google=window.google||{};
  window.google.script=window.google.script||{};
  window.google.script.run=new Runner();

  window.addEventListener('message',function(ev){
    const d=ev.data||{};

    if(embedded){
      if(ev.source!==window.parent) return;
      if(d.type==='spark-api-result'&&d.id){
        // Normal embedded request: consume locally. Legacy-shell compatibility:
        // if this nested GitHub frame did not originate the request, forward
        // the Apps Script result to the outer GitHub page.
        if(!finish(d.id,!!d.ok,d.result,d.error) && window.top!==window){
          window.top.postMessage(d,'*');
        }
      }
      return;
    }

    if(d.type==='spark-relay-ready'&&relay&&ev.source===relay.contentWindow){
      markReady();
      return;
    }

    if(d.type==='spark-api-result'&&d.id&&pending.has(d.id)){
      // v2.1 replies arrive from the relay iframe. With the legacy v2.0
      // shell, the result is forwarded by its nested GitHub frame, so its
      // source is different but its origin is this GitHub Pages origin.
      if((relay&&ev.source===relay.contentWindow)||ev.origin===GH_ORIGIN){
        finish(d.id,!!d.ok,d.result,d.error);
      }
    }
  });

  if(!embedded&&backend){
    relay=document.createElement('iframe');
    relay.src=backend+(backend.includes('?')?'&':'?')+'bridge=1';
    relay.setAttribute('aria-hidden','true');
    relay.tabIndex=-1;
    relay.style.cssText='position:fixed;width:1px;height:1px;border:0;opacity:0;pointer-events:none;left:-9999px;top:-9999px';
    // A v2.1 relay announces readiness itself. The older shell does not, so
    // after its iframe finishes loading give its nested GitHub page a moment
    // to initialize, then treat it as ready.
    relay.addEventListener('load',function(){
      if(!relayReady){
        fallbackReadyTimer=setTimeout(markReady,1200);
      }
    });
    document.documentElement.appendChild(relay);
  }
})();
