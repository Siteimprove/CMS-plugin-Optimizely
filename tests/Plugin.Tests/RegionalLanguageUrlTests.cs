using System.Globalization;
using EPiServer;
using EPiServer.Core;
using EPiServer.Web;
using EPiServer.Web.Routing;
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

public class RegionalLanguageUrlTests : ServiceFixture
{
    private readonly Mock<IContentRepository> content = new();
    private readonly Mock<IUrlResolver> urls = new();
    private readonly Mock<ISiteDefinitionResolver> sites = new();
    private readonly Mock<ISettingsRepository> settings = new();
    private readonly PageData master = ContentFixture.Page(42, 7);
    private readonly SiteimproveHelper helper;

    public RegionalLanguageUrlTests()
    {
        master.Property.Add("PageLanguageBranch", new PropertyString("en"));
        content.Setup(x => x.Get<IContent>(It.IsAny<ContentReference>(), It.IsAny<LoaderOptions>())).Returns(master);
        sites.Setup(x => x.GetByContent(It.IsAny<ContentReference>(), false))
            .Returns(new SiteDefinition { SiteUrl = new Uri("https://cms.example") });
        settings.Setup(x => x.GetSetting()).Returns(new Settings
        {
            UrlMap = new() { ["https://cms.example"] = "https://www.example" }
        });
        Services.AddSingleton(content.Object);
        Services.AddSingleton(urls.Object);
        Services.AddSingleton(sites.Object);
        UseServices();
        helper = new SiteimproveHelper(settings.Object);
    }

    // These are the regional language branches reported in CST-6191.
    [Theory]
    [InlineData("en-001")]
    [InlineData("en-GB")]
    [InlineData("en-US")]
    [InlineData("en-150")]
    [InlineData("en-CA")]
    [InlineData("en-SG")]
    [InlineData("fr-FR")]
    [InlineData("fr-CA")]
    [InlineData("de-DE")]
    [InlineData("es-ES")]
    [InlineData("es-419")]
    public void Inherited_page_uses_the_selected_region_instead_of_the_master_language(string locale)
    {
        // The content is English; the editor and public route can still be regional.
        Assert.Equal("en", master.Language.Name);
        urls.Setup(x => x.GetUrl(It.IsAny<ContentReference>(), It.IsAny<string>(), It.IsAny<UrlResolverArguments>()))
            .Returns((ContentReference link, string language, UrlResolverArguments args) =>
                $"/{(language ?? "en").ToLowerInvariant()}/investor-relations/");

        Assert.Equal($"https://www.example/{locale.ToLowerInvariant()}/investor-relations/", PageUrl("42_7", locale));
        content.Verify(x => x.Get<IContent>(
            It.Is<ContentReference>(r => r.ID == 42 && r.WorkID == 7),
            It.Is<LoaderOptions>(o => o.Get<LanguageLoaderOption>().Language.Name == locale)), Times.Once);
    }

    [Fact]
    public void Page_without_a_regional_version_can_load_using_configured_fallback()
    {
        content.Setup(x => x.Get<IContent>(It.IsAny<ContentReference>(), It.IsAny<LoaderOptions>()))
            .Returns((ContentReference link, LoaderOptions options) =>
                options.Get<LanguageLoaderOption>().FallbackBehaviour == LanguageBehaviour.Fallback ? master : null);
        urls.Setup(x => x.GetUrl(It.IsAny<ContentReference>(), It.IsAny<string>(), It.IsAny<UrlResolverArguments>()))
            .Returns("/en-gb/investor-relations/");

        Assert.Equal("https://www.example/en-gb/investor-relations/", PageUrl("42", "en-GB"));
    }

