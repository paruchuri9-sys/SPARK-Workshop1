import {getDatabase} from '@netlify/database';
import crypto from 'node:crypto';
const DESIGN='0.4.0', REASONER='0.4.0-activation-alpha', BUILD=process.env.COMMIT_REF||'local';
const allowed=new Set(['session_started','opportunities_generated','moments_selected','activity_generated','teacher_feedback','api_error']);
const cors={'content-type':'application/json','cache-control':'no-store'};
function respond(body,status=200){return new Response(JSON.stringify(body),{status,headers:cors});}
function uid(value){return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
async function record(sessionId,eventType,lessonId,payload={}){
 if(!uid(sessionId)||!allowed.has(eventType))throw Error('Invalid event');
 const db=getDatabase();
 await db.sql`INSERT INTO spark_events(id,session_id,event_type,design_version,reasoner_version,build_id,lesson_id,payload) VALUES (${crypto.randomUUID()},${sessionId},${eventType},${DESIGN},${REASONER},${BUILD},${lessonId||null},${JSON.stringify(payload)}::jsonb)`;
}
function safeLesson(text){return typeof text==='string'&&text.trim().length>=80&&text.length<=30000;}
async function model(messages,schema){
 const key=process.env.OPENAI_API_KEY;
 if(!key)throw Error('AI service not configured');
 const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),55000);
 try{
  const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:ac.signal,headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({model:process.env.SPARK_MODEL||'gpt-4.1-mini',temperature:0.2,messages,response_format:{type:'json_schema',json_schema:{name:'spark_response',strict:true,schema}}})});
  if(!r.ok)throw Error('Model request failed ('+r.status+')');
  const data=await r.json();return JSON.parse(data.choices[0].message.content);
 }finally{clearTimeout(timer);}
}

