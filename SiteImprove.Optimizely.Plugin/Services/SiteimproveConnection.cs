using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Repositories;

namespace SiteImprove.Optimizely.Plugin.Services;

public interface ISiteimproveConnection
{
    Task<string> GetTokenAsync(CancellationToken cancellationToken);
}

// Provision once when needed, without network calls during CMS resource discovery or settings reads.
public sealed class SiteimproveConnection(IServiceScopeFactory scopes, TimeProvider clock) : ISiteimproveConnection
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private DateTimeOffset _retryAfter;

    public async Task<string> GetTokenAsync(CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var settings = scope.ServiceProvider.GetRequiredService<ISettingsRepository>();
        var token = settings.GetToken();
        if (!string.IsNullOrWhiteSpace(token)) return token;

        await _gate.WaitAsync(cancellationToken);
        try
        {
            token = settings.GetToken();
            if (!string.IsNullOrWhiteSpace(token)) return token;
            if (clock.GetUtcNow() < _retryAfter) return null;
            var helper = scope.ServiceProvider.GetRequiredService<ISiteimproveHelper>();
            var api = scope.ServiceProvider.GetRequiredService<ISiteimproveApiClient>();
            token = await api.RequestTokenAsync(helper.GetOptimizelyVersion(), cancellationToken);
            if (string.IsNullOrWhiteSpace(token))
            {
                _retryAfter = clock.GetUtcNow().AddMinutes(1);
                return null;
            }
            // Another node may have connected while the request was in flight. Reuse its value.
            var current = settings.GetToken();
            if (!string.IsNullOrWhiteSpace(current)) return current;
            settings.SetToken(token);
            return token;
        }
        finally { _gate.Release(); }
    }
}
