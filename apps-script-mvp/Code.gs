/** SPARK MVP v0.2 standalone backend */
const SPARK_DESIGN_VERSION='0.3.0';
const SPARK_REASONER_VERSION='0.3.0';
const SPARK_RELEASE='2026-10-14-rc1';
const GH_ORIGIN='https://paruchuri9-sys.github.io';
const GH_MVP=GH_ORIGIN+'/SPARK-Workshop1/mvp.html';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('SPARK Reasoning Opportunity Builder')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}

function api(action,payload){
  const q=payload||{};
  if(action==='health') return {ok:true,designVersion:SPARK_DESIGN_VERSION,reasonerVersion:SPARK_REASONER_VERSION,release:SPARK_RELEASE};
  if(action==='mvpEvent'){recordEvent_(q);return {ok:true};}
  if(action==='mvpUncover'){
    const resolved=resolveSource_(q);
    q.sourceText=resolved.text;
    if(!q.fileName) q.fileName=resolved.label;
    const moments=mvpUncover_(q).moments||[];
    recordEvent_({sessionId:q.sessionId,event:'uncover_completed',detail:{count:moments.length,moments:moments.map(m=>({id:m.id,classification:m.coverage_status,construct:m.construct_label}))}});
    return {ok:true,moments:moments,reasonerVersion:SPARK_REASONER_VERSION};
  }
  if(action==='mvpBuild'){
    if(!Array.isArray(q.selections)||!q.selections.length) throw new Error('Select at least one consequential moment.');
    const resolved=resolveSource_(q);
    q.sourceText=resolved.text;
    if(!q.fileName) q.fileName=resolved.label;
    const artifact=mvpBuild_(q);
    recordEvent_({sessionId:q.sessionId,event:'build_completed',detail:{ids:q.selections.map(s=>s.moment.id),totalMinutes:q.selections.reduce((n,s)=>n+Number(s.minutes||0),0)}});
    return {ok:true,artifact:artifact};
  }
  throw new Error('Unknown action: '+action);
}


function resolveSource_(q){
  const pasted=String(q.sourceText||'').trim();
  if(pasted.length>=80) return {text:pasted,label:String(q.fileName||'Pasted activity')};

  const url=String(q.sourceUrl||'').trim();
  if(!url) throw new Error('Upload or paste the activity, or provide a public lesson URL.');
  if(!/^https?:\/\//i.test(url)) throw new Error('Lesson URL must begin with http:// or https://.');

  const res=UrlFetchApp.fetch(url,{
    followRedirects:true,
    muteHttpExceptions:true,
    headers:{'User-Agent':'Mozilla/5.0 SPARK-MVP/0.2'}
  });
  const code=res.getResponseCode();
  if(code<200||code>=300) throw new Error('Could not retrieve that lesson URL (HTTP '+code+').');

  const headers=res.getHeaders();
  const contentType=String(headers['Content-Type']||headers['content-type']||'').toLowerCase();
  if(contentType.indexOf('pdf')>=0) throw new Error('PDF links are not supported by URL yet. Download the PDF and upload it instead.');
  if(contentType && contentType.indexOf('html')<0 && contentType.indexOf('text')<0){
    throw new Error('That URL is not a readable public web page. Upload the lesson file instead.');
  }

  let text=res.getContentText();
  if(contentType.indexOf('html')>=0 || /<html[\s>]/i.test(text)){
    text=htmlToText_(text);
  }
  text=String(text||'').replace(/\s+/g,' ').trim();
  if(text.length<80) throw new Error('The public page did not expose enough lesson text to analyze. Paste the lesson text or upload the file instead.');
  if(text.length>120000) text=text.slice(0,120000);
  return {text:text,label:url};
}

function htmlToText_(html){
  return String(html||'')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,' ')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/(p|div|li|section|article|h[1-6]|tr)>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&#(\d+);/g,function(_,n){return String.fromCharCode(Number(n));})
    .replace(/[ \t]+/g,' ')
    .replace(/\n\s*\n+/g,'\n')
    .trim();
}