// Conservative v0 URL import: educational source allowlist, HTTPS only, no redirects.
// Prevent arbitrary server-side URL fetching and inadvertent access to private services.
const sourceHosts=new Set(['readwritethink.org','www.readwritethink.org','loc.gov','www.loc.gov','pbslearningmedia.org','www.pbslearningmedia.org','education.nationalgeographic.org']);
function decodeEntities(s){return s.replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));}
async function extractPublicLesson(url){
 let u;try{u=new URL(url);}catch{throw Error('Invalid lesson URL');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!sourceHosts.has(u.hostname.toLowerCase()))throw Error('URL import currently supports selected public educational sites only. Paste lesson text for other sources.');
 const response=await fetch(u.toString(),{redirect:'error',signal:AbortSignal.timeout(15000),headers:{accept:'text/html'}});
 if(!response.ok)throw Error('Lesson website returned HTTP '+response.status);
 if(!(response.headers.get('content-type')||'').includes('text/html'))throw Error('Lesson URL did not return HTML');
 const length=Number(response.headers.get('content-length')||0);
 if(length>1500000)throw Error('Lesson page is too large');
 const html=(await response.text()).slice(0,1500000);
 const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||html;
 const plain=decodeEntities(main.replace(/<(script|style|nav|footer|header|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()).slice(0,30000);
 if(!safeLesson(plain))throw Error('Could not extract enough lesson text. Paste the relevant portion instead.');
 return plain;
}

const opportunitiesSchema={type:'object',additionalProperties:false,required:['moments'],properties:{moments:{type:'array',items:{type:'object',additionalProperties:false,required:['id','title','where','construct','explanation','coverage','evidence','added_value','teacher_prompt','minutes','reasoning_move','connection_cue','transfer_cue','quick_check','quick_check_format','quick_check_purpose'],properties:{id:{type:'string'},title:{type:'string'},where:{type:'string'},construct:{type:'string',enum:['Evidence evaluation','Causal reasoning','Comparison and contrast','Perspective taking','Tradeoff analysis','Decision under uncertainty','Counterexample testing','Assumption testing','Systems reasoning','Argumentation']},explanation:{type:'string'},coverage:{type:'string',enum:['uncovered','strengthened','already_present']},evidence:{type:'string'},added_value:{type:'string'},teacher_prompt:{type:'string'},reasoning_move:{type:'string'},connection_cue:{type:'string'},transfer_cue:{type:'string'},quick_check:{type:'string'},quick_check_format:{type:'string',enum:['none','multiple_choice','show_of_hands','short_response']},quick_check_purpose:{type:'string',enum:['none','recognition','prompted_application','transfer_probe']},minutes:{type:'integer'}}}}}};
const buildSchema={type:'object',additionalProperties:false,required:['teacher_view','student_view','integration_notes'],properties:{teacher_view:{type:'string'},student_view:{type:'string'},integration_notes:{type:'string'}}};
export default async function(req){
 if(req.method!=='POST')return respond({error:'POST required'},405);
 let q;try{q=await req.json();}catch{return respond({error:'Invalid JSON'},400);}
 const session=q.sessionId,lessonId=q.lessonId||null;
 if(!uid(session))return respond({error:'Invalid session ID'},400);
 try{
  if(q.action==='event'){
   if(!['session_started','moments_selected','teacher_feedback'].includes(q.eventType))return respond({error:'Unsupported event'},400);
   // Strictly whitelist metadata; never store free-form lesson content or personal identifiers.
   const p=q.eventType==='moments_selected'?{ids:(q.ids||[]).slice(0,5).map(String)}:q.eventType==='teacher_feedback'?{rating:Number(q.rating)||0}:{};
   await record(session,q.eventType,lessonId,p);return respond({ok:true,logged:true});
  }
  if(q.action==='analyze'){
   const lessonText=q.lessonUrl?await extractPublicLesson(q.lessonUrl):q.lesson;
   if(!safeLesson(lessonText))return respond({error:'Paste 80–30,000 characters of lesson text'},400);
   const result=await model([{role:'system',content:'You are SPARK, a rigorous middle/high school instructional reasoning analyst. Given an existing lesson, identify 1-5 consequential reasoning opportunities, not mere reflection questions. Differentiate what is already present, what could be strengthened, and what is absent, supported by a brief quote or precise pointer to source lesson; do not invent source evidence. Suggest the smallest useful addition. Preserve historical accuracy, do not normalize discriminatory statements. Use exactly one reasoning construct label from: Evidence evaluation, Causal reasoning, Comparison and contrast, Perspective taking, Tradeoff analysis, Decision under uncertainty, Counterexample testing, Assumption testing, Systems reasoning, Argumentation. Treat these as preliminary operational labels, not proven measurement categories. Identify opportunities that ALREADY exist: recognition is valuable, not a defect. For each give the smallest helpful teacher move (one question, short cue, or tiny process adjustment), explicit reasoning operation and why, a connection cue to another lesson step and optional different-context transfer cue. Do not merely praise an existing activity or relabel it: show what a teacher could SAY or DO, and where. Estimate ADDITIONAL minutes 0-10, not original lesson activity duration; use 0 when no change warranted. The optional quick_check is one short, ready-to-use question using format multiple_choice, show_of_hands, or short_response only if it yields useful evidence of the targeted reasoning; otherwise empty string, format none and purpose none. For multiple_choice provide the response options in the question text and a simple teacher-only interpretation of what options reveal. For show_of_hands, use a prompt with concrete choices. Never collect responses. Do not claim a quick response establishes independent transfer. Avoid extra activity creation and avoid cognitive overload. Unique IDs M1...M5.'},{role:'user',content:JSON.stringify({grade:q.grade||'middle school',lesson:lessonText})}],opportunitiesSchema);
   if(!Array.isArray(result.moments)||result.moments.length<1||result.moments.length>5)throw Error('Invalid model moments');
   const moments=result.moments.map((m,i)=>({...m,id:'M'+(i+1),minutes:Math.max(0,Math.min(10,Number(m.minutes)||0))}));
   await record(session,'opportunities_generated',lessonId,{moments,source_type:q.lessonUrl?'url':'paste',source_host:q.lessonUrl?new URL(q.lessonUrl).hostname:null});return respond({ok:true,logged:true,moments,versions:{design:DESIGN,reasoner:REASONER,build:BUILD}});
  }
  if(q.action==='build'){
   const selected=q.selected;
   if(!Array.isArray(selected)||selected.length<1||selected.length>5||selected.some(m=>!m||typeof m.title!=='string'||typeof m.reasoning_move!=='string'))return respond({error:'Choose 1-5 valid moments'},400);
   const budget=Math.max(5,Math.min(120,Number(q.budget)||30));
   const result=await model([{role:'system',content:'Generate one MINIMUM-ADDITION integrated teaching plan from selected SPARK reasoning opportunities, not a replacement lesson or generic standalone exercise. Preserve existing tasks. Teacher_view: exact placement and concise teacher wording for each selected move, the sequence, connection cues, and optional quick checks only where justified. Student_view: the reasoning students should perform and what brief observable responses would show. integration_notes: estimated total ADDITIONAL minutes and feasibility given the budget, what is already in the lesson, and any tradeoffs to avoid overload. If selected estimated minutes exceed budget, prioritize essentials and explicitly state what was omitted. Do not claim evidence of transfer from a short check. Provide teacher_view, student_view, integration_notes.'},{role:'user',content:JSON.stringify({grade:q.grade||'middle school',budget,selected})}],buildSchema);
   await record(session,'activity_generated',lessonId,{moment_ids:selected.map(x=>x.id),budget,activity:result});
   return respond({ok:true,logged:true,activity:result});
  }
  return respond({error:'Unknown action'},400);
 }catch(e){
  console.error('SPARK function failure',String(e?.message||e));
  return respond({error:'Request failed; no research result is confirmed as saved. Check server configuration and logs.'},503);
 }
}

