'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:3333';
const output = path.join(__dirname, '..', 'browser-artifacts');
fs.mkdirSync(output, { recursive: true });
const sample = [
  {id:1,title:'Sometimes the fastest system is the one willing to stop',description:'How manufacturing inspired resilient systems.',publishedAt:'2026-09-20T10:00:00Z',tags:['architecture','engineering'],url:'/blog/fixture',devSlug:'fixture',readingTimeMinutes:7,coverImage:'https://media.invalid/cover-fail.webp',coverImageFallback:'https://media.invalid/backup-fail.webp'},
  ...Array.from({length:8},(_,i)=>({id:i+2,title:'Article on systems and engineering '+(i+2),description:'Practical notes for engineers and builders.',publishedAt:'2026-09-'+String(18-i).padStart(2,'0')+'T10:00:00Z',tags:i%2?['javascript']:['architecture'],url:'/blog/sample-'+(i+2),devSlug:'sample-'+(i+2),readingTimeMinutes:5,coverImage:null}))
];
(async()=>{
const browser = await chromium.launch({headless:true});
const context = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,acceptDownloads:true});
const page = await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/blogs*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({blogs:sample,count:sample.length})}));
await page.goto(base+'/',{waitUntil:'domcontentloaded'});
await page.locator('#journal-grid .journal-card').first().waitFor({timeout:20000});
await page.route('**/media.invalid/**',route=>route.abort());
await page.waitForTimeout(250);
const listImageFallback=await page.locator('#journal-feature .journal-art').evaluate(el=>({count:el.querySelectorAll('img').length,fallback:!!el.querySelector('.journal-art-fallback'),height:el.getBoundingClientRect().height}));
assert.equal(listImageFallback.count,0,'broken original and backup covers are removed');
assert.equal(listImageFallback.fallback,true,'cover fallback artwork stays visible');
assert.ok(listImageFallback.height>=180,'cover image failure does not collapse the layout');
await page.locator('#journal-feature .journal-art').screenshot({path:path.join(output,'journal-broken-cover-fallback.png')});

