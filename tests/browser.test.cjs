const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
let server, crossServer, browser, origin, crossOrigin;
const scripts = path.join(__dirname,'../SiteImprove.Optimizely.Plugin/modules/_protected/SiteImprove.Optimizely.Plugin_files/5.0.0-alpha.11/ClientResources');
const strictCsp="default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'none'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'self'";
function handler(req,res) {
    const url = new URL(req.url,'http://localhost');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    const strict=['/strict','/blocked-preview','/sandboxed-preview'].includes(url.pathname);
    if(strict || url.searchParams.get('csp')==='strict') res.setHeader('Content-Security-Policy',url.pathname==='/blocked-preview'?strictCsp.replace("frame-src 'self'","frame-src 'none'"):strictCsp);
    if(url.pathname==='/bootstrap.js'){res.setHeader('Content-Type','text/javascript');res.end(`        window._si=[];
        window.epi={routes:{getActionPath:x=>'/api/'+x.action}};
        window.define=(_,factory)=>{
            const declare=(_,methods)=>function(){Object.assign(this,methods);methods.constructor.call(this);};
            const topic={subscribe:()=>({remove(){}})};
            const request={get:(url,options)=>{
                const u=new URL(url,location.href);Object.entries(options?.query||{}).forEach(([k,v])=>u.searchParams.set(k,v));
                return fetch(u).then(async r=>{if(!r.ok)throw {response:{status:r.status}};return r.json();});
            }};
            window.Plugin=factory(declare,topic,request,{},(v,fn)=>Promise.resolve(v).then(fn));
        };
        `);return;}
    if(url.pathname==='/start.js'){res.setHeader('Content-Type','text/javascript');res.end(`        window.plugin=new Plugin();plugin.inherited=()=>{};plugin.getCurrentContext=()=>({id:'1_2',language:'en',capabilities:{isPage:true}});plugin.initialize();
`);return;}
    if(url.pathname==='/plugin.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(scripts,'Scripts/siteimprove.js')));return;}
    if(url.pathname==='/styles.css'){res.setHeader('Content-Type','text/css');res.end(fs.readFileSync(path.join(scripts,'Styles/styles.css'))+'\niframe[name=sitePreview]{width:800px;height:400px}');return;}
    if(url.pathname==='/preview') {res.end('<!doctype html><html><head><title>Draft</title></head><body><p id="issue">Hello <strong>world</strong></p></body></html>');return;}
    if(url.pathname.startsWith('/api/')) {
        res.setHeader('Content-Type','application/json');
        const action=url.pathname.slice(5);
        if(action==='IsAuthorized'){res.end('true');return;}
        if(action==='Token'){res.end('"test-token"');return;}
        const [id,version]=url.searchParams.get('contentId').split('_');
        res.end(JSON.stringify({url:origin+'/public/'+id,previewUrl:origin+`/preview?id=${id}&version=${version}&lang=${url.searchParams.get('locale')}`}));return;
    }
    res.end(`<!doctype html><html><head><title>Preview fixture</title><link rel="stylesheet" href="/styles.css"></head><body>
        <iframe name="sitePreview" src="/preview?id=1&version=2&lang=en${strict?'&csp=strict':''}" ${url.pathname==='/sandboxed-preview'?'sandbox="allow-scripts"':''}></iframe>
        <script src="/bootstrap.js"></script><script src="/plugin.js"></script><script src="/start.js"></script></body></html>`);
}
async function listen() {const s=http.createServer(handler);await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));return s;}
before(async()=>{
    server=await listen();crossServer=await listen();
    origin='http://127.0.0.1:'+server.address().port;crossOrigin='http://127.0.0.1:'+crossServer.address().port;
    browser=await chromium.launch({headless:true});
});
after(async()=>{if(browser)await browser.close();for(const s of [server,crossServer])if(s)await new Promise(resolve=>s.close(resolve));});
async function page() {const p=await browser.newPage();await p.goto(origin);await p.waitForFunction(()=>plugin.checkAvailable===true);return p;}

