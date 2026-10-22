const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = readFileSync(path.join(__dirname, '../SiteImprove.Optimizely.Plugin/modules/_protected/SiteImprove.Optimizely.Plugin_files/5.0.0-alpha.7/ClientResources/Scripts/siteimprove.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function element() {
    return { children: [], style: {}, attributes: {}, setAttribute(k,v) {this.attributes[k]=v;},
        getAttribute(k) {return this.attributes[k] ?? null;},
        appendChild(child) {child.parent=this;this.children.push(child);},
        remove() {if(this.parent) this.parent.children=this.parent.children.filter(x=>x!==this);} };
}
function preview(url='https://cms.example/preview?id=1&version=2&lang=en') {
    return { URL:url, readyState:'complete', body:element(), documentElement:Object.assign(element(),{clientWidth:1000,clientHeight:700}),
        defaultView:{scrollX:0,scrollY:0}, createElement:element };
}
function load(dom=preview()) {
    let module;
    let now = 1000;
    const frame = {contentWindow:{document:dom}};
    const window = { _si:[], location:{href:'https://cms.example/Optimizely'}, setTimeout, setInterval:()=>1, clearInterval(){} };
    window.epi={routes:{getActionPath:x=>x.action}};
    const requests=[];
    const observers=[];
    const request={get:(action,options)=>new Promise((resolve,reject)=>requests.push({action,options,resolve,reject}))};
    const document={body:element(),createElement:element,querySelectorAll:()=>[frame],addEventListener(){},removeEventListener(){}};
    class Observer {constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
    vm.runInNewContext(source,{window,document,URL,Promise,MutationObserver:Observer,Date:{now:()=>now},
        define:(_,factory)=>{module=factory((_,obj)=>obj,{subscribe:()=>({remove(){}})},request,{},(value,fn)=>Promise.resolve(value).then(fn));}});
    module.constructor();
    module.inherited=()=>{};
    return {module,window,document,frame,requests,observers,advance:ms=>{now+=ms;}};
}
async function select(env,id='1',version='2') {
    const start=env.requests.length;
    env.module.contextChange({id:`${id}_${version}`,language:'en',capabilities:{isPage:true}});
    env.requests[start].resolve({url:`https://public.example/${id}`,previewUrl:`https://cms.example/preview?id=${id}&version=${version}&lang=en`});
    env.requests[start+1].resolve('token');
    await tick();
}
async function ready(env) {await select(env);env.advance(500);env.module.updateAvailability();}
const callback=env=>env.window._si.filter(x=>x[0]==='registerPrepublishCallback').at(-1)[1];

test('cross-origin preview removes the check action and explains the limitation',async()=>{
    const env=load();
    Object.defineProperty(env.frame.contentWindow,'document',{get(){const e=new Error('blocked');e.name='SecurityError';throw e;}});
    await ready(env);
    assert.equal(callback(env),null);
    assert.equal(env.module.previewStatus,'cross-origin');
    assert.match(env.module.statusElement.textContent,/hosted separately/);
});

test('missing, blank and loading previews have no check action',async()=>{
    for(const dom of [null,Object.assign(preview(),{URL:'about:blank'}),Object.assign(preview(),{readyState:'loading'})]) {
        const env=load(dom);await ready(env);assert.equal(callback(env),null);
    }
});

test('the exact page, draft and language must match the preview',async()=>{
    for(const url of ['https://cms.example/preview?id=9&version=2&lang=en','https://cms.example/preview?id=1&version=1&lang=en','https://cms.example/preview?id=1&version=2&lang=da']) {
        const env=load(preview(url));await ready(env);assert.equal(callback(env),null);assert.equal(env.module.previewStatus,'mismatch');
    }
});

test('query parameter order and additional view parameters are accepted',async()=>{
    const env=load(preview('https://cms.example/preview?lang=en&version=2&id=1&device=mobile'));
    await ready(env);assert.equal(typeof callback(env),'function');
});

test('a quiet matching preview can be captured',async()=>{
    const env=load();await ready(env);
    assert.equal(await callback(env)(),env.frame.contentWindow.document);
    assert.equal(env.module.lastCapture.revision,env.module.contextRevision);
});

test('navigation disables capture of the old document immediately',async()=>{
    const env=load();await ready(env);const oldCallback=callback(env);
    env.module.contextChange({id:'2_3',language:'en',capabilities:{isPage:true}});
    assert.equal(callback(env),null);
    await assert.rejects(oldCallback(),/not ready/);
    env.requests[2].resolve({url:'https://public.example/2',previewUrl:'https://cms.example/preview?id=2&version=3&lang=en'});
    env.requests[3].resolve('token');await tick();env.advance(500);env.module.updateAvailability();
    assert.equal(callback(env),null);
    env.frame.contentWindow.document=preview('https://cms.example/preview?id=2&version=3&lang=en');
    env.module.updateAvailability();env.advance(500);env.module.updateAvailability();
    assert.equal(await callback(env)(),env.frame.contentWindow.document);
});

test('a navigation queued during capture rejects the old check',async()=>{
    const env=load();await ready(env);const check=callback(env)();
    env.module.contextChange({id:'2_3',language:'en',capabilities:{isPage:true}});
    await assert.rejects(check,/draft changed/);
});

test('late page and token responses cannot replace the current context',async()=>{
    const env=load();env.module.contextChange({id:'1_2',language:'en'});
    env.module.contextChange({id:'2_3',language:'en'});
    env.requests[2].resolve({url:'https://public.example/2',previewUrl:'https://cms.example/preview?id=2&version=3&lang=en'});
    env.requests[3].resolve('token');await tick();
    env.requests[0].resolve({url:'https://public.example/1'});env.requests[1].resolve('old-token');await tick();
    assert.equal(env.module.publicUrl,'https://public.example/2');
    assert.deepEqual(env.window._si.filter(x=>x[0]==='input').map(x=>x[1]),['https://public.example/2']);
});

test('a block selection clears context and does not fetch a standalone page',async()=>{
    const env=load();await ready(env);env.module.contextChange({id:'block',language:'en',capabilities:{isPage:false}});
    assert.equal(env.requests.length,2);assert.equal(callback(env),null);assert.equal(env.module.previewStatus,'no-page');
});

test('render mutations invalidate old highlights and require another quiet period',async()=>{
    const env=load();await ready(env);await callback(env)();
    env.observers[0].fn();assert.equal(env.module.lastCapture,null);assert.equal(callback(env),null);
    env.module.highlight({highlights:[]});assert.equal(env.module.previewStatus,'stale');
    env.advance(500);env.module.updateAvailability();assert.equal(typeof callback(env),'function');
});

test('asynchronous rendering can explicitly hold checks until ready',async()=>{
    const env=load();env.frame.contentWindow.document.body.setAttribute('data-siteimprove-preview-ready','false');
    await ready(env);assert.equal(callback(env),null);
    env.frame.contentWindow.document.body.setAttribute('data-siteimprove-preview-ready','true');env.observers[0].fn();
    env.advance(500);env.module.updateAvailability();assert.equal(typeof callback(env),'function');
});

test('font loading also prevents premature capture',async()=>{
    const env=load();env.frame.contentWindow.document.fonts={status:'loading'};
    await ready(env);assert.equal(callback(env),null);
    env.frame.contentWindow.document.fonts.status='loaded';env.module.updateAvailability();assert.equal(typeof callback(env),'function');
});

test('viewport changes invalidate highlighting',async()=>{
    const env=load();await ready(env);await callback(env)();
    env.frame.contentWindow.document.documentElement.clientWidth=400;env.module.updateAvailability();
    assert.equal(env.module.lastCapture,null);
});

test('element highlighting adds a decoration without wrapping authored nodes',async()=>{
    const env=load();await ready(env);await callback(env)();
    let scrolled=false;
    const issue={getBoundingClientRect:()=>({left:5,top:10,width:200,height:20}),scrollIntoView(){scrolled=true;}};
    const dom=env.frame.contentWindow.document;dom.querySelector=()=>issue;
    const originalBody=[...dom.body.children];
    env.module.highlight({highlights:[{selector:'#issue'}]});
    assert.equal(env.module.highlightLayer.children.length,1);assert.equal(scrolled,true);
    assert.deepEqual(dom.body.children,originalBody);
    assert.equal(env.module.highlightLayer.children[0].style.left,'5px');
});

test('text offsets can span multiple text nodes without rewriting them',()=>{
    const env=load();const nodes=[{textContent:'Hello '},{textContent:'world'}];let i=0;const bounds={};
    const dom={createTreeWalker:()=>({nextNode:()=>nodes[i++]||null}),createRange:()=>({setStart:(n,o)=>bounds.start=[n,o],setEnd:(n,o)=>bounds.end=[n,o]})};
    assert.ok(env.module.textRange(dom,{}, {start:4,length:5}));
    assert.deepEqual(bounds.start,[nodes[0],4]);assert.deepEqual(bounds.end,[nodes[1],3]);
    assert.equal(env.module.textRange(dom,{}, {start:-1,length:1}),null);
});

test('SDK text offsets select the specified direct text child',()=>{
    const env=load();
    const first={nodeType:3,textContent:'A prefix '};
    const nested={nodeType:1,textContent:'nested text'};
    const target={nodeType:3,textContent:'target phrase'};
    const bounds={};
    const dom={createRange:()=>({setStart:(n,o)=>bounds.start=[n,o],setEnd:(n,o)=>bounds.end=[n,o]})};
    const parent={childNodes:[first,nested,target]};
    assert.ok(env.module.textRange(dom,parent,{child:2,start:0,length:6}));
    assert.deepEqual(bounds.start,[target,0]);
    assert.deepEqual(bounds.end,[target,6]);
    assert.equal(env.module.textRange(dom,parent,{child:1,start:0,length:6}),null);
    assert.equal(env.module.textRange(dom,parent,{child:9,start:0,length:6}),null);
});

test('module setup checks authorization before reading the content context',async()=>{
    const env=load();let requested=false;env.module.getCurrentContext=()=>{requested=true;return null;};
    env.module.initialize();assert.equal(requested,false);assert.equal(env.requests[0].action,'IsAuthorized');
    env.requests[0].resolve(true);await tick();assert.equal(requested,true);
    env.module.destroy();assert.equal(env.module.disposed,true);assert.equal(callback(env),null);
});

test('a hidden preview has no draft-check action',async()=>{
    const env=load();env.frame.getClientRects=()=>[];
    await ready(env);assert.equal(callback(env),null);assert.equal(env.module.previewStatus,'missing');
});
