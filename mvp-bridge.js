// Standalone bridge for SPARK MVP v0.2.
// Use ?backend=<Apps Script deployment URL> once; the URL is remembered in localStorage.
(function(){
  'use strict';
  const params=new URLSearchParams(location.search);
  const embedded=params.get('embedded')==='1' && window.parent!==window;
  const STORAGE_KEY='spark_mvp_backend_v1';
  const supplied=params.get('backend')||'';
  if(supplied){try{localStorage.setItem(STORAGE_KEY,supplied)}catch(e){}}
  const DEFAULT_BACKEND='https://script.google.com/macros/s/AKfycbwNwTbdbAeKh1Cj3-WuJ0vXAf65ydps_ytJlLLhlnTEBPBkghX0hj85B5iU7egOlq2I/exec';
  let backend=supplied;
  if(!backend){try{backend=localStorage.getItem(STORAGE_KEY)||DEFAULT_BACKEND}catch(e){backend=DEFAULT_BACKEND}}
  const TIMEOUT_MS=90000;
  const pending=new Map();
  const queue=[];
  let seq=0,relay=null,relayReady=false,activeId=null,timer=null;

  function Runner(success,failure){this.success=success||null;this.failure=failure||null}
  Runner.prototype.withSuccessHandler=function(fn){return new Runner(fn,this.failure)};
  Runner.prototype.withFailureHandler=function(fn){return new Runner(this.success,fn)};
  Runner.prototype.api=function(action,payload){
    if(!embedded&&!backend){
      if(this.failure)this.failure(new Error('SPARK backend is not configured yet.'));
      return;
    }
    const id='spark_mvp_'+Date.now()+'_'+(++seq);
    pending.set(id,{success:this.success,failure:this.failure});
    queue.push({type:'spark-mvp-api',id,action,payload:payload||{}});
    pump();
  };

  function ready(){return embedded || (!!backend&&relayReady&&relay&&relay.contentWindow)}
  function pump(){
    if(activeId||!queue.length||!ready())return;
    const msg=queue.shift();activeId=msg.id;
    timer=setTimeout(function(){
      const p=pending.get(msg.id);pending.delete(msg.id);activeId=null;
      if(p&&p.failure)p.failure(new Error('SPARK backend timed out.'));
      pump();
    },TIMEOUT_MS);
    (embedded?window.parent:relay.contentWindow).postMessage(msg,'*');
  }
  function finish(d){
    const p=pending.get(d.id);if(!p)return;
    pending.delete(d.id);if(timer)clearTimeout(timer);timer=null;activeId=null;
    if(d.ok){if(p.success)p.success(d.result)}else if(p.failure)p.failure(new Error(d.error||'SPARK backend request failed'));
    pump();
  }

  window.google=window.google||{};
  window.google.script=window.google.script||{};
  window.google.script.run=new Runner();

  window.addEventListener('message',function(ev){
    const d=ev.data||{};
    if(embedded){
      if(ev.source!==window.parent)return;
      if(d.type==='spark-mvp-api-result')finish(d);
      return;
    }
    if(relay&&ev.source===relay.contentWindow&&d.type==='spark-mvp-relay-ready'){
      relayReady=true;pump();return;
    }
    if(relay&&ev.source===relay.contentWindow&&d.type==='spark-mvp-api-result')finish(d);
  });

  if(!embedded&&backend){
    relay=document.createElement('iframe');
    relay.src=backend+(backend.includes('?')?'&':'?')+'bridge=1';
    relay.setAttribute('aria-hidden','true');
    relay.style.cssText='position:fixed;width:1px;height:1px;border:0;opacity:0;pointer-events:none;left:-9999px;top:-9999px';
    document.documentElement.appendChild(relay);
  }
})();