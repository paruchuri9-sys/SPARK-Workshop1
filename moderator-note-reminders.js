// Lightweight moderator observation reminders. Keeps facilitation primary and notes optional.
(function(){
'use strict';
const OBS_URL='https://docs.google.com/spreadsheets/d/16JXl1NCbdZB9QSCafGutWPVPQ2vJYbJUquhdv1xKm7o/edit';
const REMINDERS={
  1:'Note only if important: confusion about the task/choices, visible hesitation, participants not working independently, or an interface problem.',
  2:'Note only if important: the group waits for you to supply questions, cannot separate known vs. unknown, or needs help getting started.',
  3:'Note only if important: evidence is chosen mainly because it sounds interesting/familiar, the group asks which packet is “best,” or cannot decide.',
  4:'Note only if important: participants mostly list facts without connecting them to the decision, misunderstand evidence, or become stuck.',
  5:'Note only if important: very quick agreement, reluctance to disagree, one person drives the recommendation, or discussion needs a cue.',
  6:'Note only if important: visible surprise/confusion, automatic change/no-change without discussion, or the new information is ignored.',
  7:'Note only if important: the alternative is dismissed, treated as a box-checking exercise, or the group cannot build a serious opposing case.',
  8:'Note only if important: the group rushes, conditions/monitoring do not connect to earlier reasoning, or meaningful disagreement remains.',
  9:'Note only if important: strong reactions, specific wording/phases participants return to, disagreement about classroom feasibility, or a design issue the recording may not show.'
};
function phase(){const t=document.querySelector('#stageKicker')?.textContent||'';const m=t.match(/Phase\s+(\d+)/i);return m?Number(m[1]):0;}
function isModerator(){return (document.querySelector('#roleBadge')?.textContent||'').trim().startsWith('Moderator');}
function install(){
  if(!isModerator())return;
  const strip=document.querySelector('#moderatorStrip');
  if(!strip)return;
  const p=phase(); if(!p)return;
  let box=document.querySelector('#moderatorNoteReminder');
  if(!box){box=document.createElement('div');box.id='moderatorNoteReminder';box.className='callout';box.style.marginTop='10px';strip.appendChild(box);}
  box.innerHTML='<strong>Observation reminder:</strong> '+REMINDERS[p]+' <a href="'+OBS_URL+'" target="_blank" rel="noopener">Open moderator notes</a>';
}
const obs=new MutationObserver(()=>install());
obs.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
document.addEventListener('DOMContentLoaded',install);
setInterval(install,2000);
})();
