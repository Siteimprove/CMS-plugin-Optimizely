using System.Net;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Repositories;
using Xunit;

namespace Plugin.Tests;

public class HttpClientFactoryTests
{
    [Fact]
    public void Dependency_injection_routes_requests_through_the_named_client()
    {
        var factory = new Mock<IHttpClientFactory>(MockBehavior.Strict);
        factory.Setup(x => x.CreateClient("Siteimprove"))
            .Returns(() => new HttpClient(new ReadyHandler()));
        var services = new ServiceCollection();
        services.AddSingleton(Mock.Of<ISettingsRepository>());
        services.AddSingleton(factory.Object);
        services.AddTransient<ISiteimproveHelper, SiteimproveHelper>();
        using var provider = services.BuildServiceProvider();
        var helper = provider.GetRequiredService<ISiteimproveHelper>();

        Assert.True(helper.GetPrepublishCheckEnabled("fixture-user", "fixture-key"));
        Assert.True(helper.GetPrepublishCheckEnabled("fixture-user", "fixture-key"));
        factory.Verify(x => x.CreateClient("Siteimprove"), Times.Exactly(2));
    }

    private sealed class ReadyHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"is_ready\":true}")
            });
    }
}
