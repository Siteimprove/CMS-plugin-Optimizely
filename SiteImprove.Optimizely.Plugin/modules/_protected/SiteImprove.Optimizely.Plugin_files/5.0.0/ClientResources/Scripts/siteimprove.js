define([
    "dojo",
    "dojo/_base/declare",
    "epi/_Module",
    "epi/dependency",
    "dojo/topic",
    "dojo/request",
    "epi/shell/_ContextMixin",
    "dojo/when",
], function (
    dojo,
    declare,
    _Module,
    dependency,
    topic,
    request,
    _ContextMixin,
    when,
) {
        return declare([_ContextMixin], {
            isPublishing: false,
            isInitialized: false,
            contextRevision: 0,
            constructor: function () {
                var scope = this;
                when(scope.getCurrentContext(),
                    function (context) {
                        //if (console.debug) console.debug("we have context: ", context);
                        scope.contextCurrent(context);
                    });
            },
            initialize: function () {
                this.inherited(arguments);

                request.get(window.epi.routes.getActionPath({ moduleArea: "SiteImprove.Optimizely.Plugin", controller: "Siteimprove", action: "IsAuthorized" }))
                    .then(function (response) { //assume success
                        topic.subscribe('/epi/shell/context/current', this.contextCurrent.bind(this));
                        topic.subscribe('/epi/shell/context/changed', this.contextChange.bind(this));
                        topic.subscribe('epi/shell/context/request', this.contextChange.bind(this));
                        topic.subscribe('/epi/cms/content/statuschange/', this.statusChange.bind(this));

                        var si = window._si || [];
                        var getPreviewDom = this.getPreviewDom;

                        si.push([
                            'onHighlight',
                            function (highlightInfo) {
                                var dom = getPreviewDom();
                                if (dom) {
                                    si.push(['applyDefaultHighlighting', highlightInfo, dom]);
                                }
                            },
                        ]);

                        si.push(['registerPrepublishCallback', getPreviewDom]);
                    }.bind(this));
            },
            /**
             * Resolves the preview iframe's document at call time. The iframe's document is
             * replaced on every in-CMS navigation, so it must never be cached.
             */
            getPreviewDom: function () {
                var previewIFrame = document.querySelector('iframe[name="sitePreview"]');
                try {
                    var dom = previewIFrame && previewIFrame.contentWindow ? previewIFrame.contentWindow.document : null;
                    return dom && dom.readyState === "complete" && dom.body && dom.URL !== "about:blank" ? dom : null;
                } catch (error) {
                    // Cross-origin previews need a frontend bridge. Never substitute the CMS document.
                    if (error.name === "SecurityError") return null;
                    throw error;
                }
            },
            /**
             * Event for shell updates. Gets current context. Should only be called one to initialize the _si plugin.
             */
            contextCurrent: function (content) {
                if (this.isInitialized) return;
                this.isInitialized = true;
                this.contextChange(content);
            },

            /**
             * When content changes status, to publish for example. NOTE! No longe in use. Publish events are triggered in backend.
             */
            statusChange: function (status, page) {
                if (status === 'Publish' || status === 3) {
                    this.isPublishing = true;
                }
            },

            /**
             * Similar to contextCurrent. Used for pushing the input event.
             */
            contextChange: function (content, ctx) {
                var scope = this;
                var revision = ++this.contextRevision;
                if (!content || !content.id || (content.capabilities && !content.capabilities.isPage)) {
                    this.pushSi("input", "", null, revision);
                    return;
                }
                this.getPageUrl(content.id, content.language)
                    .then(function (response) {
                        if (revision !== scope.contextRevision) return;
                        scope.pushSi("input", response.url || "", null, revision);
                    }, function () {
                        if (revision === scope.contextRevision) scope.pushSi("input", "", null, revision);
                    });
            },

            /**
             * Will get the page url from backend
             * Returns Promise.
             */
            getPageUrl: function (contentId, locale) {
                return request.get(window.epi.routes.getActionPath({ moduleArea: "SiteImprove.Optimizely.Plugin", controller: "Siteimprove", action: "pageUrl" }),
                    {
                        query: {
                            contentId: contentId,
                            locale: locale
                        },
                        handleAs: 'json'
                    });
            },

            /**
             * Request token from backoffice and sends request to SiteImprove
             */
            pushSi: function (method, url, callback, revision) {
                var si = window._si || [];

                if (method === 'clear') { //special case, does not ask for token
                    si.push([
                        method, function () {
                            //console.log('SiteImprove pass: ' + method + (callback ? " with callback" : ""));
                            if (callback) {
                                callback();
                            }
                        }
                    ]);
                } else {
                    request.get(window.epi.routes.getActionPath({ moduleArea: "SiteImprove.Optimizely.Plugin", controller: "Siteimprove", action: "token" }), { handleAs: 'json' })
                        .then(function (response) {
                            if (revision !== undefined && revision !== this.contextRevision) return;
                            // relay to SiteImprove
                            si.push([
                                method, url, response, function () {
                                    //console.log('SiteImprove pass: ' + method + ' - ' + url + (callback ? " with callback" : ""));
                                    if (callback) {
                                        callback();
                                    }
                                }
                            ]);
                        }.bind(this));
                }
            },

            /**
             * Helper method for event: /epi/shell/context/changed
             */
            isPublishOrViewContext: function (content, ctx) {
                // Not interested if there is no
                if (!content || !content.publicUrl) {
                    return false;
                }

                // If it's not a page ignore it
                if (content.capabilities && !content.capabilities.isPage) {
                    return false;
                }

                if (ctx.trigger && !this.isPublishing) {
                    return false;
                }

                return true;
            }
        });
    });