/* Accessible shared navigation, scroll helpers and document links. */
(()=>{'use strict';
const body=document.body;
const q=s=>document.querySelector(s);
const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const subpage=/^\/blog\//.test(location.pathname)||body.classList.contains('is-aruvix-view');
const nav=q('#primary-nav'),menu=q('#menu-toggle'),header=q('.site-header'),top=q('#back-to-top'),bar=q('#reading-progress');
if(subpage){
  menu?.addEventListener('click',()=>{
    const next=menu.getAttribute('aria-expanded')!=='true';
    menu.setAttribute('aria-expanded',String(next));menu.setAttribute('aria-label',next?'Close navigation':'Open navigation');
    nav?.classList.toggle('open',next);
  });
  nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{menu?.setAttribute('aria-expanded','false');nav.classList.remove('open')}));
  addEventListener('keydown',e=>{if(e.key==='Escape'){menu?.setAttribute('aria-expanded','false');nav?.classList.remove('open')}});
}
function scrollUI(){
 const y=scrollY,max=document.documentElement.scrollHeight-innerHeight;
 header?.classList.toggle('is-scrolled',y>30);
 top?.classList.toggle('is-visible',y>490);
 if(bar)bar.style.width=(max>0?Math.min(100,y/max*100):0)+'%';
}
addEventListener('scroll',scrollUI,{passive:true});scrollUI();
if(/^\/blog\//.test(location.pathname)){
 top?.addEventListener('click',()=>scrollTo({top:0,behavior:reduce()?'instant':'smooth'}));
 const back=q('.blog-back-link');if(back)back.href='/#writing';
}
document.querySelectorAll('a[href^="/resume/"]').forEach(a=>{a.setAttribute('download','')});
})();