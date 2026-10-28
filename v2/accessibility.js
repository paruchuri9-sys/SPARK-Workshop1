(function(){
'use strict';
const terms={
'infrastructure':'Roads, water pipes, power lines, and other systems a community needs.',
'property-tax abatement':'A deal that reduces the property taxes a business would otherwise pay.',
'property-tax breaks':'Reductions in property taxes a business would otherwise pay.',
'confidence':'How sure you are about your recommendation, based on what you know and do not know.',
'percentages':'Parts out of 100. For example, 50% means 50 out of 100.',
'defer':'Wait to make a decision until you have important missing information.',
'utility':'A service such as electricity, water, or sewer.',
'ratepayers':'People and businesses who pay utility bills.',
'property taxes':'Taxes on property that help pay for local services, including schools.',
'permanent jobs':'Jobs expected to continue after construction is finished.',
'temporary jobs':'Jobs expected to last only for a limited time.',
'expand':'Grow larger or add more buildings.',
'rezoned':'Changed the official rules about how land can be used.',
'wastewater':'Water that has been used and needs treatment.',
'treated wastewater':'Used water that has been cleaned at a treatment plant.',
'trade-off':'When choosing something beneficial also means accepting a cost or disadvantage.',
'uncertainty':'Something important that is not yet known.',
'evidence':'Information that helps support or question a claim.',
'conditions':'Requirements that must be met for a decision to be acceptable.',
'MW':'Megawatt: a measurement of electrical power. One megawatt is one million watts.',
'kV':'Kilovolt: a measurement of voltage. One kilovolt is 1,000 volts.'
};
const words=Object.keys(terms).sort((a,b)=>b.length-a.length);
const rx=new RegExp('(?<![\\w])('+words.join('|')+')(?![\\w])','gi');
let panel;
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
 b.setAttribute('aria-label',m[0]+': show explanation');b.dataset.term=m[0].toLowerCase();f.append(b);start=m.index+m[0].length;
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
 panel.innerHTML='<button class="secondary" type="button" id="sparkRead">Read this section aloud</button><button class="secondary" type="button" id="sparkGlossary" aria-expanded="false">Word help</button><span>Tap underlined words to see a simple explanation.</span><div class="spark-message" id="sparkMeaning" role="status" aria-live="polite" hidden></div><div class="spark-message" id="sparkTerms" hidden></div>';
 root.before(panel);
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
 root.addEventListener('click',e=>{
 const b=e.target.closest('.spark-word');if(!b)return;
 const message=panel.querySelector('#sparkMeaning'),title=document.createElement('strong');title.textContent=b.textContent+': ';
 message.replaceChildren(title,document.createTextNode(terms[b.dataset.term]||''));message.hidden=false;
 });
 new MutationObserver(()=>update()).observe(root,{subtree:true,childList:true});update();
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&'speechSynthesis' in window)speechSynthesis.cancel();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();