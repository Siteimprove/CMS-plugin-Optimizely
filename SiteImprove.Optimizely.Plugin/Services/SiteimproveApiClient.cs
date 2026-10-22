using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace SiteImprove.Optimizely.Plugin.Services;

public class SiteimproveApiClient(IHttpClientFactory clients, ILogger<SiteimproveApiClient> logger) : ISiteimproveApiClient
{
    public const string ClientName = "Siteimprove";
    public static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(10);

    public async Task<string> RequestTokenAsync(string cmsVersion, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get,
            $"{Constants.SiteImproveTokenUrl}?cms={Uri.EscapeDataString("Optimizely " + cmsVersion)}");
        try
        {
            using var client = clients.CreateClient(ClientName);
            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode) return null;
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            return json.RootElement.ValueKind == JsonValueKind.Object && json.RootElement.TryGetProperty("token", out var token) && token.ValueKind == JsonValueKind.String
                ? token.GetString() : null;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { return null; }
        catch (HttpRequestException) { logger.LogWarning("Siteimprove token request failed."); return null; }
        catch (JsonException) { logger.LogWarning("Siteimprove returned an invalid token response."); return null; }
    }

    public async Task<bool> RecheckAsync(string url, string token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token) || !Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            (uri.Scheme != "https" && uri.Scheme != "http")) return false;
        using var request = new HttpRequestMessage(HttpMethod.Post, Constants.SiteImproveRecheckUrl)
        {
            Content = new StringContent(JsonSerializer.Serialize(new { url, type = "recheck", token }), Encoding.UTF8, "application/json")
        };
        try
        {
            using var client = clients.CreateClient(ClientName);
            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode) logger.LogWarning("Siteimprove recheck returned HTTP {StatusCode}.", (int)response.StatusCode);
            return response.IsSuccessStatusCode;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { return false; }
        catch (HttpRequestException) { logger.LogWarning("Siteimprove recheck request failed."); return false; }
    }
}