assert.equal(await page.locator('#studio-theme-toggle').count(),1,'one theme toggle');
assert.equal(await page.locator('#back-to-top').count(),1,'one back-to-top button');
assert.ok(await page.locator('.hero h1').isVisible(),'hero heading shown');
assert.ok((await page.locator('a[href$=".pdf"]').count())>0,'resume PDF available');
assert.ok((await page.locator('a[href$=".docx"]').count())>0,'resume DOCX available');
assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth))<=1442,'no desktop horizontal overflow');
assert.equal(await page.locator('#approach-title').evaluate(el=>getComputedStyle(el).animationName),'none','desktop intro is not trapped in a paused animation');
assert.equal(await page.locator('#work-title').evaluate(el=>getComputedStyle(el).animationName),'none','work headline is visible');
assert.equal(await page.locator('#hero-heading').evaluate(el=>getComputedStyle(el).color),'rgb(246, 244, 238)','light-mode hero heading contrasts with dark hero');
// Section-level regression: the legacy stylesheet must not constrain the studio layout.
const sectionGeometry = await page.evaluate(() => {
  const intro = document.querySelector('.intro-section');
  const introCopy = document.querySelector('.intro-copy');
  const experience = document.querySelector('#experience');
  const heading = experience?.querySelector('.experience-heading');
  const timeline = experience?.querySelector('.timeline');
  const work = document.querySelector('.work-layout');
  const contact = document.querySelector('.contact-section');
  return {
    introDisplay: getComputedStyle(intro).display,
    introCopyWidth: introCopy.getBoundingClientRect().width,
    introColumns: getComputedStyle(intro.querySelector('.intro-grid')).gridTemplateColumns.split(' ').length,
    experiencePosition: getComputedStyle(heading).position,
    timelineOverflow: getComputedStyle(timeline).overflowY,
    workColumns: getComputedStyle(work).gridTemplateColumns.split(' ').length,
    contactDisplay: getComputedStyle(contact).display,
    contactWidth: Math.round(contact.getBoundingClientRect().width),
    viewportWidth: innerWidth
  };
});
assert.equal(sectionGeometry.introDisplay,'block','intro is a full-width section, not the legacy grid');
assert.ok(sectionGeometry.introCopyWidth >= 220,'intro body copy has proper reading width');
assert.equal(sectionGeometry.introColumns,2,'intro uses editorial two-column grid');
assert.equal(sectionGeometry.experiencePosition,'sticky','experience heading stays pinned on desktop');
assert.notEqual(sectionGeometry.timelineOverflow,'scroll','timeline uses natural page scrolling');
assert.equal(sectionGeometry.workColumns,2,'work cards use two-column layout');
assert.equal(await page.locator('.project-aruvix').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(213, 244, 120)','flagship matches lime prototype treatment');
assert.equal(await page.locator('.project-aruvix h3').evaluate(el=>getComputedStyle(el).color),'rgb(17, 22, 29)','flagship heading contrasts against lime');

assert.equal((await page.locator('.project-aruvix h3').innerText()).trim(),'Aruvix','product name has no decorative asterisk');
assert.equal(await page.locator('.project-star').count(),0,'no misleading star symbol beside Aruvix');
const boarding = await page.locator('#work .project-airline').evaluate(card=>{
 const ticket=card.querySelector('.boarding-pass');
 const visual=card.querySelector('.airline-visual');
 const barcode=card.querySelector('.bar-code');
 const ticketStyle=getComputedStyle(ticket);
 const rectangle=ticket.getBoundingClientRect();
 const art=visual.getBoundingClientRect();
 const content=card.querySelector('.project-content').getBoundingClientRect();
 return {
  ticketBackground:ticketStyle.backgroundColor,
  transform:ticketStyle.transform,
  barcode:getComputedStyle(barcode).backgroundImage,
  airlineBackground:getComputedStyle(card).backgroundColor,
  artHeight:Math.round(art.height),
  ticketWidth:Math.round(rectangle.width),
  ticketHeight:Math.round(rectangle.height),
  cardWidth:Math.round(card.getBoundingClientRect().width),
  contentWidth:Math.round(content.width),
  textColor:getComputedStyle(card.querySelector('.project-content h3')).color
 };
});
assert.equal(boarding.airlineBackground,'rgb(32, 42, 50)','airline has prototype charcoal background');
assert.equal(boarding.ticketBackground,'rgb(250, 249, 244)','boarding pass has ivory ticket surface');
assert.notEqual(boarding.transform,'none','boarding pass is angled');
assert.ok(boarding.barcode.includes('repeating-linear-gradient'),'ticket barcode is rendered');
assert.ok(boarding.artHeight>=250,'boarding pass gets generous visual space');
assert.ok(boarding.ticketWidth>=270&&boarding.ticketHeight>=145,'ticket is legible on desktop');
assert.ok(boarding.contentWidth>350,'project content has adequate width');
const openSourceRow=await page.locator('#work .project-oss').evaluate(card=>{
 const grid=card.parentElement.getBoundingClientRect();
 const rect=card.getBoundingClientRect();
 const visual=card.querySelector('.oss-visual').getBoundingClientRect();
 const content=card.querySelector('.project-content').getBoundingClientRect();
 return {
  rowSpan:getComputedStyle(card).gridColumn,
  gridLayout:getComputedStyle(card).display,
  width:rect.width,
  gridWidth:grid.width,
  visualX:visual.x,
  contentX:content.x,
  visualWidth:visual.width,
  contentWidth:content.width
 };
});
assert.ok(openSourceRow.width>=openSourceRow.gridWidth-3,'open source card fills final row');
assert.equal(openSourceRow.gridLayout,'grid','open source card uses horizontal editorial layout');
assert.ok(openSourceRow.contentX>openSourceRow.visualX,'open source copy is alongside graphic');
assert.ok(openSourceRow.visualWidth>250&&openSourceRow.contentWidth>250,'open source content is spacious');

const packages=page.locator('#work .oss-package');
assert.equal(await packages.count(),3,'published npm packages are visible');
for(const [i,name] of ['%40amrishkhan05/frankly','%40amrishkhan05/hallpass','sql-select-query-generator'].entries()){
  const item=packages.nth(i);
  assert.ok((await item.getAttribute('href')).includes('npmjs.com/package/'+name),'each package has a direct npm URL');
  assert.ok(await item.isVisible(),'each published package is visible');
}
async function checkVerticalRhythm(width,height) {
 await page.setViewportSize({width,height});
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
 const geometry=await page.evaluate(()=>{
   const selectors=['#approach','#work','#experience','#writing','#contact'];
   return {
     viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
     hero:document.querySelector('.hero').getBoundingClientRect().height,
     sections:selectors.map(sel=>{
       const el=document.querySelector(sel),rect=el.getBoundingClientRect(),st=getComputedStyle(el);
       return {id:sel,height:Math.round(rect.height),paddingTop:parseFloat(st.paddingTop),paddingBottom:parseFloat(st.paddingBottom),overflowY:st.overflowY,display:st.display};
     })
   };
 });
 assert.ok(geometry.scrollWidth<=geometry.viewport+2,'no sideways scroll at '+width+'×'+height);
 for(const section of geometry.sections){
  assert.ok(section.height>200,'content remains present in '+section.id);
  assert.ok(section.paddingTop<=85&&section.paddingBottom<=85,'no oversized section-edge spacing in '+section.id+' at '+height+'px viewport');
  assert.notEqual(section.overflowY,'scroll','sections use natural document scrolling: '+section.id);
 }
 if(width>=1100)assert.ok(geometry.hero<=height*1.4,'hero does not overwhelm shorter laptop screens');
 return geometry;
}
const laptopRhythm=await checkVerticalRhythm(1280,720);
assert.ok(laptopRhythm.sections.find(s=>s.id==='#work').paddingTop<=55,'work section begins promptly on short laptop viewport');
await page.locator('#work').screenshot({path:path.join(output,'selected-work-laptop-packages.png')});
await checkVerticalRhythm(1440,900);


assert.equal(boarding.textColor,'rgb(246, 244, 238)','airline heading has sufficient contrast');
await page.locator('#work').screenshot({path:path.join(output,'selected-work-desktop-light.png')});

assert.equal(sectionGeometry.contactDisplay,'block','contact is full-width rather than legacy grid');
assert.ok(sectionGeometry.contactWidth >= sectionGeometry.viewportWidth - 2,'contact band is edge to edge');
await page.evaluate(() => {
  const section=document.getElementById('experience');
  scrollTo({top:scrollY+section.getBoundingClientRect().top+180,behavior:'instant'});
});
await page.waitForTimeout(150);
const beforeSticky=await page.evaluate(() => ({
  heading:document.querySelector('.experience-heading').getBoundingClientRect().top,
  row:document.querySelector('.timeline-row').getBoundingClientRect().top
}));
await page.evaluate(() => scrollBy({top:150,behavior:'instant'}));
await page.waitForTimeout(150);
const afterSticky=await page.evaluate(() => ({
  heading:document.querySelector('.experience-heading').getBoundingClientRect().top,
  row:document.querySelector('.timeline-row').getBoundingClientRect().top
}));
assert.ok(Math.abs(afterSticky.heading-beforeSticky.heading)<12,'heading stays pinned while scrolling through experience');
assert.ok(beforeSticky.row-afterSticky.row>=120,'experience entries move while heading stays still');
await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));

