/** SPARK Workshop 1 backend v2.2: Apps Script shell + optimized Google Sheets store */
const ACCESS_KEY=['Go','Bears'].join('');
const GROUP_IDS=['Owl','Fox','Raven','Dolphin','Octopus'];
const STAGE_MINUTES=[4,6,5,8,7,5,6,8,18];
const GH_ORIGIN='https://paruchuri9-sys.github.io';
const GH_BASE=GH_ORIGIN+'/SPARK-Workshop1/';
const SHEETS={participants:'ParticipantsV2',responses:'ResponsesV2',votes:'VotesV2',events:'EventsV2',group:'GroupDataV2'};
const SETUP_CACHE_KEY='spark_setup_v22';

function doGet(e){
  ensureSetupCached_();
  const p=(e&&e.parameter)||{};
  const view=String(p.view||'');
  const fresh=String(p.fresh||'')==='1' ? '&fresh=1' : '';
  const target=view==='dashboard' ? GH_BASE+'dashboard.html?embedded=1' : GH_BASE+'?embedded=1'+fresh;
  return HtmlService.createHtmlOutput(shellHtml_(target))
    .setTitle(view==='dashboard'?'SPARK Workshop Dashboard':'SPARK Workshop 1')
    .addMetaTag('viewport','width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function shellHtml_(target){
  const safeTarget=JSON.stringify(target);
  const safeOrigin=JSON.stringify(GH_ORIGIN);
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f6f5f8}iframe{width:100%;height:100%;border:0;display:block}</style></head><body>'
    +'<iframe id="sparkFrame" src='+safeTarget+' allow="clipboard-write"></iframe>'
    +'<script>(function(){const ORIGIN='+safeOrigin+';const f=document.getElementById("sparkFrame");window.addEventListener("message",function(ev){if(ev.origin!==ORIGIN)return;const d=ev.data||{};if(d.type!=="spark-api"||!d.id)return;google.script.run.withSuccessHandler(function(r){f.contentWindow.postMessage({type:"spark-api-result",id:d.id,ok:true,result:r},ORIGIN)}).withFailureHandler(function(err){f.contentWindow.postMessage({type:"spark-api-result",id:d.id,ok:false,error:(err&&err.message)||String(err)},ORIGIN)}).api(d.action,d.payload||{})})})();</script>'
    +'</body></html>';
}

function api(action,payload){
  ensureSetupCached_();
  const q={action:action,...(payload||{})};
  if(action==='state'||action==='dashboard') return handle_(q);
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try{return handle_(q);}finally{lock.releaseLock();}
}

function ensureSetupCached_(){
  const cache=CacheService.getScriptCache();
  if(cache.get(SETUP_CACHE_KEY)) return;
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try{
    if(cache.get(SETUP_CACHE_KEY)) return;
    ensureSetup_();
    cache.put(SETUP_CACHE_KEY,'1',21600);
  }finally{lock.releaseLock();}
}

