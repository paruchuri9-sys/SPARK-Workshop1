/**
 * SPARK Workshop 1 - Apps Script backend v0.3.1
 * Bound to a Google Sheet.
 */
const SHEETS = ["Config","Participants","Responses","Votes","Events","GroupData"];
const STAGE_MINUTES = [4,6,5,8,7,5,6,8,18,25];
const GROUP_IDS = ["1","2","3","4","5","6"];

function setup(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  SHEETS.forEach(n=>{ if(!ss.getSheetByName(n)) ss.insertSheet(n); });
  initSheet_(ss.getSheetByName("Config"),["key","value"]);
  initSheet_(ss.getSheetByName("Participants"),["timestamp","participant","group","recorder"]);
  initSheet_(ss.getSheetByName("Responses"),["timestamp","group","key","participant","json"]);
  initSheet_(ss.getSheetByName("Votes"),["timestamp","group","stage","participant","choice","confidence"]);
  initSheet_(ss.getSheetByName("Events"),["timestamp","group","participant","event","stage","detail"]);
  initSheet_(ss.getSheetByName("GroupData"),["group","key","json","updated"]);
  setConfig_("stage","1");
  setConfig_("deadline",String(Date.now()+STAGE_MINUTES[0]*60000));
  setConfig_("workshopTitle","SPARK Workshop 1");
  GROUP_IDS.forEach(g=>upsertGroup_(g,"_prompt",""));
}

function include(filename){ return HtmlService.createHtmlOutputFromFile(filename).getContent(); }

function doGet(e){
  const t=HtmlService.createTemplateFromFile("Index");
  t.boot=JSON.stringify({role:(e&&e.parameter.role)||"participant",group:(e&&e.parameter.group)||"1"});
  return t.evaluate().setTitle("SPARK Workshop 1").addMetaTag("viewport","width=device-width, initial-scale=1");
}

function api(action,payload){ return handle_({action:action,...(payload||{})}); }

function handle_(q){
  const ss=SpreadsheetApp.getActiveSpreadsheet(),a=q.action;
  if(a==="join"){
    ss.getSheetByName("Participants").appendRow([new Date(),q.participant,q.group,!!q.recorder]);
    logEvent_(q.group,q.participant,"join",1,{recorder:!!q.recorder});
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
  if(a==="ready"){
    logEvent_(q.group,q.participant,"ready",q.stage,{});
    return {ok:true};
  }
  if(a==="facilitator"){
    const patch=q.patch||{};
    if(Object.prototype.hasOwnProperty.call(patch,"prompt")){
      upsertGroup_(q.group,"_prompt",String(patch.prompt||""));
    }
    ["deadline"].forEach(k=>{
      if(Object.prototype.hasOwnProperty.call(patch,k)) setConfig_(k,String(patch[k]??""));
    });
    if(Object.prototype.hasOwnProperty.call(patch,"stage")){
      const s=Number(patch.stage),mins=STAGE_MINUTES[s-1]||5;
      setConfig_("stage",String(s));
      setConfig_("deadline",String(Date.now()+mins*60000));
      GROUP_IDS.forEach(g=>upsertGroup_(g,"_prompt",""));
      logEvent_(q.group||"","","stage_advanced",s,{});
    }
    return {ok:true};
  }
  if(a==="state") return {ok:true,state:stateForGroup_(q.group)};
  if(a==="allState") return {ok:true,data:allState_()};
  return {ok:false,error:"Unknown action: "+a};
}

function stateForGroup_(g){
  const all=allState_(),gd=all.groupData[g]||{};
  return {
    stage:all.stage,
    deadline:all.deadline,
    prompt:gd._prompt||"",
    selectedEvidence:all.selectedEvidenceByGroup[g]||[],
    votes:all.votes[g]||{},
    groupData:gd,
    participants:(all.participants||[]).filter(p=>String(p.group)===String(g)),
    ready:(all.ready[g]||[])
  };
}
function allState_(){
  const cfg=getConfig_(),gd=readGroupData_(),votes=readVotes_(),participants=readParticipants_(),ready=readReady_();
  const selected={};
  Object.keys(gd).forEach(g=>selected[g]=gd[g].selectedEvidence||[]);
  return {stage:Number(cfg.stage||1),deadline:Number(cfg.deadline||0)||null,selectedEvidenceByGroup:selected,votes,groupData:gd,participants,ready};
}
function initSheet_(sh,headers){if(sh.getLastRow()===0)sh.appendRow(headers);}
function readParticipants_(){
  const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Participants").getDataRange().getValues(),m={};
  v.slice(1).forEach(r=>{if(r[1])m[String(r[1])]={participant:String(r[1]),group:String(r[2]),recorder:!!r[3]};});
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
function readReady_(){
  const v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Events").getDataRange().getValues(),o={};
  v.slice(1).forEach(r=>{
    if(r[3]==="ready"){
      const g=String(r[1]);o[g]=o[g]||[];
      if(!o[g].includes(String(r[2])))o[g].push(String(r[2]));
    }
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
  for(let i=1;i<v.length;i++){
    if(v[i][0]===k){sh.getRange(i+1,2).setValue(val);return;}
  }
  sh.appendRow([k,val]);
}
function logEvent_(g,p,event,stage,detail){
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Events").appendRow([new Date(),g||"",p||"",event||"",stage||"",JSON.stringify(detail||{})]);
}
