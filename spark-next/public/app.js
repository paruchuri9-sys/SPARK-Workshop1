const reasoningExplainers={
 'Assumption testing':'Identify what a claim or rule takes for granted, test whether it is warranted, and consider what changes if it is false.',
 'Evidence evaluation':'Judge whether particular evidence actually supports a claim, taking relevance and quality into account.',
 'Comparison and contrast':'Compare cases using the same relevant criteria, then explain why similarities and differences matter.',
 'Tradeoff analysis':'Weigh competing benefits and costs using explicit criteria, then justify a choice.',
 'Counterexample testing':'Look for a case that challenges a general rule, and decide whether the rule needs revising.',
 'Perspective taking':'Consider how a differently situated person might interpret the same evidence or decision, without assuming all positions are equally justified.',
 'Argumentation':'Make a defensible claim, support it with evidence and reasoning, and consider a counterargument.',
 'Causal reasoning':'Distinguish what contributes to an outcome from what merely occurs alongside it.',
 'Systems reasoning':'Identify interacting parts, feedback, and unintended consequences rather than treating each part alone.',
 'Decision under uncertainty':'Choose a defensible action when evidence is incomplete, and explain what additional information might change the choice.'
};
const $=id=>document.getElementById(id);
const sessionId=crypto.randomUUID();let moments=[],lessonId=crypto.randomUUID();
async function call(data){const r=await fetch('/.netlify/functions/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,lessonId,...data})});const type=r.headers.get('content-type')||'';if(!type.includes('application/json'))throw Error('SPARK API unavailable: server returned a webpage (HTTP '+r.status+'). Verify function routing and access permissions.');const result=await r.json();if(!r.ok||!result.ok)throw Error(result.error||'Request failed');return result;}
function status(text){$('state').textContent=text;}
$('analyze').onclick=async()=>{
 const button=$('analyze');button.disabled=true;status('Analyzing lesson and saving research events…');$('result').hidden=true;
 try{
  lessonId=crypto.randomUUID();moments=[];$('moments').replaceChildren();$('opportunities').hidden=true;
  const r=await call({action:'analyze',lesson:$('lesson').value,lessonUrl:$('lessonUrl').value.trim(),grade:$('grade').value});
  moments=r.moments;$('moments').replaceChildren();
  for(const m of moments){
   const card=document.createElement('article');
   const line=document.createElement('div');line.className='moment-head';
   const choose=document.createElement('input');choose.type='checkbox';choose.value=m.id;choose.setAttribute('aria-label','Select '+m.title);
   const details=document.createElement('details');details.className='moment-details';
   const summary=document.createElement('summary');const title=document.createElement('strong');title.textContent=m.title;
   const sub=document.createElement('span');sub.className='moment-meta';sub.textContent=m.construct+' · '+m.minutes+' extra min';
   summary.append(title,sub);
   const body=document.createElement('div');body.className='moment-body';
   const add=(name,value)=>{if(!value)return;const p=document.createElement('p'),b=document.createElement('b');b.textContent=name+': ';p.append(b,document.createTextNode(String(value)));body.append(p);};
   add('Suggested teacher move',m.reasoning_move||m.teacher_prompt);
   add('Connect to another step',m.connection_cue);
   add('Possible transfer cue',m.transfer_cue);
   const info=document.createElement('details'),is=document.createElement('summary');is.textContent='Learn more: '+m.construct;info.append(is);const explanation=document.createElement('p');explanation.textContent=(reasoningExplainers[m.construct]||'Describe the reasoning operation and what students should do.')+' In this lesson: '+m.explanation;info.append(explanation);body.append(info);
   const evidence=document.createElement('details'),es=document.createElement('summary');es.textContent='Existing lesson evidence and rationale';evidence.append(es);
   const evidenceBody=document.createElement('div');const labels={already_present:'Already present',strengthened:'Can be strengthened',uncovered:'Not explicitly present'};
   for(const [key,val] of [['Where',m.where],['Evidence',m.evidence],['Current coverage',labels[m.coverage]||m.coverage],['Why this helps',m.added_value]]){const p=document.createElement('p');const b=document.createElement('b');b.textContent=key+': ';p.append(b,document.createTextNode(String(val||'')));evidenceBody.append(p);}
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
 const selected=moments.filter(x=>ids.includes(x.id));const btn=$('build');btn.disabled=true;status('Building a minimal teaching plan and saving it…');
 try{
  await call({action:'event',eventType:'moments_selected',ids});
  const r=await call({action:'build',selected,grade:$('grade').value,budget:$('budget').value});
  $('teacher').textContent=r.activity.teacher_view;$('student').textContent=r.activity.student_view;$('notes').textContent=r.activity.integration_notes;
  $('result').hidden=false;status('Activity generated and saved to research database.');
 }catch(e){status('Not completed: '+e.message);}finally{btn.disabled=false;}
};
