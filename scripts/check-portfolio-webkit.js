'use strict';
// WebKit (Safari engine) smoke test at an iPhone-sized viewport.
// Icon paths are SVG, never platform-dependent Unicode emoji arrows.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {webkit,devices}=require('playwright');
(async()=>{
 const browser=await webkit.launch({headless:true});
 try{
  const context=await browser.newContext({...devices['iPhone 13'],viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const route of ['/','/aruvix']){
   await page.goto('http://127.0.0.1:3333'+route,{waitUntil:'domcontentloaded'});
   await page.locator('link[href="/ui-arrows.css?v=1"]').waitFor();
   assert.equal(await page.locator('.site-header .studio-resume-link svg.ui-arrow-svg').count(),1,'header download arrow is SVG');
   if(route==='/'){
    const contact=page.locator('#contact');
    await contact.scrollIntoViewIfNeeded();
    const mail=contact.locator('a.contact-mail');
    assert.equal(await mail.locator('svg.ui-arrow-svg').count(),1,'mobile email arrow is SVG');
    const metrics=await mail.locator('svg.ui-arrow-svg').evaluate(el=>({
      width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,
      stroke:getComputedStyle(el).stroke, color:getComputedStyle(el).color
    }));
    assert.ok(metrics.width>=14 && metrics.height>=14,'email icon visibly rendered: '+JSON.stringify(metrics));
    assert.notEqual(metrics.stroke,'none','arrow has a visible SVG stroke');
   }else{
    assert.equal(await page.locator('.aru-hero .aru-button svg.ui-arrow-svg').count(),1,'case study launch icon is SVG');
   }
   const out=path.join(__dirname,'..','browser-artifacts',route==='/'?'webkit-iphone-contact.png':'webkit-iphone-aruvix.png');
   fs.mkdirSync(path.dirname(out),{recursive:true});
   if(route==='/')await page.locator('#contact').screenshot({path:out});
   else await page.locator('.aru-hero').screenshot({path:out});
  }
  assert.deepEqual(errors,[],'WebKit has no page errors');
  await context.close();
  console.log('PASS iPhone-sized WebKit/Safari arrow icon checks');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
