/** SPARK Workshop 1 backend v2.6: explicit moderator start + resettable live group state */
const ACCESS_KEY=['Go','Bears'].join('');
const GROUP_IDS=['Owl','Fox','Raven','Dolphin','Octopus'];
const STAGE_MINUTES=[4,6,5,8,7,5,6,8,10];
const GH_ORIGIN='https://paruchuri9-sys.github.io';
const GH_BASE=GH_ORIGIN+'/SPARK-Workshop1/';
const SHEETS={participants:'ParticipantsV2',responses:'ResponsesV2',votes:'VotesV2',events:'EventsV2',group:'GroupDataV2',mvpEvents:'MVPEventsV1'};
const SETUP_CACHE_KEY='spark_setup_v26';
const TIME_ZONE='America/Chicago';

function doGet(e){
  ensureSetupCached_();
  const view=String((e&&e.parameter&&e.parameter.view)||'');
  const target=view==='dashboard' ? GH_BASE+'dashboard.html?embedded=1' : (view==='mvp' ? GH_BASE+'mvp.html?embedded=1' : GH_BASE+'?embedded=1');
  return HtmlService.createHtmlOutput(shellHtml_(target))
    .setTitle(view==='dashboard'?'SPARK Workshop Dashboard':(view==='mvp'?'SPARK Reasoning Opportunity Builder':'SPARK Workshop 1'))
    .addMetaTag('viewport','width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function shellHtml_(target){
  const safeTarget=JSON.stringify(target),safeOrigin=JSON.stringify(GH_ORIGIN);
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f6f5f8}iframe{width:100%;height:100%;border:0;display:block}</style></head><body>'
    +'<iframe id="sparkFrame" src='+safeTarget+' allow="clipboard-write"></iframe>'
    +'<script>(function(){const ORIGIN='+safeOrigin+';const f=document.getElementById("sparkFrame");window.addEventListener("message",function(ev){if(ev.origin!==ORIGIN)return;const d=ev.data||{};if(d.type!=="spark-api"||!d.id)return;google.script.run.withSuccessHandler(function(r){f.contentWindow.postMessage({type:"spark-api-result",id:d.id,ok:true,result:r},ORIGIN)}).withFailureHandler(function(err){f.contentWindow.postMessage({type:"spark-api-result",id:d.id,ok:false,error:(err&&err.message)||String(err)},ORIGIN)}).api(d.action,d.payload||{})})})();</script>'
    +'</body></html>';
}

function api(action,payload){
  ensureSetupCached_();
  const q={action:action,...(payload||{})};
  if(action==='state'||action==='dashboard')return handle_(q);
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{return handle_(q);}finally{lock.releaseLock();}
}

function ensureSetupCached_(){
  const cache=CacheService.getScriptCache();
  if(cache.get(SETUP_CACHE_KEY))return;
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{if(cache.get(SETUP_CACHE_KEY))return;ensureSetup_();cache.put(SETUP_CACHE_KEY,'1',21600);}finally{lock.releaseLock();}
}

function ensureSetup_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(ss.getSpreadsheetTimeZone()!==TIME_ZONE)ss.setSpreadsheetTimeZone(TIME_ZONE);
  const defs={};
  defs[SHEETS.participants]=['timestamp','id','name','group','role'];
  defs[SHEETS.responses]=['timestamp','group','key','participant_id','json'];
  defs[SHEETS.votes]=['timestamp','group','stage','participant_id','name','choice','confidence'];
  defs[SHEETS.events]=['timestamp','group','participant_id','event','stage','detail'];
  defs[SHEETS.group]=['group','key','json','updated'];
  defs[SHEETS.mvpEvents]=['timestamp','session_id','event','json'];
  Object.keys(defs).forEach(n=>{let sh=ss.getSheetByName(n);if(!sh)sh=ss.insertSheet(n);if(!sh.getLastRow())sh.appendRow(defs[n]);});
  const gd=readGroupData_();
  GROUP_IDS.forEach(g=>{if(!gd[g]||gd[g]._stage===undefined){upsertGroup_(g,'_started',false);upsertGroup_(g,'_stage',1);upsertGroup_(g,'_deadline',null);upsertGroup_(g,'_prompt','');upsertGroup_(g,'_resetAt',0);}});
}

