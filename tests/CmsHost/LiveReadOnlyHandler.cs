namespace CmsHost;

// The initial live smoke test may obtain a token and read entitlement, but cannot recheck or change settings remotely.
public sealed class LiveReadOnlyHandler : DelegatingHandler
{
    public LiveReadOnlyHandler() : base(new HttpClientHandler { AllowAutoRedirect = false }) { }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var url = request.RequestUri!;
        if (request.Method != HttpMethod.Get || url.Scheme != "https" || !url.IsDefaultPort
            || !((url.Host == "my2.siteimprove.com" && url.AbsolutePath == "/auth/token")
                || (url.Host == "api.siteimprove.com" && url.AbsolutePath == "/v2/settings/content_checking")))
            throw new InvalidOperationException("Outbound request is outside the live smoke test scope.");
        return base.SendAsync(request, cancellationToken);
    }
}
