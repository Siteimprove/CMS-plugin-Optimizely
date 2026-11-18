using System.Reflection;
using EPiServer;
using EPiServer.Core;
using EPiServer.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SiteImprove.Optimizely.Plugin.Controllers;
using Xunit;

public class PageContextTests
{
    [Theory]
    [InlineData("invalid", "en", "invalid-content")]
    [InlineData("1_2", "", "invalid-language")]
    [InlineData("1_2", "not a language", "invalid-language")]
    public void InvalidContextIsRejectedBeforeReadingContent(string reference, string language, string expected)
    {
        var controller = new SiteimproveController(null, null, null, null, null);
        var result = Assert.IsType<BadRequestObjectResult>(controller.PageUrl(reference, language));
        Assert.Contains(expected, System.Text.Json.JsonSerializer.Serialize(result.Value));
    }

    [Fact]
    public void UnreadableContentReturnsNoUrls()
    {
        var controller = Controller(new PageData(), false);
        Assert.Equal(403, Assert.IsType<StatusCodeResult>(controller.PageUrl("1_2", "en")).StatusCode);
    }

    [Fact]
    public void MissingContentReturnsNotFound()
    {
        var controller = Controller(null, true);
        Assert.IsType<NotFoundObjectResult>(controller.PageUrl("1_2", "en"));
    }

    [Fact]
    public void NonPageContentDoesNotProduceAPageContext()
    {
        var result = Assert.IsType<JsonResult>(Controller(new ContentFolder(), true).PageUrl("1_2", "en"));
        Assert.Contains("no-page-context", System.Text.Json.JsonSerializer.Serialize(result.Value));
    }

    [Fact]
    public void RegionalLanguageLoadsFallbackContentAndResolvesTheRegionalPublicUrl()
    {
        // en-US can fall back to en content; the editor still expects the en-US public URL.
        var page = new PageData();
        page.Property.Add("PageLink", new PropertyContentReference(new ContentReference(1, 2)));
        page.Property.Add("PageLanguageBranch", new PropertyString("en"));
        var helper = new LanguageHelper();
        var controller = Controller(page, true, helper, out var loader);

        var result = Assert.IsType<JsonResult>(controller.PageUrl("1_2", "en-US"));

        Assert.Equivalent(LanguageSelector.Fallback("en-US", false), loader.Selector);
        Assert.Equal("en-US", helper.Language);
        Assert.Contains("https://public.example/en-us/", System.Text.Json.JsonSerializer.Serialize(result.Value));
    }

    [Fact]
    public void ExternalUrlUsesTheRequestedLanguageInsteadOfTheFallbackLanguage()
    {
        var page = new PageData();
        page.Property.Add("PageLink", new PropertyContentReference(new ContentReference(1, 2)));
        page.Property.Add("PageLanguageBranch", new PropertyString("en"));
        var resolver = DispatchProxy.Create<EPiServer.Web.Routing.IUrlResolver, UrlProxy>();

        Assert.Null(new SiteImprove.Optimizely.Plugin.Helper.SiteimproveHelper(null, resolver, null).GetExternalUrl(page, "en-US"));

        Assert.Equal("en-US", ((UrlProxy)(object)resolver).Language);
    }

    private static SiteimproveController Controller(IContent content, bool readable, SiteImprove.Optimizely.Plugin.Helper.ISiteimproveHelper helper, out ContentProxy proxy)
    {
        var loader = DispatchProxy.Create<IContentLoader, ContentProxy>();
        proxy = (ContentProxy)(object)loader;
        proxy.Content = content;
        var access = DispatchProxy.Create<IContentAccessEvaluator, AccessProxy>();
        ((AccessProxy)(object)access).Readable = readable;
        return new SiteimproveController(null, helper, loader, access, null)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
    }

    public class LanguageHelper : SiteImprove.Optimizely.Plugin.Helper.ISiteimproveHelper
    {
        public string Language;
        public string GetOptimizelyVersion() => "13.0.0";
        public string GetSiteimprovePluginVersion() => "5.0.0";
        public string GetExternalUrl(PageData page) => throw new InvalidOperationException("The requested language must be used.");
        public string GetExternalUrl(PageData page, string language) { Language = language; return "https://public.example/en-us/"; }
        public string GetPreviewUrl(PageData page) => null;
    }

    public class UrlProxy : DispatchProxy
    {
        public string Language;
        protected override object Invoke(MethodInfo method, object[] args)
        {
            Assert.Equal("GetUrl", method.Name);
            Language = args.OfType<string>().Single();
            return null;
        }
    }

    private static SiteimproveController Controller(IContent content, bool readable)
    {
        var loader = DispatchProxy.Create<IContentLoader, ContentProxy>();
        ((ContentProxy)(object)loader).Content = content;
        var access = DispatchProxy.Create<IContentAccessEvaluator, AccessProxy>();
        ((AccessProxy)(object)access).Readable = readable;
        return new(null, null, loader, access, null)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
    }

    public class ContentProxy : DispatchProxy
    {
        public IContent Content;
        public LoaderOptions Selector;
        protected override object Invoke(MethodInfo method, object[] args)
        {
            Assert.Equal("TryGet", method.Name);
            Selector = args.OfType<LoaderOptions>().SingleOrDefault();
            args[^1] = Content;
            return Content != null;
        }
    }

    public class AccessProxy : DispatchProxy
    {
        public bool Readable;
        protected override object Invoke(MethodInfo method, object[] args)
        {
            Assert.Equal("HasAccess", method.Name);
            Assert.Contains(AccessLevel.Read, args);
            return Readable;
        }
    }
}
