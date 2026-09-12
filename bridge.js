// Bridge between the GitHub-hosted UI and the Apps Script backend.
// Requests are serialized to avoid postMessage races, but each transport
// request has its own watchdog so one lost reply cannot freeze the queue.
(function(){
  'use strict';
  const q=new URLSearchParams(location.search);
  const embedded=q.get('embedded')==='1' && window.parent!==window;
  const DEFAULT_BACKEND='https://script.google.com/macros/s/AKfycbydRLKhrr2McY3IeZ9T0Pe1lA9a3BNoL7Rz-Hd557_clOwEiwL1kFwcuqCu48tdOA6V8Q/exec';
  const backend=(window.SPARK_CONFIG&&window.SPARK_CONFIG.API_URL)||DEFAULT_BACKEND;
  const GH_ORIGIN=location.origin;
  const TRANSPORT_TIMEOUT_MS=12000;

  window.SPARK_APPS_SCRIPT=embedded||!!backend;

  const pending=new Map();
  const outbound=[];
  let seq=0;
  let relay=null;
  let relayReady=false;
  let fallbackReadyTimer=null;
  let activeId=null;
  let activeWatchdog=null;
  let pumpTimer=null;

  function Runner(success,failure){
    this.success=success||null;
    this.failure=failure||null;
  }
  Runner.prototype.withSuccessHandler=function(fn){return new Runner(fn,this.failure)};
  Runner.prototype.withFailureHandler=function(fn){return new Runner(this.success,fn)};
  Runner.prototype.api=function(action,payload){
    const id='spark_'+Date.now()+'_'+(++seq)+'_'+Math.random().toString(36).slice(2,8);
    pending.set(id,{success:this.success,failure:this.failure,action:action});
    outbound.push({type:'spark-api',id,action,payload:payload||{}});
    pump();
  };

  function transportReady(){
    if(embedded)return true;
    return !!(backend&&relayReady&&relay&&relay.contentWindow);
  }

  function clearActive(){
    if(activeWatchdog){clearTimeout(activeWatchdog);activeWatchdog=null;}
    activeId=null;
  }

  function send(msg){
    activeId=msg.id;
    activeWatchdog=setTimeout(function(){
      if(activeId!==msg.id)return;
      const p=pending.get(msg.id);
      pending.delete(msg.id);
      clearActive();
      try{
        if(p&&p.failure)p.failure(new Error('Backend relay timed out; retrying is safe.'));
      }finally{
        // Continue with queued requests rather than deadlocking the page.
        pump(150);
      }
    },TRANSPORT_TIMEOUT_MS);

    if(embedded){
      window.parent.postMessage(msg,'*');
    }else{
      relay.contentWindow.postMessage(msg,'*');
    }
  }

  function pump(delay){
    if(pumpTimer){clearTimeout(pumpTimer);pumpTimer=null;}
    const run=function(){
      if(activeId||!outbound.length||!transportReady())return;
      send(outbound.shift());
    };
    if(delay)pumpTimer=setTimeout(run,delay);else run();
  }

  function finish(id,ok,result,error){
    const p=pending.get(id);
    if(!p)return false;
    pending.delete(id);
    if(activeId===id)clearActive();
    try{
      if(ok){if(p.success)p.success(result);}
      else if(p.failure)p.failure(new Error(error||'Apps Script request failed'));
    }finally{
      // Small gap prevents the next postMessage from racing the shell
      // immediately after google.script.run completes.
      pump(150);
    }
    return true;
  }

  function markReady(){
    if(relayReady)return;
    relayReady=true;
    if(fallbackReadyTimer){clearTimeout(fallbackReadyTimer);fallbackReadyTimer=null;}
    pump();
  }

  window.google=window.google||{};
  window.google.script=window.google.script||{};
  window.google.script.run=new Runner();

  window.addEventListener('message',function(ev){
    const d=ev.data||{};

    if(embedded){
      if(ev.source!==window.parent)return;
      if(d.type==='spark-api-result'&&d.id){
        if(!finish(d.id,!!d.ok,d.result,d.error)&&window.top!==window){
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
    relay.addEventListener('load',function(){
      if(!relayReady)fallbackReadyTimer=setTimeout(markReady,1200);
    });
    document.documentElement.appendChild(relay);
  }
})();