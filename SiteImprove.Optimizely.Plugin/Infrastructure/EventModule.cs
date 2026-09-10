using System;
using EPiServer;
using EPiServer.Core;
using EPiServer.Framework;
using EPiServer.Framework.Initialization;
using EPiServer.ServiceLocation;
using Microsoft.AspNetCore.Http;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Repositories;

namespace SiteImprove.Optimizely.Plugin.Infrastructure
{
    [ModuleDependency(typeof(ServiceContainerInitialization))]
    public class EventModule : IInitializableModule
    {
        private ISettingsRepository _settingsRepository;
        private bool _homeIsUnPublished = false;
        private IHttpContextAccessor _httpContextAccessor;
        private ISiteimproveHelper _siteimproveHelper;
        private IContentEvents _contentEvents;

        public void Initialize(InitializationEngine context)
        {
            Uninitialize(context);
            _settingsRepository = ServiceLocator.Current.GetInstance<ISettingsRepository>();
            _siteimproveHelper = ServiceLocator.Current.GetInstance<ISiteimproveHelper>();
            _httpContextAccessor = ServiceLocator.Current.GetInstance<IHttpContextAccessor>();

            _contentEvents = ServiceLocator.Current.GetInstance<IContentEvents>();
            _contentEvents.PublishedContent += ContentEvents_PublishedContent;
        }

        private void ContentEvents_PublishedContent(object sender, ContentEventArgs e)
        {
            if (e.Content is not PageData page)
                return;

            // Page is home page
            if (page.ContentLink.ID == ContentReference.StartPage.ID)
            {
                if (page.StopPublish.HasValue)
                    this._homeIsUnPublished = page.StopPublish <= DateTime.Now;

                // In event "Publishing", homeIsPublished was false, now it is. Send a recrawl
                if (this._homeIsUnPublished && page.CheckPublishedStatus(PagePublishedStatus.Published))
                {
                    string url = _siteimproveHelper.GetExternalUrl(page);
                    if (url != null) _siteimproveHelper.PassEvent("recrawl", url, this._settingsRepository.GetToken());
                    this._homeIsUnPublished = false;
                    return;
                }
            }

            if (_settingsRepository.GetSetting().Recheck && _httpContextAccessor.HttpContext != null)
            { 
                if (page.CheckPublishedStatus(PagePublishedStatus.Published))
                {
                    string url = _siteimproveHelper.GetExternalUrl(page);
                    if (url != null) _siteimproveHelper.PassEvent("recheck", url, this._settingsRepository.GetToken());
                }
                else
                {
                    _siteimproveHelper.PassEvent("recheck", "", this._settingsRepository.GetToken());
                }
            }
        }

        public void Uninitialize(InitializationEngine context)
        {
            if (_contentEvents != null)
            {
                _contentEvents.PublishedContent -= ContentEvents_PublishedContent;
                _contentEvents = null;
            }
            _homeIsUnPublished = false;
        }
    }
}
