using EPiServer.Core;
using EPiServer.Web;
using EPiServer.Web.Routing;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Models;
using SiteImprove.Optimizely.Plugin.Repositories;
using Xunit;

namespace Plugin.Tests;

public class UrlMappingTests : ServiceFixture
{
    private readonly Mock<IUrlResolver> urls = new();
    private readonly Mock<ISiteDefinitionResolver> sites = new();
    private readonly Mock<ISettingsRepository> settings = new();

    public UrlMappingTests()
    {
        Services.AddSingleton(urls.Object);
        Services.AddSingleton(sites.Object);
        UseServices();
    }

    [Theory]
    [InlineData("https://cms.example", "https://cms.example", "https://www.example", "https://www.example/da/news?preview=1")]
    [InlineData("http://cms.example:8080", "http://cms.example:8080", "https://public.example:8443", "https://public.example:8443/da/news?preview=1")]
    [InlineData("https://cms.example", "http://cms.example", "https://wrong.example", "https://cms.example/da/news?preview=1")]
    [InlineData("https://cms.example:8443", "https://cms.example", "https://wrong.example", "https://cms.example:8443/da/news?preview=1")]
    [InlineData("https://cms.example", "https://other.example", "https://wrong.example", "https://cms.example/da/news?preview=1")]
    [InlineData("https://cms.example", "not a URL", "https://wrong.example", "https://cms.example/da/news?preview=1")]
    public void Mapping_matches_the_site_origin_and_preserves_page_path_and_query(string origin, string from, string to, string expected)
    {
        var page = ContentFixture.Page();
        urls.Setup(x => x.GetUrl(page.ContentLink, It.IsAny<string>(), It.IsAny<UrlResolverArguments>())).Returns("/da/news?preview=1");
        sites.Setup(x => x.GetByContent(page.ContentLink, false)).Returns(new SiteDefinition { SiteUrl = new Uri(origin) });
        settings.Setup(x => x.GetSetting()).Returns(new Settings { UrlMap = new() { [from] = to } });
        Assert.Equal(expected, new SiteimproveHelper(settings.Object).GetExternalUrl(page));
    }

    [Fact]
    public void Different_sites_and_language_paths_keep_their_own_public_urls()
    {
        var a = ContentFixture.Page(42, 7);
        var b = ContentFixture.Page(43, 9);
        urls.Setup(x => x.GetUrl(new ContentReference(42), It.IsAny<string>(), It.IsAny<UrlResolverArguments>())).Returns("/en/news");
        urls.Setup(x => x.GetUrl(new ContentReference(43), It.IsAny<string>(), It.IsAny<UrlResolverArguments>())).Returns("/da/nyheder");
        sites.Setup(x => x.GetByContent(a.ContentLink, false)).Returns(new SiteDefinition { SiteUrl = new Uri("https://cms-a.example") });
        sites.Setup(x => x.GetByContent(b.ContentLink, false)).Returns(new SiteDefinition { SiteUrl = new Uri("https://cms-b.example") });
        settings.Setup(x => x.GetSetting()).Returns(new Settings { UrlMap = new() {
            ["https://cms-a.example"] = "https://a.example", ["https://cms-b.example"] = "https://b.example"
        } });
        var helper = new SiteimproveHelper(settings.Object);
        Assert.Equal("https://a.example/en/news", helper.GetExternalUrl(a));
        Assert.Equal("https://b.example/da/nyheder", helper.GetExternalUrl(b));
    }

    [Theory]
    [InlineData("missing-url")]
    [InlineData("missing-site")]
    [InlineData("resolver-error")]
    public void Unresolvable_pages_return_no_public_url(string failure)
    {
        var page = ContentFixture.Page();
        if (failure == "resolver-error") urls.Setup(x => x.GetUrl(page.ContentLink, It.IsAny<string>(), It.IsAny<UrlResolverArguments>())).Throws(new InvalidOperationException("Fixture resolver failure"));
        else urls.Setup(x => x.GetUrl(page.ContentLink, It.IsAny<string>(), It.IsAny<UrlResolverArguments>())).Returns(failure == "missing-url" ? null : "/news");
        Assert.Null(new SiteimproveHelper(settings.Object).GetExternalUrl(page));
    }
}
