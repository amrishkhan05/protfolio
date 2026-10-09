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
const wideCoverSvg="<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1000\" height=\"420\" viewBox=\"0 0 1000 420\"><rect width=\"1000\" height=\"420\" fill=\"#1f292d\"/><rect x=\"0\" y=\"0\" width=\"90\" height=\"420\" fill=\"#d5f478\"/><rect x=\"910\" y=\"0\" width=\"90\" height=\"420\" fill=\"#f4aa91\"/><text x=\"10\" y=\"200\" font-size=\"22\" fill=\"#11161d\">LEFT</text><text x=\"930\" y=\"200\" font-size=\"22\" fill=\"#11161d\">RIGHT</text><text x=\"150\" y=\"230\" font-family=\"monospace\" font-size=\"60\" fill=\"#ffffff\">FULL BANNER</text></svg>";
sample[1].coverImage='https://fixture-images.test/wide-banner.svg';
await page.route('**/fixture-images.test/wide-banner.svg',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:wideCoverSvg}));
await page.route('**/api/blogs*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({blogs:sample,count:sample.length})}));
await page.goto(base+'/',{waitUntil:'domcontentloaded'});
await page.locator('#journal-grid .journal-card').first().waitFor({timeout:20000});

const contextBar=page.locator('#writing-context');
assert.equal(await contextBar.isVisible(),false,'writing contextual bar stays hidden before entering Writing');
await page.evaluate(()=>{
 const writing=document.getElementById('writing');
 const barHeading=writing.querySelector('.journal-toolbar');
 const header=document.querySelector('.site-header');
 scrollTo({top:scrollY+barHeading.getBoundingClientRect().bottom+40,behavior:'instant'});
});
await page.waitForTimeout(180);
assert.ok(await contextBar.isVisible(),'slim Field Notes bar appears once Writing heading leaves view');
const contextGeo=await contextBar.evaluate(el=>({height:el.getBoundingClientRect().height,top:el.getBoundingClientRect().top,headerBottom:document.querySelector('.site-header').getBoundingClientRect().bottom}));
assert.ok(contextGeo.height>=40&&contextGeo.height<=52,'context bar is a compact 46px band');
console.log('WRITING CONTEXT GEOMETRY',JSON.stringify(contextGeo));
assert.ok(Math.abs(contextGeo.top-contextGeo.headerBottom)<4,'context bar sits beneath fixed navigation, without overlap');
assert.equal((await page.locator('#writing-context-count').innerText()).trim(),'9 stories','contextual count follows API response');
assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light','writing context uses the fixed editorial palette');

await contextBar.locator('#writing-context-search').click();
await page.waitForTimeout(750);
assert.equal(await page.locator('#journal-search').evaluate(el=>document.activeElement===el),true,'Find a story focuses the real article search');
const searchGeo=await page.locator('#journal-search').evaluate(el=>({top:el.getBoundingClientRect().top,headerBottom:document.querySelector('.site-header').getBoundingClientRect().bottom,contextHeight:document.querySelector('#writing-context').getBoundingClientRect().height}));
assert.ok(searchGeo.top>searchGeo.headerBottom+searchGeo.contextHeight-1,'focused search remains unobstructed by both navigation bars');
await page.locator('#writing-context').screenshot({path:path.join(output,'writing-context-desktop-light.png')});
await page.evaluate(()=>document.getElementById('contact').scrollIntoView({behavior:'instant',block:'start'}));
await page.waitForTimeout(170);
assert.equal(await contextBar.isVisible(),false,'context bar disappears completely before Contact');
await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));

