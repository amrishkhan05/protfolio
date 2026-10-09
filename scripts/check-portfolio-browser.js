'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:3333';
const output = path.join(__dirname, '..', 'browser-artifacts');
fs.mkdirSync(output, { recursive: true });
const sample = [
  {id:1,title:'Sometimes the fastest system is the one willing to stop',description:'How manufacturing inspired resilient systems.',publishedAt:'2026-09-20T10:00:00Z',tags:['architecture','engineering'],url:'/blog/fixture',devSlug:'fixture',readingTimeMinutes:7,coverImage:null},
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
await page.screenshot({path:path.join(output,'mobile-dark.png'),fullPage:true});
const pageSource=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
// Mirror app.js renderBlogPage(), which injects the legacy article reader CSS
// exclusively for server-rendered /blog/:slug pages.
const articleHtml=pageSource
 .replace('<link rel="stylesheet" href="/site-redesign.css?v=5" />', ['<link rel="stylesheet" href="/styles.css?v=4" />', '<link rel="stylesheet" href="/site-redesign.css?v=5" />'].join("\n"))
 .replace('<div class="blog-detail-content" id="blog-detail-content" hidden>','<div class="blog-detail-content" id="blog-detail-content">')
 .replace('<div class="blog-detail-status" id="blog-detail-status">Loading...</div>','<div class="blog-detail-status" id="blog-detail-status" hidden></div>')
 .replace('<h1 id="blog-detail-title"></h1>','<h1 id="blog-detail-title">Sometimes the fastest system is the one willing to stop</h1>')
 .replace('<div class="blog-body" id="blog-detail-body"></div>','<div class="blog-body" id="blog-detail-body"><p>Engineering is about thoughtful decisions in complex systems.</p></div>');
await page.route('**/blog/fixture',route=>route.fulfill({status:200,contentType:'text/html',body:articleHtml}));
await page.route('**/api/blogs/fixture*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...sample[0],bodyHtml:'<p>Engineering is about thoughtful decisions in complex systems.</p>',bodyMarkdown:''})}));
await page.goto(base+'/blog/fixture',{waitUntil:'domcontentloaded'});
await page.locator('#blog-detail-title').waitFor({state:'visible',timeout:20000});
assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark','theme persists to article');
assert.ok(await page.locator('#blog-detail-body').isVisible(),'article body is visible');
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
assert.deepEqual(errors,[],'no browser JavaScript errors');
await browser.close();
console.log('Browser regression checks passed on desktop, mobile, theme persistence, Aruvix, article reader and resume downloads.');
})().catch(err=>{console.error(err);process.exit(1);});
