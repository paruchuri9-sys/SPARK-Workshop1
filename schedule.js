import {initializeApp} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {getAuth,signInAnonymously} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {getDatabase,ref,onValue,get,update,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import {firebaseConfig} from "./v2/firebase-config.js";
const $=s=>document.querySelector(s),app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
const pollId=(new URLSearchParams(location.search).get("poll")||"").replace(/[^a-zA-Z0-9_-]/g,"");
let uid="",config=null,ownEntry=null,votes={};
const err=m=>{$("#loading").hidden=true;$("#poll").hidden=true;$("#problem").hidden=false;$("#problem").textContent=m;};
function displayDate(date){const d=new Date(date+"T12:00:00Z");return new Intl.DateTimeFormat("en-US",{timeZone:"UTC",weekday:"long",month:"long",day:"numeric",year:"numeric"}).format(d)}
function displayHour(h){return (h%12||12)+(h<12?" AM":" PM")}
function renderCounts(){
 for(const slotId of config.slotOrder){
  const count=Object.values(votes).filter(v=>v?.slots?.[slotId]===true).length;
  const c=document.querySelector('[data-count="'+slotId+'"]');if(c)c.textContent=count+" available";
 }
}
function render(){
 $("#meetingTitle").textContent=config.title;
 $("#meetingMeta").textContent="One-hour meetings · Central Time · "+Object.keys(votes).length+" response(s)";
 $("#followupQuestion").textContent=config.question;
 const group=$("#slotGroups");group.replaceChildren();
 for(const day of config.dates){
  const section=document.createElement("section");section.className="day";
  const heading=document.createElement("h3");heading.textContent=displayDate(day);
  if(day===config.preferredDate){const pref=document.createElement("span");pref.className="preferred";pref.textContent="Preferred day";heading.appendChild(pref)}
  section.appendChild(heading);
  for(const slotId of config.slotOrder){
   const slot=config.slots[slotId];if(slot.date!==day)continue;
   const label=document.createElement("label");label.className="slot";
   const input=document.createElement("input");input.type="checkbox";input.name="slot";input.value=slotId;
   input.checked=!!ownEntry?.slots?.[slotId];
   const title=document.createElement("span");title.className="time";title.textContent=displayHour(slot.start)+"–"+displayHour(slot.start+1);
   const count=document.createElement("span");count.className="count";count.dataset.count=slotId;
   label.append(input,title,count);section.appendChild(label);
  }
  group.appendChild(section);
 }
 if(ownEntry){$("#participantName").value=ownEntry.name||"";const option=document.querySelector('input[name="followup"][value="'+ownEntry.answer+'"]');if(option)option.checked=true;$("#submitVote").textContent="Update my availability";}
 $("#loading").hidden=true;$("#poll").hidden=false;
 renderCounts();
}
async function init(){
 if(!pollId)return err("This meeting link is missing its poll code. Please use the link provided by the organizer.");
 try{
  uid=(await signInAnonymously(auth)).user.uid;
  const root="meetingPolls/"+pollId;
  const cfg=await get(ref(db,root+"/config"));
  if(!cfg.exists())return err("This meeting poll is not yet available. Ask the organizer to initialize it first.");
  config=cfg.val();
  if(config.closed)return err("This meeting poll has closed.");
  const own=await get(ref(db,root+"/entries/"+uid));ownEntry=own.val();
  onValue(ref(db,root+"/votes"),snap=>{votes=snap.val()||{};if(config) {if($("#poll").hidden)render();else {$("#meetingMeta").textContent="One-hour meetings · Central Time · "+Object.keys(votes).length+" response(s)";renderCounts();}}},e=>err("Cannot load availability totals: "+(e.code||e.message)));
  if(ownEntry)render();
 }catch(e){err("Could not connect to this meeting: "+(e.code||e.message));}
}
$("#availabilityForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!config||!uid)return;
 const name=$("#participantName").value.trim(),answer=document.querySelector('input[name="followup"]:checked')?.value;
 const slots=Object.fromEntries([...document.querySelectorAll('input[name="slot"]:checked')].map(n=>[n.value,true]));
 if(!name){$("#saveStatus").textContent="Please enter your name.";return}
 if(Object.keys(slots).length===0){$("#saveStatus").textContent="Select at least one suitable time.";return}
 if(!["yes","maybe","no"].includes(answer)){ $("#saveStatus").textContent="Please answer the scenario question.";return}
 const button=$("#submitVote");button.disabled=true;$("#saveStatus").textContent="Saving...";
 try{
  // One atomic multi-path update ensures named responses and anonymous-looking vote tallies agree.
  await update(ref(db),{
   ["meetingPolls/"+pollId+"/entries/"+uid]:{name,answer,slots,submittedAt:serverTimestamp()},
   ["meetingPolls/"+pollId+"/votes/"+uid]:{slots}
  });
  ownEntry={name,answer,slots};
  button.textContent="Update my availability";
  $("#saveStatus").textContent="Saved. You may return to this page on the same browser to edit your response.";
 }catch(error){$("#saveStatus").textContent="Not saved ("+(error.code||error.message)+"). Please retry.";}
 finally{button.disabled=false}
});
init();