await page.route('**/media.invalid/**',route=>route.abort());
await page.waitForTimeout(250);
const listImageFallback=await page.locator('#journal-feature .journal-art').evaluate(el=>({count:el.querySelectorAll('img').length,fallback:!!el.querySelector('.journal-art-fallback'),height:el.getBoundingClientRect().height}));
assert.equal(listImageFallback.count,0,'broken original and backup covers are removed');
assert.equal(listImageFallback.fallback,true,'cover fallback artwork stays visible');
assert.ok(listImageFallback.height>=180,'cover image failure does not collapse the layout');
await page.locator('#journal-feature .journal-art').screenshot({path:path.join(output,'journal-broken-cover-fallback.png')});
const wideThumbnail=page.locator('#journal-grid .journal-card').first().locator('.journal-art');
await wideThumbnail.locator('img').waitFor({state:'visible'});
await wideThumbnail.locator('img').evaluate(img=>img.decode());
const thumbnailGeometry=await wideThumbnail.evaluate(el=>{
  const img=el.querySelector('img'),box=el.getBoundingClientRect(),style=getComputedStyle(img);
  return {naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,objectFit:style.objectFit,aspect:box.width/box.height};
});
assert.equal(thumbnailGeometry.naturalWidth,1000,'wide banner image downloaded');
assert.equal(thumbnailGeometry.naturalHeight,420,'wide banner image has original dimensions');
assert.equal(thumbnailGeometry.objectFit,'contain','full thumbnail must not crop title text');
assert.ok(Math.abs(thumbnailGeometry.aspect-1000/420)<0.07,'thumbnail frame matches article banner proportions');
await wideThumbnail.screenshot({path:path.join(output,'journal-wide-banner-uncropped.png')});


assert.equal(await page.locator('#studio-theme-toggle').count(),0,'theme toggle removed entirely');
assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light','homepage uses one editorial theme');
assert.equal(await page.locator('#back-to-top').count(),1,'one back-to-top button');

