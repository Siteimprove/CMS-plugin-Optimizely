(function () {
    if (document.getElementById('siteimprove-overlay-script')) return;
    window._si = window._si || [];
    var version = new URL(document.currentScript.src).searchParams.get('version') === 'latest' ? 'latest' : 'v1';
    var script = document.createElement('script');
    script.id = 'siteimprove-overlay-script';
    script.async = true;
    script.src = 'https://cdn.siteimprove.net/cms/overlay-' + version + '.js';
    document.head.appendChild(script);
}());