function mvpUncover_(q){
  const schema={
    type:'object',additionalProperties:false,required:['moments'],
    properties:{moments:{type:'array',minItems:3,maxItems:5,items:{
      type:'object',additionalProperties:false,
      required:['id','title','source_location','current_task','consequential_judgment','why_it_matters','reasoning_focus','construct_label','construct_explanation','coverage_status','coverage_rationale','added_value','options'],
      properties:{
        id:{type:'string'},title:{type:'string'},source_location:{type:'string'},current_task:{type:'string'},
        consequential_judgment:{type:'string'},why_it_matters:{type:'string'},reasoning_focus:{type:'string'},construct_label:{type:'string'},construct_explanation:{type:'string'},
        coverage_status:{type:'string',enum:['uncovered','strengthened','already_present']},
        coverage_rationale:{type:'string'},added_value:{type:'string'},
        options:{type:'array',minItems:4,maxItems:4,items:{
          type:'object',additionalProperties:false,required:['minutes','label','description'],
          properties:{minutes:{type:'integer',enum:[5,10,20,30]},label:{type:'string'},description:{type:'string'}}
        }}
      }
    }}}
  };
  const instructions=[
    'You are the SPARK consequential-moment generator for educators.',
    'Find up to five substantial consequential reasoning moments, including moments already present when needed to represent an already reasoning-rich lesson. Do not force novelty or force five distinct improvements.',
    'A consequential reasoning moment is a point where a student judgment could materially change depending on evidence, assumptions, uncertainty, competing explanations, tradeoffs, consequences, or new information.',
    'Classify every moment as uncovered (substantially absent from original), strengthened (original asks for reasoning but a consequential operation can be added), or already_present (the proposed reasoning is substantially present). The classification is a tentative, source-grounded interpretation, not verified teacher novelty.',
    'For each candidate name one recognizable reasoning construct, explain it in ordinary language, provide concrete source evidence for its coverage status, and state the specific instructional increment (or explicitly say no material increment).',
    'Do not rebrand tasks already present as new. Do not add generic critical-thinking activities.',
    'Ground every moment in a specific place in the source activity.',
    'For each moment, create 5-, 10-, 20-, and 30-minute realizations of the SAME underlying reasoning opportunity.',
    'Preserve the supplied objective and constraints.',
    'Use plain teacher-facing language.',
    'Reject candidates that merely add engagement, explanation, recall, or extra work without meaningful student judgment.'
  ].join('\n');
  return openAIJson_(instructions,{
    activity:q.sourceText||'',file_name:q.fileName||'',grade_or_course:q.gradeCourse||'',subject:q.subject||'',
    additional_time_minutes:Number(q.availableTime||10),learning_objective:q.objective||'',preserve:q.preserve||'',avoid:q.avoid||''
  },schema,'spark_consequential_moments');
}

