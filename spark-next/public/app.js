const $=id=>document.getElementById(id);
const sessionId=crypto.randomUUID();let moments=[],lessonId=crypto.randomUUID();
async function call(data){const r=await fetch('/api/spark',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,lessonId,...data})});const result=await r.json();if(!r.ok||!result.ok)throw Error(result.error||'Request failed');return result;}
function status(text){$('state').textContent=text;}
$('analyze').onclick=async()=>{
 const button=$('analyze');button.disabled=true;status('Analyzing lesson and saving research events…');$('result').hidden=true;
 try{
  lessonId=crypto.randomUUID();
  const r=await call({action:'analyze',lesson:$('lesson').value,lessonUrl:$('lessonUrl').value.trim(),grade:$('grade').value});
  moments=r.moments;$('moments').replaceChildren();
  for(const m of moments){
   const card=document.createElement('article');
   const line=document.createElement('div');line.className='moment-head';
   const choose=document.createElement('input');choose.type='checkbox';choose.value=m.id;choose.setAttribute('aria-label','Select '+m.title);
   const details=document.createElement('details');details.className='moment-details';
   const summary=document.createElement('summary');const title=document.createElement('strong');title.textContent=m.title;
   const sub=document.createElement('span');sub.className='moment-meta';sub.textContent='Reasoning type: '+m.construct+' · '+m.minutes+' additional min';
   summary.append(title,sub);
   const body=document.createElement('div');body.className='moment-body';
   const add=(name,value)=>{if(!value)return;const p=document.createElement('p'),b=document.createElement('b');b.textContent=name+': ';p.append(b,document.createTextNode(String(value)));body.append(p);};
   add('Suggested teacher move',m.reasoning_move||m.teacher_prompt);
   add('Connect to another step',m.connection_cue);
   add('Possible transfer cue',m.transfer_cue);
   const info=document.createElement('details'),is=document.createElement('summary');is.textContent='Learn more about this reasoning type';info.append(is);const explanation=document.createElement('p');explanation.textContent=m.explanation;info.append(explanation);body.append(info);
   const evidence=document.createElement('details'),es=document.createElement('summary');es.textContent='Existing lesson evidence and rationale';evidence.append(es);
   const evidenceBody=document.createElement('div');const labels={already_present:'Already present',strengthened:'Can be strengthened',uncovered:'Not explicitly present'};
   for(const [key,val] of [['Where',m.where],['Evidence',m.evidence],['Current coverage',labels[m.coverage]||m.coverage],['SPARK added value',m.added_value]]){const p=document.createElement('p');const b=document.createElement('b');b.textContent=key+': ';p.append(b,document.createTextNode(String(val||'')));evidenceBody.append(p);}
   evidence.append(evidenceBody);body.append(evidence);
   if(m.quick_check&&m.quick_check_purpose!=='none'){
    const check=document.createElement('details'),cs=document.createElement('summary');cs.textContent='Optional quick check (no responses collected)';check.append(cs);
    const q=document.createElement('p');q.textContent=m.quick_check;const aim=document.createElement('p');aim.className='status';aim.textContent='Probe purpose: '+m.quick_check_purpose.replaceAll('_',' ')+'. This is a suggested classroom question, not proof of learning or transfer.';check.append(q,aim);body.append(check);
   }
   details.append(summary,body);line.append(choose,details);card.append(line);$('moments').append(card);
  }
  $('opportunities').hidden=false;status('Saved '+moments.length+' generated opportunities · '+r.versions.build);
 }catch(e){status('Not completed: '+e.message);}finally{button.disabled=false;}
};
$('build').onclick=async()=>{
 const ids=[...$('moments').querySelectorAll('input:checked')].map(x=>x.value);
 if(!ids.length){status('Select at least one reasoning opportunity');return;}
 const selected=moments.filter(x=>ids.includes(x.id));const btn=$('build');btn.disabled=true;status('Building and recording activity…');
 try{
  await call({action:'event',eventType:'moments_selected',ids});
  const r=await call({action:'build',selected,grade:$('grade').value,budget:$('budget').value});
  $('teacher').textContent=r.activity.teacher_view;$('student').textContent=r.activity.student_view;$('notes').textContent=r.activity.integration_notes;
  $('result').hidden=false;status('Activity generated and saved to research database.');
 }catch(e){status('Not completed: '+e.message);}finally{btn.disabled=false;}
};
