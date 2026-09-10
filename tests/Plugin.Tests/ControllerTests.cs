using EPiServer;
using EPiServer.Core;
using EPiServer.Framework.Modules;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Newtonsoft.Json.Linq;
using SiteImprove.Optimizely.Plugin.Controllers;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Models;
using SiteImprove.Optimizely.Plugin.Repositories;
using Xunit;

namespace Plugin.Tests;

public class ControllerTests : ServiceFixture
{
    private readonly Mock<IContentRepository> content = new();
    private readonly Mock<ISettingsRepository> settings = new();
    private readonly Mock<ISiteimproveHelper> helper = new();

    public ControllerTests()
    {
        Services.AddSingleton(content.Object);
        UseServices();
    }

    [Fact]
    public void Page_url_resolves_the_requested_revision_and_language()
    {
        var page = ContentFixture.Page(42, 7);
        content.Setup(x => x.Get<IContent>(It.Is<ContentReference>(r => r.ID == 42 && r.WorkID == 7), It.Is<LoaderOptions>(l => l.Get<LanguageLoaderOption>().Language.Name == "da"))).Returns(page);
        helper.Setup(x => x.GetExternalUrl(page)).Returns("https://public.example/da/news");
        var result = Assert.IsType<JsonResult>(new SiteimproveController(settings.Object, helper.Object).PageUrl("42_7", "da"));
        var json = JObject.FromObject(result.Value);
        Assert.Equal("https://public.example/da/news", (string)json["url"]);
        Assert.False((bool)json["isDomain"]);
    }

    [Fact]
    public void Direct_block_request_returns_bad_request_without_resolving_a_page_url()
    {
        var block = new Mock<IContent>();
        block.SetupGet(x => x.ContentLink).Returns(new ContentReference(99));
        content.Setup(x => x.Get<IContent>(It.IsAny<ContentReference>(), It.IsAny<LoaderOptions>())).Returns(block.Object);
        // Reproduce the repository contract for an inappropriate typed lookup.
        content.Setup(x => x.Get<PageData>(It.IsAny<ContentReference>(), It.IsAny<LoaderOptions>())).Throws(new TypeMismatchException("Content 99 is a Block"));
        var result = Assert.IsType<StatusCodeResult>(new SiteimproveController(settings.Object, helper.Object).PageUrl("99", "en"));
        Assert.Equal(400, result.StatusCode);
        helper.Verify(x => x.GetExternalUrl(It.IsAny<PageData>()), Times.Never);
    }

    private SiteimproveAdminController Admin() => new(settings.Object, helper.Object, Mock.Of<IModuleResourceResolver>());

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Enabling_prepublish_reports_the_service_outcome(bool success)
    {
        settings.Setup(x => x.GetSetting()).Returns(new Settings { ApiUser = "fixture-user", ApiKey = "fixture-key" });
        helper.Setup(x => x.EnablePrepublishCheck("fixture-user", "fixture-key")).Returns(success);
        var result = Assert.IsType<RedirectToActionResult>(Admin().EnablePrepublishCheck(true));
        Assert.Equal("Index", result.ActionName);
        if (!success) Assert.Equal(true, result.RouteValues["prepublishError"]);
        else Assert.Null(result.RouteValues);
    }
}
