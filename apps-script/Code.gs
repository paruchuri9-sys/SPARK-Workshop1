/**
 * SPARK Workshop 1 - Apps Script backend v0.5
 * Group-specific moderator release. No assigned recorder role.
 */
const SHEETS = ["Config","Participants","Responses","Votes","Events","GroupData"];
const STAGE_MINUTES = [4,6,5,8,7,5,6,8,18,25];
const GROUP_IDS = ["1","2","3","4","5","6"];
const ACCESS_KEY = "GoBears";

function setup(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  SHEETS.forEach(n=>{ if(!ss.getSheetByName(n)) ss.insertSheet(n); });
  initSheet_(ss.getSheetByName("Config"),["key","value"]);
  initSheet_(ss.getSheetByName("Participants"),["timestamp","participant","group","recorder"]);
  initSheet_(ss.getSheetByName("Responses"),["timestamp","group","key","participant","json"]);
  initSheet_(ss.getSheetByName("Votes"),["timestamp","group","stage","participant","choice","confidence"]);
  initSheet_(ss.getSheetByName("Events"),["timestamp","group","participant","event","stage","detail"]);
  initSheet_(ss.getSheetByName("GroupData"),["group","key","json","updated"]);
  setConfig_("workshopTitle","SPARK Workshop 1");
  GROUP_IDS.forEach(g=>{
    upsertGroup_(g,"_prompt","");
    upsertGroup_(g,"_started",false);
    upsertGroup_(g,"_stage",1);
    upsertGroup_(g,"_deadline",null);
  });
}

function include(filename){ return HtmlService.createHtmlOutputFromFile(filename).getContent(); }

function doGet(e){
  const t=HtmlService.createTemplateFromFile("Index");
  const requested=(e&&e.parameter.role)||"participant";
  const key=(e&&e.parameter.key)||"";
  const role=(requested==="participant"||key===ACCESS_KEY)?requested:"participant";
  t.boot=JSON.stringify({role:role,group:(e&&e.parameter.group)||"1",key:key});
  return t.evaluate().setTitle("SPARK Workshop 1").addMetaTag("viewport","width=device-width, initial-scale=1");
}

function api(action,payload){ return handle_({action:action,...(payload||{})}); }

function handle_(q){
  const ss=SpreadsheetApp.getActiveSpreadsheet(),a=q.action;
  if(a==="join"){
    ss.getSheetByName("Participants").appendRow([new Date(),q.participant,q.group,false]);
    logEvent_(q.group,q.participant,"join",stateForGroup_(q.group).stage,{});
    return {ok:true};
  }
  if(a==="event"){
    logEvent_(q.group||"",q.participant||"",q.event||"",q.stage||"",q);
    return {ok:true};
  }
  if(a==="submit"){
    upsertGroup_(q.group,q.key,q.value);
    ss.getSheetByName("Responses").appendRow([new Date(),q.group,q.key,q.participant||"",JSON.stringify(q.value)]);
    return {ok:true};
  }
  if(a==="vote"){
    ss.getSheetByName("Votes").appendRow([new Date(),q.group,q.stage,q.participant,q.choice,q.confidence]);
    logEvent_(q.group,q.participant,"decision_submit",q.stage,{choice:q.choice,confidence:q.confidence});
    return {ok:true};
  }
  if(a==="selectEvidence"){
    upsertGroup_(q.group,"selectedEvidence",q.ids);
    logEvent_(q.group,q.participant||"","evidence_selected",3,{ids:q.ids});
    return {ok:true};
  }
  if(a==="ready") return {ok:true};
  if(a==="facilitator"){
    const g=String(q.group||"1"),patch=q.patch||{},gd=readGroupData_()[g]||{};
    if(Object.prototype.hasOwnProperty.call(patch,"prompt")) upsertGroup_(g,"_prompt",String(patch.prompt||""));
    if(Object.prototype.hasOwnProperty.call(patch,"started")){
      upsertGroup_(g,"_started",!!patch.started);
      if(patch.started){
        const stage=Number(gd._stage||1),mins=STAGE_MINUTES[stage-1]||5;
        upsertGroup_(g,"_deadline",Date.now()+mins*60000);
        logEvent_(g,"","scenario_started",stage,{});
      }
    }
    if(Object.prototype.hasOwnProperty.call(patch,"deadline")) upsertGroup_(g,"_deadline",Number(patch.deadline)||null);
    if(Object.prototype.hasOwnProperty.call(patch,"stage")){
      const s=Math.max(1,Math.min(10,Number(patch.stage)||1)),mins=STAGE_MINUTES[s-1]||5;
      upsertGroup_(g,"_stage",s);
      upsertGroup_(g,"_started",true);
      upsertGroup_(g,"_deadline",Date.now()+mins*60000);
      upsertGroup_(g,"_prompt","");
      logEvent_(g,"","stage_advanced",s,{});
    }
    return {ok:true};
  }
  if(a==="state") return {ok:true,state:stateForGroup_(q.group)};
  if(a==="allState") return {ok:true,data:allState_()};
  return {ok:false,error:"Unknown action: "+a};
}

