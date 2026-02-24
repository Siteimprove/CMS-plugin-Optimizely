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

                        this.waitForPreviewIFrame(function (iFrameContentWindow) {
                            const dom = iFrameContentWindow?.document;
                            if (!dom) return;
                            var si = window._si || [];                                            

                            si.push([
                                'onHighlight',
                                function (highlightInfo) {
                                    si.push(['applyDefaultHighlighting', highlightInfo, dom]);
                                },
                            ]);

                            si.push(['registerPrepublishCallback', () => dom]);
                        });                                            
                    }.bind(this));                    
            },
            /**
             * Waits for the preview iframe to be available, then executes the callback with the iframe's document as parameter.
             * Will try for a certain amount of attempts before giving up.
             */
            waitForPreviewIFrame: async function (callback) {
                const maxAttempts = 10;                
                
                for (let i = 0; i < maxAttempts; i++) {
                    const previewIFrame = document.querySelector('iframe[name="sitePreview"]');
                    if (previewIFrame && previewIFrame.contentWindow) {
                        callback(previewIFrame.contentWindow);
                        return;
                    } else if (i < maxAttempts - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000)); // wait 1 second before trying again
                    }      
                }                          
            },
            /**
             * Event for shell updates. Gets current context. Should only be called one to initialize the _si plugin.
             */
            contextCurrent: function (content) {
                if (!request || this.isInitialized)
                    return;

                if (!content.capabilities || !content.capabilities.isPage)
                    return;

                this.isInitialized = true;
                var that = this;

                this.getPageUrl(content.id, content.language)
                    .then(function (response) {
                        that.pushSi(response.isDomain ? "domain" : "input", response.url);
                    },
                        function (error) {
                            that.pushSi('input', '');

                        });
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

                this.getPageUrl(content.id, content.language)
                    .then(function (response) {
                        
                        scope.pushSi("input", response.url);
                        
                    }, function (error) {
                        scope.pushSi('input', '');
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
            pushSi: function (method, url, callback) {
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