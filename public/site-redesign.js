
/* Systems Studio frontend. All DEV.to content is supplied by the site's existing /api/blogs endpoint. */
(() => {
'use strict';
if (/^\/blog\//.test(location.pathname)) return;
const q=(x)=>document.querySelector(x),qa=(x)=>Array.from(document.querySelectorAll(x));
const nav=q('#primary-nav'),toggle=q('#menu-toggle'),header=q('.site-header'),top=q('#back-to-top'),progress=q('#reading-progress');
const escape=(v)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

// Engineering switchboard: meaningful illustration, not a fabricated live dashboard.
const systemScenes={
 aviation:{inputs:['Passenger','Journey','Services','Business rules'],result:'One calm<br>check-in<span class="switchboard-result-period">.</span>',summary:'A seamless journey, despite the complexity behind it.'},
 payments:{inputs:['Authorization','Capture','Callbacks','Retries'],result:'One reliable<br>payment<span class="switchboard-result-period">.</span>',summary:'Different providers. One predictable experience.'},
 tooling:{inputs:['JSON','Requests','Diffs','Workflows'],result:'One focused<br>workspace<span class="switchboard-result-period">.</span>',summary:'Small developer tasks, without the context switching.'}
};
const switchboard=q('.hero-switchboard');
if(switchboard){
 const output=q('#switchboard-result'),summary=q('#switchboard-summary'),paper=switchboard.querySelector('.switchboard-output-paper');
 const scenes=switchboard.querySelectorAll('.switchboard-mode');
 scenes.forEach(button=>button.addEventListener('click',()=>{
  const mode=button.dataset.system,scene=systemScenes[mode];
  if(!scene||switchboard.dataset.mode===mode)return;
  switchboard.dataset.mode=mode;
  switchboard.querySelectorAll('[data-signal]').forEach(el=>{el.textContent=scene.inputs[Number(el.dataset.signal)]||'';});
  if(output)output.innerHTML=scene.result;
  if(summary)summary.textContent=scene.summary;
  scenes.forEach(item=>{const active=item===button;item.classList.toggle('is-active',active);item.setAttribute('aria-pressed',String(active));});
  if(paper&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    paper.classList.remove('is-changing');void paper.offsetWidth;paper.classList.add('is-changing');
  }
 }));
}

toggle?.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));toggle.setAttribute('aria-label',open?'Open navigation':'Close navigation');nav?.classList.toggle('open',!open);});
qa('#primary-nav a').forEach(a=>a.addEventListener('click',()=>{nav?.classList.remove('open');toggle?.setAttribute('aria-expanded','false');}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){nav?.classList.remove('open');toggle?.setAttribute('aria-expanded','false');}});
// Context navigation is a reading shortcut, not a second permanent header.
const writing=q('#writing'),writingHeader=writing?.querySelector('.journal-toolbar'),writingContext=q('#writing-context'),contextSearch=q('#writing-context-search'),contextCount=q('#writing-context-count');
const desktopWriting=matchMedia('(min-width:1051px)');
function updateWritingContext(){
  if(!writingContext||!writingHeader||!writing)return;
  const navBottom=header?.getBoundingClientRect().bottom||68;
  const sectionBottom=writing.getBoundingClientRect().bottom;
  const headingBottom=writingHeader.getBoundingClientRect().bottom;
  const active=desktopWriting.matches&&headingBottom<=navBottom+2&&sectionBottom>navBottom+60;
  writingContext.hidden=!active;
  if(active){
    const top=Math.round(navBottom)+'px';
    if(writingContext.style.top!==top)writingContext.style.top=top;
  }
}
contextSearch?.addEventListener('click',()=>{
  const field=q('#journal-search'),actions=field?.closest('.journal-actions');
  if(!field||!actions)return;
  const headerHeight=header?.getBoundingClientRect().bottom||68;
  const contextHeight=writingContext?.getBoundingClientRect().height||46;
  const y=window.scrollY+actions.getBoundingClientRect().top-headerHeight-contextHeight-16;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  field.focus({preventScroll:true});
  window.scrollTo({top:Math.max(0,y),behavior:reduced?'instant':'smooth'});
});
const storyCounter=q('#journal-count');
if(storyCounter&&contextCount){
  const syncCount=()=>{
    const raw=storyCounter.textContent?.trim()||'';
    const matched=raw.match(/\b\d+\s+stories\b/i);
    contextCount.textContent=matched?matched[0]:'Latest stories';
  };
  new MutationObserver(syncCount).observe(storyCounter,{childList:true,characterData:true,subtree:true});
  syncCount();
}
addEventListener('resize',updateWritingContext,{passive:true});
// The primary header animates from tall to compact: keep the contextual bar
// attached during the CSS transition, not just when scroll events fire.
if(header&&typeof ResizeObserver!=='undefined')new ResizeObserver(updateWritingContext).observe(header);

