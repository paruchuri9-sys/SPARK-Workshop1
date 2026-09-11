// SPARK Workshop 1: compact moderator overlay on the shared participant page.
// Loaded after app4.js so moderators see the same activity and timer as participants.

moderatorOverlayHtml = function(){
  if(session.role!=='moderator') return '';
  const st=server.stage||1;
  const guide=MOD_GUIDE[st]||{say:'',do:''};
  const ps=server.participants||[];
  const votes=server.votes?.[`s${st}`]||{};
  const gd=server.groupData||{};

  let progress='';
  if([1,6].includes(st)) progress=`${Object.keys(votes).length}/${ps.length} submitted`;
  else if(st===2) progress=gd.stage2?'Submitted':'Group response pending';
  else if(st===3) progress=gd.stage3?'Submitted':'Evidence choice pending';
  else if(st===4) progress=gd.stage4?'Submitted':'Evidence review pending';
  else if(st===5) progress=`${Object.keys(votes).length}/${ps.length} choices${gd.stage5?' · reasoning submitted':' · reasoning pending'}`;
  else if(st===7) progress=gd.stage7?'Submitted':'Challenge pending';
  else if(st===8) progress=`${Object.keys(votes).length}/${ps.length} choices${gd.stage8?' · artifact submitted':' · artifact pending'}`;
  else if(st===9) progress=gd.stage9?'Submitted':'Reflection pending';
  else progress=gd.stage10?'Submitted':'Transfer map pending';

  return `<section id="moderatorOverlay" class="card compact" style="padding:10px 14px;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <strong>Moderator · ${groupLabel(session.group)}</strong>
      <span class="muted" style="margin-right:auto">${esc(progress)}</span>
      <button class="secondary-btn" id="plusMinute" style="padding:7px 11px">+1 min</button>
      <button class="primary" id="nextStage" style="padding:7px 11px" ${st>=10?'disabled':''}>${st<10?'Next phase →':'Final phase'}</button>
      <details style="margin:0">
        <summary style="cursor:pointer;font-weight:700">Guide</summary>
        <div style="margin-top:9px;max-width:760px">
          <div><strong>Say:</strong> ${esc(guide.say)}</div>
          <div style="margin-top:5px"><strong>Do:</strong> ${esc(guide.do)}</div>
        </div>
      </details>
    </div>
  </section>`;
};
