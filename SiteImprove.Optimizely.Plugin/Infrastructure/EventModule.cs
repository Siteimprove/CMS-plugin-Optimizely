using EPiServer;
using Microsoft.Extensions.DependencyInjection;
using EPiServer.Core;
using EPiServer.Framework;
using EPiServer.Framework.Initialization;
using EPiServer.ServiceLocation;
using SiteImprove.Optimizely.Plugin.Services;

namespace SiteImprove.Optimizely.Plugin.Infrastructure;

[InitializableModule]
[ModuleDependency(typeof(ServiceContainerInitialization))]
public class EventModule : IInitializableModule
{
    private IContentEvents _contentEvents;
    private ISiteimproveRecheckQueue _queue;

    public void Initialize(InitializationEngine context)
    {
        _contentEvents = context.Services.GetRequiredService<IContentEvents>();
        _queue = context.Services.GetRequiredService<ISiteimproveRecheckQueue>();
        _contentEvents.PublishedContent += Published;
    }

    private void Published(object sender, ContentEventArgs args)
    {
        if (args.Content is PageData page) _queue.TryEnqueue(page.ContentLink, page.Language?.Name);
    }

    public void Uninitialize(InitializationEngine context)
    {
        if (_contentEvents != null) _contentEvents.PublishedContent -= Published;
    }
}
