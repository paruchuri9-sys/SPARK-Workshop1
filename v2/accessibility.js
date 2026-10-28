(function(){
'use strict';
const terms={
'infrastructure':'Roads, water pipes, power lines, and other systems a community needs.',
'property-tax abatement':'A deal that reduces the property taxes a business would otherwise pay.',
'property-tax breaks':'Reductions in property taxes a business would otherwise pay.',
'defer':'Wait to decide until important missing information is available.',
'ratepayers':'People and businesses who pay electricity or other utility bills.',
'rezoned':'Changed the official rules about how land can be used.',
'wastewater':'Used water that requires treatment.',
'treated wastewater':'Used water that has been cleaned at a treatment plant.',
'MW':'Megawatt, a measurement of electrical power equal to one million watts.',
'kV':'Kilovolt, a measurement of electrical voltage equal to 1,000 volts.'
};
const words=Object.keys(terms).sort((a,b)=>b.length-a.length);
const rx=new RegExp('(?<![\\w])('+words.join('|')+')(?![\\w])','gi');
let panel;
let tooltip;
function showMeaning(button){
 const meaning=terms[button.dataset.term];if(!meaning)return;
 tooltip.textContent=meaning;tooltip.hidden=false;
 const r=button.getBoundingClientRect();
 const width=tooltip.offsetWidth;
 const left=Math.max(8,Math.min(window.innerWidth-width-8,r.left));
 tooltip.style.left=left+'px';
 const above=r.bottom+tooltip.offsetHeight+12>window.innerHeight&&r.top>tooltip.offsetHeight+12;
 tooltip.style.top=(above?r.top-tooltip.offsetHeight-8:r.bottom+8)+'px';
}
function hideMeaning(){tooltip.hidden=true;}

function annotate(root){
 const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(n){
 if(!n.parentElement||n.parentElement.closest('button,a,label,input,textarea,select,option,script,style,.spark-word,.spark-help'))return NodeFilter.FILTER_REJECT;
 rx.lastIndex=0;return rx.test(n.nodeValue)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;
 }});
 const nodes=[];while(w.nextNode())nodes.push(w.currentNode);
 nodes.forEach(n=>{const f=document.createDocumentFragment(),s=n.nodeValue;let start=0;rx.lastIndex=0;
 for(const m of s.matchAll(rx)){
 f.append(document.createTextNode(s.slice(start,m.index)));
 const b=document.createElement('button');b.type='button';b.className='spark-word';b.textContent=m[0];
 b.setAttribute('aria-label',m[0]+': '+terms[m[0].toLowerCase()]);b.setAttribute('aria-describedby','sparkTooltip');b.dataset.term=m[0].toLowerCase();f.append(b);start=m.index+m[0].length;
 }f.append(document.createTextNode(s.slice(start)));n.replaceWith(f);});
}
function update(){
 const root=document.querySelector('#app');if(!root)return;
 annotate(root);
 root.querySelectorAll('input[type="range"]').forEach(input=>{
 if(input.id!=='conf'||input.dataset.sparkExplained)return;
 input.dataset.sparkExplained='1';input.setAttribute('aria-label','How sure are you of your recommendation, from 0 to 100 percent?');
 const p=document.createElement('p');p.className='spark-help spark-confidence';
 p.textContent='How sure are you? 0% = not sure, 50% = somewhat sure, 100% = very sure. It is okay to be uncertain.';
 input.before(p);
 });
}
function init(){
 const root=document.querySelector('#app');if(!root)return;
 panel=document.createElement('section');panel.className='spark-help spark-toolbar';panel.setAttribute('aria-label','Reading and vocabulary help');
 panel.innerHTML='<button class="secondary" type="button" id="sparkRead">Read this section aloud</button><button class="secondary" type="button" id="sparkGlossary" aria-expanded="false">Word help</button><span>Hover, focus, or tap a dotted-underlined technical term for its meaning.</span><div class="spark-message" id="sparkTerms" hidden></div>';
 root.before(panel);
 tooltip=document.createElement('div');tooltip.className='spark-tooltip';tooltip.id='sparkTooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;document.body.append(tooltip);
 const read=panel.querySelector('#sparkRead');if(!('speechSynthesis' in window)){read.disabled=true;read.title='Not supported by this browser';}
 read.addEventListener('click',()=>{
 if(speechSynthesis.speaking){speechSynthesis.cancel();read.textContent='Read this section aloud';return;}
 const copy=root.cloneNode(true);copy.querySelectorAll('button, input, textarea, select, .actions').forEach(n=>n.remove());
 const msg=new SpeechSynthesisUtterance(copy.textContent||'');msg.lang='en-US';msg.rate=.9;
 msg.onend=()=>read.textContent='Read this section aloud';msg.onerror=()=>read.textContent='Read this section aloud';
 speechSynthesis.speak(msg);read.textContent='Stop reading';
 });
 const glossary=panel.querySelector('#sparkGlossary'),list=panel.querySelector('#sparkTerms');
 glossary.addEventListener('click',()=>{
 const expanded=glossary.getAttribute('aria-expanded')==='true';glossary.setAttribute('aria-expanded',String(!expanded));list.hidden=expanded;
 if(!expanded&&!list.childElementCount){for(const t of words){const p=document.createElement('p'),b=document.createElement('strong');b.textContent=t+': ';p.append(b,document.createTextNode(terms[t]));list.append(p);}}
 });
 root.addEventListener('pointerover',e=>{const b=e.target.closest('.spark-word');if(b&&e.pointerType!=='touch')showMeaning(b);});
 root.addEventListener('pointerout',e=>{if(e.target.closest('.spark-word')&&e.pointerType!=='touch')hideMeaning();});
 root.addEventListener('focusin',e=>{const b=e.target.closest('.spark-word');if(b)showMeaning(b);});
 root.addEventListener('focusout',e=>{if(e.target.closest('.spark-word'))hideMeaning();});
 root.addEventListener('click',e=>{const b=e.target.closest('.spark-word');if(b){showMeaning(b);}});
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('.spark-word')&&!e.target.closest('.spark-tooltip'))hideMeaning();});
 window.addEventListener('scroll',hideMeaning,true);
 new MutationObserver(()=>{hideMeaning();update();}).observe(root,{subtree:true,childList:true});update();
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&'speechSynthesis' in window)speechSynthesis.cancel();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();