function ensureSetup_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet(),defs={};
  defs[SHEETS.participants]=['timestamp','id','name','group','role'];
  defs[SHEETS.responses]=['timestamp','group','key','participant_id','json'];
  defs[SHEETS.votes]=['timestamp','group','stage','participant_id','name','choice','confidence'];
  defs[SHEETS.events]=['timestamp','group','participant_id','event','stage','detail'];
  defs[SHEETS.group]=['group','key','json','updated'];
  Object.keys(defs).forEach(n=>{let sh=ss.getSheetByName(n);if(!sh)sh=ss.insertSheet(n);if(!sh.getLastRow())sh.appendRow(defs[n]);});
  const gd=readGroupData_();
  GROUP_IDS.forEach(g=>{if(!gd[g]||gd[g]._stage===undefined){upsertGroup_(g,'_started',false);upsertGroup_(g,'_stage',1);upsertGroup_(g,'_deadline',null);upsertGroup_(g,'_prompt','');}});
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
    if(role==='moderator'&&!readGroupValue_(g,'_started'))startGroup_(g);
    logEvent_(g,q.id,'join',Number(readGroupValue_(g,'_stage')||1),{name:q.name,role:role});
    invalidateGroupCache_(g);
    return {ok:true};
  }
  if(a==='state'){
    if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
    return {ok:true,state:stateForGroup_(g)};
  }
  if(a==='vote'){
    if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
    ss.getSheetByName(SHEETS.votes).appendRow([new Date(),g,q.stage,q.id,q.name||'',q.choice,q.confidence]);
    logEvent_(g,q.id,'decision_submit',q.stage,{choice:q.choice,confidence:q.confidence});
    invalidateGroupCache_(g);
    return {ok:true};
  }
  if(a==='submit'){
    if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
    upsertGroup_(g,q.key,q.value);
    ss.getSheetByName(SHEETS.responses).appendRow([new Date(),g,q.key,q.id||'',JSON.stringify(q.value||{})]);
    invalidateGroupCache_(g);
    return {ok:true};
  }
  if(a==='selectEvidence'){
    if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
    upsertGroup_(g,'selectedEvidence',q.ids||[]);
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
    const p=q.patch||{};
    if(Object.prototype.hasOwnProperty.call(p,'stage'))setStage_(g,Math.max(1,Math.min(9,Number(p.stage)||1)));
    if(Object.prototype.hasOwnProperty.call(p,'deadline'))upsertGroup_(g,'_deadline',p.deadline==null?null:Number(p.deadline));
    if(Object.prototype.hasOwnProperty.call(p,'prompt'))upsertGroup_(g,'_prompt',String(p.prompt||''));
    invalidateGroupCache_(g);
    return {ok:true};
  }
  if(a==='resetWorkshop'){
    if(q.key!==ACCESS_KEY)return {ok:false,error:'Invalid moderator key'};
    GROUP_IDS.forEach(x=>{upsertGroup_(x,'_started',false);upsertGroup_(x,'_stage',1);upsertGroup_(x,'_deadline',null);upsertGroup_(x,'_prompt','');upsertGroup_(x,'selectedEvidence',[]);invalidateGroupCache_(x);});
    return {ok:true};
  }
  return {ok:false,error:'Unknown action: '+a};
}

