using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using SiteImprove.Optimizely.Plugin.Models;

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

    public Task<ContentCheckStatus> GetPrepublishStatusAsync(string apiUser, string apiKey, CancellationToken cancellationToken) =>
        ContentCheckingAsync(HttpMethod.Get, apiUser, apiKey, cancellationToken);

    public Task<ContentCheckStatus> EnablePrepublishCheckAsync(string apiUser, string apiKey, CancellationToken cancellationToken) =>
        ContentCheckingAsync(HttpMethod.Post, apiUser, apiKey, cancellationToken);

    private async Task<ContentCheckStatus> ContentCheckingAsync(HttpMethod method, string apiUser, string apiKey, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(apiUser) || string.IsNullOrWhiteSpace(apiKey)) return ContentCheckStatus.Unconfigured;
        using var request = new HttpRequestMessage(method, Constants.SiteImproveApiUrl + "/settings/content_checking");
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic",
            Convert.ToBase64String(Encoding.UTF8.GetBytes($"{apiUser}:{apiKey}")));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        try
        {
            using var client = clients.CreateClient(ClientName);
            using var response = await client.SendAsync(request, cancellationToken);
            if (response.StatusCode == HttpStatusCode.Unauthorized) return ContentCheckStatus.InvalidCredentials;
            if (response.StatusCode == HttpStatusCode.Forbidden) return ContentCheckStatus.AccessDenied;
            if (!response.IsSuccessStatusCode) return ContentCheckStatus.Unavailable;
            if (method == HttpMethod.Post) return ContentCheckStatus.Enabled;
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            if (json.RootElement.ValueKind != JsonValueKind.Object || !json.RootElement.TryGetProperty("is_ready", out var ready) ||
                (ready.ValueKind != JsonValueKind.True && ready.ValueKind != JsonValueKind.False)) return ContentCheckStatus.Unavailable;
            return ready.GetBoolean() ? ContentCheckStatus.Enabled : ContentCheckStatus.Disabled;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { return ContentCheckStatus.Unavailable; }
        catch (HttpRequestException) { logger.LogWarning("Siteimprove content-check request failed."); return ContentCheckStatus.Unavailable; }
        catch (JsonException) { logger.LogWarning("Siteimprove returned an invalid content-check response."); return ContentCheckStatus.Unavailable; }
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