function handle_(q){
  const a=q.action,ss=SpreadsheetApp.getActiveSpreadsheet(),g=String(q.group||'');
  if(a==='dashboard'){
    if(q.key!==ACCESS_KEY)return {ok:false,error:'Invalid moderator code'};
    return {ok:true,data:dashboardData_()};
  }
  if(a==='join'){
    if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
    const role=String(q.role||'participant');
    if(role==='moderator'&&q.key!==ACCESS_KEY)return {ok:false,error:'Incorrect moderator code'};
    upsertParticipant_(q.id,q.name,g,role);
    logEvent_(g,q.id,'join',Number(readGroupValue_(g,'_stage')||1),{name:q.name,role:role});
    invalidateGroupCache_(g);
    return {ok:true};
  }
  if(a==='state'){
    if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
    return {ok:true,state:stateForGroup_(g)};
  }
  if(a==='startGroup'){
    if(q.key!==ACCESS_KEY)return {ok:false,error:'Invalid moderator code'};
    if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
    if(!!readGroupValue_(g,'_started'))return {ok:true,alreadyStarted:true};
    startGroup_(g,q.id||'');
    invalidateGroupCache_(g);
    return {ok:true};
  }
  if(a==='vote'){
    if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
    if(!readGroupValue_(g,'_started'))return {ok:false,error:'This group has not started yet.'};
    ss.getSheetByName(SHEETS.votes).appendRow([new Date(),g,q.stage,q.id,q.name||'',q.choice,q.confidence]);
    if(q.responseKey){
      upsertGroup_(g,q.responseKey,q.responseValue||{});
      ss.getSheetByName(SHEETS.responses).appendRow([new Date(),g,q.responseKey,q.id||'',JSON.stringify(q.responseValue||{})]);
    }
    logEvent_(g,q.id,'decision_submit',q.stage,{choice:q.choice,confidence:q.confidence});
    invalidateGroupCache_(g);
    return {ok:true};
  }
  if(a==='submit'){
    if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
    if(!readGroupValue_(g,'_started'))return {ok:false,error:'This group has not started yet.'};
    if(q.once&&readGroupValue_(g,q.key)!==undefined)return {ok:false,error:'A group response has already been submitted.'};
    upsertGroup_(g,q.key,q.value);
    ss.getSheetByName(SHEETS.responses).appendRow([new Date(),g,q.key,q.id||'',JSON.stringify(q.value||{})]);
    invalidateGroupCache_(g);
    return {ok:true};
  }
  if(a==='selectEvidence'){
    if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
    if(!readGroupValue_(g,'_started'))return {ok:false,error:'This group has not started yet.'};
    if(q.once&&readGroupValue_(g,'stage3')!==undefined)return {ok:false,error:'A group evidence choice has already been submitted.'};
    upsertGroup_(g,'selectedEvidence',q.ids||[]);
    if(q.value){
      upsertGroup_(g,'stage3',q.value);
      ss.getSheetByName(SHEETS.responses).appendRow([new Date(),g,'stage3',q.id||'',JSON.stringify(q.value||{})]);
    }
    logEvent_(g,q.id,'evidence_selected',3,{ids:q.ids||[]});
    invalidateGroupCache_(g);
    return {ok:true};
  }
  if(a==='event'){
    if(q.key&&q.key!==ACCESS_KEY)return {ok:false,error:'Invalid moderator key'};
    logEvent_(g,q.id||'',q.event||'',q.stage||'',q);
    return {ok:true};
  }
  if(a==='moderator'){
    if(q.key!==ACCESS_KEY)return {ok:false,error:'Invalid moderator code'};
    if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
    if(!readGroupValue_(g,'_started'))return {ok:false,error:'Start Phase 1 first.'};
    const p=q.patch||{};
    if(Object.prototype.hasOwnProperty.call(p,'stage'))setStage_(g,Math.max(1,Math.min(9,Number(p.stage)||1)));
    if(Object.prototype.hasOwnProperty.call(p,'deadline'))upsertGroup_(g,'_deadline',p.deadline==null?null:Number(p.deadline));
    if(Object.prototype.hasOwnProperty.call(p,'prompt'))upsertGroup_(g,'_prompt',String(p.prompt||''));
    invalidateGroupCache_(g);
    return {ok:true};
  }
  if(a==='resetGroup'){
    if(q.key!==ACCESS_KEY)return {ok:false,error:'Invalid moderator key'};
    if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
    resetGroup_(g);
    return {ok:true};
  }
  if(a==='resetWorkshop'){
    if(q.key!==ACCESS_KEY)return {ok:false,error:'Invalid moderator key'};
    GROUP_IDS.forEach(resetGroup_);
    return {ok:true};
  }
  if(a==='mvpEvent'){
    logMvpEvent_(q.sessionId||'',q.event||'',q.detail||{});
    return {ok:true};
  }
  if(a==='mvpUncover'){
    const source=String(q.sourceText||'').trim();
    if(source.length<80)return {ok:false,error:'Activity text is too short to analyze.'};
    const result=mvpUncover_(q);
    logMvpEvent_(q.sessionId||'','uncover_complete',{count:(result.moments||[]).length,fileName:q.fileName||'',gradeCourse:q.gradeCourse||'',subject:q.subject||''});
    return {ok:true,moments:result.moments||[]};
  }
  if(a==='mvpBuild'){
    if(!q.selectedMoment)return {ok:false,error:'Select a consequential moment first.'};
    const artifact=mvpBuild_(q);
    logMvpEvent_(q.sessionId||'','build_complete',{momentId:q.selectedMoment.id||'',minutes:Number(q.minutes||0),format:q.format||''});
    return {ok:true,artifact:artifact};
  }
  return {ok:false,error:'Unknown action: '+a};
}