function startGroup_(g){upsertGroup_(g,'_started',true);upsertGroup_(g,'_stage',1);upsertGroup_(g,'_deadline',Date.now()+STAGE_MINUTES[0]*60000);upsertGroup_(g,'_prompt','');logEvent_(g,'','phase_started',1,{reason:'moderator_join'});}
function setStage_(g,s){upsertGroup_(g,'_started',true);upsertGroup_(g,'_stage',s);upsertGroup_(g,'_deadline',Date.now()+(STAGE_MINUTES[s-1]||5)*60000);upsertGroup_(g,'_prompt','');logEvent_(g,'','phase_started',s,{reason:'moderator_next'});}
function stateForGroup_(g){const cache=CacheService.getScriptCache();const key='spark_state_v22_'+g;const hit=cache.get(key);if(hit){try{const x=JSON.parse(hit);x.serverNow=Date.now();return x;}catch(e){}}const gd=readGroupData_()[g]||{},p=readParticipants_().filter(x=>x.group===g);const state={serverNow:Date.now(),started:!!gd._started,stage:Math.max(1,Math.min(9,Number(gd._stage||1))),deadline:gd._deadline==null?null:Number(gd._deadline),prompt:gd._prompt||'',selectedEvidence:gd.selectedEvidence||[],votes:readVotesForGroup_(g),groupData:stripControl_(gd),participants:p.filter(x=>x.role!=='moderator'),moderators:p.filter(x=>x.role==='moderator')};cache.put(key,JSON.stringify(state),1);return state;}
function invalidateGroupCache_(g){CacheService.getScriptCache().remove('spark_state_v22_'+g);}
function dashboardData_(){const ss=SpreadsheetApp.getActiveSpreadsheet(),people=readParticipants_(),gd=readGroupData_(),votes=readAllVotes_(),groups={};GROUP_IDS.forEach(g=>{const p=people.filter(x=>x.group===g),raw=gd[g]||{};groups[g]={state:{started:!!raw._started,stage:Math.max(1,Math.min(9,Number(raw._stage||1))),deadline:raw._deadline==null?null:Number(raw._deadline)},participants:p.filter(x=>x.role!=='moderator'),moderators:p.filter(x=>x.role==='moderator'),selectedEvidence:raw.selectedEvidence||[],votes:votes[g]||{},groupData:stripControl_(raw)};});return {generatedAt:Date.now(),spreadsheetUrl:ss.getUrl(),groups:groups,responses:readResponses_(),events:readEvents_()};}
function readResponses_(){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.responses),v=sh.getDataRange().getValues();return v.slice(1).filter(r=>r[0]).map(r=>{let val={};try{val=JSON.parse(r[4]||'{}')}catch(e){val=r[4]}return {ts:new Date(r[0]).getTime(),group:String(r[1]||''),key:String(r[2]||''),participantId:String(r[3]||''),value:val};});}
function readEvents_(){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.events),v=sh.getDataRange().getValues();return v.slice(1).filter(r=>r[0]).map(r=>{let d={};try{d=JSON.parse(r[5]||'{}')}catch(e){d=r[5]}return {ts:new Date(r[0]).getTime(),group:String(r[1]||''),participantId:String(r[2]||''),event:String(r[3]||''),stage:r[4],detail:d};});}
function stripControl_(gd){const o={};Object.keys(gd||{}).forEach(k=>{if(!k.startsWith('_'))o[k]=gd[k];});return o;}
function upsertParticipant_(id,name,g,role){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.participants),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(String(v[i][1])===String(id)){sh.getRange(i+1,1,1,5).setValues([[new Date(),id,name,g,role||'participant']]);return;}sh.appendRow([new Date(),id,name,g,role||'participant']);}
function readParticipants_(){const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.participants).getDataRange().getValues(),m={};v.slice(1).forEach(r=>{if(r[1])m[String(r[1])]={id:String(r[1]),name:String(r[2]||''),group:String(r[3]||''),role:String(r[4]||'participant')};});return Object.values(m);}
function readAllVotes_(){const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.votes).getDataRange().getValues(),all={};v.slice(1).forEach(r=>{const g=String(r[1]||''),p=String(r[3]||'');if(!g||!p)return;const s='s'+r[2];all[g]=all[g]||{};all[g][s]=all[g][s]||{};all[g][s][p]={name:String(r[4]||''),choice:r[5],confidence:Number(r[6]),ts:new Date(r[0]).getTime()};});return all;}
function readVotesForGroup_(g){return readAllVotes_()[g]||{};}
function readGroupData_(){const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.group).getDataRange().getValues(),o={};v.slice(1).forEach(r=>{if(!r[0])return;const g=String(r[0]);o[g]=o[g]||{};try{o[g][r[1]]=JSON.parse(r[2])}catch(e){o[g][r[1]]=r[2]}});return o;}
function readGroupValue_(g,k){const gd=readGroupData_();return gd[g]?gd[g][k]:undefined;}
function upsertGroup_(g,k,val){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.group),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(String(v[i][0])===String(g)&&String(v[i][1])===String(k)){sh.getRange(i+1,3,1,2).setValues([[JSON.stringify(val),new Date()]]);return;}sh.appendRow([g,k,JSON.stringify(val),new Date()]);}
function logEvent_(g,p,event,stage,detail){SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.events).appendRow([new Date(),g||'',p||'',event||'',stage||'',JSON.stringify(detail||{})]);}
