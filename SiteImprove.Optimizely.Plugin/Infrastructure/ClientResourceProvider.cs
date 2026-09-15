using EPiServer.Framework.Modules;
using EPiServer.Framework.Web.Resources;
using EPiServer.ServiceLocation;
using EPiServer.Shell;
using SiteImprove.Optimizely.Plugin.Repositories;
using System.Collections.Generic;

namespace SiteImprove.Optimizely.Plugin.Infrastructure
{
    [ClientResourceProvider]
    public class ClientResourceProvider : IClientResourceProvider
    {
        public readonly ISettingsRepository _settingsRepository;
        private readonly IModuleResourceResolver _resources;

        public ClientResourceProvider(ISettingsRepository settingsRepository)
            : this(settingsRepository, ServiceLocator.Current.GetInstance<IModuleResourceResolver>())
        {
        }

        public ClientResourceProvider(ISettingsRepository settingsRepository, IModuleResourceResolver resources)
        {
            _settingsRepository = settingsRepository;
            _resources = resources;
        }

        public IEnumerable<ClientResource> GetClientResources()
        {
            var version = _settingsRepository.GetSetting()?.LatestUI == true ? "latest" : "v1";
            // Only the local loader is required for CMS startup; a CDN outage must not block the editor.
            yield return new ClientResource
            {
                Name = "siteimprove.smallbox",
                Path = _resources.ResolvePath(Constants.SiteImproveModuleName,
                    "1.0.5/ClientResources/Scripts/overlay-loader.js") + "?version=" + version,
                ResourceType = ClientResourceType.Script
            };
        }
    }
}
