using System;
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using EPiServer;
using EPiServer.Core;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Repositories;

namespace SiteImprove.Optimizely.Plugin.Services;

public interface ISiteimproveRecheckQueue
{
    bool TryEnqueue(ContentReference contentLink, string language);
}

public class RecheckQueueOptions
{
    public int Capacity { get; set; } = 256;
    public int MaxAttempts { get; set; } = 3;
    public TimeSpan RetryDelay { get; set; } = TimeSpan.FromSeconds(2);
    public TimeSpan DeliveryDelay { get; set; } = TimeSpan.Zero;
}

// This queue is bounded and process-local. Pending requests are lost on a restart.
public class SiteimproveRecheckQueue : BackgroundService, ISiteimproveRecheckQueue
{
    private record Request(ContentReference ContentLink, string Language, string Key);
    private readonly Channel<Request> _channel;
    private readonly ConcurrentDictionary<string, byte> _pending = new();
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<SiteimproveRecheckQueue> _logger;
    private readonly RecheckQueueOptions _options;

    public SiteimproveRecheckQueue(IServiceScopeFactory scopes, IOptions<RecheckQueueOptions> options, ILogger<SiteimproveRecheckQueue> logger)
    {
        _scopes = scopes;
        _logger = logger;
        _options = options.Value;
        if (_options.Capacity < 1 || _options.MaxAttempts < 1 || _options.MaxAttempts > 5 ||
            _options.RetryDelay < TimeSpan.Zero || _options.DeliveryDelay < TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(options));
        _channel = Channel.CreateBounded<Request>(new BoundedChannelOptions(_options.Capacity)
        {
            FullMode = BoundedChannelFullMode.Wait, SingleReader = true
        });
    }

    public bool TryEnqueue(ContentReference contentLink, string language)
    {
        if (ContentReference.IsNullOrEmpty(contentLink) || string.IsNullOrWhiteSpace(language)) return false;
        var reference = contentLink.ToReferenceWithoutVersion();
        var key = reference + "|" + language;
        if (!_pending.TryAdd(key, 0)) return true;
        if (_channel.Writer.TryWrite(new Request(reference, language, key))) return true;
        _pending.TryRemove(key, out _);
        _logger.LogWarning("Siteimprove recheck queue is full. A recheck request was not queued.");
        return false;
    }

    public override Task StopAsync(CancellationToken cancellationToken)
    {
        _channel.Writer.TryComplete();
        return base.StopAsync(cancellationToken);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var request in _channel.Reader.ReadAllAsync(stoppingToken))
            {
                // A publication during processing must be allowed to queue another check.
                _pending.TryRemove(request.Key, out _);
                try { await ProcessAsync(request, stoppingToken); }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
                catch (Exception ex) { _logger.LogError(ex, "Siteimprove recheck processing failed."); }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }

    private async Task ProcessAsync(Request request, CancellationToken cancellationToken)
    {
        if (_options.DeliveryDelay > TimeSpan.Zero) await Task.Delay(_options.DeliveryDelay, cancellationToken);
        using var scope = _scopes.CreateScope();
        var settings = scope.ServiceProvider.GetRequiredService<ISettingsRepository>().GetSetting();
        if (!settings.Recheck) return;
        var loader = scope.ServiceProvider.GetRequiredService<IContentLoader>();
        if (!loader.TryGet<PageData>(request.ContentLink, new LanguageSelector(request.Language), out var page) ||
            !page.CheckPublishedStatus(PagePublishedStatus.Published)) return;
        var url = scope.ServiceProvider.GetRequiredService<ISiteimproveHelper>().GetExternalUrl(page);
        if (string.IsNullOrWhiteSpace(url)) return;
        var connection = scope.ServiceProvider.GetRequiredService<ISiteimproveConnection>();
        var token = await connection.GetTokenAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(token))
        {
            _logger.LogWarning("Siteimprove recheck skipped: the connection is temporarily unavailable.");
            return;
        }
        var api = scope.ServiceProvider.GetRequiredService<ISiteimproveApiClient>();
        for (var attempt = 1; attempt <= _options.MaxAttempts; attempt++)
        {
            if (await api.RecheckAsync(url, token, cancellationToken))
            {
                _logger.LogInformation("Siteimprove accepted a page recheck request.");
                return;
            }
            if (attempt < _options.MaxAttempts) await Task.Delay(_options.RetryDelay, cancellationToken);
        }
        _logger.LogWarning("Siteimprove recheck failed after {Attempts} attempts. Request a manual recheck when the service is available.", _options.MaxAttempts);
    }
}