test('capture and element/text highlights work under CSP without inline scripts, inline styles or eval',async()=>{
    const p=await browser.newPage();
    try {
        await p.addInitScript(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>cspViolations.push(e.effectiveDirective));});
        await p.goto(origin+'/strict');
        await p.waitForFunction(()=>plugin.checkAvailable===true);
        const f=p.frames().find(x=>x.name()==='sitePreview');
        const before=await f.locator('body').innerHTML();
        await p.evaluate(async()=>{await plugin.capturePreview();plugin.highlight({highlights:[{selector:'#issue'}]});});
        const marker=f.locator('#siteimprove-highlight-layer > div').first();
        assert.equal(await marker.evaluate(el=>getComputedStyle(el).borderTopWidth),'2px');
        assert.ok((await marker.boundingBox()).width>0);
        await p.evaluate(()=>plugin.highlight({highlights:[{selector:'#issue',offset:{start:6,length:5}}]}));
        assert.ok((await marker.boundingBox()).width>0);
        assert.equal(await f.locator('body').innerHTML(),before);
        assert.deepEqual(await p.evaluate(()=>cspViolations),[]);
        assert.deepEqual(await f.evaluate(()=>cspViolations),[]);
    } finally {await p.close();}
});

test('CSP-blocked and sandboxed previews cannot be captured and explain the security restriction',async()=>{
    for(const route of ['/blocked-preview','/sandboxed-preview']) {
        const p=await browser.newPage();
        try {
            await p.goto(origin+route);
            await p.waitForFunction(()=>plugin.expectedPreviewUrl && plugin.previewStatus!=='loading');
            assert.equal(await p.evaluate(()=>plugin.checkAvailable),false);
            assert.equal(await p.evaluate(()=>plugin.capturePreview().then(()=>false,()=>true)),true);
            assert.match(await p.locator('.siteimprove-preview-status').innerText(),/security policy/);
        } finally {await p.close();}
    }
});

test('real DOM highlighting preserves authored HTML and supports text offsets',async()=>{
    const p=await page();
    try {
        const f=p.frames().find(x=>x.name()==='sitePreview');
        const before=await f.locator('body').innerHTML();
        await p.evaluate(async()=>{await plugin.capturePreview();plugin.highlight({highlights:[{selector:'#issue',offset:{start:4,length:5}}]});});
        assert.ok(await f.locator('#siteimprove-highlight-layer > div').count()>0);
        assert.equal(await f.locator('body').innerHTML(),before);
        await f.evaluate(()=>document.querySelector('#issue').firstChild.textContent='Updated ');
        await p.waitForFunction(()=>plugin.lastCapture===null);
        assert.equal(await f.locator('#siteimprove-highlight-layer').count(),0);
    } finally {await p.close();}
});

test('hidden matches show guidance and visible image matches clear it without empty markers',async()=>{
    const p=await page();
    try {
        const f=p.frames().find(x=>x.name()==='sitePreview');
        await f.evaluate(()=>{
            document.body.innerHTML='<span id="hidden" style="display:none">Hidden text</span><a id="images" href="#"><img style="display:none" width="50" height="40" alt="Hidden"><img width="120" height="80" alt="Visible" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2280%22/%3E"></a>';
        });
        await p.waitForFunction(()=>plugin.checkAvailable===true);
        const before=await f.locator('body').innerHTML();
        await p.evaluate(async()=>{await plugin.capturePreview();});
        for(const offset of [undefined,{start:0,length:6}]) {
            await p.evaluate(offset=>plugin.highlight({highlights:[{selector:'#hidden',offset}]}),offset);
            assert.equal(await f.locator('#siteimprove-highlight-layer').count(),0);
            assert.match(await p.locator('.siteimprove-preview-status').innerText(),/no visible match/);
        }
        const notice=await p.locator('.siteimprove-preview-status').boundingBox();
        assert.ok(notice.x+notice.width<=p.viewportSize().width-600,'Guidance must fit beside the desktop SDK panel.');
        await p.evaluate(()=>plugin.highlight({highlights:[{selector:'#images'}]}));
        assert.equal(await f.locator('#siteimprove-highlight-layer > div').count(),1);
        assert.equal(await f.locator('#siteimprove-highlight-layer > div').evaluate(n=>parseFloat(n.style.width)),120);
        assert.equal(await f.locator('#siteimprove-highlight-layer > div').evaluate(n=>parseFloat(n.style.height)),80);
        assert.equal(await p.locator('.siteimprove-preview-status').innerText(),'');
        assert.equal(await f.locator('body').innerHTML(),before);
    } finally {await p.close();}
});

