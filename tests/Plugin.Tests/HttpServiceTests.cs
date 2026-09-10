using System.Net;
using System.Text;
using EPiServer.Logging;
using Moq;
using Newtonsoft.Json.Linq;
using SiteImprove.Optimizely.Plugin;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Repositories;
using Xunit;

namespace Plugin.Tests;

public class HttpServiceTests
{
    private readonly Mock<ILogger> log = new();
    private readonly List<RequestCapture> requests = new();

    private SiteimproveHelper Helper(Func<HttpRequestMessage, HttpResponseMessage> respond)
    {
        log.Setup(x => x.IsEnabled(It.IsAny<Level>())).Returns(true);
        return new SiteimproveHelper(Mock.Of<ISettingsRepository>(), () => new HttpClient(new Handler(request => {
            requests.Add(new RequestCapture(request.Method, request.RequestUri.ToString(), request.Headers.Authorization?.Scheme,
                request.Headers.Authorization?.Parameter, request.Content?.Headers.ContentType?.MediaType,
                request.Content?.ReadAsStringAsync().GetAwaiter().GetResult()));
            return respond(request);
        })), log.Object);
    }

    [Fact]
    public void Prepublish_status_uses_the_expected_endpoint_and_authentication()
    {
        var helper = Helper(_ => Response(HttpStatusCode.OK, "{\"is_ready\":true}"));
        Assert.True(helper.GetPrepublishCheckEnabled("fixture-user", "fixture-key"));
        var request = Assert.Single(requests);
        Assert.Equal(HttpMethod.Get, request.Method);
        Assert.Equal(Constants.SiteImproveApiUrl + "/settings/content_checking", request.Url);
        Assert.Equal("Basic", request.AuthScheme);
        Assert.Equal(Convert.ToBase64String(Encoding.ASCII.GetBytes("fixture-user:fixture-key")), request.AuthParameter);
    }

    [Theory]
    [InlineData(401, "{}")]
    [InlineData(503, "{}")]
    [InlineData(200, "not json")]
    [InlineData(200, "{}")]
    [InlineData(200, "{\"is_ready\":false}")]
    public void Unavailable_or_invalid_status_never_claims_prepublish_is_ready(int status, string body)
    {
        Assert.False(Helper(_ => Response((HttpStatusCode)status, body)).GetPrepublishCheckEnabled("fixture-user", "fixture-key"));
    }

    [Theory]
    [InlineData(200, true)]
    [InlineData(401, false)]
    [InlineData(503, false)]
    public void Enabling_prepublish_posts_and_reports_http_failure(int status, bool expected)
    {
        var helper = Helper(_ => Response((HttpStatusCode)status, "{}"));
        Assert.Equal(expected, helper.EnablePrepublishCheck("fixture-user", "fixture-key"));
        var request = Assert.Single(requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal(Constants.SiteImproveApiUrl + "/settings/content_checking", request.Url);
        Assert.Equal("Basic", request.AuthScheme);
    }

    [Fact]
    public void Token_request_includes_the_cms_version_and_reads_the_token()
    {
        var helper = Helper(_ => Response(HttpStatusCode.OK, "{\"token\":\"fixture-token\"}"));
        Assert.Equal("fixture-token", helper.RequestToken());
        var request = Assert.Single(requests);
        Assert.Equal(HttpMethod.Get, request.Method);
        Assert.StartsWith(Constants.SiteImproveTokenUrl + "?cms=Optimizely", request.Url);
        Assert.Contains("12.", request.Url);
    }

    [Theory]
    [InlineData(503, "{}")]
    [InlineData(200, "not json")]
    public void Failed_token_response_returns_no_token(int status, string body)
    {
        Assert.True(string.IsNullOrEmpty(Helper(_ => Response((HttpStatusCode)status, body)).RequestToken()));
    }

    [Fact]
    public void Recheck_posts_the_page_url_type_and_token_as_json()
    {
        Helper(_ => Response(HttpStatusCode.Accepted, "{}")).PassEvent("recheck", "https://public.example/da/news", "fixture-token");
        var request = Assert.Single(requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal(Constants.SiteImproveRecheckUrl, request.Url);
        Assert.Equal("application/json", request.ContentType);
        var body = JObject.Parse(request.Body);
        Assert.Equal("https://public.example/da/news", (string)body["url"]);
        Assert.Equal("recheck", (string)body["type"]);
        Assert.Equal("fixture-token", (string)body["token"]);
    }

    [Fact]
    public void Http_recheck_failure_is_logged_as_failure_without_interrupting_publishing()
    {
        var helper = Helper(_ => Response(HttpStatusCode.ServiceUnavailable, "{}"));
        Assert.Null(Record.Exception(() => helper.PassEvent("recheck", "https://public.example/news", "fixture-token")));
        Assert.Contains(log.Invocations, i => i.Method.Name == "Log" && Equals(i.Arguments[0], Level.Error));
        Assert.DoesNotContain(log.Invocations, i => i.Method.Name == "Log" && Equals(i.Arguments[0], Level.Information));
    }

    [Fact]
    public void Network_failures_are_contained_for_each_service_operation()
    {
        var helper = Helper(_ => throw new HttpRequestException("Fixture service unavailable"));
        Assert.False(helper.GetPrepublishCheckEnabled("fixture-user", "fixture-key"));
        Assert.False(helper.EnablePrepublishCheck("fixture-user", "fixture-key"));
        Assert.True(string.IsNullOrEmpty(helper.RequestToken()));
        Assert.Null(Record.Exception(() => helper.PassEvent("recheck", "https://public.example/news", "fixture-token")));
    }

    private static HttpResponseMessage Response(HttpStatusCode status, string body) => new(status) { Content = new StringContent(body) };
    private sealed record RequestCapture(HttpMethod Method, string Url, string AuthScheme, string AuthParameter, string ContentType, string Body);
    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => Task.FromResult(respond(request));
    }
}
