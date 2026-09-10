(function(){
  // v0.4: moderator-led phase release, no assigned recorder, and lighter evidence packets.
  const reviewMode=new URLSearchParams(location.search).get('review')==='1';

  // Everyone can participate in entering the shared group response. The group can
  // decide naturally who types; the web app no longer assigns a recorder role.
  if(typeof recorderOnly==='function'){
    recorderOnly=function(html){
      return `<div class="callout"><strong>Group response:</strong> Discuss together. Anyone in the group may enter or edit the shared response. Decide naturally who will type.</div>${html}`;
    };
  }

  // Make evidence packets scan-first. Keep full detail available on demand rather
  // than forcing every participant to read every bullet before deciding what matters.
  if(typeof evidenceCard==='function'){
    evidenceCard=function(id){
      const e=D.evidence[id];
      if(!e)return '';
      const facts=(e.facts||[]), unknowns=(e.unknowns||[]);
      const visibleFacts=facts.slice(0,3), extraFacts=facts.slice(3);
      const visibleUnknowns=unknowns.slice(0,2), extraUnknowns=unknowns.slice(2);
      const extra=(extraFacts.length||extraUnknowns.length)?`<details><summary>More detail</summary>${extraFacts.length?`<strong>Additional information</strong><ul>${extraFacts.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${extraUnknowns.length?`<strong>Other unresolved questions</strong><ul>${extraUnknowns.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}<div class="source-note"><strong>Source status:</strong> ${esc(e.source||'')}</div></details>`:`<div class="source-note"><strong>Source status:</strong> ${esc(e.source||'')}</div>`;
      return `<article class="evidence-card"><h4>${id}. ${esc(e.title)}</h4><div class="source-note"><strong>Quick read</strong></div><ul>${visibleFacts.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><strong>Questions that still matter</strong><ul>${visibleUnknowns.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>${extra}</article>`;
    };
  }

  // Lightly rewrite group-stage instructions so the absence of a recorder is clear.
  if(typeof stageHtml==='function'){
    const priorStageHtml=stageHtml;
    stageHtml=function(n){
      let html=priorStageHtml(n);
      if([2,3,4,5,7,8,9,10].includes(n)){
        html=html.replace('<section class="card stage-card">', '<section class="card stage-card"><div class="plain-note"><strong>Shared group work:</strong> Your group decides how to enter one shared response; no recorder is assigned.</div>');
      }
      if(n===3){
        html=html.replace('Lock evidence selection','Confirm group evidence choice');
      }
      return html;
    };
  }

  // Static preview backend: maintain release/start state per group so a moderator
  // controls only the group they are assigned to.
  if(typeof demoApi==='function'){
    const priorDemoApi=demoApi;
    demoApi=async function(action,payload){
      const group=String(payload?.group||session.group||'1');
      const d=demoLoad();
      d.state=d.state||{};
      d.state.groupControl=d.state.groupControl||{};
      d.state.groupControl[group]=d.state.groupControl[group]||{started:false,stage:1,deadline:null,prompt:''};
      const ctrl=d.state.groupControl[group];
      if(action==='facilitator'){
        const patch=payload?.patch||{};
        if(Object.prototype.hasOwnProperty.call(patch,'started')) ctrl.started=!!patch.started;
        if(Object.prototype.hasOwnProperty.call(patch,'stage')){
          ctrl.stage=Math.max(1,Math.min(10,Number(patch.stage)||1));
          ctrl.deadline=Date.now()+((STAGES[ctrl.stage-1]?.mins||5)*60000);
          ctrl.prompt='';
        }
        if(Object.prototype.hasOwnProperty.call(patch,'deadline')) ctrl.deadline=Number(patch.deadline)||null;
        if(Object.prototype.hasOwnProperty.call(patch,'prompt')) ctrl.prompt=String(patch.prompt||'');
        demoSave(d);
        return {ok:true};
      }
      const r=await priorDemoApi(action,payload);
      if(action==='state' && r?.state){
        const current=demoLoad().state?.groupControl?.[group]||ctrl;
        r.state.started=!!current.started;
        r.state.stage=current.stage||1;
        r.state.deadline=current.deadline||null;
        r.state.prompt=current.prompt||'';
        r.state.recorder='';
      }
      return r;
    };
  }

  // Moderator terminology and controls. Existing facilitator mechanics are reused,
  // but each moderator stays tied to the group encoded in the moderator entry URL.
  if(typeof renderFacilitator==='function'){
    const priorRenderFacilitator=renderFacilitator;
    renderFacilitator=function(){
      priorRenderFacilitator();
      const view=document.querySelector('#facilitatorView');
      if(!view)return;
      document.querySelector('#roleBadge').textContent='Moderator';
      view.querySelectorAll('*').forEach(el=>{
        if(el.childNodes.length===1 && el.firstChild?.nodeType===3){
          el.textContent=el.textContent.replace(/Facilitator/g,'Moderator').replace(/facilitator/g,'moderator');
        }
      });
      view.querySelector('#facGroup')?.remove();
      view.querySelector('#recorderAssign')?.closest('.fac-toolbar')?.remove();
      view.querySelectorAll('.metric').forEach(m=>{if(/ready/i.test(m.textContent))m.remove();});
      const next=view.querySelector('#nextStage');
      const prev=view.querySelector('#prevStage');
      if(next){
        if(!server.started){
          next.textContent='Start scenario →';
          next.onclick=()=>facPatch({started:true,stage:1});
          if(prev)prev.disabled=true;
        }else{
          next.textContent=server.stage>=STAGES.length?'Final phase active':'Start next phase →';
          next.disabled=server.stage>=STAGES.length;
          if(server.stage<STAGES.length)next.onclick=()=>facPatch({stage:server.stage+1});
        }
      }
      const bar=view.querySelector('.stagebar .eyebrow');
      if(bar)bar.textContent=`Moderator · Group ${session.group}`;
      if(!server.started){
        const h=view.querySelector('.stagebar h2');
        if(h)h.textContent='Waiting to start scenario';
        const timer=view.querySelector('#timer');if(timer)timer.textContent='--:--';
      }
    };
  }

  // Review mode remains unrestricted for PI/core-educator page-by-page review.
  if(reviewMode){
    document.querySelector('#roleBadge').textContent='Core educator / PI review';
  }
})();