test('an old loaded frame cannot be checked after selecting another draft',async()=>{
    const p=await page();
    try {
        await p.evaluate(()=>{window.oldCheck=_si.filter(x=>x[0]==='registerPrepublishCallback').at(-1)[1];plugin.contextChange({id:'2_3',language:'en',capabilities:{isPage:true}});});
        await p.waitForFunction(()=>plugin.expectedPreviewUrl?.includes('id=2'));
        assert.equal(await p.evaluate(()=>plugin.checkAvailable),false);
        assert.equal(await p.evaluate(()=>oldCheck().then(()=>false,()=>true)),true);
        await p.evaluate(()=>document.querySelector('iframe').src='/preview?id=2&version=3&lang=en');
        await p.waitForFunction(()=>plugin.checkAvailable===true);
        assert.equal(await p.evaluate(async()=>{const d=await plugin.capturePreview();return new URL(d.URL).searchParams.get('version');}),'3');
    } finally {await p.close();}
});

test('a genuinely cross-origin frame disables draft checks with visible guidance',async()=>{
    const p=await page();
    try {
        await p.evaluate(url=>document.querySelector('iframe').src=url,crossOrigin+'/preview?id=1&version=2&lang=en');
        await p.waitForFunction(()=>plugin.previewStatus==='cross-origin');
        assert.equal(await p.evaluate(()=>_si.filter(x=>x[0]==='registerPrepublishCallback').at(-1)[1]),null);
        assert.match(await p.locator('.siteimprove-preview-status').innerText(),/hosted separately/);
    } finally {await p.close();}
});

test('explicit frontend readiness prevents checks while an asynchronous render is pending',async()=>{
    const p=await page();
    try {
        const f=p.frames().find(x=>x.name()==='sitePreview');
        await f.evaluate(()=>document.body.setAttribute('data-siteimprove-preview-ready','false'));
        await p.waitForFunction(()=>plugin.checkAvailable===false);
        await new Promise(resolve=>setTimeout(resolve,700));
        assert.equal(await p.evaluate(()=>plugin.checkAvailable),false);
        await f.evaluate(()=>document.body.setAttribute('data-siteimprove-preview-ready','true'));
        await p.waitForFunction(()=>plugin.checkAvailable===true);
    } finally {await p.close();}
});

test('switching away from a visible preview removes draft checking',async()=>{
    const p=await page();
    try {
        await p.evaluate(()=>document.querySelector('iframe').style.display='none');
        await p.waitForFunction(()=>plugin.checkAvailable===false);
        assert.match(await p.locator('.siteimprove-preview-status').innerText(),/Open the page preview/);
    } finally {await p.close();}
});

test('Visual Builder uses its visible preview instead of the hidden classic iframe',async()=>{
    const p=await page();
    try {
        await p.evaluate(()=>{
            const classic=document.querySelector('iframe[name="sitePreview"]');
            classic.style.display='none';
            classic.src='about:blank';
            const container=document.createElement('div');
            container.className='content-preview';
            const visual=document.createElement('iframe');
            visual.src='/preview?id=1&version=2&lang=en';
            visual.style.cssText='width:800px;height:400px';
            container.append(visual);
            document.body.append(container);
        });
        await p.waitForFunction(()=>plugin.checkAvailable===true && plugin.previewDocument===document.querySelector('.content-preview iframe').contentDocument,{},{timeout:3000});
        assert.equal(await p.evaluate(async()=>{
            const dom=await plugin.capturePreview();
            return dom===document.querySelector('.content-preview iframe').contentDocument;
        }),true);
        await p.evaluate(()=>document.querySelector('.content-preview').style.display='none');
        await p.waitForFunction(()=>plugin.checkAvailable===false);
    } finally {await p.close();}
});

test('an unrelated visible iframe cannot stand in for the selected preview',async()=>{
    const p=await page();
    try {
        await p.evaluate(()=>{
            document.querySelector('iframe[name="sitePreview"]').style.display='none';
            const container=document.createElement('div');
            container.className='content-preview';
            const visual=document.createElement('iframe');
            visual.src='/preview?id=9&version=2&lang=en';
            visual.style.cssText='width:800px;height:400px';
            container.append(visual);
            document.body.append(container);
        });
        await p.waitForFunction(()=>plugin.checkAvailable===false);
        assert.equal(await p.evaluate(()=>plugin.capturePreview().then(()=>false,()=>true)),true);
    } finally {await p.close();}
});

