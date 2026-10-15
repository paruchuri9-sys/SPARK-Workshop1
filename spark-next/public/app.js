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
const sessionId=crypto.randomUUID();let moments=[],lessonId=crypto.randomUUID();let builtIds='',currentPlan=null;
function showPage(page){
 for(const [id,number] of [['source',1],['opportunities',2],['result',3]])$(id).hidden=id!==page;
 const n={source:1,opportunities:2,result:3}[page];
 for(let i=1;i<=3;i++)$('step'+i).classList.toggle('current',i===n);
 window.scrollTo({top:0,behavior:'smooth'});
}
function selection(){
 const ids=[...$('moments').querySelectorAll('input[type=checkbox]:checked')].map(x=>x.value);
 const selected=moments.filter(x=>ids.includes(x.id));
 const time=selected.reduce((n,m)=>n+Math.max(0,Number(m.minutes)||0),0);
 $('selectedCount').textContent=ids.length+' selected';
 $('totalTime').textContent='~'+time+' min additional';
 $('build').disabled=!ids.length;
 return {ids,selected,time};
}
$('back2').onclick=()=>showPage('source');
$('editSelections').onclick=()=>showPage('opportunities');
$('printPlan').onclick=()=>window.print();
$('copyPlan').onclick=()=>{
 if(!currentPlan)return;
 const text=[currentPlan.lesson_title,currentPlan.plan_summary,...currentPlan.steps.map((x,i)=>[String(i+1)+'. '+x.placement,x.reasoning_type,'Ask: '+x.teacher_question,'Students: '+x.student_action,'Look for: '+x.look_for,x.connection?'Connection: '+x.connection:'',x.optional_check?'Optional check: '+x.optional_check:''].filter(Boolean).join('\n')),currentPlan.integration_notes].join('\n\n');
 navigator.clipboard.writeText(text).catch(()=>{$('buildStatus').textContent='Copy unavailable; select and copy the text manually.';});
};
function renderPlan(plan,selected){
 if(!plan||!Array.isArray(plan.steps))throw Error('Plan response lacks structured steps');
 const ids=new Set(selected.map(m=>m.id));
 if(plan.steps.length!==ids.size||plan.steps.some(x=>!ids.has(x.moment_id)))throw Error('Plan did not include precisely the selected opportunities');
 $('planTitle').textContent=plan.lesson_title||'Integrated teaching plan';
 $('planSummary').textContent=plan.plan_summary||'';
 $('notes').textContent=plan.integration_notes||'';
 $('planSteps').replaceChildren();
 for(const [i,step] of plan.steps.entries()){
  const article=document.createElement('article');article.className='plan-step';
  const top=document.createElement('div');top.className='plan-step-heading';
  const heading=document.createElement('h3');heading.textContent=(i+1)+'. '+step.placement;
  const timing=document.createElement('span');timing.textContent='~'+Math.max(0,step.estimated_minutes)+' min';
  top.append(heading,timing);article.append(top);
  const type=document.createElement('p');type.className='plan-reasoning-type';type.textContent=step.reasoning_type;article.append(type);
  for(const [label,value] of [['Ask students',step.teacher_question],['Students do',step.student_action],['Look for',step.look_for],['Connection',step.connection],['Optional quick check',step.optional_check]]){
   if(!value)continue;const row=document.createElement('p');const strong=document.createElement('strong');strong.textContent=label+': ';row.append(strong,document.createTextNode(value));article.append(row);
  }
  $('planSteps').append(article);
 }
 currentPlan=plan;
}