function startGroup_(g,moderatorId){
  upsertGroup_(g,'_started',true);
  upsertGroup_(g,'_stage',1);
  upsertGroup_(g,'_deadline',Date.now()+STAGE_MINUTES[0]*60000);
  upsertGroup_(g,'_prompt','');
  logEvent_(g,moderatorId||'','phase_started',1,{reason:'moderator_start'});
}
function setStage_(g,s){upsertGroup_(g,'_started',true);upsertGroup_(g,'_stage',s);upsertGroup_(g,'_deadline',Date.now()+(STAGE_MINUTES[s-1]||5)*60000);upsertGroup_(g,'_prompt','');logEvent_(g,'','phase_started',s,{reason:'moderator_next'});}

function resetGroup_(g){
  const resetAt=Date.now();
  clearGroupStateRows_(g);
  upsertGroup_(g,'_started',false);
  upsertGroup_(g,'_stage',1);
  upsertGroup_(g,'_deadline',null);
  upsertGroup_(g,'_prompt','');
  upsertGroup_(g,'_resetAt',resetAt);
  upsertGroup_(g,'selectedEvidence',[]);
  logEvent_(g,'','group_reset',1,{resetAt:resetAt});
  invalidateGroupCache_(g);
}
function clearGroupStateRows_(g){
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.group),v=sh.getDataRange().getValues();
  for(let i=v.length-1;i>=1;i--)if(String(v[i][0])===String(g))sh.deleteRow(i+1);
}