function updateScroll(){const y=scrollY,max=document.documentElement.scrollHeight-innerHeight;header?.classList.toggle('is-scrolled',y>25);top?.classList.toggle('is-visible',y>490);if(progress)progress.style.width=(max>0?Math.min(100,y/max*100):0)+'%';updateWritingContext();}
addEventListener('scroll',updateScroll,{passive:true});updateScroll();
top?.addEventListener('click',()=>window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
if(q('#current-year'))q('#current-year').textContent=String(new Date().getFullYear());
const sectionObserver=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting)qa('#primary-nav a[href*="#"]').forEach(a=>{if(a.hash==='#'+e.target.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});}},{rootMargin:'-20% 0px -65% 0px'});
qa('main section[id]').forEach(s=>sectionObserver.observe(s));
qa('.filter-tab').forEach(tab=>tab.addEventListener('click',()=>{const kind=tab.dataset.filter;qa('.filter-tab').forEach(b=>{b.classList.toggle('active',b===tab);b.setAttribute('aria-pressed',String(b===tab))});qa('.project-card[data-category]').forEach(card=>{card.hidden=kind!=='all'&&!String(card.dataset.category||'').split(' ').includes(kind);});}));
q('#format-btn')?.addEventListener('click',()=>{const area=q('#json-input'),status=q('#json-status');if(!area)return;try{area.value=JSON.stringify(JSON.parse(area.value),null,2);if(status)status.textContent='✓ Valid JSON · Formatted locally';}catch(e){if(status)status.textContent='Please enter valid JSON: '+e.message;}});
q('#copy-email')?.addEventListener('click',async()=>{const addr=q('.contact-mail')?.getAttribute('href')?.replace(/^mailto:/,'')||'amrishkhansheikabdullah@gmail.com';try{await navigator.clipboard.writeText(addr);if(q('#copy-feedback'))q('#copy-feedback').textContent='Email address copied';}catch(e){if(q('#copy-feedback'))q('#copy-feedback').textContent='Copy unavailable. Use the email link above.';}});
const feature=q('#journal-feature'),grid=q('#journal-grid'),filters=q('#journal-filters'),search=q('#journal-search'),sort=q('#journal-order'),more=q('#journal-more'),counter=q('#journal-count'),shown=q('#journal-showing');
const sortMenu=q('#journal-sort-options'),sortText=q('#journal-order-text'),sortField=sort?.closest('.journal-sort-field');let sortOrder='newest';
const total=q('#journal-total'),matchSummary=q('#journal-match-summary');
if(!grid)return;
let articles=[],term='',tag='All',visible=6;
const normalTags=a=>Array.isArray(a.tags)?a.tags.filter(Boolean):[];
const date=a=>{const d=new Date(a.publishedAt);return Number.isNaN(+d)?'RECENT':d.toLocaleDateString('en-US',{month:'short',year:'numeric'}).toUpperCase();};
const validImage = (value) => typeof value === 'string' && /^https:\/\//i.test(value);
const journalCoverFallback = '<span class="journal-art-fallback" aria-hidden="true"><span class="cover-comment">/* FIELD NOTES */</span><span class="cover-glyph">{ ↗ }</span><span class="cover-signature">WHO SAW THE CONNECTION?</span></span>';
function card(a,featured=false){
  const image=validImage(a.coverImage)?'<img loading="'+(featured?'eager':'lazy')+'" decoding="async" src="'+escape(a.coverImage)+'" data-fallback-src="'+escape(validImage(a.coverImageFallback)?a.coverImageFallback:'')+'" alt="">':'';
  const href=typeof a.url==='string'&&/^\/blog\/[a-zA-Z0-9-]+\/?$/.test(a.url)?a.url:'/blog/'+encodeURIComponent(a.devSlug||'');
  return '<a class="journal-card" href="'+escape(href)+'"><div class="journal-art">'+journalCoverFallback+image+'</div><div class="journal-copy"><div class="journal-meta"><span>'+escape(date(a))+'</span><span>'+escape(a.readingTimeMinutes?a.readingTimeMinutes+' MIN READ':'ENGINEERING')+'</span></div><h3>'+escape(a.title||'Untitled article')+'</h3><p>'+escape(a.description||'Notes on building better systems.')+'</p><div class="journal-read">READ STORY ↗</div></div></a>';
}
document.addEventListener('error', event => {
  const img=event.target;
  if(!(img instanceof HTMLImageElement)||!img.closest('.journal-art'))return;
  const alt=img.dataset.fallbackSrc;
  if(alt&&!img.dataset.backupTried&&validImage(alt)){
    img.dataset.backupTried='1';
    img.src=alt;
  }else{
    img.remove(); // Reveal the reserved editorial fallback, never a broken icon.
  }
},true);
// Use normal browser navigation for story links. The article document owns
// exactly one loader until SSR content and reader enhancements are ready.
// Do not launch a second terminal from the homepage before navigation.
function filtered(){return articles.filter(a=>(tag==='All'||normalTags(a).some(t=>String(t).toLowerCase()===tag.toLowerCase()))&&(!term||(a.title+' '+a.description+' '+normalTags(a).join(' ')).toLowerCase().includes(term))).sort((a,b)=>(sortOrder==='oldest'?1:-1)*(new Date(a.publishedAt||0)-new Date(b.publishedAt||0)));}
function render(){const list=filtered(),first=!term&&tag==='All'&&sortOrder!=='oldest'?list[0]:null;feature.innerHTML=first?card(first,true):'';const other=first?list.slice(1):list;grid.innerHTML=other.length?other.slice(0,visible).map(a=>card(a)).join(''):'<p class="journal-status">No matching stories. Try another topic or search.</p>';if(shown)shown.textContent=list.length?('Showing '+Math.min(visible+(first?1:0),list.length)+' of '+list.length+' stories'):'';if(more)more.hidden=other.length<=visible;if(counter)counter.textContent=articles.length+' stories from DEV.to';if(total)total.textContent=String(articles.length);if(matchSummary){const narrowed=Boolean(term)||tag!=='All';matchSummary.textContent=narrowed?list.length+' of '+articles.length+' matching':'All stories';}}
function buildFilters(){const tags=[...new Set(articles.flatMap(normalTags).map(String).filter(Boolean))];const count=t=>articles.filter(a=>normalTags(a).some(s=>String(s).toLowerCase()===t.toLowerCase())).length;tags.sort((a,b)=>count(b)-count(a));const choices=['All',...tags.slice(0,8)];filters.innerHTML=choices.map(t=>'<button type="button" data-tag="'+escape(t)+'" aria-pressed="'+String(t===tag)+'">'+escape(t==='All'?'All stories':t)+'</button>').join('');}
filters?.addEventListener('click',e=>{const b=e.target.closest('button[data-tag]');if(!b)return;tag=b.dataset.tag;visible=6;buildFilters();render();});
search?.addEventListener('input',e=>{term=e.target.value.trim().toLowerCase();visible=6;render();});
// Site-designed sort popup with click, arrows, Home/End, Enter, Escape and outside click.
const sortOptions=[...(sortMenu?.querySelectorAll('[role="option"]')||[])];
function closeSort(focus=false){if(sortMenu)sortMenu.hidden=true;sort?.setAttribute('aria-expanded','false');if(focus)sort?.focus();}
function openSort(step=0){if(!sortMenu)return;sortMenu.hidden=false;sort?.setAttribute('aria-expanded','true');
 const selected=Math.max(0,sortOptions.findIndex(x=>x.dataset.sort===sortOrder));
 sortOptions[Math.max(0,Math.min(sortOptions.length-1,selected+step))]?.focus();}
