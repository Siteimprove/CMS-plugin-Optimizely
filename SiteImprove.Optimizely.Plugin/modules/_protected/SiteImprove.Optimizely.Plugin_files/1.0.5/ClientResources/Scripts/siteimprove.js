define([
    "dojo",
    "dojo/_base/declare",
    "epi/_Module",
    "epi/dependency",
    "dojo/topic",
    "dojo/request",
    "epi/shell/_ContextMixin",
    "dojo/when",
], function (dojo, declare, _Module, dependency, topic, request, _ContextMixin, when) {
    return declare([_ContextMixin], {
        isPublishing: false,
        isInitialized: false,
        contextRevision: 0,
        activeContext: null,
        contextKey: null,
        prepublishKind: null,
        pendingBlockPreview: null,
        stalePreviewDocument: null,

        initialize: function () {
            this.inherited(arguments);
            request.get(window.epi.routes.getActionPath({ moduleArea: "SiteImprove.Optimizely.Plugin", controller: "Siteimprove", action: "IsAuthorized" }))
                .then(function () {
                    topic.subscribe('/epi/shell/context/current', this.contextCurrent.bind(this));
                    topic.subscribe('/epi/shell/context/changed', this.contextChange.bind(this));
                    topic.subscribe('epi/shell/context/request', this.contextChange.bind(this));
                    topic.subscribe('/epi/cms/content/statuschange/', this.statusChange.bind(this));
                    var scope = this;
                    window._si = window._si || [];
                    window._si.push(['onHighlight', function (highlightInfo) {
                        // Temporary block previews are removed after capture; highlight only a matching visible preview.
                        var dom = scope.prepublishKind === 'page' ? scope.getPagePreview() : scope.getPreviewDom();
                        if (dom && (scope.prepublishKind === 'page' || (scope.prepublishKind === 'block' && scope.matchesBlockPreview(dom)))) {
                            window._si.push(['applyDefaultHighlighting', highlightInfo, dom]);
                        }
                    }]);
                    when(this.getCurrentContext(), this.contextCurrent.bind(this));
                }.bind(this));
        },

        getPreviewDom: function () {
            var frame = document.querySelector('iframe[name="sitePreview"]');
            try {
                var dom = frame && frame.contentWindow ? frame.contentWindow.document : null;
                return dom && dom.readyState === 'complete' && dom.body && dom.URL !== 'about:blank' ? dom : null;
            } catch (error) {
                if (error.name === 'SecurityError') return null;
                throw error;
            }
        },

        getBlockPreviewUrl: function () {
            var content = this.activeContext;
            if (!content || !content.capabilities || !content.capabilities.isBlock || !window.siteimproveBlockBetaEnabled) return null;
            // These are the same draft URLs used by the CMS's PageDataController in edit mode.
            var value = content.editablePreviewUrlWithToken || content.editablePreviewUrl;
            if (!value) return null;
            try {
                var url = new URL(value, window.location.href);
                if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol)) return null;
                return url;
            } catch (error) {
                return null;
            }
        },

        getPagePreview: function () {
            if (this.prepublishKind !== 'page') return null;
            var dom = this.getPreviewDom();
            if (!dom) return null;
            var content = this.activeContext;
            var urls = content ? [content.editablePreviewUrlWithToken, content.editablePreviewUrl,
                content.previewUrlWithToken, content.previewUrl].filter(Boolean) : [];
            if (urls.length) {
                return urls.some(function (value) {
                    try { return this.matchesPreview(dom, new URL(value, window.location.href)); }
                    catch (error) { return false; }
                }.bind(this)) ? dom : null;
            }
            return dom !== this.stalePreviewDocument ? dom : null;
        },

        matchesBlockPreview: function (dom) {
            var expected = this.getBlockPreviewUrl();
            if (!expected) return false;
            return this.matchesPreview(dom, expected);
        },

        matchesPreview: function (dom, expected) {
            var actual = new URL(dom.URL);
            if (expected.origin !== actual.origin || expected.pathname !== actual.pathname) return false;
            var matches = true;
            expected.searchParams.forEach(function (value, key) {
                if (key !== 'epieditmode' && actual.searchParams.get(key) !== value) matches = false;
            });
            return matches;
        },

        getBlockPreview: function () {
            if (this.prepublishKind !== 'block') return null;
            var url = this.getBlockPreviewUrl();
            if (!url) return null;
            var dom = this.getPreviewDom();
            if (dom && this.matchesBlockPreview(dom)) return [dom, function () {}, 'fragment'];

            // All Properties view may have no block preview. Render the CMS draft on demand.
            if (this.pendingBlockPreview) this.pendingBlockPreview();
            var scope = this;
            var revision = this.contextRevision;
            return new Promise(function (resolve) {
                var frame = document.createElement('iframe');
                frame.title = 'Block prepublish preview';
                frame.setAttribute('aria-hidden', 'true');
                frame.tabIndex = -1;
                frame.style.cssText = 'position:absolute;top:100vh;left:0;width:100%;height:100vh;border:0;pointer-events:none;';
                var timer;
                var settled = false;
                function cleanup() {
                    clearTimeout(timer);
                    frame.removeEventListener('load', loaded);
                    frame.remove();
                    if (scope.pendingBlockPreview === cancel) scope.pendingBlockPreview = null;
                }
                function cancel() {
                    cleanup();
                    if (!settled) { settled = true; resolve(null); }
                }
                function loaded() {
                    try {
                        var document = frame.contentWindow.document;
                        if (revision !== scope.contextRevision || document.readyState !== 'complete' || !document.body || !scope.matchesBlockPreview(document)) {
                            cancel();
                            return;
                        }
                        settled = true;
                        clearTimeout(timer);
                        resolve([document, cleanup, 'fragment']);
                    } catch (error) {
                        cancel();
                    }
                }
                scope.pendingBlockPreview = cancel;
                frame.addEventListener('load', loaded);
                timer = setTimeout(cancel, 10000);
                url.searchParams.set('epieditmode', 'true');
                frame.src = url.href;
                document.body.appendChild(frame);
            });
        },

        setPrepublishKind: function (kind) {
            if (this.prepublishKind === kind) return;
            this.prepublishKind = kind;
            var callback = kind === 'block' ? this.getBlockPreview.bind(this)
                : kind === 'page' ? this.getPagePreview.bind(this) : null;
            window._si = window._si || [];
            window._si.push(['registerPrepublishCallback', callback]);
        },

        contextCurrent: function (content) {
            this.contextChange(content);
        },

        statusChange: function (status) {
            if (status === 'Publish' || status === 3) this.isPublishing = true;
        },

        contextChange: function (content) {
            var capabilities = content && content.capabilities;
            var isPage = content && content.id && capabilities && capabilities.isPage;
            var isBlock = content && content.id && capabilities && capabilities.isBlock && !isPage;
            if (!isPage && !isBlock && !this.isInitialized) return;
            var key = JSON.stringify([content && content.id, content && content.language, !!isPage, !!isBlock,
                content && content.editablePreviewUrlWithToken, content && content.editablePreviewUrl,
                content && content.previewUrlWithToken, content && content.previewUrl]);
            if (key === this.contextKey) return;
            this.contextKey = key;
            var revision = ++this.contextRevision;
            if (this.pendingBlockPreview) this.pendingBlockPreview();
            this.stalePreviewDocument = this.activeContext ? this.getPreviewDom() : null;
            this.activeContext = content;
            this.isInitialized = true;
            var scope = this;
            if (!isPage) {
                this.setPrepublishKind('none');
                // A block has no public page URL. Clear crawled page data before offering its checks.
                this.pushSi('clear', null, null, revision).then(function (cleared) {
                    if (cleared && revision === scope.contextRevision && isBlock && scope.getBlockPreviewUrl()) scope.setPrepublishKind('block');
                });
                return;
            }
            this.setPrepublishKind('page');
            this.getPageUrl(content.id, content.language).then(function (response) {
                if (revision === scope.contextRevision) scope.pushSi('input', response.url, null, revision);
            }, function () {
                if (revision === scope.contextRevision) scope.pushSi('input', '', null, revision);
            });
        },

        getPageUrl: function (contentId, locale) {
            return request.get(window.epi.routes.getActionPath({ moduleArea: "SiteImprove.Optimizely.Plugin", controller: "Siteimprove", action: "pageUrl" }), {
                query: { contentId: contentId, locale: locale },
                handleAs: 'json'
            });
        },

        pushSi: function (method, url, callback, revision) {
            return request.get(window.epi.routes.getActionPath({ moduleArea: "SiteImprove.Optimizely.Plugin", controller: "Siteimprove", action: "token" }), { handleAs: 'json' })
                .then(function (token) {
                    if (revision !== undefined && revision !== this.contextRevision) return;
                    window._si = window._si || [];
                    if (method === 'clear') window._si.push(['clear', callback, token]);
                    else window._si.push([method, url, token, callback]);
                    return true;
                }.bind(this), function () {
                    // Keep scanning unavailable when context initialization failed.
                    if (revision === this.contextRevision) this.setPrepublishKind('none');
                    return false;
                }.bind(this));
        },

        isPublishOrViewContext: function (content, ctx) {
            return !!(content && content.publicUrl && (!content.capabilities || content.capabilities.isPage) && (!ctx.trigger || this.isPublishing));
        }
    });
});
