define([
    "dojo",
    "dojo/_base/declare",
    "epi/_Module",
    "epi/dependency",
    "dojo/topic",
    "dojo/request",
    "epi/shell/_ContextMixin",
    "dojo/when",
    "siteimprove/SiteimproveCommandProvider",
    "dojo/_base/lang"
], function (
    dojo,
    declare,
    _Module,
    dependency,
    topic,
    request,
    _ContextMixin,
    when,
    SiteimproveCommandProvider,
    lang
) {
        return declare([_ContextMixin], {
            isPublishing: false,
            isInitialized: false,
            _token: null,
            _tokenExpiry: null,
            _tokenRetryCount: 0,
            _maxTokenRetries: 3,
            _tokenRequestInProgress: false,
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

                        var commandRegistry = dependency.resolve("epi.globalcommandregistry");
                        if (commandRegistry) {
                            commandRegistry.registerProvider("epi.cms.globalToolbar", new SiteimproveCommandProvider());
                        }
                        
                    }.bind(this));
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

                if (!this.isPublishOrViewContext(content, ctx)) {
                    scope.pushSi("domain", "", function () { //we have to to reset domain, as SiteImprove plugin caches calls
                        scope.pushSi("clear"); //We don't have the domain or current page - we are probably in trash or root
                    });
                    return;
                }
                //if(ctx.sender.isSaving) return; //We are in middle of an edit


                this.getPageUrl(content.id, content.language)
                    .then(function (response) {
                        if (scope.isPublishing) {
                            scope.pushSi("recheck", response.url);
                            scope.isPublishing = false;
                        }
                        else {
                            scope.pushSi(response.isDomain ? "domain" : "input", response.url);
                        }
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
            /**
             * Request token from backoffice and sends request to SiteImprove
             * @param {string} method - The method to call on the SiteImprove object
             * @param {string} url - The URL to pass to the method
             * @param {Function} callback - Callback function to execute after the method call
             * @param {boolean} isRetry - Internal flag to indicate if this is a retry attempt
             */
            pushSi: function (method, url, callback, isRetry) {
                var si = window._si || [];
                var scope = this;

                // Special case - doesn't require a token
                if (method === 'clear') {
                    si.push([
                        method, 
                        function () {
                            if (callback) {
                                callback();
                            }
                        }
                    ]);
                    return;
                }

                // Check if we have a valid cached token
                if (this._token && this._tokenExpiry && this._tokenExpiry > new Date().getTime()) {
                    this._executeSiCall(si, method, url, callback, this._token);
                    return;
                }

                // Prevent multiple concurrent token requests
                if (this._tokenRequestInProgress) {
                    setTimeout(function() {
                        scope.pushSi(method, url, callback);
                    }, 500);
                    return;
                }

                // Reset retry counter if not a retry
                if (!isRetry) {
                    this._tokenRetryCount = 0;
                }

                // If we've exceeded max retries, give up silently for non-critical operations
                if (this._tokenRetryCount >= this._maxTokenRetries) {
                    console.warn('Max token retries reached. Operation skipped.');
                    if (callback) callback();
                    return;
                }

                // Request a new token
                this._tokenRequestInProgress = true;
                request.get(window.epi.routes.getActionPath({ 
                    moduleArea: "SiteImprove.Optimizely.Plugin", 
                    controller: "Siteimprove", 
                    action: "token" 
                }), { 
                    handleAs: 'json',
                    headers: {
                        'X-Requested-With': null // Prevent auth redirects
                    }
                })
                .then(function (response) {
                    scope._tokenRequestInProgress = false;
                    scope._tokenRetryCount = 0;
                    
                    // Cache the token with a 1-hour expiry
                    scope._token = response;
                    scope._tokenExpiry = new Date().getTime() + (60 * 60 * 1000);
                    
                    // Execute the original call with the new token
                    scope._executeSiCall(si, method, url, callback, response);
                })
                .otherwise(function(error) {
                    scope._tokenRequestInProgress = false;
                    scope._token = null;
                    scope._tokenExpiry = null;
                    
                    // Only show login prompt for critical operations
                    if (method === 'recheck' || method === 'input') {
                        scope._tokenRetryCount++;
                        if (scope._tokenRetryCount < scope._maxTokenRetries) {
                            // Retry with exponential backoff
                            setTimeout(function() {
                                scope.pushSi(method, url, callback, true);
                            }, 1000 * Math.pow(2, scope._tokenRetryCount));
                        } else {
                            console.error('Failed to get token after multiple attempts:', error);
                            if (callback) callback();
                        }
                    } else {
                        // For non-critical operations, just skip if we can't get a token
                        if (callback) callback();
                    }
                });
            },

            /**
             * Execute the SiteImprove call with the provided token
             * @private
             */
            _executeSiCall: function(si, method, url, callback, token) {
                try {
                    si.push([
                        method, 
                        url, 
                        token, 
                        function() {
                            if (callback) {
                                callback();
                            }
                        }
                    ]);
                } catch (e) {
                    console.error('Error executing SiteImprove call:', e);
                    if (callback) callback();
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