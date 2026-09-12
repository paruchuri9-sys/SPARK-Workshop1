// SPARK Workshop 1 - Phase 9 review/reference pane and moderator rescue cues.
(function(){
'use strict';

const D=window.SPARK_DATA||{};
const DECISIONS=['Proceed under current requirements','Proceed with project-specific conditions','Defer pending specific studies/information','Oppose the project'];
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));

const CUES={
  1:[
    'If the room is quiet: “What is the biggest uncertainty affecting your first impression?”',
    'If someone is stuck: “What is one fact here that matters to your recommendation, and why?”',
    'If discussion starts too early: “Finish your individual response first; we will compare in the next phase.”'
  ],
  2:[
    'If the group is listing everything: “Which unknown could most change your recommendation?”',
    'If claims and evidence blur together: “Is that established by the record, or something we still need to verify?”',
    'If the room stalls: “What is the one question you would most want answered before deciding?”'
  ],
  3:[
    'If choices are based on interest: “Which packet is most likely to change or sharpen the decision?”',
    'If they cannot choose: “What question are you hoping this evidence will answer?”',
    'If discussion stalls: “Which two unknowns from the last phase matter most?”'
  ],
  4:[
    'If they only summarize facts: “Why does that information matter to the decision?”',
    'If they treat a packet as conclusive: “What remains uncertain or still needs verification?”',
    'If they get stuck: “Did this evidence answer your question or create another one?”'
  ],
  5:[
    'If the room converges immediately: “Does anyone see the evidence differently?”',
    'If positions are unsupported: “What evidence matters most to that recommendation?”',
    'If discussion stalls: “What important uncertainty remains even if you keep your current position?”'
  ],
  6:[
    'If participants assume they should change: “Maintaining your position is allowed. Does this actually affect your earlier reasoning?”',
    'If the update is treated as decisive: “What uncertainty still remains?”',
    'If the group is quiet: “Which new item, if any, is most consequential?”'
  ],
  7:[
    'If the alternative is dismissed quickly: “What would have to be true for that alternative to be defensible?”',
    'If they build a weak straw man: “What is the strongest case a thoughtful person could make for it?”',
    'If stuck: “What evidence would discriminate between the competing positions?”'
  ],
  8:[
    'If conditions are vague: “What would make that condition enforceable rather than aspirational?”',
    'If monitoring is vague: “What would you actually measure or check after the decision?”',
    'If reconsideration is difficult: “What future evidence would make you reopen this decision?”'
  ],
  9:[
    'If the room is quiet: “Look at the scenario on the left. Which phase produced the most useful discussion?”',
    'If feedback is vague: “Can you point to the exact wording or step that caused that reaction?”',
    'If they focus only on content: “Where did participants actually have to reason rather than retrieve information?”',
    'If they say everything worked: “What would you remove or simplify if you only had 30 minutes?”',
    'If they cannot identify observables: “What could you realistically see or collect from students without creating much extra grading?”',
    'If one person dominates: “Does anyone have a different reaction to that phase?”',
    'If discussion drifts: “What is the most important change we should make before classroom use?”'
  ]
};

function addStyles(){
  if($('#sparkPhase9Styles'))return;
  const s=document.createElement('style');
  s.id='sparkPhase9Styles';
  s.textContent=`
    .spark-phase9-grid{display:grid;grid-template-columns:minmax(300px,44%) minmax(0,56%);gap:16px;align-items:start}
    .spark-history-pane{max-height:66vh;overflow:auto;position:sticky;top:8px;padding:16px}
    .spark-history-pane details{border-top:1px solid rgba(0,0,0,.10);padding:9px 0}
    .spark-history-pane details:first-of-type{border-top:0}
    .spark-history-pane summary{cursor:pointer;font-weight:700}
    .spark-history-pane .history-body{padding:8px 2px 2px;font-size:.94rem;line-height:1.45}
    .spark-history-pane .history-body ul{margin:.4rem 0 .7rem 1.15rem;padding:0}
    .spark-reflection-pane{min-width:0}
    .spark-cue-bank{margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,.12)}
    .spark-cue-bank summary{cursor:pointer;font-weight:700}
    .spark-cue-bank li{margin:.35rem 0}
    @media(max-width:900px){.spark-phase9-grid{grid-template-columns:1fr}.spark-history-pane{position:static;max-height:45vh}}
  `;
  document.head.appendChild(s);
}