function mvpBuild_(q){
  const schema={
    type:'object',additionalProperties:false,required:['teacher','student'],
    properties:{
      teacher:{type:'object',additionalProperties:false,required:['purpose','where_to_insert','preparation','facilitation','prompts','look_for'],properties:{
        purpose:{type:'string'},where_to_insert:{type:'string'},preparation:{type:'array',items:{type:'string'}},
        facilitation:{type:'array',items:{type:'string'}},prompts:{type:'array',items:{type:'string'}},look_for:{type:'array',items:{type:'string'}}
      }},
      student:{type:'object',additionalProperties:false,required:['instructions','evidence','questions'],properties:{
        instructions:{type:'array',items:{type:'string'}},evidence:{type:'array',items:{type:'string'}},questions:{type:'array',items:{type:'string'}}
      }}
    }
  };
  const instructions=[
    'You are the SPARK classroom-intervention builder.',
    'Create ONE coherent classroom-ready intervention integrating all teacher-selected consequential moments, not a concatenation of unrelated mini-lessons.',
    'Fit it into the existing activity rather than replacing the activity.',
    'Treat total duration as a strict cap. Use per-moment durations as allocation targets. If moments overlap, consolidate shared activities and explicitly preserve each different reasoning construct.',
    'Preserve the consequential judgment of each selected moment and give students authentic opportunities to make, justify, test, qualify or revise judgments. Explain what is newly strengthened relative to the source, without fabricating novelty.',
    'Do not invent factual evidence. If new evidence is required but not supplied, state that need in teacher preparation.',
    'Teacher prompts should be ready to say or display. Student view should contain only student-facing material.',
    'Do not generate slides, standards alignment, rubrics, or extra formats.'
  ].join('\n');
  return openAIJson_(instructions,{
    original_activity:q.sourceText||'',file_name:q.fileName||'',grade_or_course:q.gradeCourse||'',subject:q.subject||'',
    learning_objective:q.objective||'',preserve:q.preserve||'',avoid:q.avoid||'',selections:q.selections,
    duration_minutes:q.selections.reduce(function(n,s){return n+Number(s.minutes||0);},0),activity_format:q.format||'discussion'
  },schema,'spark_classroom_intervention');
}

function openAIJson_(instructions,input,schema,name){
  const props=PropertiesService.getScriptProperties();
  const apiKey=props.getProperty('OPENAI_API_KEY');
  const model=props.getProperty('SPARK_MODEL');
  if(!apiKey) throw new Error('Missing OPENAI_API_KEY in Script Properties.');
  if(!model) throw new Error('Missing SPARK_MODEL in Script Properties.');
  const payload={
    model:model,
    instructions:instructions,
    input:JSON.stringify(input),
    text:{format:{type:'json_schema',name:name,strict:true,schema:schema}}
  };
  const res=UrlFetchApp.fetch('https://api.openai.com/v1/responses',{
    method:'post',contentType:'application/json',
    headers:{Authorization:'Bearer '+apiKey},
    payload:JSON.stringify(payload),muteHttpExceptions:true
  });
  const code=res.getResponseCode(),body=res.getContentText();
  if(code<200||code>=300){
    let msg='OpenAI request failed ('+code+').';
    try{const j=JSON.parse(body);msg=(j.error&&j.error.message)||msg;}catch(e){}
    throw new Error(msg);
  }
  const j=JSON.parse(body);
  let out=j.output_text||'';
  if(!out&&Array.isArray(j.output)){
    j.output.forEach(function(item){(item.content||[]).forEach(function(part){if(part&&typeof part.text==='string')out+=part.text;});});
  }
  if(!out) throw new Error('Model returned no structured output.');
  try{return JSON.parse(out);}catch(e){throw new Error('Model returned invalid structured output.');}
}
function recordEvent_(q){
  // Privacy-preserving event metadata only. No lesson text or student data.
  try{
    const props=PropertiesService.getScriptProperties();
    const id=props.getProperty('SPARK_EVENT_SHEET_ID');
    if(!id)return;
    const lock=LockService.getScriptLock();lock.waitLock(3000);
    try{
      const book=SpreadsheetApp.openById(id);
      const sheet=book.getSheetByName('MVPEventsV1')||book.insertSheet('MVPEventsV1');
      if(sheet.getLastRow()===0)sheet.appendRow(['timestamp','session_id','event','design_version','reasoner_version','release','metadata_json']);
      sheet.appendRow([new Date(),String(q.sessionId||''),String(q.event||''),SPARK_DESIGN_VERSION,SPARK_REASONER_VERSION,SPARK_RELEASE,JSON.stringify(q.detail||{})]);
    }finally{lock.releaseLock();}
  }catch(err){console.error('MVP event write failed: '+err.message);}
}