function stateForGroup_(g){
  const all=allState_(),gd=all.groupData[String(g)]||{};
  return {
    started:!!gd._started,
    stage:Number(gd._stage||1),
    deadline:gd._deadline==null?null:Number(gd._deadline),
    prompt:gd._prompt||"",
    recorder:"",
    selectedEvidence:all.selectedEvidenceByGroup[String(g)]||[],
    votes:all.votes[String(g)]||{},
    groupData:gd,
    participants:(all.participants||[]).filter(p=>String(p.group)===String(g)),
    ready:[]
  };
}
function allState_(){
  const gd=readGroupData_(),votes=readVotes_(),participants=readParticipants_();
  const selected={},control={};
  GROUP_IDS.forEach(g=>{
    const x=gd[g]||{};
    selected[g]=x.selectedEvidence||[];
    control[g]={started:!!x._started,stage:Number(x._stage||1),deadline:x._deadline==null?null:Number(x._deadline)};
  });
  return {groupControl:control,selectedEvidenceByGroup:selected,votes,groupData:gd,participants,ready:{}};
}
function initSheet_(sh,headers){if(sh.getLastRow()===0)sh.appendRow(headers);}
function readParticipants_(){
  const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Participants").getDataRange().getValues(),m={};
  v.slice(1).forEach(r=>{if(r[1])m[String(r[1])]={participant:String(r[1]),group:String(r[2]),recorder:false};});
  return Object.values(m);
}
function readVotes_(){
  const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Votes").getDataRange().getValues(),o={};
  v.slice(1).forEach(r=>{
    const g=String(r[1]),s="s"+r[2],p=String(r[3]);
    o[g]=o[g]||{};o[g][s]=o[g][s]||{};
    o[g][s][p]={choice:r[4],confidence:Number(r[5]),ts:new Date(r[0]).getTime()};
  });
  return o;
}
function readGroupData_(){
  const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("GroupData").getDataRange().getValues(),o={};
  v.slice(1).forEach(r=>{
    if(!r[0])return;
    const g=String(r[0]);o[g]=o[g]||{};
    try{o[g][r[1]]=JSON.parse(r[2]);}catch(e){o[g][r[1]]=r[2];}
  });
  return o;
}
function upsertGroup_(g,k,val){
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("GroupData"),v=sh.getDataRange().getValues();
  for(let i=1;i<v.length;i++){
    if(String(v[i][0])===String(g)&&String(v[i][1])===String(k)){
      sh.getRange(i+1,3,1,2).setValues([[JSON.stringify(val),new Date()]]);
      return;
    }
  }
  sh.appendRow([g,k,JSON.stringify(val),new Date()]);
}
function getConfig_(){
  const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Config").getDataRange().getValues(),o={};
  v.slice(1).forEach(r=>{if(r[0])o[r[0]]=r[1];});
  return o;
}
function setConfig_(k,val){
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Config"),v=sh.getDataRange().getValues();
  for(let i=1;i<v.length;i++)if(v[i][0]===k){sh.getRange(i+1,2).setValue(val);return;}
  sh.appendRow([k,val]);
}
function logEvent_(g,p,event,stage,detail){
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Events").appendRow([new Date(),g||"",p||"",event||"",stage||"",JSON.stringify(detail||{})]);
}