test('linked-image highlights cover the image and preserve its authored link',async()=>{
    const p=await page();
    try {
        const f=p.frames().find(x=>x.name()==='sitePreview');
        await f.evaluate(()=>document.querySelector('#issue').innerHTML='<a id="image-link" href="#"><img width="120" height="80" alt="Fixture" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2280%22/%3E"></a>');
        await p.waitForFunction(()=>plugin.checkAvailable===true);
        const before=await f.locator('body').innerHTML();
        await p.evaluate(async()=>{await plugin.capturePreview();plugin.highlight({highlights:[{selector:'#image-link'}]});});
        const height=await f.locator('#siteimprove-highlight-layer > div').evaluate(n=>parseFloat(n.style.height));
        assert.equal(height,80);
        assert.equal(await f.locator('body').innerHTML(),before);
    } finally {await p.close();}
});

test('SDK text-child offsets highlight the requested text after a nested element',async()=>{
    const p=await page();
    try {
        const f=p.frames().find(x=>x.name()==='sitePreview');
        await f.evaluate(()=>document.querySelector('#issue').innerHTML='<strong>Prefix </strong>Target phrase');
        await p.waitForFunction(()=>plugin.checkAvailable===true);
        await p.evaluate(async()=>{await plugin.capturePreview();plugin.highlight({highlights:[{selector:'#issue',offset:{child:1,start:0,length:6}}]});});
        const positions=await f.evaluate(()=>{
            const range=document.createRange();
            const target=document.querySelector('#issue').childNodes[1];
            range.setStart(target,0);range.setEnd(target,6);
            return {expected:range.getBoundingClientRect().left,actual:parseFloat(document.querySelector('#siteimprove-highlight-layer > div').style.left)};
        });
        assert.ok(Math.abs(positions.expected-positions.actual)<1);
    } finally {await p.close();}
});

test('selecting the same page retries context after a temporary connection failure',async()=>{
    const p=await browser.newPage();
    try {
        await p.route('**/api/Token',route=>route.fulfill({status:503,body:'{}'}));
        await p.goto(origin);
        await p.waitForFunction(()=>plugin.previewStatus==='unavailable');
        assert.equal(await p.evaluate(()=>plugin.checkAvailable),false);
        assert.equal(await p.getByRole('status').innerText(),'Siteimprove is temporarily unavailable. Try again in a minute.');
        await p.unroute('**/api/Token');
        await p.evaluate(()=>plugin.contextChange({id:'1_2',language:'en',capabilities:{isPage:true}}));
        await p.waitForFunction(()=>plugin.checkAvailable===true);
    } finally {await p.close();}
});

test('language and version changes reject the previous capture and its highlights',async()=>{
    const p=await page();
    try {
        const old=p.frames().find(x=>x.name()==='sitePreview');
        await p.evaluate(async()=>{await plugin.capturePreview();plugin.contextChange({id:'1_3',language:'de',capabilities:{isPage:true}});});
        await p.waitForFunction(()=>plugin.expectedPreviewUrl?.includes('lang=de'));
        assert.equal(await p.evaluate(()=>plugin.capturePreview().then(()=>false,()=>true)),true);
        await p.evaluate(()=>plugin.highlight({highlights:[{selector:'#issue'}]}));
        assert.equal(await old.locator('#siteimprove-highlight-layer').count(),0);
        await p.evaluate(()=>document.querySelector('iframe').src='/preview?id=1&version=3&lang=de');
        await p.waitForFunction(()=>plugin.checkAvailable===true);
        assert.equal(await p.evaluate(async()=>new URL((await plugin.capturePreview()).URL).searchParams.get('lang')),'de');
    } finally {await p.close();}
});

test('viewport changes invalidate highlights and removing the plugin releases its resources',async()=>{
    const p=await page();
    try {
        const f=p.frames().find(x=>x.name()==='sitePreview');
        await p.evaluate(async()=>{await plugin.capturePreview();plugin.highlight({highlights:[{selector:'#issue'}]});});
        assert.equal(await f.locator('#siteimprove-highlight-layer').count(),1);
        await p.evaluate(()=>document.querySelector('iframe').style.width='500px');
        await p.waitForFunction(()=>plugin.lastCapture===null);
        assert.equal(await f.locator('#siteimprove-highlight-layer').count(),0);
        await p.evaluate(()=>plugin.destroy());
        assert.equal(await p.locator('.siteimprove-preview-status').count(),0);
        assert.equal(await p.evaluate(()=>_si.filter(x=>x[0]==='registerPrepublishCallback').at(-1)[1]),null);
        assert.equal(await p.evaluate(()=>_si.filter(x=>x[0]==='onHighlight').at(-1)[1]),null);
    } finally {await p.close();}
});