    [Fact]
    public void Live_page_url_uses_a_public_route_without_the_editor_revision()
    {
        urls.Setup(x => x.GetUrl(It.IsAny<ContentReference>(), It.IsAny<string>(), It.IsAny<UrlResolverArguments>()))
            .Returns((ContentReference link, string language, UrlResolverArguments args) =>
                link.WorkID == 0 && args?.ContextMode == ContextMode.Default
                    ? "/en-us/investor-relations/"
                    : "/EPiServer/CMS/Content/investor-relations,,42_7/?epieditmode=True");

        Assert.Equal("https://www.example/en-us/investor-relations/", PageUrl("42_7", "en-US"));
        Assert.Equal(7, master.ContentLink.WorkID);
    }

    [Fact]
    public void Locally_translated_page_keeps_its_regional_url()
    {
        master.Language = CultureInfo.GetCultureInfo("fr-CA");
        urls.Setup(x => x.GetUrl(It.IsAny<ContentReference>(), It.IsAny<string>(), It.IsAny<UrlResolverArguments>()))
            .Returns((ContentReference link, string language, UrlResolverArguments args) =>
                language == "fr-CA" ? "/fr-ca/relations-investisseurs/" : "/en/investor-relations/");

        Assert.Equal("https://www.example/fr-ca/relations-investisseurs/", PageUrl("42_7", "fr-CA"));
    }

    [Fact]
    public void Calls_without_an_editor_locale_use_the_pages_own_language()
    {
        master.Language = CultureInfo.GetCultureInfo("es-419");
        urls.Setup(x => x.GetUrl(It.IsAny<ContentReference>(), It.IsAny<string>(), It.IsAny<UrlResolverArguments>()))
            .Returns((ContentReference link, string language, UrlResolverArguments args) =>
                language == "es-419" ? "/es-419/inversores/" : "/en/investors/");

        Assert.Equal("https://www.example/es-419/inversores/", helper.GetExternalUrl(master));
    }

    [Fact]
    public void Missing_public_route_does_not_invent_a_regional_url()
    {
        urls.Setup(x => x.GetUrl(It.IsAny<ContentReference>(), It.IsAny<string>(), It.IsAny<UrlResolverArguments>()))
            .Returns((string)null);

        Assert.Null(PageUrl("42_7", "en-US"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void Missing_editor_locale_keeps_the_pages_language(string locale)
    {
        master.Language = CultureInfo.GetCultureInfo("fr-CA");
        urls.Setup(x => x.GetUrl(It.IsAny<ContentReference>(), "fr-CA", It.IsAny<UrlResolverArguments>()))
            .Returns("/fr-ca/relations-investisseurs/");

        Assert.Equal("https://www.example/fr-ca/relations-investisseurs/", helper.GetExternalUrl(master, locale));
    }

    [Fact]
    public void Custom_helper_implementing_only_the_original_contract_still_works()
    {
        ISiteimproveHelper customHelper = new ExistingCustomHelper();
        var controller = new SiteimproveController(settings.Object, customHelper);
        var response = Assert.IsType<JsonResult>(controller.PageUrl("42_7", "en-US"));

        Assert.Equal("https://custom.example/page/42", (string)JObject.FromObject(response.Value)["url"]);
    }

    private sealed class ExistingCustomHelper : ISiteimproveHelper
    {
        public string GetExternalUrl(PageData page) => $"https://custom.example/page/{page.ContentLink.ID}";
        public string GetOptimizelyVersion() => throw new NotSupportedException();
        public string GetSiteimprovePluginVersion() => throw new NotSupportedException();
        public string RequestToken() => throw new NotSupportedException();
        public void PassEvent(string type, string url, string token) => throw new NotSupportedException();
        public bool GetPrepublishCheckEnabled(string apiUser, string apiKey) => throw new NotSupportedException();
        public bool EnablePrepublishCheck(string apiUser, string apiKey) => throw new NotSupportedException();
    }

    private string PageUrl(string contentId, string locale)
    {
        var controller = new SiteimproveController(settings.Object, helper);
        var response = Assert.IsType<JsonResult>(controller.PageUrl(contentId, locale));
        var json = JObject.FromObject(response.Value);
        Assert.False((bool)json["isDomain"]);
        return (string)json["url"];
    }
}
