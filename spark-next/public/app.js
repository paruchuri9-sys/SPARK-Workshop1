const $=id=>document.getElementById(id);
const sessionId=crypto.randomUUID();let moments=[],lessonId=crypto.randomUUID();
async function call(data){const r=await fetch('/api/spark',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,lessonId,...data})});const result=await r.json();if(!r.ok||!result.ok)throw Error(result.error||'Request failed');return result;}
function status(text){$('state').textContent=text;}
$('analyze').onclick=async()=>{
 const button=$('analyze');button.disabled=true;status('Analyzing lesson and saving research events…');$('result').hidden=true;
 try{
  lessonId=crypto.randomUUID();
  const r=await call({action:'analyze',lesson:$('lesson').value,grade:$('grade').value});
  moments=r.moments;$('moments').replaceChildren();
  for(const m of moments){
   const card=document.createElement('article');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=m.id;checkbox.style.width='auto';checkbox.style.display='inline';checkbox.setAttribute('aria-label','Select '+m.title);
   const title=document.createElement('strong');title.textContent=' '+m.title;card.append(checkbox,title);
   for(const [label,value] of [['Construct',m.construct],['Explanation',m.explanation],['Coverage',m.coverage],['Lesson evidence',m.evidence],['Added value',m.added_value],['Teacher prompt',m.teacher_prompt],['Estimated time',m.minutes+' min']]){const p=document.createElement('p');const b=document.createElement('b');b.textContent=label+': ';p.append(b,document.createTextNode(String(value)));card.append(p);}
   $('moments').append(card);
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
