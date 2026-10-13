using SiteImprove.Optimizely.Plugin;
using System.Net;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using SiteImprove.Optimizely.Plugin.Models;
using SiteImprove.Optimizely.Plugin.Services;
using Xunit;

public class ApiClientTests
{
    [Theory]
    [InlineData(200, "{\"is_ready\":true}", ContentCheckStatus.Enabled)]
    [InlineData(200, "{\"is_ready\":false}", ContentCheckStatus.Disabled)]
    [InlineData(200, "{\"is_ready\":\"false\"}", ContentCheckStatus.Unavailable)]
    [InlineData(200, "{}", ContentCheckStatus.Unavailable)]
    [InlineData(200, "[]", ContentCheckStatus.Unavailable)]
    [InlineData(200, "null", ContentCheckStatus.Unavailable)]
    [InlineData(200, "not-json", ContentCheckStatus.Unavailable)]
    [InlineData(401, "", ContentCheckStatus.InvalidCredentials)]
    [InlineData(403, "", ContentCheckStatus.AccessDenied)]
    [InlineData(503, "", ContentCheckStatus.Unavailable)]
    public async Task ReportsTheActualStatus(int code, string body, ContentCheckStatus expected)
    {
        var api = Client((_, _) => Task.FromResult(new HttpResponseMessage((HttpStatusCode)code) { Content = new StringContent(body) }));
        Assert.Equal(expected, await api.GetPrepublishStatusAsync("user", "secret", default));
    }

    [Fact]
    public async Task MissingCredentialsDoNotMakeAnHttpRequest()
    {
        var api = Client((_, _) => throw new Exception("Must not contact Siteimprove"));
        Assert.Equal(ContentCheckStatus.Unconfigured, await api.GetPrepublishStatusAsync("user", "", default));
    }

    [Fact]
    public async Task TimeoutIsUnavailableRatherThanDisabled()
    {
        var api = Client(async (_, ct) => { await Task.Delay(Timeout.Infinite, ct); return null; }, TimeSpan.FromMilliseconds(30));
        Assert.Equal(ContentCheckStatus.Unavailable, await api.GetPrepublishStatusAsync("user", "secret", default));
    }

    [Fact]
    public async Task CallerCancellationIsPreserved()
    {
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        var api = Client(async (_, ct) => { await Task.Delay(Timeout.Infinite, ct); return null; });
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => api.GetPrepublishStatusAsync("user", "secret", cancelled.Token));
    }

    [Fact]
    public async Task RecheckReportsFailureAndDoesNotLeakTokenInUrl()
    {
        string payload = null;
        var api = Client(async (request, ct) => {
            Assert.Equal(Constants.SiteImproveRecheckUrl, request.RequestUri.AbsoluteUri);
            payload = await request.Content.ReadAsStringAsync(ct);
            return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
        });
        Assert.False(await api.RecheckAsync("https://public.example/page", "token", default));
        Assert.Contains("\"type\":\"recheck\"", payload);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("[]")]
    [InlineData("null")]
    [InlineData("{\"token\":42}")]
    public async Task MalformedTokenDoesNotBecomeAStoredToken(string body)
    {
        var api = Client((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body) }));
        Assert.Null(await api.RequestTokenAsync("13.0.0", default));
    }

    private static SiteimproveApiClient Client(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send, TimeSpan? timeout = null) =>
        new(new Factory(send, timeout), NullLogger<SiteimproveApiClient>.Instance);

    private class Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => send(request, cancellationToken);
    }
    private class Factory(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send, TimeSpan? timeout) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(new Handler(send)) { Timeout = timeout ?? SiteimproveApiClient.RequestTimeout };
    }
}