function rgbFrom(style) {
 const m=style.match(/[\d.]+/g);
 return m?m.slice(0,3).map(Number):null;
}
function contrastRatio(fg,bg) {
 const linear=colors=>colors.map(x=>{const c=x/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
 const luminosity=x=>{const v=linear(x);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
 const [a,b]=[luminosity(fg),luminosity(bg)].sort((x,y)=>y-x);
 return (a+.05)/(b+.05);
}
async function assertHoverContrast(selector,label){
 const element=page.locator(selector).first();
 await element.scrollIntoViewIfNeeded();
 await element.hover();
 await page.waitForTimeout(200);
 const colors=await element.evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));
 const fg=rgbFrom(colors.fg),bg=rgbFrom(colors.bg);
 assert.ok(fg&&bg, label+' has solid hover foreground and background colors');
 assert.ok(contrastRatio(fg,bg)>=4.5,label+' hover contrast is at least WCAG AA for normal text: '+JSON.stringify(colors));
}
await assertHoverContrast('#journal-more','Show More Stories');
await assertHoverContrast('#work .project-action','Aruvix project button');
await assertHoverContrast('.site-header .header-cta','Header contact button');
await assertHoverContrast('#work .filter-tab.active','Selected Work active filter');

assert.ok(await page.locator('.hero h1').isVisible(),'hero heading shown');
const board=page.locator('.hero-switchboard');
assert.ok(await board.isVisible(),'interactive systems artwork visible');
assert.equal(await page.locator('.topo-frame').count(),0,'old hub-and-spoke diagram removed');
assert.equal(await board.locator('.switchboard-mode').count(),3,'three engineering perspectives available');
const initialBoard=await board.evaluate(el=>({width:el.getBoundingClientRect().width,panel:el.querySelector('.switchboard').getBoundingClientRect().width,buttons:[...el.querySelectorAll('.switchboard-mode')].map(b=>b.getAttribute('aria-pressed'))}));
assert.ok(initialBoard.width>350&&initialBoard.panel<=initialBoard.width+16,'editorial artwork sits within hero column');
assert.deepEqual(initialBoard.buttons,['true','false','false'],'aviation is the default perspective');
await board.screenshot({path:path.join(output,'hero-switchboard-desktop.png')});
await board.locator('[data-system="payments"]').click();
assert.ok((await page.locator('#switchboard-result').innerText()).includes('payment'),'payments experience updates output');
assert.equal(await board.locator('[data-system="payments"]').getAttribute('aria-pressed'),'true','pressed state updates accessibly');
assert.equal(await board.locator('[data-signal="0"]').innerText(),'Authorization','inputs update with perspective');
await board.locator('[data-system="tooling"]').click();
assert.ok((await page.locator('#switchboard-summary').innerText()).includes('developer tasks'),'tooling perspective shows relevant outcome');
await board.locator('[data-system="aviation"]').click();
assert.ok((await page.locator('#switchboard-result').innerText()).includes('check-in'),'switchboard can return to aviation');

const skills=page.locator('#skills');
assert.ok(await skills.isVisible(),'technical expertise section visible');
assert.equal(await skills.locator('.skills-group').count(),6,'six carefully curated technical groups');
assert.ok(await page.locator('#primary-nav a[href="#skills"]').isVisible(),'skills navigation is discoverable');
assert.ok((await skills.innerText()).includes('PostgreSQL'),'database experience is indexed');
assert.ok((await skills.innerText()).includes('NestJS'),'backend stack is indexed');
const skillsDesktop=await skills.evaluate(el=>({cols:getComputedStyle(el.querySelector('.skills-categories')).gridTemplateColumns.trim().split(/\s+/).length,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));
assert.equal(skillsDesktop.cols,3,'desktop skills grouped into three columns');
assert.ok(skillsDesktop.height<1000,'skills section remains concise on desktop');
await skills.screenshot({path:path.join(output,'skills-desktop-light.png')});

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
const ossCard=await page.locator('#work .project-oss').evaluate(card=>{
 const outer=card.getBoundingClientRect();
 const grid=card.parentElement.getBoundingClientRect();
 const tiles=Array.from(card.querySelectorAll('.oss-package')).map(x=>x.getBoundingClientRect());
 const columns=getComputedStyle(card.querySelector('.oss-package-list')).gridTemplateColumns.trim().split(/\s+/).length;
 return {height:Math.round(outer.height),width:outer.width,gridWidth:grid.width,columns,tiles:tiles.map(t=>({x:Math.round(t.x),height:Math.round(t.height)})),illustration:!!card.querySelector('.oss-visual')};
});
assert.equal(ossCard.illustration,false,'oversized OSS illustration is removed');
assert.ok(ossCard.width>=ossCard.gridWidth-3,'open source uses available final row');
assert.equal(ossCard.columns,3,'open source displays three compact package tiles');
assert.ok(ossCard.height<=285,'open source panel is compact on 1440 desktop');
assert.ok(Math.abs(ossCard.tiles[0].x-ossCard.tiles[1].x)>100,'tiles are side by side');
await page.locator('#work .project-oss').screenshot({path:path.join(output,'open-source-compact-desktop.png')});

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

// Last-page anchor regression, observed on a 1536×960 desktop:
// contact must occupy the viewport beneath the sticky header, with no
// leftover writing cards or blank transition bands in the visible area.
await page.setViewportSize({width:1536,height:960});
await page.goto(base+'/',{waitUntil:'domcontentloaded'});
await page.locator('#journal-grid .journal-card').first().waitFor({timeout:20000});
await page.evaluate(()=>document.getElementById('contact').scrollIntoView({behavior:'instant',block:'start'}));
await page.waitForTimeout(120);
const contactAnchor=await page.evaluate(()=>{
  const nav=document.querySelector('.site-header').getBoundingClientRect();
  const writing=document.getElementById('writing').getBoundingClientRect();
  const contact=document.getElementById('contact').getBoundingClientRect();
  const footer=document.querySelector('#contact .footer').getBoundingClientRect();
  const journalFooter=document.querySelector('#writing .journal-footer').getBoundingClientRect();
  return {
    navBottom:nav.bottom,contactTop:contact.top,contactBottom:contact.bottom,
    contactHeight:contact.height,viewport:innerHeight,
    writingBottom:writing.bottom,writingPaddingBottom:parseFloat(getComputedStyle(document.getElementById('writing')).paddingBottom),
    footerBottom:footer.bottom,journalFooterBottom:journalFooter.bottom,
    maxScroll:document.documentElement.scrollHeight-innerHeight,scrollY
  };
});
console.log('CONTACT ANCHOR GEOMETRY',JSON.stringify(contactAnchor));
assert.ok(Math.abs(contactAnchor.contactTop-contactAnchor.navBottom)<=32,'contact starts directly below sticky desktop navigation');
assert.ok(contactAnchor.writingBottom<=contactAnchor.navBottom+33,'writing cards cannot peek below sticky navigation at contact anchor');
assert.ok(contactAnchor.writingPaddingBottom<=33,'no oversized blank writing-to-contact band');
assert.ok(contactAnchor.contactBottom>=contactAnchor.viewport-3,'contact panel and footer reach the viewport bottom');
assert.ok(contactAnchor.footerBottom<=contactAnchor.viewport+4,'contact footer remains visible at final anchor on tall desktop');
const footerControlCollision=await page.evaluate(()=>{
  const last=document.querySelector('#contact .footer-social a:last-child').getBoundingClientRect();
  const button=document.querySelector('#back-to-top').getBoundingClientRect();
  return {linkRight:last.right,linkTop:last.top,linkBottom:last.bottom,buttonLeft:button.left,buttonTop:button.top,buttonBottom:button.bottom};
});
assert.ok(footerControlCollision.linkRight< footerControlCollision.buttonLeft-4 ||
  footerControlCollision.linkBottom<footerControlCollision.buttonTop-4 ||
  footerControlCollision.linkTop>footerControlCollision.buttonBottom+4,
  'fixed back-to-top button must not cover footer navigation');

await page.screenshot({path:path.join(output,'contact-desktop-1536x960.png'),fullPage:false});
await page.goto(base+'/#contact',{waitUntil:'domcontentloaded'});
await page.locator('#journal-grid .journal-card').first().waitFor({timeout:20000});
await page.waitForTimeout(220);
const directHashTop=await page.locator('#contact').evaluate(el=>el.getBoundingClientRect().top);
assert.ok(directHashTop<=115&&directHashTop>=45,'direct #contact navigation shows contact below header');
await page.setViewportSize({width:1440,height:900});
await page.goto(base+'/',{waitUntil:'domcontentloaded'});
await page.locator('#journal-grid .journal-card').first().waitFor({timeout:20000});

await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));