function chooseSort(value){if(value!=='newest'&&value!=='oldest')return;sortOrder=value;
 if(sortText)sortText.textContent=value==='newest'?'Newest first':'Oldest first';
 for(const option of sortOptions)option.setAttribute('aria-selected',String(option.dataset.sort===value));
 closeSort(true);visible=6;render();}
sort?.addEventListener('click',()=>{if(sortMenu?.hidden)openSort();else closeSort();});
sort?.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
 e.preventDefault();openSort(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0);
 if(e.key==='Home')sortOptions[0]?.focus();
 if(e.key==='End')sortOptions.at(-1)?.focus();
 }else if(e.key==='Escape'&&!sortMenu?.hidden){e.preventDefault();closeSort(true);}});
sortMenu?.addEventListener('click',e=>{const option=e.target.closest('[role="option"][data-sort]');if(option&&sortMenu.contains(option))chooseSort(option.dataset.sort);});
sortMenu?.addEventListener('keydown',e=>{const i=sortOptions.indexOf(document.activeElement);if(i<0)return;
 if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();
 const n=e.key==='Home'?0:e.key==='End'?sortOptions.length-1:(i+(e.key==='ArrowDown'?1:-1)+sortOptions.length)%sortOptions.length;sortOptions[n]?.focus();
 }else if(e.key==='Escape'){e.preventDefault();closeSort(true);}
 else if(e.key==='Tab')closeSort();});
sortField?.addEventListener('focusout',e=>{if(!sortField.contains(e.relatedTarget))closeSort();});
document.addEventListener('pointerdown',e=>{if(sortField&&!sortField.contains(e.target))closeSort();});
more?.addEventListener('click',()=>{visible+=6;render();});
async function load(){try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);let res;try{res=await fetch('/api/blogs',{headers:{Accept:'application/json'},signal:controller.signal});}finally{clearTimeout(timer);}if(!res.ok)throw Error('Feed unavailable');const json=await res.json();if(json.warning&&!Array.isArray(json.blogs))throw Error('Feed unavailable');articles=Array.isArray(json.blogs)?json.blogs.filter(a=>a&&a.title):[];if(!articles.length)throw Error('No articles available');buildFilters();render();}catch(e){if(feature)feature.innerHTML='';if(counter)counter.textContent='DEV.to is temporarily unavailable';if(total)total.textContent='—';if(matchSummary)matchSummary.textContent='Archive temporarily unavailable';grid.innerHTML='<div class="journal-status"><p>Could not load the latest stories right now.</p><button type="button" id="journal-retry">TRY AGAIN ↗</button><p><a href="https://dev.to/amrishkhan05" target="_blank" rel="noopener noreferrer">Read directly on DEV.to ↗</a></p></div>';q('#journal-retry')?.addEventListener('click',load,{once:true});}}
load();
})();