await page.screenshot({path:path.join(output,'desktop-light.png'),fullPage:true});
await page.locator('#studio-theme-toggle').click();
assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark','theme toggle works');
await page.screenshot({path:path.join(output,'desktop-dark.png'),fullPage:true});
await page.goto(base+'/aruvix',{waitUntil:'domcontentloaded'});
assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark','theme persists to Aruvix');
assert.ok(await page.locator('#case-study').isVisible(),'Aruvix content visible');
assert.equal(await page.locator('#case-study .reveal').first().evaluate(el=>getComputedStyle(el).animationName),'none','Aruvix content not trapped in animation');
await page.screenshot({path:path.join(output,'aruvix-dark.png'),fullPage:true});
const pdf=await page.request.get(base+'/resume/pdf/Amrishkhan-Sheik-Abdullah-Resume.pdf');
const doc=await page.request.get(base+'/resume/doc/Amrishkhan-Sheik-Abdullah-Resume.docx');
assert.equal(pdf.status(),200,'PDF endpoint accessible');assert.equal(doc.status(),200,'Word endpoint accessible');
await page.setViewportSize({width:390,height:844});
await page.goto(base+'/',{waitUntil:'domcontentloaded'});
await page.locator('#journal-grid .journal-card').first().waitFor({timeout:20000});
assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth))<=392,'no mobile horizontal overflow');
await page.locator('#menu-toggle').click();
assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'true','mobile menu opens');
assert.ok(await page.locator('#primary-nav').isVisible(),'mobile nav visible');
await page.locator('#primary-nav a[href="#writing"]').click();
assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'false','mobile menu closes');
const mobileTicket=await page.locator('#work .boarding-pass').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,bg:getComputedStyle(el).backgroundColor,barcode:getComputedStyle(document.querySelector('#work .bar-code')).backgroundImage}));
assert.ok(mobileTicket.width>=240&&mobileTicket.height>=140,'boarding pass remains legible on phones');
assert.equal(mobileTicket.bg,'rgb(250, 249, 244)','mobile boarding pass uses ivory paper');
assert.equal(await page.locator('#work .project-oss').evaluate(el=>getComputedStyle(el).display),'flex','open source returns to single-column mobile flow');
const mobileRhythm=await checkVerticalRhythm(390,844);
assert.ok(mobileRhythm.sections.every(s=>s.paddingTop<=60),'mobile sections do not have desktop-sized gaps');
assert.equal(await page.locator('#work .oss-package').count(),3,'all published packages remain available on mobile');


