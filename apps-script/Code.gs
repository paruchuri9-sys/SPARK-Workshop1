/** SPARK Workshop 1 production backend v1.1: automatic phase flow */
const ACCESS_KEY='GoBears';
const GROUP_IDS=['Owl','Fox','Raven','Dolphin','Octopus'];
const STAGE_MINUTES=[4,6,5,8,7,5,6,8,18,25];
const SHEETS={participants:'ParticipantsV2',responses:'ResponsesV2',votes:'VotesV2',events:'EventsV2',group:'GroupDataV2'};

function include(filename){return HtmlService.createHtmlOutputFromFile(filename).getContent();}
function doGet(e){
  ensureSetup_();
  const t=HtmlService.createTemplateFromFile('Index');
  const requested=(e&&e.parameter.role)||'participant',key=(e&&e.parameter.key)||'';
  const role=(requested==='moderator'&&key===ACCESS_KEY)?'moderator':(requested==='review'?'review':'participant');
  t.boot=JSON.stringify({role:role,group:(e&&e.parameter.group)||'',key:key});
  return t.evaluate().setTitle('SPARK Workshop 1').addMetaTag('viewport','width=device-width, initial-scale=1');
}
function api(action,payload){
  ensureSetup_();
  const lock=LockService.getScriptLock();
  lock.waitLock(10000);
  try{return handle_({action:action,...(payload||{})});}
  finally{lock.releaseLock();}
}

