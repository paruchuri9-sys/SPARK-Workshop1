(function(){
  // UI refinements after pilot review. This file intentionally overlays v0.3 behavior
  // so the GitHub Pages preview stays lightweight while the Apps Script runtime evolves.
  const addCss=css=>{const st=document.createElement('style');st.textContent=css;document.head.appendChild(st)};
  addCss(`
    .choice{margin:0;display:flex!important;align-items:center;gap:10px;border:2px solid #cfc7d5;border-radius:10px;padding:12px;background:#fff;font-weight:700;cursor:pointer}
    .choice input{position:static!important;opacity:1!important;pointer-events:auto!important;width:18px!important;height:18px!important;margin:0!important;accent-color:#582C83;flex:0 0 auto}
    .choice span{display:block!important;border:0!important;padding:0!important;background:transparent!important;box-shadow:none!important}
    .choice:has(input:checked){border-color:#582C83;background:#f1edf5;box-shadow:0 0 0 2px rgba(88,44,131,.12)}
    #facGroup{display:none!important}
  `);

  if(typeof stakeholderHtml==='function'){
    stakeholderHtml=function(){
      const people=(window.SPARK_DATA?.stakeholders||[]).map(x=>`<span class="stakeholder">${esc(x)}</span>`).join('');
      return `<details><summary>Stakeholders who may be affected</summary><div class="stakeholders">${people}</div><p class="muted"><strong>Reference context only.</strong> There is nothing to answer or submit here, and you are not assigned a stakeholder role.</p></details>`;
    };
  }

  if(typeof stageHtml==='function'){
    const oldStageHtml=stageHtml;
    stageHtml=function(n){
      let html=oldStageHtml(n);
      if(n===1){
        html=html.replace('Treat the information below as the <strong>current project record</strong>. It is not necessarily complete. You may question meaning, sufficiency, assumptions, source quality and what still needs verification.', '<strong>Starting record:</strong> The information below is currently available to the Community Advisory Team. Use it as the basis for your initial judgment. Some project details may still be incomplete or unsettled.');
      }
      return html;
    };
  }

  // Static preview recorder support. In the synchronized Apps Script version the
  // facilitator assignment is stored in the group backend instead of browser storage.
  if(typeof demoApi==='function'){
    const oldDemoApi=demoApi;
    demoApi=async function(action,payload){
      if(action==='facilitator' && payload?.patch && Object.prototype.hasOwnProperty.call(payload.patch,'recorder')){
        const d=demoLoad();
        d.state=d.state||{};
        d.state.recorderByGroup=d.state.recorderByGroup||{};
        d.state.recorderByGroup[payload.group]=payload.patch.recorder||'';
        demoSave(d);
        return {ok:true};
      }
      const r=await oldDemoApi(action,payload);
      if(action==='state' && r?.state){
        const d=demoLoad();
        r.state.recorder=d.state?.recorderByGroup?.[payload.group]||'';
      }
      return r;
    };
  }

  if(typeof recorderOnly==='function'){
    recorderOnly=function(html){
      if(session.recorder)return html;
      const who=server.recorder?`<strong>${esc(server.recorder)}</strong> is the group recorder.`:'The facilitator will assign a recorder when group entry is needed.';
      return `<div class="callout"><strong>Group discussion:</strong> ${who} Everyone participates; only the recorder enters the shared group artifact.</div>`;
    };
  }

  if(typeof refreshState==='function'){
    refreshState=async function(){
      const r=await callApi('state',{group:session.group,participant:session.participant});
      if(r.state){server=r.state;session.recorder=server.recorder===session.participant;}
      renderParticipant();
    };
  }

  if(typeof renderFacilitator==='function'){
    const oldRenderFacilitator=renderFacilitator;
    renderFacilitator=function(){
      oldRenderFacilitator();
      const selector=document.querySelector('#facGroup');
      if(selector)selector.remove();
      const firstCard=document.querySelector('#facilitatorView section.card');
      if(!firstCard)return;
      const row=document.createElement('div');
      row.className='fac-toolbar';
      row.style.marginTop='14px';
      const options=(server.participants||[]).map(p=>`<option value="${esc(p.participant)}" ${server.recorder===p.participant?'selected':''}>${esc(p.participant)}</option>`).join('');
      row.innerHTML=`<strong>Group ${esc(session.group)} recorder:</strong><select id="recorderAssign"><option value="">Not assigned</option>${options}</select><button class="secondary-btn" id="assignRecorderBtn">Assign recorder</button><span class="muted">Assign after participants join; it does not need to be decided before the workshop starts.</span>`;
      firstCard.appendChild(document.createElement('hr'));
      firstCard.appendChild(row);
      document.querySelector('#assignRecorderBtn').onclick=async()=>{
        await callApi('facilitator',{group:session.group,patch:{recorder:document.querySelector('#recorderAssign').value}});
        await facilitatorState();
      };
    };
  }

  // Re-render an already-open stage so the refinements appear immediately.
  try{
    if(session?.role==='participant' && document.querySelector('#workshopView') && !document.querySelector('#workshopView').classList.contains('hidden')) renderParticipant();
    if(session?.role==='facilitator' && document.querySelector('#facilitatorView') && !document.querySelector('#facilitatorView').classList.contains('hidden')) renderFacilitator();
  }catch(e){console.warn('SPARK patch re-render deferred',e)}
})();