async function call(data){const r=await fetch('/.netlify/functions/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,lessonId,...data})});const type=r.headers.get('content-type')||'';if(!type.includes('application/json'))throw Error('SPARK API unavailable: server returned a webpage (HTTP '+r.status+'). Verify function routing and access permissions.');const result=await r.json();if(!r.ok||!result.ok)throw Error(result.error||'Request failed');return result;}
function status(text){$('state').textContent=text;}
$('analyze').onclick=async()=>{
 const button=$('analyze');button.disabled=true;status('Analyzing lesson and saving research events…');$('result').hidden=true;
 try{
  lessonId=crypto.randomUUID();currentPlan=null;moments=[];$('moments').replaceChildren();$('opportunities').hidden=true;
  const r=await call({action:'analyze',lesson:$('lesson').value,lessonUrl:$('lessonUrl').value.trim(),grade:$('grade').value});
  moments=r.moments;$('moments').replaceChildren();
  for(const m of moments){
   const card=document.createElement('article');
   const line=document.createElement('div');line.className='moment-head';
   const choose=document.createElement('input');choose.type='checkbox';choose.value=m.id;choose.setAttribute('aria-label','Select '+m.title);
   const details=document.createElement('details');details.className='moment-details';
   const summary=document.createElement('summary');const title=document.createElement('strong');title.textContent=m.construct+': '+m.title;
   const sub=document.createElement('span');sub.className='moment-meta';sub.textContent='~'+m.minutes+' min additional';
   summary.append(title,sub);choose.addEventListener('change',()=>{selection();builtIds='';});
   const body=document.createElement('div');body.className='moment-body';
   const add=(name,value)=>{if(!value)return;const p=document.createElement('p'),b=document.createElement('b');b.textContent=name+': ';p.append(b,document.createTextNode(String(value)));body.append(p);};
   add('Suggested question or adjustment',m.reasoning_move||m.teacher_prompt);
   add('Time estimate (~'+m.minutes+' min)',m.time_rationale);
   add('Connect to another step',m.connection_cue);
   add('Possible transfer cue',m.transfer_cue);
   const info=document.createElement('details'),is=document.createElement('summary');is.textContent='Learn more: '+m.construct;info.append(is);const explanation=document.createElement('p');explanation.textContent=(reasoningExplainers[m.construct]||'Describe the reasoning operation and what students should do.')+' In this lesson: '+m.explanation;info.append(explanation);body.append(info);
   const evidence=document.createElement('details'),es=document.createElement('summary');es.textContent='Existing lesson evidence and rationale';evidence.append(es);
   const evidenceBody=document.createElement('div');const labels={already_present:'Already present',strengthened:'Can be strengthened',uncovered:'Not explicitly present'};
   for(const [key,val] of [['Where',m.where],['Evidence',m.evidence],['Current coverage',labels[m.coverage]||m.coverage],['Why this helps',m.added_value]]){const p=document.createElement('p');const b=document.createElement('b');b.textContent=key+': ';p.append(b,document.createTextNode(String(val||'')));evidenceBody.append(p);}
   evidence.append(evidenceBody);body.append(evidence);
   if(m.quick_check&&m.quick_check_purpose!=='none'){
    const check=document.createElement('details'),cs=document.createElement('summary');cs.textContent='Optional '+({'multiple_choice':'multiple-choice','show_of_hands':'show-of-hands','short_response':'short-response'}[m.quick_check_format]||'quick')+' check (no responses collected)';check.append(cs);
    const q=document.createElement('p');q.textContent=m.quick_check;const aim=document.createElement('p');aim.className='status';aim.textContent='Probe purpose: '+m.quick_check_purpose.replaceAll('_',' ')+'. This is a suggested classroom question, not proof of learning or transfer.';check.append(q,aim);body.append(check);
   }
   details.append(summary,body);line.append(choose,details);card.append(line);$('moments').append(card);
  }
  showPage('opportunities');selection();status('Saved '+moments.length+' generated opportunities · '+r.versions.build);
 }catch(e){status('Not completed: '+e.message);}finally{button.disabled=false;}
};
$('build').onclick=async()=>{
 const {ids,selected,time}=selection();
 if(!ids.length){$('buildStatus').textContent='Select at least one reasoning opportunity';return;}
 const btn=$('build');btn.disabled=true;$('buildStatus').textContent='Building the teaching plan…';
 try{
  await call({action:'event',eventType:'moments_selected',ids});
  const r=await call({action:'build',selected,grade:$('grade').value,budget:time});
  renderPlan(r.activity,selected);
  $('planTime').textContent='~'+time+' min additional';builtIds=ids.join(',');showPage('result');$('buildStatus').textContent='Teaching plan generated and saved.';
 }catch(e){$('buildStatus').textContent='Could not build plan: '+e.message;}finally{btn.disabled=false;}
};
