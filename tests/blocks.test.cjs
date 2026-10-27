const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
let server,crossServer,browser,origin,crossOrigin;
const source=fs.readFileSync(path.join(__dirname,'../SiteImprove.Optimizely.Plugin/modules/_protected/SiteImprove.Optimizely.Plugin_files/5.0.0-beta.1/ClientResources/Scripts/siteimprove.js'));
const policy="default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'none'; frame-src 'self'; connect-src 'self'; font-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'";
function handler(req,res){
    const u=new URL(req.url,origin||'http://localhost');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    if(u.pathname==='/plugin.js'){res.setHeader('Content-Type','text/javascript');res.end(source);return;}
    if(u.pathname==='/bootstrap.js'){
        res.setHeader('Content-Type','text/javascript');
        res.end(`window._si=[];window.calls=[];window.epi={routes:{getActionPath:x=>'/api/'+x.action}};
        window.define=(_,factory)=>{window.Plugin=factory((_,methods)=>function(){Object.assign(this,methods);methods.constructor.call(this);},{subscribe:()=>({remove(){}})},{get:(action,options)=>{calls.push({action,query:options?.query});const u=new URL(action,location.href);Object.entries(options?.query||{}).forEach(([k,v])=>u.searchParams.set(k,v));return fetch(u).then(r=>{if(!r.ok)throw Error('Request failed');return r.json();});}},{},(v,fn)=>Promise.resolve(v).then(fn));};
        document.addEventListener('securitypolicyviolation',e=>(window.violations||=[]).push(e.effectiveDirective));`);return;
    }
    if(u.pathname==='/start.js'){
        res.setHeader('Content-Type','text/javascript');
        res.end(`window.block=(id='99_4',language='en')=>({id,language,capabilities:{isBlock:true,isPage:false},editablePreviewUrl:'/preview?id='+id+'&lang='+language+'&epieditmode=true'});
        window.plugin=new Plugin();plugin.inherited=()=>{};plugin.getCurrentContext=()=>block();plugin.initialize();`);return;
    }
    if(u.pathname==='/api/IsAuthorized'){res.end('true');return;}
    if(u.pathname==='/api/Token'){res.end('"fixture-token"');return;}
    if(u.pathname==='/api/PageUrl'){
        res.end(JSON.stringify({url:origin+'/published/'+u.searchParams.get('contentId'),previewUrl:origin+'/preview?id='+u.searchParams.get('contentId')+'&lang='+u.searchParams.get('locale')+'&epieditmode=true'}));return;
    }
    if(u.pathname==='/redirect'){res.writeHead(302,{Location:crossOrigin+'/preview?id=99_4&lang=en'});res.end();return;}
    if(u.pathname==='/wrong'){res.writeHead(302,{Location:'/preview?id=99_3&lang=en&epieditmode=true'});res.end();return;}
    if(u.pathname==='/preview'){
        res.end(`<!doctype html><html><head><title>Shared block draft</title><link rel="stylesheet" href="/style.css"></head><body ${u.searchParams.has('pending')?'data-siteimprove-preview-ready="false"':''}><p id="block-text">BLOCK ${u.searchParams.get('id')} ${u.searchParams.get('lang')}</p></body></html>`);return;
    }
    if(u.pathname==='/style.css'){res.setHeader('Content-Type','text/css');res.end('body{font:18px system-ui}iframe{width:800px;height:400px}');return;}
    if(u.pathname==='/strict')res.setHeader('Content-Security-Policy',policy);
    res.end(`<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body>${u.pathname==='/visible'?'<iframe name="sitePreview" src="/preview?id=99_4&lang=en&epieditmode=true"></iframe>':''}<script src="/bootstrap.js"></script><script src="/plugin.js"></script><script src="/start.js"></script></body></html>`);
}
async function listen(){const s=http.createServer(handler);await new Promise(r=>s.listen(0,'127.0.0.1',r));return s;}
before(async()=>{server=await listen();origin='http://127.0.0.1:'+server.address().port;crossServer=await listen();crossOrigin='http://127.0.0.1:'+crossServer.address().port;browser=await chromium.launch({headless:true});});
after(async()=>{if(browser)await browser.close();for(const s of [server,crossServer])if(s)await new Promise(r=>s.close(r));});
async function page(route='/'){const p=await browser.newPage();await p.goto(origin+route);await p.waitForFunction(()=>plugin.checkAvailable===true);return p;}
async function capture(p){return p.evaluate(async()=>{const cb=_si.filter(x=>x[0]==='registerPrepublishCallback').at(-1)[1];const [dom,cleanup,type]=await cb();const result={text:dom.body.innerText,type,url:dom.URL};cleanup();return result;});}

test('direct block editing initializes a prepublish-only SDK session without page URL requests',async()=>{
    const p=await page();try{
        assert.equal(await p.evaluate(()=>_si[0][0]),'setSession');
        assert.equal(await p.evaluate(()=>calls.some(x=>x.action==='/api/PageUrl')),false);
        assert.equal(await p.evaluate(()=>_si.some(x=>x[0]==='input')),false);
        assert.equal(await p.evaluate(()=>_si.filter(x=>x[0]==='clear').at(-1)[2]),'fixture-token');
        assert.equal(await p.locator('.siteimprove-preview-status').count(),0);
    }finally{await p.close();}
});