function decisionsList(){return `<ul>${DECISIONS.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;}
function evidenceList(){
  const ev=D.evidence||{};
  return Object.entries(ev).map(([id,e])=>`<details><summary>${esc(id)}. ${esc(e.title||'')}</summary><div class="history-body"><strong>Evidence shown</strong><ul>${(e.facts||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><strong>Questions that still matter</strong><ul>${(e.unknowns||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></details>`).join('');
}
function historyHtml(){
  return `
    <section class="card spark-history-pane">
      <div class="eyebrow">Scenario reference</div>
      <h3>Review Phases 1–8</h3>
      <p class="muted">Use this pane to refer to the exact task wording and scenario material while giving feedback. No response is required here.</p>
      <details><summary>Phase 1 · Starting Record & Individual First Impression</summary><div class="history-body">
        <p><strong>Your role:</strong> You are part of a Community Advisory Team advising local leaders whether, and under what conditions, the community should support a proposed hyperscale data-center campus in Central Arkansas.</p>
        <p><strong>Starting record:</strong></p><ul>${(D.startingFacts||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
        <p><strong>Individual first impression:</strong> Choose one recommendation, rate your confidence, identify two or three factors most important to your recommendation, and state the most important thing you still need to know or verify.</p>${decisionsList()}
      </div></details>
      <details><summary>Phase 2 · Need to Know</summary><div class="history-body">
        <p><strong>Group starting points:</strong> Compare participants’ initial factors and unknowns.</p>
        <p><strong>Map uncertainty:</strong> Compare questions and concerns. Distinguish supplied evidence from claims or assumptions that still need verification.</p>
        <p>Table headings: <strong>Evidence we currently have</strong> · <strong>What we need to know / verify</strong> · <strong>How or where could we find out?</strong></p>
        <p><strong>Prompt:</strong> Which 2–3 unanswered questions could most change the group's recommendation?</p>
      </div></details>
      <details open><summary>Phase 3 · Choose What to Investigate</summary><div class="history-body">
        <p><strong>Choose exactly TWO evidence packets.</strong></p>
        <p>Choose based on what could change or sharpen the decision, not merely what sounds interesting.</p>
        <p><strong>Prompts:</strong> Why these two? What questions do you hope they answer?</p>
        ${evidenceList()}
      </div></details>
      <details><summary>Phase 4 · Review the Evidence</summary><div class="history-body">
        <p><strong>Review the evidence:</strong> Focus on what the evidence resolves, what it complicates, and what remains uncertain.</p>
        <p>For each selected packet: What did it help answer? What remains uncertain / needs verification? How useful was it?</p>
        <p><strong>Prompt:</strong> Did the evidence create any new important question?</p>
      </div></details>
      <details><summary>Phase 5 · Preliminary Recommendation</summary><div class="history-body">
        <p>Discuss first. Then every participant submits an <strong>individual</strong> recommendation and confidence rating.</p>
        <p><strong>Prompts:</strong> What evidence matters most to your recommendation? What important uncertainty remains?</p>${decisionsList()}
      </div></details>
      <details><summary>Phase 6 · Evolving Information Update</summary><div class="history-body">
        <p><strong>Additional information:</strong></p><ul>${(D.stage6Update||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
        <p>Consider whether this information actually changes your earlier reasoning. Maintaining your position can be as defensible as revising it.</p>
        <p><strong>Prompts:</strong> Why does this information change or not change your recommendation? What uncertainty matters most now?</p>
      </div></details>
      <details><summary>Phase 7 · Perspective Challenge</summary><div class="history-body">
        <p>Build the strongest defensible case for the alternative position shown to the group.</p>
        <p><strong>Prompts:</strong> What is the strongest case for the alternative? What would have to be true for that alternative to be defensible? What evidence would discriminate between the competing positions?</p>
      </div></details>
      <details><summary>Phase 8 · Final Decision, Conditions & Reconsideration</summary><div class="history-body">
        <p>Make your final judgment. A change is not inherently better than maintaining a position.</p>
        <p><strong>Prompts:</strong> Conditions or safeguards needed, if any; what should be monitored after the decision; and what future evidence would make you reopen the decision.</p>${decisionsList()}
      </div></details>
    </section>`;
}

function phaseNumber(){
  const t=$('#stageKicker')?.textContent||'';
  const m=t.match(/Phase\s+(\d+)/i);
  return m?Number(m[1]):0;
}

function decorateGuide(){
  const n=phaseNumber();
  const panel=$('#modGuidePanel');
  if(!panel||!CUES[n]||panel.querySelector('.spark-cue-bank'))return;
  const d=document.createElement('details');
  d.className='spark-cue-bank';
  d.innerHTML=`<summary>Optional cues if the group is quiet, stuck, or drifting</summary><ul>${CUES[n].map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
  panel.appendChild(d);
}

function simplifyPhase9Reflection(section){
  if(section.dataset.sparkPhase9Simplified==='1')return;
  section.dataset.sparkPhase9Simplified='1';
  const button=section.querySelector('button.group-submit');
  if(!button)return;
  Array.from(section.querySelectorAll('label')).forEach(l=>l.remove());
  const intro=section.querySelector('p');
  if(intro)intro.textContent='Review the completed scenario on the left, then discuss the three questions below. This is a group response; choose one participant to submit.';
  const wrap=document.createElement('div');
  wrap.innerHTML=`
    <label>1. What felt authentic or inauthentic? Refer to a phase or exact wording when useful.<textarea id="authenticity"></textarea></label>
    <label>2. Where did consequential reasoning actually occur? What caused participants to examine evidence, uncertainty, assumptions, or reconsideration?<textarea id="reasoningMoments"></textarea></label>
    <label>3. What should we keep, remove, simplify, or change before classroom use? Include any scaffold that felt leading and what learner reasoning could realistically be observed without excessive grading burden.<textarea id="changes"></textarea></label>`;
  section.insertBefore(wrap,button);
}

function decoratePhase9(){
  if(phaseNumber()!==9)return;
  const host=$('#stageContent');
  if(!host||host.dataset.sparkPhase9Layout==='1')return;
  const current=host.firstElementChild;
  if(!current)return;
  host.dataset.sparkPhase9Layout='1';
  simplifyPhase9Reflection(current);
  const grid=document.createElement('div');
  grid.className='spark-phase9-grid';
  const right=document.createElement('div');
  right.className='spark-reflection-pane';
  host.insertBefore(grid,current);
  grid.insertAdjacentHTML('beforeend',historyHtml());
  grid.appendChild(right);
  right.appendChild(current);
}

function decorate(){addStyles();decorateGuide();decoratePhase9();}

const observer=new MutationObserver(()=>decorate());
observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
decorate();
})();