function stateForGroup_(g){
  const cache=CacheService.getScriptCache(),key='spark_state_v26_'+g,hit=cache.get(key);
  if(hit){try{const x=JSON.parse(hit);x.serverNow=Date.now();return x;}catch(e){}}
  const gd=readGroupData_()[g]||{},resetAt=Number(gd._resetAt||0),p=readParticipants_().filter(x=>x.group===g&&x.ts>=resetAt);
  const state={serverNow:Date.now(),started:!!gd._started,stage:Math.max(1,Math.min(9,Number(gd._stage||1))),deadline:gd._deadline==null?null:Number(gd._deadline),prompt:gd._prompt||'',selectedEvidence:gd.selectedEvidence||[],votes:readVotesForGroup_(g,resetAt),groupData:stripControl_(gd),participants:p.filter(x=>x.role!=='moderator'),moderators:p.filter(x=>x.role==='moderator')};
  cache.put(key,JSON.stringify(state),3);
  return state;
}
function invalidateGroupCache_(g){CacheService.getScriptCache().remove('spark_state_v26_'+g);}

function dashboardData_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet(),people=readParticipants_(),gd=readGroupData_(),groups={};
  GROUP_IDS.forEach(g=>{const raw=gd[g]||{},resetAt=Number(raw._resetAt||0),p=people.filter(x=>x.group===g&&x.ts>=resetAt);groups[g]={state:{started:!!raw._started,stage:Math.max(1,Math.min(9,Number(raw._stage||1))),deadline:raw._deadline==null?null:Number(raw._deadline),resetAt:resetAt},participants:p.filter(x=>x.role!=='moderator'),moderators:p.filter(x=>x.role==='moderator'),selectedEvidence:raw.selectedEvidence||[],votes:readVotesForGroup_(g,resetAt),groupData:stripControl_(raw)};});
  return {generatedAt:Date.now(),spreadsheetUrl:ss.getUrl(),groups:groups};
}
function readResponses_(){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.responses),v=sh.getDataRange().getValues();return v.slice(1).filter(r=>r[0]).map(r=>{let val={};try{val=JSON.parse(r[4]||'{}')}catch(e){val=r[4]}return {ts:new Date(r[0]).getTime(),group:String(r[1]||''),key:String(r[2]||''),participantId:String(r[3]||''),value:val};});}
function readEvents_(){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.events),v=sh.getDataRange().getValues();return v.slice(1).filter(r=>r[0]).map(r=>{let d={};try{d=JSON.parse(r[5]||'{}')}catch(e){d=r[5]}return {ts:new Date(r[0]).getTime(),group:String(r[1]||''),participantId:String(r[2]||''),event:String(r[3]||''),stage:r[4],detail:d};});}
function stripControl_(gd){const o={};Object.keys(gd||{}).forEach(k=>{if(!k.startsWith('_'))o[k]=gd[k];});return o;}
function upsertParticipant_(id,name,g,role){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.participants),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(String(v[i][1])===String(id)){sh.getRange(i+1,1,1,5).setValues([[new Date(),id,name,g,role||'participant']]);return;}sh.appendRow([new Date(),id,name,g,role||'participant']);}
function readParticipants_(){const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.participants).getDataRange().getValues(),m={};v.slice(1).forEach(r=>{if(r[1])m[String(r[1])]={ts:new Date(r[0]).getTime(),id:String(r[1]),name:String(r[2]||''),group:String(r[3]||''),role:String(r[4]||'participant')};});return Object.values(m);}
function readAllVotes_(){const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.votes).getDataRange().getValues(),all={};v.slice(1).forEach(r=>{const g=String(r[1]||''),p=String(r[3]||'');if(!g||!p)return;const s='s'+r[2];all[g]=all[g]||{};all[g][s]=all[g][s]||{};all[g][s][p]={name:String(r[4]||''),choice:r[5],confidence:Number(r[6]),ts:new Date(r[0]).getTime()};});return all;}
function readVotesForGroup_(g,since){const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.votes).getDataRange().getValues(),out={};v.slice(1).forEach(r=>{const ts=new Date(r[0]).getTime(),rg=String(r[1]||''),p=String(r[3]||'');if(rg!==g||!p||ts<Number(since||0))return;const s='s'+r[2];out[s]=out[s]||{};out[s][p]={name:String(r[4]||''),choice:r[5],confidence:Number(r[6]),ts:ts};});return out;}
function readGroupData_(){const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.group).getDataRange().getValues(),o={};v.slice(1).forEach(r=>{if(!r[0])return;const g=String(r[0]);o[g]=o[g]||{};try{o[g][r[1]]=JSON.parse(r[2])}catch(e){o[g][r[1]]=r[2]}});return o;}
function readGroupValue_(g,k){const gd=readGroupData_();return gd[g]?gd[g][k]:undefined;}
function upsertGroup_(g,k,val){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.group),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(String(v[i][0])===String(g)&&String(v[i][1])===String(k)){sh.getRange(i+1,3,1,2).setValues([[JSON.stringify(val),new Date()]]);return;}sh.appendRow([g,k,JSON.stringify(val),new Date()]);}
function logEvent_(g,p,event,stage,detail){SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.events).appendRow([new Date(),g||'',p||'',event||'',stage||'',JSON.stringify(detail||{})]);}