await page.screenshot({path:path.join(output,'desktop-light.png'),fullPage:true});
await page.evaluate(()=>localStorage.setItem('portfolio-theme','dark'));
await page.reload({waitUntil:'domcontentloaded'});
assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light','old saved dark preference cannot override the fixed palette');
assert.equal(await page.locator('#studio-theme-toggle').count(),0,'toggle remains removed after reload');

assert.ok(await page.locator('#skills .skills-group').first().isVisible(),'skills remain readable in the editorial palette');
await page.locator('#skills').screenshot({path:path.join(output,'skills-desktop-editorial.png')});

await page.screenshot({path:path.join(output,'desktop-editorial.png'),fullPage:true});
await page.goto(base+'/aruvix',{waitUntil:'domcontentloaded'});
assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light','Aruvix uses the same single theme');
assert.ok(await page.locator('#case-study').isVisible(),'Aruvix content visible');
assert.equal(await page.locator('.aru-hero h1').count(),1,'one clear Aruvix case study headline');
assert.equal(await page.locator('.aru-tool').count(),6,'current six tool families documented');
assert.equal(await page.locator('link[href^="/styles.css"]').count(),0,'new Aruvix page does not load legacy stylesheet');
assert.ok(await page.locator('#decisions').isVisible(),'engineering decisions are visible');
assert.ok(await page.locator('body > footer.footer').isVisible(),'case study footer is visible');
assert.ok(await page.locator('body > footer.footer a[href="/"]').isVisible(),'footer links back to portfolio');
assert.ok(await page.locator('.aru-editor-grid code').isVisible(),'developer workspace visual is present');
assert.ok((await page.locator('#evolution').innerText()).includes('macOS and Windows'),'desktop product expansion mentioned');
const aruDesktop=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,columns:getComputedStyle(document.querySelector('.aru-tools-grid')).gridTemplateColumns.trim().split(/\s+/).length}));
assert.ok(aruDesktop.width<=aruDesktop.viewport+2,'Aruvix has no desktop horizontal overflow');
assert.equal(aruDesktop.columns,3,'desktop Aruvix tools grid uses three columns');
await page.screenshot({path:path.join(output,'aruvix-case-desktop-editorial.png'),fullPage:true});

