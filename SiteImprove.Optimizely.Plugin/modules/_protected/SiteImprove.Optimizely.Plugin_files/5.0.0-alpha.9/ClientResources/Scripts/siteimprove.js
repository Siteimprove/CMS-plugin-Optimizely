define([
    "dojo/_base/declare", "dojo/topic", "dojo/request", "epi/shell/_ContextMixin", "dojo/when"
], function (declare, topic, request, _ContextMixin, when) {
    return declare([_ContextMixin], {
        constructor: function () {
            this.contextRevision = 0;
            this.documentEpoch = 0;
            this.subscriptions = [];
        },
        si: function () { return window._si = window._si || []; },
        initialize: function () {
            this.inherited(arguments);
            this.subscriptions = this.subscriptions || [];
            this.contextRevision = this.contextRevision || 0;
            this.documentEpoch = this.documentEpoch || 0;
            this.si().push(["registerPrepublishCallback", null]);
            request.get(this.actionPath("IsAuthorized"), { handleAs: "json" }).then(function (authorized) {
                if (!authorized || this.disposed) return;
                ["/epi/shell/context/current", "/epi/shell/context/changed", "epi/shell/context/request"].forEach(function (name) {
                    this.subscriptions.push(topic.subscribe(name, this.contextChange.bind(this)));
                }, this);
                this.si().push(["onHighlight", this.highlight.bind(this)]);
                this.onPreviewLoad = this.updateAvailability.bind(this);
                document.addEventListener("load", this.onPreviewLoad, true);
                this.previewTimer = window.setInterval(this.updateAvailability.bind(this), 250);
                when(this.getCurrentContext(), this.contextChange.bind(this));
            }.bind(this), function () { this.setStatus("unauthorized", "Siteimprove access is unavailable for this account."); }.bind(this));
        },
        actionPath: function (action) {
            return window.epi.routes.getActionPath({ moduleArea: "SiteImprove.Optimizely.Plugin", controller: "Siteimprove", action: action });
        },
        getPageUrl: function (contentId, locale) {
            return request.get(this.actionPath("PageUrl"), { query: { contentId: contentId, locale: locale }, handleAs: "json" });
        },
        contextChange: function (content) {
            if (this.disposed) return;
            var key = content && [content.id, content.language, content.previewUrl || ""].join("|");
            if (key && key === this.contextKey) { this.updateAvailability(); return; }
            this.contextKey = key;
            var revision = ++this.contextRevision;
            this.blockedDocument = this.previewDocument;
            this.blockedEpoch = this.documentEpoch;
            this.expectedPreviewUrl = null;
            this.publicUrl = null;
            this.lastCapture = null;
            this.notice = null;
            this.setAvailability(false);
            this.clearHighlights();
            if (this.token) this.si().push(["clear", null, this.token]);
            if (!content || !content.id || !content.language || (content.capabilities && !content.capabilities.isPage)) {
                this.setStatus("no-page", "Select a page to use Siteimprove. Standalone block and section checks are not supported yet.");
                return;
            }
            this.setStatus("loading", "Waiting for the selected draft preview.");
            Promise.all([
                this.getPageUrl(content.id, content.language),
                request.get(this.actionPath("Token"), { handleAs: "json" })
            ]).then(function (responses) {
                if (this.disposed || revision !== this.contextRevision) return;
                var page = responses[0];
                this.token = responses[1];
                if (!this.token) { this.setStatus("connection-unavailable", "Siteimprove is temporarily unavailable. Try again in a minute."); return; }
                this.publicUrl = page.url || null;
                this.expectedPreviewUrl = page.previewUrl || null;
                this.si().push(["input", this.publicUrl, this.token]);
                if (!this.expectedPreviewUrl) {
                    this.setStatus("no-preview", "This page has no draft preview available for checking.");
                    return;
                }
                this.updateAvailability();
            }.bind(this), function (error) {
                if (this.disposed || revision !== this.contextRevision) return;
                this.contextKey = null;
                this.setStatus("unavailable", error && error.response && error.response.status === 503
                    ? "Siteimprove is temporarily unavailable. Try again in a minute."
                    : "Siteimprove could not load this page's context. Select the page again to retry.");
            }.bind(this));
        },
        readPreview: function () {
            // Visual Builder leaves the classic iframe hidden and renders an unnamed preview.
            var frames = document.querySelectorAll('iframe[name="sitePreview"], .content-preview iframe');
            var fallback = { state: "missing" };
            for (var i = 0; i < frames.length; i++) {
                var frame = frames[i];
                if (!frame.contentWindow || (frame.getClientRects && frame.getClientRects().length === 0)) continue;
                if (frame.getBoundingClientRect) {
                    var rect = frame.getBoundingClientRect();
                    if (rect.width <= 0 || rect.height <= 0) continue;
                }
                if (window.getComputedStyle && window.getComputedStyle(frame).visibility !== "visible") continue;
                try {
                    var dom = frame.contentWindow.document;
                    if (!dom || !dom.body || dom.readyState !== "complete" || dom.URL === "about:blank") {
                        if (fallback.state === "missing") fallback = { state: "loading" };
                        continue;
                    }
                    var readable = { state: "readable", dom: dom };
                    if (this.matchesPreview(dom)) return readable;
                    fallback = readable;
                } catch (error) {
                    if (error.name !== "SecurityError") throw error;
                    fallback = { state: "cross-origin" };
                }
            }
            return fallback;
        },
        matchesPreview: function (dom) {
            if (!this.expectedPreviewUrl) return false;
            try {
                var expected = new URL(this.expectedPreviewUrl, window.location.href);
                var actual = new URL(dom.URL);
                if (expected.origin !== actual.origin || expected.pathname !== actual.pathname) return false;
                // Require all CMS-generated identity/version/language parameters. Additional view parameters are allowed.
                return Array.from(expected.searchParams.entries()).every(function (pair) {
                    return actual.searchParams.getAll(pair[0]).indexOf(pair[1]) !== -1;
                });
            } catch (_) { return false; }
        },
        observePreview: function (dom) {
            if (this.previewDocument === dom && this.observedBody === dom.body) return;
            if (this.previewObserver) this.previewObserver.disconnect();
            this.previewDocument = dom;
            this.observedBody = dom.body;
            this.documentEpoch++;
            this.stableSince = Date.now();
            this.lastCapture = null;
            this.previewObserver = new MutationObserver(function () {
                this.documentEpoch++;
                this.stableSince = Date.now();
                this.lastCapture = null;
                this.clearHighlights();
                this.setAvailability(false);
                if (this.token) {
                    this.si().push(["clear", null, this.token]);
                    this.si().push(["input", this.publicUrl, this.token]);
                }
                this.setStatus("changed", "The draft changed. Wait for the preview to settle, then run a new check.");
            }.bind(this));
            this.previewObserver.observe(dom.body, { subtree: true, childList: true, attributes: true, characterData: true });
        },
        previewState: function () {
            if (!this.expectedPreviewUrl || !this.token) return { state: "waiting" };
            var result = this.readPreview();
            if (result.state !== "readable") return result;
            var dom = result.dom;
            if (!this.matchesPreview(dom)) return { state: "mismatch" };
            this.observePreview(dom);
            if (this.blockedDocument === dom && this.blockedEpoch === this.documentEpoch) return { state: "loading" };
            if (dom.body.getAttribute("data-siteimprove-preview-ready") === "false") return { state: "loading" };
            if (Date.now() - this.stableSince < 500 || (dom.fonts && dom.fonts.status === "loading")) return { state: "loading" };
            return { state: "ready", dom: dom };
        },
        updateAvailability: function () {
            if (this.disposed || !this.expectedPreviewUrl || !this.token) return;
            var result = this.previewState();
            if (this.lastCapture && (result.dom !== this.lastCapture.dom || this.documentEpoch !== this.lastCapture.epoch ||
                result.dom.documentElement.clientWidth !== this.lastCapture.width || result.dom.documentElement.clientHeight !== this.lastCapture.height)) {
                this.lastCapture = null;
                this.clearHighlights();
                this.notice = "The preview changed. Run a new content check before highlighting issues.";
            }
            this.setAvailability(result.state === "ready");
            var messages = {
                "cross-origin": "Draft checks and highlighting are unavailable because this preview is hosted separately from the CMS. Published-page insights can still be used.",
                missing: "Open the page preview to run a draft check.",
                mismatch: "Waiting for the preview to match the selected page, language and draft.",
                loading: "Waiting for the draft preview to finish rendering."
            };
            this.setStatus(result.state, result.state === "ready" ? (this.notice || "") : (messages[result.state] || ""));
        },
        setAvailability: function (available) {
            if (this.checkAvailable === available) return;
            this.checkAvailable = available;
            this.si().push(["registerPrepublishCallback", available ? this.capturePreview.bind(this) : null]);
        },
        capturePreview: function () {
            this.clearHighlights();
            var result = this.previewState();
            if (result.state !== "ready") {
                this.updateAvailability();
                return Promise.reject(new Error("The selected draft preview is not ready for checking."));
            }
            var revision = this.contextRevision;
            var epoch = this.documentEpoch;
            var dom = result.dom;
            // Revalidate on the next turn so navigation or a queued render cannot reuse the old document.
            return new Promise(function (resolve, reject) {
                window.setTimeout(function () {
                    var current = this.previewState();
                    if (this.disposed || revision !== this.contextRevision || epoch !== this.documentEpoch || current.dom !== dom) {
                        reject(new Error("The draft changed before it could be checked. Run a new check."));
                        return;
                    }
                    this.notice = null;
                    this.setStatus("ready", "");
                    this.lastCapture = { dom: dom, revision: revision, epoch: epoch,
                        width: dom.documentElement.clientWidth, height: dom.documentElement.clientHeight };
                    resolve(dom);
                }.bind(this), 0);
            }.bind(this));
        },
        highlight: function (info) {
            var capture = this.lastCapture;
            var result = this.previewState();
            if (!capture || capture.revision !== this.contextRevision || capture.epoch !== this.documentEpoch ||
                result.state !== "ready" || result.dom !== capture.dom ||
                result.dom.documentElement.clientWidth !== capture.width || result.dom.documentElement.clientHeight !== capture.height) {
                this.clearHighlights();
                this.setStatus("stale", "The preview changed. Run a new content check before highlighting issues.");
                return;
            }
            this.clearHighlights();
            var dom = capture.dom;
            var layer = dom.createElement("div");
            layer.id = "siteimprove-highlight-layer";
            layer.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;z-index:2147483646";
            var first = null;
            (info && Array.isArray(info.highlights) ? info.highlights : []).forEach(function (issue) {
                var element;
                try { element = dom.querySelector(issue.selector); } catch (_) { return; }
                if (!element) return;
                var target = element;
                var images = !issue.offset && element.querySelectorAll ? Array.from(element.querySelectorAll(":scope > img")) : [];
                var rects = images.length ? images.map(function (img) { return img.getBoundingClientRect(); }) : [element.getBoundingClientRect()];
                if (images.length) target = images[0];
                if (issue.offset) {
                    var range = this.textRange(dom, element, issue.offset);
                    if (!range) return;
                    rects = Array.from(range.getClientRects());
                }
                rects.forEach(function (rect) {
                    var marker = dom.createElement("div");
                    marker.style.cssText = "position:absolute;box-sizing:border-box;border:2px solid #bd1230;background:rgba(189,18,48,.16)";
                    marker.style.left = (rect.left + dom.defaultView.scrollX) + "px";
                    marker.style.top = (rect.top + dom.defaultView.scrollY) + "px";
                    marker.style.width = rect.width + "px";
                    marker.style.height = rect.height + "px";
                    layer.appendChild(marker);
                });
                first = first || target;
            }, this);
            if (!first) { this.setStatus("unmatched", "This issue could not be located in the preview. Run a new check."); return; }
            // Keep decorations outside the observed body and framework-managed content nodes.
            dom.documentElement.appendChild(layer);
            this.highlightLayer = layer;
            first.scrollIntoView({ block: "center", behavior: "smooth" });
        },
        textRange: function (dom, element, offset) {
            if (!Number.isInteger(offset.start) || !Number.isInteger(offset.length) || offset.start < 0 || offset.length <= 0) return null;
            if (offset.child !== undefined) {
                // The SDK's offsets are relative to a direct text child when child is supplied.
                if (!Number.isInteger(offset.child) || offset.child < 0) return null;
                var child = element.childNodes[offset.child];
                if (!child || child.nodeType !== 3 || offset.start + offset.length > child.textContent.length) return null;
                var childRange = dom.createRange();
                childRange.setStart(child, offset.start);
                childRange.setEnd(child, offset.start + offset.length);
                return childRange;
            }
            var walker = dom.createTreeWalker(element, 4);
            var position = 0, node, start = null, end = null;
            while ((node = walker.nextNode())) {
                var next = position + node.textContent.length;
                if (!start && offset.start < next) start = { node: node, at: offset.start - position };
                if (start && offset.start + offset.length <= next) { end = { node: node, at: offset.start + offset.length - position }; break; }
                position = next;
            }
            if (!start || !end) return null;
            var range = dom.createRange();
            range.setStart(start.node, start.at);
            range.setEnd(end.node, end.at);
            return range;
        },
        clearHighlights: function () {
            if (this.highlightLayer) this.highlightLayer.remove();
            this.highlightLayer = null;
        },
        setStatus: function (state, message) {
            this.previewStatus = state;
            if (state === "changed" || state === "stale" || state === "unmatched") this.notice = message;
            if (!this.statusElement) {
                this.statusElement = document.createElement("div");
                this.statusElement.className = "siteimprove-preview-status";
                this.statusElement.setAttribute("role", "status");
                this.statusElement.setAttribute("aria-live", "polite");
                document.body.appendChild(this.statusElement);
            }
            this.statusElement.textContent = message;
            this.statusElement.hidden = !message;
        },
        destroy: function () {
            this.disposed = true;
            this.contextRevision++;
            window.clearInterval(this.previewTimer);
            document.removeEventListener("load", this.onPreviewLoad, true);
            (this.subscriptions || []).forEach(function (subscription) { subscription.remove(); });
            if (this.previewObserver) this.previewObserver.disconnect();
            this.clearHighlights();
            if (this.statusElement) this.statusElement.remove();
            this.si().push(["registerPrepublishCallback", null]);
            this.si().push(["onHighlight", null]);
            this.inherited(arguments);
        }
    });
});
