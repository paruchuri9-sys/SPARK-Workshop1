/** SPARK Workshop 1 production backend v1.3: moderator-controlled phases */
const ACCESS_KEY='GoBears';
const GROUP_IDS=['Owl','Fox','Raven','Dolphin','Octopus'];
const STAGE_MINUTES=[4,6,5,8,7,5,6,8,18,25];
const SHEETS={participants:'ParticipantsV2',responses:'ResponsesV2',votes:'VotesV2',events:'EventsV2',group:'GroupDataV2'};

function include(filename){return HtmlService.createHtmlOutputFromFile(filename).getContent();}
function doGet(e){
  ensureSetup_();
  const t=HtmlService.createTemplateFromFile('Index');
  t.boot=JSON.stringify({role:'participant',group:'',key:''});
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
 defs[SHEETS.participants]=['timestamp','id','name','group','role'];
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
   const role=String(q.role||'participant');
   if(role==='moderator'&&q.key!==ACCESS_KEY)return {ok:false,error:'Incorrect moderator code'};
   upsertParticipant_(q.id,q.name,g,role);
   if(role==='moderator'&&!readGroupValue_(g,'_started'))startGroup_(g,'moderator_join');
   logEvent_(g,q.id,'join',Number(readGroupValue_(g,'_stage')||1),{name:q.name,role:role});
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
   return {ok:true};
 }
 if(a==='submit'){
   if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
   upsertGroup_(g,q.key,q.value);
   ss.getSheetByName(SHEETS.responses).appendRow([new Date(),g,q.key,q.id||'',JSON.stringify(q.value||{})]);
   return {ok:true};
 }
 if(a==='selectEvidence'){
   if(!GROUP_IDS.includes(g))return {ok:false,error:'Invalid group'};
   upsertGroup_(g,'selectedEvidence',q.ids||[]);
   logEvent_(g,q.id,'evidence_selected',3,{ids:q.ids||[]});
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
   const patch=q.patch||{};
   if(Object.prototype.hasOwnProperty.call(patch,'stage')){
     const s=Math.max(1,Math.min(10,Number(patch.stage)||1));
     setStage_(g,s,'moderator_next');
   }
   if(Object.prototype.hasOwnProperty.call(patch,'deadline')){
     upsertGroup_(g,'_deadline',patch.deadline==null?null:Number(patch.deadline));
     logEvent_(g,'','timer_changed',Number(readGroupValue_(g,'_stage')||1),{deadline:patch.deadline});
   }
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
function startGroup_(g,reason){
 upsertGroup_(g,'_started',true);
 upsertGroup_(g,'_stage',Number(readGroupValue_(g,'_stage')||1));
 const s=Number(readGroupValue_(g,'_stage')||1);
 upsertGroup_(g,'_deadline',Date.now()+(STAGE_MINUTES[s-1]||5)*60000);
 upsertGroup_(g,'_prompt','');
 logEvent_(g,'','phase_started',s,{reason:reason||'moderator_join'});
}
function setStage_(g,s,reason){
 upsertGroup_(g,'_started',true);
 upsertGroup_(g,'_stage',s);
 upsertGroup_(g,'_deadline',Date.now()+(STAGE_MINUTES[s-1]||5)*60000);
 upsertGroup_(g,'_prompt','');
 logEvent_(g,'','phase_started',s,{reason:reason||'moderator_next'});
}
function stateForGroup_(g){
 const gd=readGroupData_()[g]||{},people=readParticipants_().filter(p=>p.group===g);
 return {serverNow:Date.now(),started:!!gd._started,stage:Number(gd._stage||1),deadline:gd._deadline==null?null:Number(gd._deadline),prompt:gd._prompt||'',selectedEvidence:gd.selectedEvidence||[],votes:readVotesForGroup_(g),groupData:stripControl_(gd),participants:people.filter(p=>p.role!=='moderator'),moderators:people.filter(p=>p.role==='moderator')};
}
function stripControl_(gd){const o={};Object.keys(gd||{}).forEach(k=>{if(!k.startsWith('_'))o[k]=gd[k]});return o;}
function upsertParticipant_(id,name,g,role){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.participants),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++){if(String(v[i][1])===String(id)){sh.getRange(i+1,1,1,5).setValues([[new Date(),id,name,g,role||'participant']]);return;}}sh.appendRow([new Date(),id,name,g,role||'participant']);}
function readParticipants_(){const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.participants).getDataRange().getValues(),m={};v.slice(1).forEach(r=>{if(r[1])m[String(r[1])]={id:String(r[1]),name:String(r[2]||''),group:String(r[3]||''),role:String(r[4]||'participant')}});return Object.values(m);}
function readVotesForGroup_(g){const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.votes).getDataRange().getValues(),o={};v.slice(1).forEach(r=>{if(String(r[1])!==g||!r[3])return;const s='s'+r[2],p=String(r[3]);o[s]=o[s]||{};o[s][p]={name:String(r[4]||''),choice:r[5],confidence:Number(r[6]),ts:new Date(r[0]).getTime()};});return o;}
function readGroupData_(){const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.group).getDataRange().getValues(),o={};v.slice(1).forEach(r=>{if(!r[0])return;const g=String(r[0]);o[g]=o[g]||{};try{o[g][r[1]]=JSON.parse(r[2]);}catch(e){o[g][r[1]]=r[2];}});return o;}
function readGroupValue_(g,k){const gd=readGroupData_();return gd[g]?gd[g][k]:undefined;}
function upsertGroup_(g,k,val){const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.group),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++){if(String(v[i][0])===String(g)&&String(v[i][1])===String(k)){sh.getRange(i+1,3,1,2).setValues([[JSON.stringify(val),new Date()]]);return;}}sh.appendRow([g,k,JSON.stringify(val),new Date()]);}
function logEvent_(g,p,event,stage,detail){SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.events).appendRow([new Date(),g||'',p||'',event||'',stage||'',JSON.stringify(detail||{})]);}