assert.equal(await page.locator('#case-study .aru-hero h1').evaluate(el=>getComputedStyle(el).opacity),'1','Aruvix headline is visible without scroll reveal');
await page.screenshot({path:path.join(output,'aruvix-editorial.png'),fullPage:true});
await page.setViewportSize({width:390,height:844});
await page.goto(base+'/aruvix',{waitUntil:'domcontentloaded'});
assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth))<=392,'Aruvix case study fits mobile');
assert.equal(await page.locator('.aru-tool').count(),6,'Aruvix mobile shows all tool groups');
assert.equal(await page.locator('.aru-tools-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length),1,'Aruvix tool cards stack cleanly on mobile');
assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light','Aruvix mobile uses the same single theme');
await page.locator('.aru-hero').screenshot({path:path.join(output,'aruvix-case-mobile-editorial.png')});
await page.setViewportSize({width:1440,height:900});
await page.goto(base+'/aruvix',{waitUntil:'domcontentloaded'});

const pdf=await page.request.get(base+'/resume/pdf/Amrishkhan-Sheik-Abdullah-Resume.pdf');
const doc=await page.request.get(base+'/resume/doc/Amrishkhan-Sheik-Abdullah-Resume.docx');
assert.equal(pdf.status(),200,'PDF endpoint accessible');assert.equal(doc.status(),200,'Word endpoint accessible');
await page.setViewportSize({width:390,height:844});
await page.goto(base+'/',{waitUntil:'domcontentloaded'});
await page.locator('#journal-grid .journal-card').first().waitFor({timeout:20000});
assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth))<=392,'no mobile horizontal overflow');
const mobileBoard=await page.locator('.hero-switchboard').evaluate(el=>({width:el.getBoundingClientRect().width,viewport:innerWidth,result:el.querySelector('.switchboard-result').getBoundingClientRect().width}));
assert.ok(mobileBoard.width<=mobileBoard.viewport-20,'hero art does not overflow mobile viewport');
assert.ok(mobileBoard.result>=100,'hero result text remains readable on mobile');
await page.locator('.hero-switchboard').screenshot({path:path.join(output,'hero-switchboard-mobile.png')});

assert.equal(await page.locator('#writing-context').isVisible(),false,'secondary bar never crowds the mobile viewport');
const mobileSkills=await page.locator('#skills .skills-categories').evaluate(el=>({columns:getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length,width:el.getBoundingClientRect().width}));
assert.equal(mobileSkills.columns,1,'mobile technical expertise uses single-column layout');
assert.ok(mobileSkills.width<=390,'mobile technical expertise fits viewport');
await page.locator('#skills').screenshot({path:path.join(output,'skills-mobile.png')});

