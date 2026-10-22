using SiteImprove.Optimizely.Plugin;
using System.Net;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using SiteImprove.Optimizely.Plugin.Services;
using Xunit;

public class ApiClientTests
{
    [Fact]
    public async Task TokenRequestUsesTheCmsVersionAndNoApiCredentials()
    {
        var api = Client((request, _) => {
            Assert.Equal(HttpMethod.Get, request.Method);
            Assert.StartsWith(Constants.SiteImproveTokenUrl + "?cms=", request.RequestUri.AbsoluteUri);
            Assert.Contains("Optimizely 13.0.0", Uri.UnescapeDataString(request.RequestUri.Query));
            Assert.Null(request.Headers.Authorization);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"token\":\"generated-token\"}") });
        });
        Assert.Equal("generated-token", await api.RequestTokenAsync("13.0.0", default));
    }

    [Fact]
    public async Task TokenTimeoutReturnsUnavailable()
    {
        var api = Client(async (_, ct) => { await Task.Delay(Timeout.Infinite, ct); return null; }, TimeSpan.FromMilliseconds(30));
        Assert.Null(await api.RequestTokenAsync("13.0.0", default));
    }

    [Fact]
    public async Task CallerCancellationIsPreserved()
    {
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        var api = Client(async (_, ct) => { await Task.Delay(Timeout.Infinite, ct); return null; });
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => api.RequestTokenAsync("13.0.0", cancelled.Token));
    }

    [Theory]
    [InlineData("not-json")]
    [InlineData("{\"token\":\"\"}")]
    [InlineData("{}")]
    [InlineData("[]")]
    [InlineData("null")]
    [InlineData("{\"token\":42}")]
    public async Task MalformedTokenDoesNotBecomeAStoredToken(string body)
    {
        var api = Client((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body) }));
        Assert.True(string.IsNullOrWhiteSpace(await api.RequestTokenAsync("13.0.0", default)));
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