assert.ok(mobileTicket.barcode.includes('repeating-linear-gradient'),'mobile barcode is visible');
await page.locator('#work').screenshot({path:path.join(output,'selected-work-mobile-dark.png')});

await page.screenshot({path:path.join(output,'mobile-dark.png'),fullPage:true});
const pageSource=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
// Mirror app.js renderBlogPage(), which injects the legacy article reader CSS
// exclusively for server-rendered /blog/:slug pages.
const articleHtml=pageSource
 .replace('<link rel="stylesheet" href="/site-redesign.css?v=5" />', ['<link rel="stylesheet" href="/styles.css?v=4" />', '<link rel="stylesheet" href="/site-redesign.css?v=5" />'].join("\n"))
 .replace('<div class="blog-detail-content" id="blog-detail-content" hidden>','<div class="blog-detail-content" id="blog-detail-content">')
 .replace('<div class="blog-detail-status" id="blog-detail-status">Loading...</div>','<div class="blog-detail-status" id="blog-detail-status" hidden></div>')
 .replace('classList.add("is-blog-route", "is-blog-loading")','classList.add("is-blog-route", "is-blog-ready")')
 .replace('<img class="blog-cover" id="blog-detail-cover" alt="" loading="eager" fetchpriority="high" decoding="async" width="1200" height="675" hidden />','<img class="blog-cover" id="blog-detail-cover" alt="" src="https://media.invalid/article-cover.webp" loading="eager" decoding="async" width="1200" height="675" />')
 .replace('<h1 id="blog-detail-title"></h1>','<h1 id="blog-detail-title">Sometimes the fastest system is the one willing to stop</h1>')
 .replace('<div class="blog-body" id="blog-detail-body"></div>','<div class="blog-body" id="blog-detail-body"><p>Engineering is about thoughtful decisions in complex systems.</p></div>');