await page.locator('#menu-toggle').click();
assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'true','mobile menu opens');
assert.ok(await page.locator('#primary-nav').isVisible(),'mobile nav visible');
await page.locator('#primary-nav a[href="#writing"]').click();
assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'false','mobile menu closes');
const mobileTicket=await page.locator('#work .boarding-pass').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,bg:getComputedStyle(el).backgroundColor,barcode:getComputedStyle(document.querySelector('#work .bar-code')).backgroundImage}));
assert.ok(mobileTicket.width>=240&&mobileTicket.height>=140,'boarding pass remains legible on phones');
assert.equal(mobileTicket.bg,'rgb(250, 249, 244)','mobile boarding pass uses ivory paper');
const mobileOss = await page.locator('#work .project-oss').evaluate(el=>({height:Math.round(el.getBoundingClientRect().height),width:el.getBoundingClientRect().width,columns:getComputedStyle(el.querySelector('.oss-package-list')).gridTemplateColumns.trim().split(/\s+/).length}));
assert.equal(mobileOss.columns,1,'mobile OSS packages display as one compact list');
assert.equal(await page.locator('#work .oss-package-index-type:visible').count(),0,'mobile package numbers remain one concise token');
assert.ok(mobileOss.height<=540,'open source panel stays concise on mobile');
assert.ok(mobileOss.width<=390,'open source does not overflow mobile viewport');
await page.locator('#work .project-oss').screenshot({path:path.join(output,'open-source-compact-mobile.png')});
const mobileRhythm=await checkVerticalRhythm(390,844);
assert.ok(mobileRhythm.sections.every(s=>s.paddingTop<=60),'mobile sections do not have desktop-sized gaps');
assert.equal(await page.locator('#work .oss-package').count(),3,'all published packages remain available on mobile');


assert.ok(mobileTicket.barcode.includes('repeating-linear-gradient'),'mobile barcode is visible');
await page.locator('#work').screenshot({path:path.join(output,'selected-work-mobile-editorial.png')});

await page.screenshot({path:path.join(output,'mobile-editorial.png'),fullPage:true});
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
assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light','article uses the same single theme');
assert.ok(await page.locator('#blog-detail-body').isVisible(),'article body is visible');
await page.waitForTimeout(250);
assert.equal(await page.locator('#blog-detail-cover').isVisible(),false,'failed full-article cover hides without a broken image');
assert.ok(await page.locator('.blog-cover-fallback').isVisible(),'branded cover fallback remains visible');
const failedCoverFrame=await page.locator('.blog-cover-frame').evaluate(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height}));
assert.ok(failedCoverFrame.h>120,'failed cover still reserves vertical space');
assert.ok(Math.abs(failedCoverFrame.w/failedCoverFrame.h-1000/420)<0.07,'failed cover retains wide banner aspect ratio');
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
await page.screenshot({path:path.join(output,'article-mobile-editorial.png'),fullPage:true});
const wideArticleHtml=articleHtml.replace('src="https://media.invalid/article-cover.webp"','src="https://fixture-images.test/wide-banner.svg"');
await page.route('**/blog/wide-banner-fixture',route=>route.fulfill({status:200,contentType:'text/html',body:wideArticleHtml}));
await page.goto(base+'/blog/wide-banner-fixture',{waitUntil:'domcontentloaded'});
await page.locator('#blog-detail-cover').evaluate(img=>img.decode());
const articleCover=await page.locator('.blog-cover-frame').evaluate(el=>{
  const img=el.querySelector('img'),rect=el.getBoundingClientRect();
  return {naturalWidth:img.naturalWidth,objectFit:getComputedStyle(img).objectFit,aspect:rect.width/rect.height};
});
assert.equal(articleCover.naturalWidth,1000,'wide full-article cover loaded');
assert.equal(articleCover.objectFit,'contain','full article image does not crop embedded text');
assert.ok(Math.abs(articleCover.aspect-1000/420)<0.07,'full article uses text-friendly banner aspect');
await page.locator('.blog-cover-frame').screenshot({path:path.join(output,'article-banner-uncropped-mobile.png')});

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
console.log('Browser regression checks passed on desktop, mobile, single editorial theme, Aruvix, article reader and resume downloads.');
})().catch(err=>{console.error(err);process.exit(1);});
