using EPiServer;
using EPiServer.Core;
using EPiServer.Web;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Infrastructure;
using SiteImprove.Optimizely.Plugin.Models;
using SiteImprove.Optimizely.Plugin.Repositories;
using Xunit;

namespace Plugin.Tests;

public class PublishEventTests : ServiceFixture
{
    private readonly Mock<IContentEvents> events = new();
    private readonly Mock<ISiteimproveHelper> helper = new();
    private readonly Mock<ISettingsRepository> settings = new();
    private readonly HttpContextAccessor http = new() { HttpContext = new DefaultHttpContext() };
    private readonly EventModule module = new();

    public PublishEventTests()
    {
        settings.Setup(x => x.GetSetting()).Returns(new Settings { Recheck = true });
        settings.Setup(x => x.GetToken()).Returns("fixture-token");
        Services.AddSingleton(events.Object);
        Services.AddSingleton(helper.Object);
        Services.AddSingleton(settings.Object);
        Services.AddSingleton<IHttpContextAccessor>(http);
        UseServices();
        SiteDefinition.Current = new SiteDefinition { StartPage = new ContentReference(1), SiteUrl = new Uri("https://public.example") };
        module.Initialize(null);
    }

    private PageData Page()
    {
        var page = ContentFixture.Page();
        helper.Setup(x => x.GetExternalUrl(page)).Returns("https://public.example/da/news");
        return page;
    }

    [Fact]
    public void Publishing_a_page_requests_one_recheck_for_its_public_url()
    {
        events.Raise(x => x.PublishedContent += null, new ContentEventArgs(Page()));
        helper.Verify(x => x.PassEvent("recheck", "https://public.example/da/news", "fixture-token"), Times.Once);
    }

    [Theory]
    [InlineData("disabled")]
    [InlineData("block")]
    [InlineData("no-url")]
    [InlineData("background")]
    public void Ineligible_publish_events_do_not_send_a_page_recheck(string scenario)
    {
        IContent content = Page();
        if (scenario == "disabled") settings.Setup(x => x.GetSetting()).Returns(new Settings { Recheck = false });
        if (scenario == "block") content = Mock.Of<IContent>();
        if (scenario == "no-url") helper.Setup(x => x.GetExternalUrl(It.IsAny<PageData>())).Returns((string)null);
        if (scenario == "background") http.HttpContext = null;
        events.Raise(x => x.PublishedContent += null, new ContentEventArgs(content));
        helper.Verify(x => x.PassEvent(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public void Module_shutdown_removes_its_publish_subscription()
    {
        module.Uninitialize(null);
        events.Raise(x => x.PublishedContent += null, new ContentEventArgs(Page()));
        helper.Verify(x => x.PassEvent(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public void Reinitializing_the_same_module_does_not_duplicate_rechecks()
    {
        module.Initialize(null);
        events.Raise(x => x.PublishedContent += null, new ContentEventArgs(Page()));
        helper.Verify(x => x.PassEvent("recheck", "https://public.example/da/news", "fixture-token"), Times.Once);
    }

    [Fact]
    public void Republished_start_page_requests_a_recrawl_after_an_expired_publish_event()
    {
        settings.Setup(x => x.GetSetting()).Returns(new Settings { Recheck = false });
        var home = ContentFixture.Page(1);
        home.StopPublish = DateTime.Now.AddDays(-1);
        helper.Setup(x => x.GetExternalUrl(home)).Returns("https://public.example/");
        events.Raise(x => x.PublishedContent += null, new ContentEventArgs(home));
        helper.Verify(x => x.PassEvent(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()), Times.Never);
        home.StopPublish = null;
        events.Raise(x => x.PublishedContent += null, new ContentEventArgs(home));
        helper.Verify(x => x.PassEvent("recrawl", "https://public.example/", "fixture-token"), Times.Once);
    }

    [Theory]
    [InlineData(false, "/custom/plugin/1.0.5/ClientResources/Scripts/overlay-loader.js?version=v1")]
    [InlineData(true, "/custom/plugin/1.0.5/ClientResources/Scripts/overlay-loader.js?version=latest")]
    public void Interface_choice_loads_exactly_one_matching_script(bool latest, string expected)
    {
        settings.Setup(x => x.GetSetting()).Returns(new Settings { LatestUI = latest });
        var resources = new Mock<EPiServer.Framework.Modules.IModuleResourceResolver>();
        resources.Setup(x => x.ResolvePath(SiteImprove.Optimizely.Plugin.Constants.SiteImproveModuleName, "1.0.5/ClientResources/Scripts/overlay-loader.js"))
            .Returns("/custom/plugin/1.0.5/ClientResources/Scripts/overlay-loader.js");
        var script = Assert.Single(new ClientResourceProvider(settings.Object, resources.Object).GetClientResources());
        Assert.Equal(expected, script.Path);
    }
}