await page.route('**/blog/fixture',route=>route.fulfill({status:200,contentType:'text/html',body:articleHtml}));
await page.route('**/api/blogs/fixture*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...sample[0],bodyHtml:'<p>Engineering is about thoughtful decisions in complex systems.</p>',bodyMarkdown:''})}));
await page.goto(base+'/blog/fixture',{waitUntil:'domcontentloaded'});
await page.locator('#blog-detail-title').waitFor({state:'visible',timeout:20000});
assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark','theme persists to article');
assert.ok(await page.locator('#blog-detail-body').isVisible(),'article body is visible');
await page.waitForTimeout(250);
assert.equal(await page.locator('#blog-detail-cover').isVisible(),false,'failed full-article cover hides without a broken image');
assert.ok(await page.locator('.blog-cover-fallback').isVisible(),'branded cover fallback remains visible');
assert.equal(await page.locator('.blog-cover-frame').evaluate(el=>Math.round(el.getBoundingClientRect().height))>150,true,'article cover keeps its dimensions after failure');
assert.equal(await page.locator('#blog-loader-overlay').isVisible(),false,'SSR articles do not flash a loader on ready content');

assert.ok((await page.locator('.blog-back-link').getAttribute('href'))==='/#writing','article back link to writing');
const articleOverflow=await page.evaluate(()=>({
  width:document.documentElement.scrollWidth,
  viewport:innerWidth,
  offenders:Array.from(document.querySelectorAll('body *')).map(el=>({el,rect:el.getBoundingClientRect()}))
   .filter(({rect})=>rect.width&&rect.right>innerWidth+3)
   .slice(0,8).map(({el,rect})=>({tag:el.tagName,cls:el.className?.baseVal??String(el.className||''),right:Math.round(rect.right)}))
}));
if(articleOverflow.width>articleOverflow.viewport+2)console.error('Article overflowing elements:',JSON.stringify(articleOverflow));
assert.ok(articleOverflow.width<=articleOverflow.viewport+2,'article mobile layout does not overflow');
await page.screenshot({path:path.join(output,'article-mobile-dark.png'),fullPage:true});
// Loading page without SSR: no homepage flash, branded terminal loader, stable frame.
await page.route('**/blog/slow-fixture',route=>route.fulfill({status:200,contentType:'text/html',body:pageSource}));
await page.route('**/api/blogs/slow-fixture*',async route=>{await new Promise(done=>setTimeout(done,950));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...sample[0],devSlug:'slow-fixture',coverImage:'https://media.invalid/missing.webp',bodyHtml:'<p>Article finally loaded.</p><img src="https://media.invalid/inline.webp" alt="Diagram">',bodyMarkdown:''})});});
await page.goto(base+'/blog/slow-fixture',{waitUntil:'domcontentloaded'});
const loaderState=await page.evaluate(()=>({home:getComputedStyle(document.querySelector('#home-content')).display,loader:getComputedStyle(document.querySelector('#blog-loader-overlay')).display,shell:document.querySelector('#blog-detail').getBoundingClientRect().height}));
assert.equal(loaderState.home,'none','article route never paints the home layout');
assert.equal(loaderState.loader,'grid','terminal loader visible while data fetch is pending');
assert.ok(loaderState.shell>200,'article route maintains reserved layout space');
assert.ok(await page.locator('.code-loader-prompt').isVisible(),'terminal progress UI is shown');
await page.screenshot({path:path.join(output,'article-terminal-loading.png')});
await page.locator('#blog-detail-body').getByText('Article finally loaded.').waitFor({timeout:8000});
await page.waitForTimeout(300);
assert.equal(await page.locator('#blog-loader-overlay').isVisible(),false,'terminal loader disappears when article is ready');
assert.equal(await page.locator('.blog-media-unavailable').count(),1,'unavailable inline image becomes branded placeholder');
assert.ok(await page.locator('.blog-cover-fallback').isVisible(),'slow article broken cover shows fallback');
assert.deepEqual(errors,[],'no browser JavaScript errors');
await browser.close();
console.log('Browser regression checks passed on desktop, mobile, theme persistence, Aruvix, article reader and resume downloads.');
})().catch(err=>{console.error(err);process.exit(1);});
