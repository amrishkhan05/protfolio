
/* Systems Studio frontend. All DEV.to content is supplied by the site's existing /api/blogs endpoint. */
(() => {
'use strict';
if (/^\/blog\//.test(location.pathname)) return;
const q=(x)=>document.querySelector(x),qa=(x)=>Array.from(document.querySelectorAll(x));
const nav=q('#primary-nav'),toggle=q('#menu-toggle'),header=q('.site-header'),top=q('#back-to-top'),progress=q('#reading-progress');
const escape=(v)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
toggle?.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));toggle.setAttribute('aria-label',open?'Open navigation':'Close navigation');nav?.classList.toggle('open',!open);});
qa('#primary-nav a').forEach(a=>a.addEventListener('click',()=>{nav?.classList.remove('open');toggle?.setAttribute('aria-expanded','false');}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){nav?.classList.remove('open');toggle?.setAttribute('aria-expanded','false');}});
// Context navigation is a reading shortcut, not a second permanent header.
const writing=q('#writing'),writingHeader=writing?.querySelector('.section-top'),writingContext=q('#writing-context'),contextSearch=q('#writing-context-search'),contextCount=q('#writing-context-count');
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

function updateScroll(){const y=scrollY,max=document.documentElement.scrollHeight-innerHeight;header?.classList.toggle('is-scrolled',y>25);top?.classList.toggle('is-visible',y>490);if(progress)progress.style.width=(max>0?Math.min(100,y/max*100):0)+'%';updateWritingContext();}
addEventListener('scroll',updateScroll,{passive:true});updateScroll();
top?.addEventListener('click',()=>window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
if(q('#current-year'))q('#current-year').textContent=String(new Date().getFullYear());
const sectionObserver=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting)qa('#primary-nav a[href*="#"]').forEach(a=>{if(a.hash==='#'+e.target.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});}},{rootMargin:'-20% 0px -65% 0px'});
qa('main section[id]').forEach(s=>sectionObserver.observe(s));
qa('.filter-tab').forEach(tab=>tab.addEventListener('click',()=>{const kind=tab.dataset.filter;qa('.filter-tab').forEach(b=>{b.classList.toggle('active',b===tab);b.setAttribute('aria-pressed',String(b===tab))});qa('.project-card[data-category]').forEach(card=>{card.hidden=kind!=='all'&&!String(card.dataset.category||'').split(' ').includes(kind);});}));
q('#format-btn')?.addEventListener('click',()=>{const area=q('#json-input'),status=q('#json-status');if(!area)return;try{area.value=JSON.stringify(JSON.parse(area.value),null,2);if(status)status.textContent='✓ Valid JSON · Formatted locally';}catch(e){if(status)status.textContent='Please enter valid JSON: '+e.message;}});
q('#copy-email')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText('amrishkhansheikabdullah@gmail.com');if(q('#copy-feedback'))q('#copy-feedback').textContent='Email address copied';}catch(e){if(q('#copy-feedback'))q('#copy-feedback').textContent='Copy unavailable. Use the email link above.';}});
const feature=q('#journal-feature'),grid=q('#journal-grid'),filters=q('#journal-filters'),search=q('#journal-search'),sort=q('#journal-order'),more=q('#journal-more'),counter=q('#journal-count'),shown=q('#journal-showing');
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
document.addEventListener('click',event=>{
  const link=event.target.closest?.('a.journal-card[href^="/blog/"]');
  if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
  event.preventDefault();
  const overlay=q('#blog-loader-overlay');
  if(overlay){overlay.hidden=false;document.documentElement.classList.add('is-opening-article');}
  requestAnimationFrame(()=>setTimeout(()=>{location.assign(link.href);},90));
},true);
function filtered(){return articles.filter(a=>(tag==='All'||normalTags(a).some(t=>String(t).toLowerCase()===tag.toLowerCase()))&&(!term||(a.title+' '+a.description+' '+normalTags(a).join(' ')).toLowerCase().includes(term))).sort((a,b)=>(sort?.value==='oldest'?1:-1)*(new Date(a.publishedAt||0)-new Date(b.publishedAt||0)));}
function render(){const list=filtered(),first=!term&&tag==='All'&&sort?.value!=='oldest'?list[0]:null;feature.innerHTML=first?card(first,true):'';const other=first?list.slice(1):list;grid.innerHTML=other.length?other.slice(0,visible).map(a=>card(a)).join(''):'<p class="journal-status">No matching stories. Try another topic or search.</p>';if(shown)shown.textContent=list.length?('Showing '+Math.min(visible+(first?1:0),list.length)+' of '+list.length+' stories'):'';if(more)more.hidden=other.length<=visible;if(counter)counter.textContent=articles.length+' stories from DEV.to';}
function buildFilters(){const tags=[...new Set(articles.flatMap(normalTags).map(String).filter(Boolean))];const count=t=>articles.filter(a=>normalTags(a).some(s=>String(s).toLowerCase()===t.toLowerCase())).length;tags.sort((a,b)=>count(b)-count(a));const choices=['All',...tags.slice(0,8)];filters.innerHTML=choices.map(t=>'<button type="button" data-tag="'+escape(t)+'" aria-pressed="'+String(t===tag)+'">'+escape(t==='All'?'All stories':t)+'</button>').join('');}
filters?.addEventListener('click',e=>{const b=e.target.closest('button[data-tag]');if(!b)return;tag=b.dataset.tag;visible=6;buildFilters();render();});
search?.addEventListener('input',e=>{term=e.target.value.trim().toLowerCase();visible=6;render();});
sort?.addEventListener('change',()=>{visible=6;render();});more?.addEventListener('click',()=>{visible+=6;render();});
async function load(){try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);let res;try{res=await fetch('/api/blogs',{headers:{Accept:'application/json'},signal:controller.signal});}finally{clearTimeout(timer);}if(!res.ok)throw Error('Feed unavailable');const json=await res.json();if(json.warning&&!Array.isArray(json.blogs))throw Error('Feed unavailable');articles=Array.isArray(json.blogs)?json.blogs.filter(a=>a&&a.title):[];if(!articles.length)throw Error('No articles available');buildFilters();render();}catch(e){if(counter)counter.textContent='DEV.to is temporarily unavailable';grid.innerHTML='<div class="journal-status"><p>Could not load the latest stories right now.</p><button type="button" id="journal-retry">TRY AGAIN ↗</button><p><a href="https://dev.to/amrishkhan05" target="_blank" rel="noopener noreferrer">Read directly on DEV.to ↗</a></p></div>';q('#journal-retry')?.addEventListener('click',load,{once:true});}}
load();
})();
