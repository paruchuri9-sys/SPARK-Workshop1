(function(){
'use strict';
const definitions={
'infrastructure':'Basic systems such as roads, water pipes, and electric lines.',
'property-tax abatement':'A reduction in property taxes a business would normally pay.',
'property-tax breaks':'A reduction in property taxes a business would normally pay.',
'confidence':'How sure you are of an answer. Being uncertain is okay.',
'ratepayer':'A person or business that pays a utility bill.',
'taxing entities':'Organizations such as schools and local governments that receive tax money.',
'effluent':'Water flowing out of a treatment facility.',
'franchise fee':'A payment required in an agreement to provide a service or use public infrastructure.',
'clawbacks':'Rules that require returning benefits if promises are not met.',
'cost overruns':'Costs higher than originally expected.',
'grid reliability':'How consistently electricity can be supplied.',
'rezoned':'Changed the official rules for how land may be used.',
'defer':'Wait to decide until important information becomes available.',
'uncertainty':'Something important we do not know yet.',
'enforceable':'Able to be required through rules or an agreement.',
'MW':'Megawatt, a unit of electrical power equal to one million watts.',
'kV':'Kilovolt, a unit of electrical voltage equal to 1,000 volts.',
'dBA':'A way to measure sound level adjusted approximately to human hearing.'
};
const terms=Object.keys(definitions).sort((a,b)=>b.length-a.length);
const regex=new RegExp('\\b('+terms.join('|').replace(/-/g,'-')+')\\b','gi');
function enhance(root){
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(n){
 if(!n.nodeValue.trim()||n.parentElement.closest('button,a,input,textarea,select,option,script,style,summary,.spark-definition'))return NodeFilter.FILTER_REJECT;
 regex.lastIndex=0;return regex.test(n.nodeValue)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}});
 const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
 nodes.forEach(n=>{const frag=document.createDocumentFragment(),txt=n.nodeValue;let last=0;regex.lastIndex=0;
 for(const m of txt.matchAll(regex)){frag.append(document.createTextNode(txt.slice(last,m.index)));
 const term=document.createElement('button');term.type='button';term.className='spark-term';term.textContent=m[0];
 term.dataset.meaning=definitions[terms.find(t=>t.toLowerCase()===m[0].toLowerCase())];
 term.setAttribute('aria-label',m[0]+': show meaning');frag.append(term);last=m.index+m[0].length;}
 frag.append(document.createTextNode(txt.slice(last)));n.replaceWith(frag);});
}
function init(){
 const stage=document.getElementById('stageContent');if(!stage)return;
 const controls=document.createElement('div');controls.className='spark-vocab-controls';
 controls.innerHTML='<button type="button" id="sparkRead" class="secondary-btn">Read page aloud / Stop</button><button type="button" id="sparkWords" class="secondary-btn" aria-expanded="false">Word help</button><span class="muted">Select a dotted-underlined word to see its meaning.</span><div id="sparkDefinition" class="spark-definition hidden" role="status" aria-live="polite"></div><div id="sparkWordList" class="spark-definition hidden"></div>';
 stage.before(controls);
 const read=controls.querySelector('#sparkRead');
 if(!('speechSynthesis' in window)){read.disabled=true;read.title='Read aloud is unavailable in this browser.';}
 read.addEventListener('click',()=>{const synth=window.speechSynthesis;if(synth.speaking){synth.cancel();return;}
 const copy=stage.cloneNode(true);copy.querySelectorAll('button,input,textarea,select,.stage-actions').forEach(e=>e.remove());
 const speech=new SpeechSynthesisUtterance(copy.textContent||'');speech.rate=.88;speech.lang='en-US';synth.speak(speech);});
 controls.querySelector('#sparkWords').addEventListener('click',e=>{const list=controls.querySelector('#sparkWordList'),open=list.classList.contains('hidden');
 list.classList.toggle('hidden',!open);e.currentTarget.setAttribute('aria-expanded',String(open));
 if(open){list.replaceChildren();terms.forEach(t=>{const p=document.createElement('p'),b=document.createElement('strong');b.textContent=t+': ';p.append(b,document.createTextNode(definitions[t]));list.append(p);});}});
 stage.addEventListener('click',e=>{const term=e.target.closest('.spark-term');if(!term)return;
 const box=controls.querySelector('#sparkDefinition'),b=document.createElement('strong');b.textContent=term.textContent+': ';
 box.replaceChildren(b,document.createTextNode(term.dataset.meaning));box.classList.remove('hidden');});
 new MutationObserver(()=>enhance(stage)).observe(stage,{childList:true,subtree:true});enhance(stage);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&window.speechSynthesis)window.speechSynthesis.cancel();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();