test('All Properties captures the selected block as a fragment and cleans its temporary preview',async()=>{
    const p=await page();try{
        assert.deepEqual(await capture(p),{text:'BLOCK 99_4 en',type:'fragment',url:origin+'/preview?id=99_4&lang=en&epieditmode=true'});
        assert.equal(await p.locator('iframe').count(),0);
        assert.equal(await p.evaluate(()=>plugin.lastCapture),null);
        await p.evaluate(()=>plugin.highlight({highlights:[{selector:'#block-text'}]}));
        assert.equal(await p.locator('#siteimprove-highlight-layer').count(),0);
    }finally{await p.close();}
});

test('a matching visible block supports capture and highlights without a temporary preview',async()=>{
    const p=await page('/visible');try{
        await p.waitForFunction(()=>plugin.previewState().state==='ready');
        const result=await p.evaluate(async()=>{const [dom,cleanup,type]=await _si.filter(x=>x[0]==='registerPrepublishCallback').at(-1)[1]();plugin.highlight({highlights:[{selector:'#block-text'}]});cleanup();return {type,visible:dom===document.querySelector('iframe[name="sitePreview"]').contentDocument};});
        assert.deepEqual(result,{type:'fragment',visible:true});
        assert.equal(await p.locator('iframe[title="Block prepublish preview"]').count(),0);
        assert.equal(await p.frameLocator('iframe[name="sitePreview"]').locator('#siteimprove-highlight-layer > div').count(),1);
    }finally{await p.close();}
});

test('page to block to page restores page reports and never captures the previous page',async()=>{
    const p=await page();try{
        await p.evaluate(()=>plugin.contextChange({id:'1_2',language:'en',capabilities:{isPage:true}}));
        await p.waitForFunction(()=>plugin.publicUrl?.endsWith('/1_2'));
        await p.evaluate(()=>{const frame=document.createElement('iframe');frame.name='sitePreview';frame.src='/preview?id=1_2&lang=en&epieditmode=true';document.body.appendChild(frame);});
        await p.waitForFunction(()=>plugin.checkAvailable===true);
        await p.evaluate(()=>plugin.contextChange(block()));
        await p.waitForFunction(()=>plugin.checkAvailable===true);
        assert.equal((await capture(p)).text,'BLOCK 99_4 en');
        await p.evaluate(()=>plugin.contextChange({id:'1_2',language:'en',capabilities:{isPage:true}}));
        await p.waitForFunction(()=>plugin.publicUrl?.endsWith('/1_2'));
        assert.equal(await p.evaluate(()=>_si.filter(x=>x[0]==='input').at(-1)[1]),origin+'/published/1_2');
    }finally{await p.close();}
});

test('a pending block capture is cancelled on draft or language change',async()=>{
    const p=await page();try{
        await p.route('**/preview?**',()=>{});
        await p.evaluate(()=>{window.check=plugin.captureBlockPreview().then(()=> 'unexpected capture',e=>e.message);});
        await p.locator('iframe[title="Block prepublish preview"]').waitFor();
        await p.evaluate(()=>plugin.contextChange(block('99_5','da')));
        assert.match(await p.evaluate(()=>check),/block changed/);
        assert.equal(await p.locator('iframe[title="Block prepublish preview"]').count(),0);
        await p.unroute('**/preview?**');
        await p.waitForFunction(()=>plugin.checkAvailable===true);
        assert.equal((await capture(p)).text,'BLOCK 99_5 da');
    }finally{await p.close();}
});

test('a late page response cannot overwrite a selected block',async()=>{
    const p=await page();try{
        let respond;const received=new Promise(r=>respond=r);
        let pending;
        await p.route('**/api/PageUrl?**',route=>{pending=route;respond();});
        await p.evaluate(()=>plugin.contextChange({id:'1_2',language:'en',capabilities:{isPage:true}}));
        await received;
        await p.evaluate(()=>plugin.contextChange(block()));
        await p.waitForFunction(()=>plugin.checkAvailable===true);
        await pending.fulfill({json:{url:origin+'/wrong-page',previewUrl:origin+'/preview?id=1_2&lang=en'}});
        await p.waitForFunction(()=>calls.filter(x=>x.action==='/api/Token').length===3);
        assert.equal((await capture(p)).type,'fragment');
        assert.equal(await p.evaluate(()=>plugin.publicUrl),null);
        assert.equal(await p.evaluate(()=>_si.some(x=>x[0]==='input'&&x[1].endsWith('/wrong-page'))),false);
    }finally{await p.close();}
});