function ensureSetup_(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();
 const defs={};
 defs[SHEETS.participants]=['timestamp','id','name','group'];
 defs[SHEETS.responses]=['timestamp','group','key','participant_id','json'];
 defs[SHEETS.votes]=['timestamp','group','stage','participant_id','name','choice','confidence'];
 defs[SHEETS.events]=['timestamp','group','participant_id','event','stage','detail'];
 defs[SHEETS.group]=['group','key','json','updated'];
 Object.keys(defs).forEach(n=>{let sh=ss.getSheetByName(n);if(!sh)sh=ss.insertSheet(n);if(sh.getLastRow()===0)sh.appendRow(defs[n]);});
 GROUP_IDS.forEach(g=>{if(readGroupValue_(g,'_stage')===undefined){upsertGroup_(g,'_started',false);upsertGroup_(g,'_stage',1);upsertGroup_(g,'_deadline',null);upsertGroup_(g,'_prompt','');}});
}
function handle_(q){
 const a=q.action,ss=SpreadsheetApp.getActiveSpreadsheet(),g=String(q.group||'');
 if(a==='join'){
   if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
   upsertParticipant_(q.id,q.name,g);
   if(!readGroupValue_(g,'_started'))startGroup_(g);
   logEvent_(g,q.id,'join',Number(readGroupValue_(g,'_stage')||1),{name:q.name});
   maybeAutoAdvance_(g);
   return {ok:true};
 }
 if(a==='state'){
   if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
   maybeAutoAdvance_(g);
   return {ok:true,state:stateForGroup_(g)};
 }
 if(a==='vote'){
   if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
   ss.getSheetByName(SHEETS.votes).appendRow([new Date(),g,q.stage,q.id,q.name||'',q.choice,q.confidence]);
   logEvent_(g,q.id,'decision_submit',q.stage,{choice:q.choice,confidence:q.confidence});
   maybeAutoAdvance_(g);
   return {ok:true};
 }
 if(a==='submit'){
   if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
   upsertGroup_(g,q.key,q.value);
   ss.getSheetByName(SHEETS.responses).appendRow([new Date(),g,q.key,q.id||'',JSON.stringify(q.value||{})]);
   maybeAutoAdvance_(g);
   return {ok:true};
 }
 if(a==='selectEvidence'){
   if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
   upsertGroup_(g,'selectedEvidence',q.ids||[]);
   logEvent_(g,q.id,'evidence_selected',3,{ids:q.ids||[]});
   maybeAutoAdvance_(g);
   return {ok:true};
 }
 if(a==='event'){
   if(q.key&&q.key!==ACCESS_KEY)return {ok:false,error:'Invalid moderator key'};
   logEvent_(g,q.id||'',q.event||'',q.stage||'',q);
   return {ok:true};
 }
 if(a==='moderator'){
   if(q.key!==ACCESS_KEY)return {ok:false,error:'Invalid moderator key'};
   if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
   const patch=q.patch||{};
   if(Object.prototype.hasOwnProperty.call(patch,'stage')){
     const s=Math.max(1,Math.min(10,Number(patch.stage)||1));
     setStage_(g,s,'moderator_override');
   }
   if(Object.prototype.hasOwnProperty.call(patch,'deadline'))upsertGroup_(g,'_deadline',patch.deadline==null?null:Number(patch.deadline));
   if(Object.prototype.hasOwnProperty.call(patch,'prompt')){
     upsertGroup_(g,'_prompt',String(patch.prompt||''));
     logEvent_(g,'','prompt_changed',Number(readGroupValue_(g,'_stage')||1),{prompt:String(patch.prompt||'')});
   }
   return {ok:true};
 }
 if(a==='resetWorkshop'){
   if(q.key!==ACCESS_KEY)return {ok:false,error:'Invalid moderator key'};
   GROUP_IDS.forEach(x=>{upsertGroup_(x,'_started',false);upsertGroup_(x,'_stage',1);upsertGroup_(x,'_deadline',null);upsertGroup_(x,'_prompt','');upsertGroup_(x,'selectedEvidence',[]);});
   return {ok:true};
 }
 return {ok:false,error:'Unknown action: '+a};
}
function startGroup_(g){
 upsertGroup_(g,'_started',true);
 upsertGroup_(g,'_stage',1);
 upsertGroup_(g,'_deadline',Date.now()+STAGE_MINUTES[0]*60000);
 upsertGroup_(g,'_prompt','');
 logEvent_(g,'','phase_started',1,{reason:'first_participant_join'});
}
function setStage_(g,s,reason){
 upsertGroup_(g,'_started',true);
 upsertGroup_(g,'_stage',s);
 upsertGroup_(g,'_deadline',Date.now()+(STAGE_MINUTES[s-1]||5)*60000);
 upsertGroup_(g,'_prompt','');
 logEvent_(g,'','phase_started',s,{reason:reason||'advance'});
}
function maybeAutoAdvance_(g){
 let guard=0;
 while(guard++<10){
   const gd=readGroupData_()[g]||{},s=Number(gd._stage||1);
   if(!gd._started||s>=10||!phaseComplete_(g,s,gd))return;
   setStage_(g,s+1,'automatic_completion');
 }
}
function phaseComplete_(g,s,gd){
 const ps=readParticipants_().filter(p=>p.group===g),votes=readVotesForGroup_(g)[`s${s}`]||{};
 const allVoted=ps.length>=2&&ps.every(p=>!!votes[p.id]);
 if(s===1){
   const deadline=Number(gd._deadline||0),startedAt=deadline?deadline-STAGE_MINUTES[0]*60000:Date.now();
   return allVoted&&(Date.now()-startedAt>=30000);
 }
 if(s===2)return !!gd.stage2;
 if(s===3)return !!gd.stage3&&Array.isArray(gd.selectedEvidence)&&gd.selectedEvidence.length===2;
 if(s===4)return !!gd.stage4;
 if(s===5)return allVoted&&!!gd.stage5;
 if(s===6)return allVoted;
 if(s===7)return !!gd.stage7;
 if(s===8)return allVoted&&!!gd.stage8;
 if(s===9)return !!gd.stage9;
 return false;
}
function stateForGroup_(g){
 const gd=readGroupData_()[g]||{};
 return {started:!!gd._started,stage:Number(gd._stage||1),deadline:gd._deadline==null?null:Number(gd._deadline),prompt:gd._prompt||'',selectedEvidence:gd.selectedEvidence||[],votes:readVotesForGroup_(g),groupData:stripControl_(gd),participants:readParticipants_().filter(p=>p.group===g)};
}
function stripControl_(gd){const o={};Object.keys(gd||{}).forEach(k=>{if(!k.startsWith('_'))o[k]=gd[k]});return o;}
function upsertParticipant_(id,name,g){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.participants),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++){if(String(v[i][1])===String(id)){sh.getRange(i+1,1,1,4).setValues([[new Date(),id,name,g]]);return;}}sh.appendRow([new Date(),id,name,g]);}
function readParticipants_(){const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.participants).getDataRange().getValues(),m={};v.slice(1).forEach(r=>{if(r[1])m[String(r[1])]={id:String(r[1]),name:String(r[2]||''),group:String(r[3]||'')}});return Object.values(m);}
function readVotesForGroup_(g){const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.votes).getDataRange().getValues(),o={};v.slice(1).forEach(r=>{if(String(r[1])!==g||!r[3])return;const s='s'+r[2],p=String(r[3]);o[s]=o[s]||{};o[s][p]={name:String(r[4]||''),choice:r[5],confidence:Number(r[6]),ts:new Date(r[0]).getTime()};});return o;}
function readGroupData_(){const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.group).getDataRange().getValues(),o={};v.slice(1).forEach(r=>{if(!r[0])return;const g=String(r[0]);o[g]=o[g]||{};try{o[g][r[1]]=JSON.parse(r[2]);}catch(e){o[g][r[1]]=r[2];}});return o;}
function readGroupValue_(g,k){const gd=readGroupData_();return gd[g]?gd[g][k]:undefined;}
function upsertGroup_(g,k,val){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.group),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++){if(String(v[i][0])===String(g)&&String(v[i][1])===String(k)){sh.getRange(i+1,3,1,2).setValues([[JSON.stringify(val),new Date()]]);return;}}sh.appendRow([g,k,JSON.stringify(val),new Date()]);}
function logEvent_(g,p,event,stage,detail){SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.events).appendRow([new Date(),g||'',p||'',event||'',stage||'',JSON.stringify(detail||{})]);}
