/** SPARK MVP v0.2 standalone backend */
const GH_ORIGIN='https://paruchuri9-sys.github.io';
const GH_MVP=GH_ORIGIN+'/SPARK-Workshop1/mvp.html';

function doGet(e){
  const p=(e&&e.parameter)||{};
  if(String(p.bridge||'')==='1'){
    return HtmlService.createHtmlOutput(bridgeHtml_())
      .setTitle('SPARK MVP Bridge')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createHtmlOutput(shellHtml_())
    .setTitle('SPARK Reasoning Opportunity Builder')
    .addMetaTag('viewport','width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function shellHtml_(){
  const target=GH_MVP+'?embedded=1';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{width:100%;height:100%;border:0}</style></head><body>'
    +'<iframe id="app" src="'+target+'"></iframe>'
    +'<script>(function(){const ORIGIN='+JSON.stringify(GH_ORIGIN)+';const f=document.getElementById("app");window.addEventListener("message",function(ev){if(ev.origin!==ORIGIN)return;const d=ev.data||{};if(d.type!=="spark-mvp-api"||!d.id)return;google.script.run.withSuccessHandler(function(r){f.contentWindow.postMessage({type:"spark-mvp-api-result",id:d.id,ok:true,result:r},ORIGIN)}).withFailureHandler(function(err){f.contentWindow.postMessage({type:"spark-mvp-api-result",id:d.id,ok:false,error:(err&&err.message)||String(err)},ORIGIN)}).api(d.action,d.payload||{})})})();</script>'
    +'</body></html>';
}

function bridgeHtml_(){
  return '<!doctype html><html><body><script>(function(){parent.postMessage({type:"spark-mvp-relay-ready"},"*");window.addEventListener("message",function(ev){const d=ev.data||{};if(d.type!=="spark-mvp-api"||!d.id)return;google.script.run.withSuccessHandler(function(r){parent.postMessage({type:"spark-mvp-api-result",id:d.id,ok:true,result:r},"*")}).withFailureHandler(function(err){parent.postMessage({type:"spark-mvp-api-result",id:d.id,ok:false,error:(err&&err.message)||String(err)},"*")}).api(d.action,d.payload||{})})})();</script></body></html>';
}

function api(action,payload){
  const q=payload||{};
  if(action==='health') return {ok:true,service:'SPARK MVP v0.2'};
  if(action==='mvpEvent') return {ok:true};
  if(action==='mvpUncover'){
    const source=String(q.sourceText||'').trim();
    if(source.length<80) throw new Error('Activity text is too short to analyze.');
    return {ok:true,moments:mvpUncover_(q).moments||[]};
  }
  if(action==='mvpBuild'){
    if(!q.selectedMoment) throw new Error('Select a consequential moment first.');
    return {ok:true,artifact:mvpBuild_(q)};
  }
  throw new Error('Unknown action: '+action);
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