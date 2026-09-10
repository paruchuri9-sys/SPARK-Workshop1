(function(){
  // v0.4.1 review refinements: no recorder language, usable scale context,
  // automatic Perspective Challenge assignment when the group has a clear result,
  // and submit -> submitted/next behavior.

  // No recorder/typing instruction is needed. Shared fields are simply shared group work.
  if(typeof recorderOnly==='function') recorderOnly=function(html){return html;};

  // Remove residual explanatory banners introduced by earlier overlays.
  if(typeof stageHtml==='function'){
    const priorStageHtml=stageHtml;

    function clearGroupChoice(votes){
      const vals=Object.values(votes||{}).filter(v=>v&&v.choice);
      const total=vals.length;
      if(!total)return '';
      const dist=Object.fromEntries(D.decisions.map(x=>[x,0]));
      vals.forEach(v=>{if(Object.prototype.hasOwnProperty.call(dist,v.choice))dist[v.choice]++;});
      const max=Math.max(...Object.values(dist));
      const winners=D.decisions.filter(x=>dist[x]===max&&max>0);
      if(max===total)return winners[0]||'';
      if(winners.length===1 && max>total/2)return winners[0];
      return '';
    }
    function challengeFor(choice){
      if(choice==='Proceed' || choice==='Proceed with conditions') return 'Defer pending more information';
      if(choice==='Defer pending more information' || choice==='Oppose') return 'Proceed with conditions';
      return '';
    }

    stageHtml=function(n){
      let html=priorStageHtml(n);
      html=html.replace(/<div class="plain-note"><strong>Shared group work:<\/strong>[^<]*(?:<[^>]+>[^<]*)*?<\/div>/g,'');
      html=html.replace(/<div class="callout"><strong>Group response:<\/strong>[\s\S]*?<\/div>/g,'');

      if(n===7){
        const current=clearGroupChoice(server.votes?.s6||{}) || clearGroupChoice(server.votes?.s5||{});
        const assigned=challengeFor(current);
        if(assigned){
          const opts=D.decisions.map(x=>`<option value="${esc(x)}" ${x===assigned?'selected':''}>${esc(x)}</option>`).join('');
          html=html.replace(/<label>Alternative recommendation<select id="altChoice">[\s\S]*?<\/select><\/label>/,
            `<label>Alternative recommendation<select id="altChoice" aria-label="Assigned alternative recommendation">${opts}</select></label><p class="muted">Because the group's current recommendation is <strong>${esc(current)}</strong>, the Perspective Challenge assigns <strong>${esc(assigned)}</strong> as the alternative to test.</p>`);
        }
      }
      return html;
    };
  }

  // Add locally meaningful scale to electricity information without implying that
  // nameplate solar capacity and continuous data-center demand are equivalent.
  if(window.SPARK_DATA){
    const scale='For local scale, Conway Solar is rated at 132 MW (DC). A 10 MW load is roughly 8% of that nameplate capacity; a possible 1,000 MW load would be more than seven times it. This is only a scale comparison because solar output varies with sunlight.';
    if(D.evidence?.B){
      const i=(D.evidence.B.facts||[]).findIndex(x=>/10 megawatts|10 MW/i.test(x));
      if(i>=0 && !/Conway Solar/.test(D.evidence.B.facts[i])) D.evidence.B.facts[i]+=' '+scale;
    }
    if(Array.isArray(D.stage6Update) && D.stage6Update.length && !/Conway Solar/.test(D.stage6Update[0])){
      D.stage6Update[0]+=' '+scale;
    }
  }

  function submittedButton(button,label){
    if(!button)return;
    button.disabled=false;
    button.classList.remove('primary');
    button.classList.add('secondary-btn');
    const next=document.querySelector('#nextParticipant');
    button.textContent=next?'Response submitted ✓ · Next →':'Response submitted ✓';
    button.onclick=()=>{const n=document.querySelector('#nextParticipant');if(n)n.click();};
  }

  // Replace base stage wiring. Any group member may submit shared work. After a
  // successful submission, the same control becomes a clear submitted/next action.
  if(typeof wireStage==='function'){
    wireStage=function(){
      document.querySelectorAll('input[type=range]').forEach(x=>x.oninput=()=>{const v=document.getElementById(x.id+'v');if(v)v.textContent=`${x.value} / 100`;});

      document.querySelectorAll('.submit-vote').forEach(b=>b.onclick=async()=>{
        const st=+b.dataset.stage;
        const choice=document.querySelector(`input[name=s${st}decision]:checked`)?.value;
        if(!choice)return alert('Choose a recommendation first.');
        const conf=+(document.querySelector(`#s${st}conf`)?.value||50);
        b.disabled=true;b.textContent='Submitting…';
        await callApi('vote',{group:session.group,participant:session.participant,stage:st,choice,confidence:conf});
        if(st===1)await callApi('submit',{group:session.group,participant:session.participant,key:`s1_${session.participant}`,value:{factors:document.querySelector('#s1factors')?.value||'',unknown:document.querySelector('#s1unknown')?.value||''}});
        if(st===6)await callApi('submit',{group:session.group,participant:session.participant,key:`s6_${session.participant}`,value:{why:document.querySelector('#s6why')?.value||'',unknown:document.querySelector('#s6unknown')?.value||''}});
        if(typeof refreshState==='function')await refreshState();
        submittedButton(b,'Response submitted');
      });

      document.querySelectorAll('.group-submit').forEach(b=>b.onclick=async()=>{
        b.disabled=true;b.textContent='Submitting…';
        await callApi('submit',{group:session.group,participant:session.participant,key:b.dataset.key,value:collectScope(b.closest('section'))});
        if(typeof refreshState==='function')await refreshState();
        submittedButton(b,'Response submitted');
      });

      document.querySelector('#selectEvidenceBtn')?.addEventListener('click',async e=>{
        const b=e.currentTarget;
        const ids=[...document.querySelectorAll('input[name=evidence]:checked')].map(x=>x.value);
        if(ids.length!==2)return alert('Choose exactly two evidence packets.');
        b.disabled=true;b.textContent='Submitting…';
        await callApi('selectEvidence',{group:session.group,participant:session.participant,ids});
        await callApi('submit',{group:session.group,participant:session.participant,key:'stage3',value:{ids,why:document.querySelector('#evidenceWhy')?.value||'',questions:document.querySelector('#evidenceQuestions')?.value||''}});
        if(typeof refreshState==='function')await refreshState();
        submittedButton(b,'Response submitted');
      });
    };
  }
})();