test('missing or cross-origin editable previews and media never enable block checking',async()=>{
    const p=await page();try{
        for(const content of [
            {id:'99_4',language:'en',capabilities:{isBlock:true},previewUrl:'/preview?id=99_4&lang=en'},
            {id:'99_4',language:'en',capabilities:{isBlock:true},editablePreviewUrl:crossOrigin+'/preview'},
            {id:'99_4',language:'en',capabilities:{isBlock:true},editablePreviewUrl:'javascript:alert(1)'},
            {id:'100',language:'en',capabilities:{isPage:false,isBlock:false}}
        ]){
            await p.evaluate(c=>plugin.contextChange(c),content);
            assert.equal(await p.evaluate(()=>plugin.checkAvailable),false);
            assert.equal(await p.evaluate(()=>_si.filter(x=>x[0]==='registerPrepublishCallback').at(-1)[1]),null);
        }
        assert.equal(await p.locator('iframe').count(),0);
        assert.equal(await p.evaluate(()=>calls.some(x=>x.action==='/api/PageUrl')),false);
    }finally{await p.close();}
});

test('redirected block previews cannot capture another draft or origin',async()=>{
    const p=await page();try{
        for(const route of ['/redirect','/wrong']){
            await p.evaluate(url=>plugin.contextChange({...block(),editablePreviewUrl:url}),route);
            await p.waitForFunction(()=>plugin.checkAvailable===true);
            const error=await p.evaluate(()=>plugin.captureBlockPreview().then(()=>null,e=>e.message));
            assert.match(error,/could not be read|does not match/);
            assert.equal(await p.locator('iframe').count(),0);
        }
    }finally{await p.close();}
});

test('asynchronous block rendering times out and removes the temporary preview',async()=>{
    const p=await page();try{
        await p.clock.install();
        await p.evaluate(()=>plugin.contextChange({...block(),editablePreviewUrl:'/preview?id=99_4&lang=en&pending=1'}));
        await p.waitForFunction(()=>plugin.checkAvailable===true);
        await p.evaluate(()=>{window.check=plugin.captureBlockPreview().then(()=>null,e=>e.message);});
        await p.frameLocator('iframe[title="Block prepublish preview"]').getByText('BLOCK 99_4 en',{exact:true}).waitFor();
        await p.clock.fastForward(11000);
        assert.match(await p.evaluate(()=>check),/did not finish rendering/);
        assert.equal(await p.locator('iframe').count(),0);
    }finally{await p.close();}
});

test('block capture works with restrictive CSP and SDK cleanup is idempotent',async()=>{
    const p=await page('/strict');try{
        await p.evaluate(async()=>{const [dom,cleanup,type]=await plugin.captureBlockPreview();window.result={type,text:dom.body.innerText};cleanup();cleanup();});
        assert.deepEqual(await p.evaluate(()=>result),{type:'fragment',text:'BLOCK 99_4 en'});
        assert.deepEqual(await p.evaluate(()=>window.violations||[]),[]);
        assert.equal(await p.locator('iframe').count(),0);
    }finally{await p.close();}
});

test('temporary block previews wait for asynchronous rendering and use CMS edit mode',async()=>{
    const p=await page();try{
        await p.clock.install();
        await p.evaluate(()=>plugin.contextChange({...block(),editablePreviewUrl:'/preview?id=99_4&lang=en&pending=1'}));
        await p.waitForFunction(()=>plugin.checkAvailable===true);
        await p.evaluate(()=>{window.finished=false;window.check=plugin.captureBlockPreview().then(result=>{window.finished=true;return result;});});
        const frame=p.frameLocator('iframe[title="Block prepublish preview"]');
        await frame.getByText('BLOCK 99_4 en',{exact:true}).waitFor();
        await p.clock.fastForward(700);
        assert.equal(await p.evaluate(()=>finished),false);
        await frame.locator('body').evaluate(el=>{el.querySelector('p').textContent='Settled block draft';el.setAttribute('data-siteimprove-preview-ready','true');});
        await p.clock.fastForward(700);
        assert.deepEqual(await p.evaluate(async()=>{const [dom,cleanup,type]=await check;const value={type,text:dom.body.innerText,mode:new URL(dom.URL).searchParams.get('epieditmode')};cleanup();return value;}),{type:'fragment',text:'Settled block draft',mode:'true'});
        assert.equal(await p.locator('iframe').count(),0);
    }finally{await p.close();}
});

test('navigation cleans a captured temporary block even before the SDK calls cleanup',async()=>{
    const p=await page();try{
        await p.evaluate(async()=>{window.captured=await plugin.captureBlockPreview();});
        assert.equal(await p.locator('iframe[title="Block prepublish preview"]').count(),1);
        await p.evaluate(()=>plugin.contextChange({id:'media',language:'en',capabilities:{isPage:false,isBlock:false}}));
        assert.equal(await p.locator('iframe').count(),0);
        await p.evaluate(()=>captured[1]());
        assert.equal(await p.locator('iframe').count(),0);
    }finally{await p.close();}
});

test('destroy cancels an outstanding block capture and releases its preview',async()=>{
    const p=await page();try{
        await p.route('**/preview?**',()=>{});
        await p.evaluate(()=>{window.check=plugin.captureBlockPreview().then(()=>null,e=>e.message);plugin.destroy();});
        assert.match(await p.evaluate(()=>check),/block changed/);
        assert.equal(await p.locator('iframe').count(),0);
    }finally{await p.close();}
});
