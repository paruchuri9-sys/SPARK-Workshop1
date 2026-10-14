/** SPARK MVP v0.2 standalone backend */
const GH_ORIGIN='https://paruchuri9-sys.github.io';
const GH_MVP=GH_ORIGIN+'/SPARK-Workshop1/mvp.html';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('SPARK Reasoning Opportunity Builder')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}

function api(action,payload){
  const q=payload||{};
  if(action==='health') return {ok:true,service:'SPARK MVP v0.2'};
  if(action==='mvpEvent') return {ok:true};
  if(action==='mvpUncover'){
    const resolved=resolveSource_(q);
    q.sourceText=resolved.text;
    if(!q.fileName) q.fileName=resolved.label;
    return {ok:true,moments:mvpUncover_(q).moments||[]};
  }
  if(action==='mvpBuild'){
    if(!q.selectedMoment) throw new Error('Select a consequential moment first.');
    const resolved=resolveSource_(q);
    q.sourceText=resolved.text;
    if(!q.fileName) q.fileName=resolved.label;
    return {ok:true,artifact:mvpBuild_(q)};
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
      required:['id','title','source_location','current_task','consequential_judgment','why_it_matters','reasoning_focus','options'],
      properties:{
        id:{type:'string'},title:{type:'string'},source_location:{type:'string'},current_task:{type:'string'},
        consequential_judgment:{type:'string'},why_it_matters:{type:'string'},reasoning_focus:{type:'string'},
        options:{type:'array',minItems:4,maxItems:4,items:{
          type:'object',additionalProperties:false,required:['minutes','label','description'],
          properties:{minutes:{type:'integer',enum:[5,10,20,30]},label:{type:'string'},description:{type:'string'}}
        }}
      }
    }}}
  };
  const instructions=[
    'You are the SPARK consequential-moment generator for educators.',
    'Identify 3 to 5 places in the existing activity where students encounter, or could naturally encounter, a consequential reasoning moment.',
    'A consequential reasoning moment is a point where a student judgment could materially change depending on evidence, assumptions, uncertainty, competing explanations, tradeoffs, consequences, or new information.',
    'Do not redesign the lesson. Do not add generic critical-thinking activities. Do not duplicate reasoning already explicit in substantially the same form.',
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
    'Create a classroom-ready intervention for the selected consequential moment.',
    'Fit it into the existing activity rather than replacing the activity.',
    'Treat the selected duration as a real constraint.',
    'Preserve the consequential judgment and give students an authentic opportunity to make, justify, compare, test, or revise a judgment.',
    'Do not invent factual evidence. If new evidence is required but not supplied, state that need in teacher preparation.',
    'Teacher prompts should be ready to say or display. Student view should contain only student-facing material.',
    'Do not generate slides, standards alignment, rubrics, or extra formats.'
  ].join('\n');
  return openAIJson_(instructions,{
    original_activity:q.sourceText||'',file_name:q.fileName||'',grade_or_course:q.gradeCourse||'',subject:q.subject||'',
    learning_objective:q.objective||'',preserve:q.preserve||'',avoid:q.avoid||'',selected_moment:q.selectedMoment,
    duration_minutes:Number(q.minutes||10),activity_format:q.format||'discussion',teacher_adjustment:q.adjustment||''
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