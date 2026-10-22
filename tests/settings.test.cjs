const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '../SiteImprove.Optimizely.Plugin');
const view = fs.readFileSync(path.join(root, 'SiteImprove.Optimizely.Plugin.Views/Views/SiteimproveAdmin/Index.cshtml'), 'utf8');
// Exercise the actual row template and script with a representative settings response.
const template = view.match(/<template id="mapping-template">([\s\S]*?)<\/template>/)[1];
const script = fs.readFileSync(path.join(root, 'modules/_protected/SiteImprove.Optimizely.Plugin_files/5.0.0-alpha.9/ClientResources/Scripts/settings.js'));
let server, browser, origin;
before(async () => {
    server = http.createServer(async (req, res) => {
        if (req.url === '/settings.js') {res.setHeader('Content-Type', 'text/javascript');res.end(script);return;}
        if (req.method === 'POST') {
            let body = '';for await (const chunk of req) body += chunk;
            res.setHeader('Content-Type', 'application/json');res.end(JSON.stringify(Object.fromEntries(new URLSearchParams(body))));return;
        }
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!doctype html><html><body><p class="settings-saved" role="status">Settings saved.</p>
        <form data-siteimprove-mappings action="/save" method="post"><p id="mapping-help">Save your changes.</p>
        <table><tbody id="mapping-rows">${template}</tbody></table><template id="mapping-template">${template}</template>
        <button type="button" id="add-mapping">Add mapping</button><button type="submit">Save settings</button>
        <p id="mapping-status" role="status" aria-live="polite"></p></form><script src="/settings.js" defer></script></body></html>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({headless:true});
});
after(async () => {if (browser) await browser.close();if (server) await new Promise(resolve => server.close(resolve));});
async function fill(page, row, source, target) {
    await page.getByRole('textbox', {name:`CMS origin, row ${row}`,exact:true}).fill(source);
    await page.getByRole('textbox', {name:`Public origin, row ${row}`,exact:true}).fill(target);
}

test('multiple mapping rows can be added without submitting or losing unsaved values', async () => {
    const p = await browser.newPage();
    try {
        await p.goto(origin);
        await fill(p, 1, 'https://cms-one.example', 'https://public-one.example');
        await p.getByRole('button', {name:'Add mapping',exact:true}).click();
        assert.equal(await p.getByRole('textbox', {name:'CMS origin, row 2',exact:true}).evaluate(el=>el===document.activeElement), true);
        await fill(p, 2, 'https://cms-two.example', 'https://public-two.example');
        await p.getByRole('button', {name:'Add mapping',exact:true}).click();
        assert.equal(new URL(p.url()).pathname, '/');
        assert.equal(await p.locator('#mapping-rows tr').count(), 3);
        assert.equal(await p.getByRole('textbox', {name:'CMS origin, row 1',exact:true}).inputValue(), 'https://cms-one.example');
        assert.equal(await p.locator('.settings-saved').isVisible(), false);
    } finally {await p.close();}
});

test('removing a middle row keeps submitted values and field/error associations contiguous', async () => {
    const p = await browser.newPage();
    try {
        await p.goto(origin);
        for (let row=1;row<=3;row++) {
            if (row>1) await p.getByRole('button', {name:'Add mapping',exact:true}).click();
            await fill(p,row,`https://cms-${row}.example`,`https://public-${row}.example`);
        }
        await p.getByRole('button', {name:'Remove mapping row 2',exact:true}).click();
        const input=p.getByRole('textbox',{name:'CMS origin, row 2',exact:true});
        assert.equal(await input.inputValue(),'https://cms-3.example');
        assert.equal(await input.getAttribute('name'),'urlMap[1].Key');
        assert.equal(await input.getAttribute('aria-describedby'),'mapping-help mapping-source-error-1');
        assert.equal(await p.locator('#mapping-source-error-1').count(),1);
        assert.equal(await p.locator('[id]').evaluateAll(elements=>new Set(elements.map(x=>x.id)).size===elements.length),true);
        const submitted=p.waitForResponse(origin+'/save');
        await p.getByRole('button',{name:'Save settings',exact:true}).click();
        assert.deepEqual(await (await submitted).json(),{
            'urlMap[0].Key':'https://cms-1.example','urlMap[0].Value':'https://public-1.example',
            'urlMap[1].Key':'https://cms-3.example','urlMap[1].Value':'https://public-3.example'
        });
    } finally {await p.close();}
});

test('all mappings can be removed and a fresh row added with keyboard focus', async () => {
    const p = await browser.newPage();
    try {
        await p.goto(origin);
        await p.getByRole('button',{name:'Remove mapping row 1',exact:true}).click();
        assert.equal(await p.locator('#mapping-rows tr').count(),0);
        assert.equal(await p.getByRole('button',{name:'Add mapping',exact:true}).evaluate(el=>el===document.activeElement),true);
        await p.getByRole('button',{name:'Add mapping',exact:true}).press('Enter');
        assert.equal(await p.getByRole('textbox',{name:'CMS origin, row 1',exact:true}).getAttribute('name'),'urlMap[0].Key');
    } finally {await p.close();}
});
