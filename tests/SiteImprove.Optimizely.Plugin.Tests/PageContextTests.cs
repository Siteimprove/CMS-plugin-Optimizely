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
        protected override object Invoke(MethodInfo method, object[] args)
        {
            Assert.Equal("TryGet", method.Name);
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
