using System.Net;
using System.Text;

namespace CmsHost;

// Only the test application registers this handler. Unexpected outbound calls fail closed.
public sealed class ExternalStub : HttpMessageHandler
{
    private bool _prepublishEnabled;
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var url = request.RequestUri!;
        string body;
        if (url.Host == "my2.siteimprove.com" && url.AbsolutePath == "/auth/token" && request.Method == HttpMethod.Get)
            body = "{\"token\":\"localhost-stub-token\"}";
        else if (url.Host == "api.siteimprove.com" && url.AbsolutePath == "/v2/settings/content_checking")
        {
            if (request.Method == HttpMethod.Post) _prepublishEnabled = true;
            body = _prepublishEnabled ? "{\"is_ready\":true}" : "{\"is_ready\":false}";
        }
        else if (url.Host == "api-gateway.siteimprove.com" && url.AbsolutePath == "/cms-recheck" && request.Method == HttpMethod.Post)
            body = "{}";
        else throw new InvalidOperationException("Unexpected external request in CMS test host.");
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        });
    }
}
