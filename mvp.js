(function(){
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const state={sourceText:'',fileName:'',gradeCourse:'',subject:'',availableTime:10,objective:'',preserve:'',avoid:'',moments:[],selected:null,artifact:null,sessionId:'mvp_'+Date.now()+'_'+Math.random().toString(36).slice(2,8)};
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function nl(s){return esc(s).replace(/\n/g,'<br>')}
function busy(title,text){$('#busyTitle').textContent=title;$('#busyText').textContent=text||'';$('#busy').classList.remove('hidden')}
function unbusy(){$('#busy').classList.add('hidden')}
function err(id,msg){const el=$(id);el.textContent=msg||'';el.classList.toggle('hidden',!msg)}
function call(action,payload){return new Promise((resolve,reject)=>{try{google.script.run.withSuccessHandler(r=>r&&r.ok===false?reject(new Error(r.error||'Request failed')):resolve(r)).withFailureHandler(e=>reject(new Error(e?.message||String(e)))).api(action,payload||{})}catch(e){reject(e)}})}
function log(event,detail){call('mvpEvent',{sessionId:state.sessionId,event,detail:detail||{}}).catch(()=>{})}
function showPage(n){$$('.page').forEach((p,i)=>p.classList.toggle('hidden',i!==n-1));$$('.step').forEach((s,i)=>{s.classList.toggle('active',i===n-1);if(i<n)s.disabled=false});window.scrollTo({top:0,behavior:'smooth'})}
function selectedTime(){return Number($('#timeChoices .selected')?.dataset.minutes||10)}
$$('#timeChoices button').forEach(b=>b.addEventListener('click',()=>{$$('#timeChoices button').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');state.availableTime=Number(b.dataset.minutes)}));

async function extractFile(file){
  if(!file)return '';
  const name=file.name.toLowerCase();
  $('#fileStatus').textContent='Reading '+file.name+'…';
  if(name.endsWith('.txt')||name.endsWith('.md')) return await file.text();
  if(name.endsWith('.docx')){
    if(!window.mammoth)throw new Error('DOCX reader did not load. Paste the text instead.');
    const result=await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
    return result.value||'';
  }
  if(name.endsWith('.pdf')){
    const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
    const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    let out='';
    for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const content=await page.getTextContent();out+=content.items.map(x=>x.str).join(' ')+'\n';}
    return out;
  }
  throw new Error('Unsupported file type. Use TXT, MD, PDF, DOCX, or paste the activity.');
}
$('#activityFile').addEventListener('change',async e=>{try{const f=e.target.files?.[0];if(!f)return;const text=await extractFile(f);state.fileName=f.name;$('#activityText').value=text;$('#fileStatus').textContent=f.name+' · '+text.length.toLocaleString()+' characters extracted';}catch(ex){err('#page1Error',ex.message);$('#fileStatus').textContent='Could not read file.'}});

$('#findBtn').addEventListener('click',async()=>{
  err('#page1Error','');
  state.sourceText=$('#activityText').value.trim();
  state.gradeCourse=$('#gradeCourse').value.trim();
  state.subject=$('#subject').value.trim();
  state.availableTime=selectedTime();
  state.objective=$('#objective').value.trim();
  state.preserve=$('#preserve').value.trim();
  state.avoid=$('#avoid').value.trim();
  if(state.sourceText.length<80)return err('#page1Error','Please upload or paste enough of the activity for SPARK to analyze.');
  if(!state.gradeCourse)return err('#page1Error','Add the grade level or course.');
  busy('SPARK is finding consequential moments…','Looking for places where student judgment could meaningfully change.');
  try{
    const r=await call('mvpUncover',{sessionId:state.sessionId,sourceText:state.sourceText,fileName:state.fileName,gradeCourse:state.gradeCourse,subject:state.subject,availableTime:state.availableTime,objective:state.objective,preserve:state.preserve,avoid:state.avoid});
    state.moments=r.moments||[];
    if(!state.moments.length)throw new Error('SPARK did not find a strong enough opportunity in this activity.');
    state.selected=null;renderMoments();showPage(2);log('moments_shown',{count:state.moments.length});
  }catch(ex){err('#page1Error',ex.message||String(ex))}finally{unbusy()}
});

function renderMoments(){
  $('#momentsHeading').textContent='SPARK found '+state.moments.length+' places worth considering';
  $('#momentsList').innerHTML=state.moments.map((m,i)=>`<article class="card moment-card" data-id="${esc(m.id)}">
    <div class="moment-title"><div style="display:flex;gap:10px"><span class="moment-number">${i+1}</span><div><h3>${esc(m.title)}</h3></div></div></div>
    <div class="meta-grid">
      <div class="meta-block"><strong>Where</strong>${nl(m.source_location)}</div>
      <div class="meta-block"><strong>Students currently</strong>${nl(m.current_task)}</div>
    </div>
    <div class="meta-block"><strong>Opportunity</strong>${nl(m.consequential_judgment)}</div>
    <p><strong>Why it matters:</strong> ${nl(m.why_it_matters)}</p>
    <div class="focus">${esc(m.reasoning_focus)}</div>
    <div class="option-list">${(m.options||[]).filter(o=>Number(o.minutes)<=state.availableTime||state.availableTime>=30).map(o=>`<div class="activity-option" data-minutes="${o.minutes}"><button type="button" data-choose="${o.minutes}">${o.minutes} min</button><div class="option-copy"><strong>${esc(o.label)}</strong><span>${nl(o.description)}</span></div></div>`).join('')}</div>
    <div class="card-actions"><button class="primary" data-use>Use this</button><button class="ghost" data-adjust>Adjust</button><button class="secondary-btn" data-skip>Skip</button></div>
    <div class="adjust-panel hidden"><label>What would you change?<textarea data-adjust-text placeholder="e.g., Make it shorter, make it more challenging, better fit my students…"></textarea></label><button class="ghost" data-apply-adjust>Use with adjustment</button></div>
  </article>`).join('');
  $$('.moment-card').forEach(card=>{
    card.addEventListener('click',e=>{
      const id=card.dataset.id,m=state.moments.find(x=>String(x.id)===id);if(!m)return;
      if(e.target.dataset.choose){choose(m,Number(e.target.dataset.choose),card,'');return}
      if(e.target.hasAttribute('data-use')){const first=(m.options||[]).filter(o=>Number(o.minutes)<=state.availableTime||state.availableTime>=30)[0];choose(m,Number(first?.minutes||Math.min(10,state.availableTime)),card,'');return}
      if(e.target.hasAttribute('data-adjust')){card.querySelector('.adjust-panel').classList.toggle('hidden');return}
      if(e.target.hasAttribute('data-apply-adjust')){const note=card.querySelector('[data-adjust-text]').value.trim();const first=(m.options||[]).filter(o=>Number(o.minutes)<=state.availableTime||state.availableTime>=30)[0];choose(m,Number(first?.minutes||Math.min(10,state.availableTime)),card,note);return}
      if(e.target.hasAttribute('data-skip')){card.classList.add('skipped');if(state.selected?.moment.id===m.id){state.selected=null;updateSelection()}log('moment_skipped',{momentId:m.id});}
    })
  });
}
function choose(moment,minutes,card,adjustment){
  $$('.moment-card').forEach(c=>{c.classList.remove('selected');c.querySelectorAll('.activity-option').forEach(x=>x.classList.remove('selected'))});
  card.classList.remove('skipped');card.classList.add('selected');card.querySelector(`.activity-option[data-minutes="${minutes}"]`)?.classList.add('selected');
  state.selected={moment,minutes,format:'discussion',adjustment:adjustment||''};updateSelection();log('moment_selected',{momentId:moment.id,minutes,adjustment:!!adjustment});
}
function updateSelection(){
  const bar=$('#selectionBar');
  if(!state.selected){bar.classList.add('hidden');return}
  bar.classList.remove('hidden');$('#selectionSummary').textContent='1 opportunity selected';$('#selectionDetail').textContent=state.selected.moment.title+' · about '+state.selected.minutes+' minutes';
}

$('#buildBtn').addEventListener('click',async()=>{
  if(!state.selected)return;
  err('#page2Error','');
  busy('SPARK is building the activity…','Keeping the selected consequential judgment and fitting it to the time you chose.');
  try{
    const r=await call('mvpBuild',{sessionId:state.sessionId,sourceText:state.sourceText,fileName:state.fileName,gradeCourse:state.gradeCourse,subject:state.subject,objective:state.objective,preserve:state.preserve,avoid:state.avoid,selectedMoment:state.selected.moment,minutes:state.selected.minutes,format:state.selected.format,adjustment:state.selected.adjustment});
    state.artifact=r.artifact;renderArtifact();showPage(3);log('artifact_generated',{momentId:state.selected.moment.id,minutes:state.selected.minutes});
  }catch(ex){err('#page2Error',ex.message||String(ex))}finally{unbusy()}
});

function section(title,value){if(!value)return'';if(Array.isArray(value))return `<h3>${esc(title)}</h3><ul>${value.map(x=>`<li>${nl(x)}</li>`).join('')}</ul>`;return `<h3>${esc(title)}</h3><div>${nl(value)}</div>`}
function renderArtifact(){
  const a=state.artifact||{},s=state.selected;
  $('#provenance').innerHTML=`<div class="prov-item"><strong>Added to</strong>${esc(s.moment.source_location)}</div><div class="prov-item"><strong>Reasoning goal</strong>${esc(s.moment.reasoning_focus)}</div><div class="prov-item"><strong>Time</strong>About ${esc(s.minutes)} minutes</div>`;
  $('#teacherView').innerHTML=section('Purpose',a.teacher?.purpose)+section('Where to insert it',a.teacher?.where_to_insert)+section('Preparation / materials',a.teacher?.preparation)+section('Facilitation',a.teacher?.facilitation)+section('Exact prompts',a.teacher?.prompts)+section('What to look for',a.teacher?.look_for);
  $('#studentView').innerHTML=section('Student activity',a.student?.instructions)+section('Evidence / information',a.student?.evidence)+section('Questions',a.student?.questions);
}
$$('.tab').forEach(t=>t.addEventListener('click',()=>{$$('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');$('#teacherView').classList.toggle('hidden',t.dataset.tab!=='teacher');$('#studentView').classList.toggle('hidden',t.dataset.tab!=='student')}));
$('#editBtn').addEventListener('click',()=>{const v=$('.tab.active')?.dataset.tab==='student'?$('#studentView'):$('#teacherView');const editing=v.getAttribute('contenteditable')==='true';v.setAttribute('contenteditable',editing?'false':'true');$('#editBtn').textContent=editing?'Edit activity':'Finish editing';if(editing)log('artifact_edited',{view:v.id})});
$('#restartBtn').addEventListener('click',()=>{location.reload()});
$$('[data-back]').forEach(b=>b.addEventListener('click',()=>showPage(Number(b.dataset.back))));
})();