function logMvpEvent_(sessionId,event,detail){
  try{
    const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.mvpEvents);
    if(sh)sh.appendRow([new Date(),String(sessionId||''),String(event||''),JSON.stringify(detail||{})]);
  }catch(e){}
}

function mvpUncover_(q){
  const schema={
    type:'object',additionalProperties:false,required:['moments'],
    properties:{moments:{type:'array',minItems:3,maxItems:5,items:{
      type:'object',additionalProperties:false,
      required:['id','title','source_location','current_task','consequential_judgment','why_it_matters','reasoning_focus','options'],
      properties:{
        id:{type:'string'},
        title:{type:'string'},
        source_location:{type:'string'},
        current_task:{type:'string'},
        consequential_judgment:{type:'string'},
        why_it_matters:{type:'string'},
        reasoning_focus:{type:'string'},
        options:{type:'array',minItems:3,maxItems:3,items:{
          type:'object',additionalProperties:false,required:['minutes','label','description'],
          properties:{minutes:{type:'integer',enum:[5,10,20]},label:{type:'string'},description:{type:'string'}}
        }}
      }
    }}}
  };
  const instructions=[
    'You are the SPARK consequential-moment generator for educators.',
    'Analyze the existing instructional activity and identify 3 to 5 places where students encounter, or could naturally encounter, a consequential reasoning moment.',
    'A consequential reasoning moment is a point where a student judgment could materially change depending on evidence, assumptions, uncertainty, competing explanations, tradeoffs, consequences, or new information.',
    'Do not redesign the lesson. Do not provide generic critical-thinking activities. Do not duplicate reasoning already explicit in substantially the same form.',
    'Ground every moment in a specific place in the supplied activity.',
    'For each moment, create 5-, 10-, and 20-minute realizations of the SAME underlying reasoning opportunity, not three unrelated activities.',
    'Preserve the teacher\'s learning objective and constraints when supplied.',
    'Use plain teacher-facing language. Avoid pedagogical jargon unless it clarifies the reasoning focus.',
    'Quality gate: reject candidates that merely add engagement, explanation, recall, or extra work without a meaningful student judgment.',
    'Return only the structured result requested.'
  ].join('\n');
  return mvpOpenAIJson_(instructions,{
    activity:q.sourceText,
    file_name:q.fileName||'',
    grade_or_course:q.gradeCourse||'',
    subject:q.subject||'',
    additional_time_minutes:Number(q.availableTime||10),
    learning_objective:q.objective||'',
    preserve:q.preserve||'',
    avoid:q.avoid||''
  },schema,'spark_consequential_moments');
}

