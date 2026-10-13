(function () {
    if (document.getElementById('siteimprove-overlay-script')) return;
    window._si = window._si || [];
    var version = new URL(document.currentScript.src).searchParams.get('version') === 'latest' ? 'latest' : 'v1';
    window.siteimproveBlockBetaEnabled = version === 'latest';
    if (window.siteimproveBlockBetaEnabled) {
        // SDK V2 requires a session before context or prepublish commands.
        window._si.unshift(['setSession', null, null, 'Optimizely CMS']);
    }
    var script = document.createElement('script');
    script.id = 'siteimprove-overlay-script';
    script.async = true;
    script.src = 'https://cdn.siteimprove.net/cms/overlay-' + version + '.js';
    document.head.appendChild(script);
}());