function mvpBuild_(q){
  const schema={
    type:'object',additionalProperties:false,required:['teacher','student'],
    properties:{
      teacher:{type:'object',additionalProperties:false,required:['purpose','where_to_insert','preparation','facilitation','prompts','look_for'],properties:{
        purpose:{type:'string'},
        where_to_insert:{type:'string'},
        preparation:{type:'array',items:{type:'string'}},
        facilitation:{type:'array',items:{type:'string'}},
        prompts:{type:'array',items:{type:'string'}},
        look_for:{type:'array',items:{type:'string'}}
      }},
      student:{type:'object',additionalProperties:false,required:['instructions','evidence','questions'],properties:{
        instructions:{type:'array',items:{type:'string'}},
        evidence:{type:'array',items:{type:'string'}},
        questions:{type:'array',items:{type:'string'}}
      }}
    }
  };
  const instructions=[
    'You are the SPARK classroom-intervention builder.',
    'Create a classroom-ready intervention for the educator-selected consequential moment.',
    'The intervention must fit into the existing activity rather than replace it.',
    'Treat the selected duration as a real constraint.',
    'Preserve the selected consequential judgment. Give students an authentic opportunity to make, justify, compare, test, or revise a judgment.',
    'Do not turn the intervention into generic reflection questions.',
    'Use only information supported by the supplied activity unless the selected moment explicitly requires teacher-provided new evidence. If new evidence is needed but not supplied, state that need in teacher preparation and do not invent factual evidence.',
    'Teacher prompts should be ready to say or display. Student view should contain only student-facing directions, evidence already available in the source, and questions.',
    'Do not generate slides, standards alignment, a rubric, or additional formats.',
    'Return only the structured result requested.'
  ].join('\n');
  return mvpOpenAIJson_(instructions,{
    original_activity:q.sourceText||'',
    file_name:q.fileName||'',
    grade_or_course:q.gradeCourse||'',
    subject:q.subject||'',
    learning_objective:q.objective||'',
    preserve:q.preserve||'',
    avoid:q.avoid||'',
    selected_moment:q.selectedMoment,
    duration_minutes:Number(q.minutes||10),
    activity_format:q.format||'discussion',
    teacher_adjustment:q.adjustment||''
  },schema,'spark_classroom_intervention');
}

function mvpOpenAIJson_(instructions,input,schema,name){
  const props=PropertiesService.getScriptProperties();
  const apiKey=props.getProperty('OPENAI_API_KEY');
  if(!apiKey)throw new Error('SPARK is not configured yet. Add OPENAI_API_KEY to Apps Script Script Properties.');
  const model=props.getProperty('SPARK_MODEL')||'gpt-6-luna';
  const payload={
    model:model,
    instructions:instructions,
    input:JSON.stringify(input),
    text:{format:{type:'json_schema',name:name,strict:true,schema:schema}}
  };
  const res=UrlFetchApp.fetch('https://api.openai.com/v1/responses',{
    method:'post',
    contentType:'application/json',
    headers:{Authorization:'Bearer '+apiKey},
    payload:JSON.stringify(payload),
    muteHttpExceptions:true
  });
  const code=res.getResponseCode(),body=res.getContentText();
  if(code<200||code>=300){
    let message='AI request failed ('+code+').';
    try{const j=JSON.parse(body);message=(j.error&&j.error.message)||message;}catch(e){}
    throw new Error(message);
  }
  const j=JSON.parse(body);
  let text='';
  if(j.output_text)text=j.output_text;
  if(!text&&Array.isArray(j.output)){
    j.output.forEach(function(item){
      (item.content||[]).forEach(function(part){
        if(part&&typeof part.text==='string')text+=part.text;
      });
    });
  }
  if(!text)throw new Error('AI returned no usable structured output.');
  try{return JSON.parse(text);}catch(e){throw new Error('AI returned invalid structured output.');}
}
