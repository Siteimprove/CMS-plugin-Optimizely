using System;
using System.Reflection;
using EPiServer;
using EPiServer.Core;
using EPiServer.Logging;
using EPiServer.ServiceLocation;
using EPiServer.Web;
using EPiServer.Applications;
using EPiServer.Web.Routing;
using SiteImprove.Optimizely.Plugin.Repositories;

namespace SiteImprove.Optimizely.Plugin.Helper
{
    [ServiceConfiguration(typeof(ISiteimproveHelper))]
    public class SiteimproveHelper : ISiteimproveHelper
    {
        private static readonly ILogger _log = LogManager.GetLogger(typeof(SiteimproveHelper));

        private readonly ISettingsRepository _settingsRepo;
        private readonly IUrlResolver _urlResolver;
        private readonly IApplicationResolver _applicationResolver;

        public SiteimproveHelper(ISettingsRepository settingsRepository, IUrlResolver urlResolver, IApplicationResolver applicationResolver)
        {
            _settingsRepo = settingsRepository;
            _urlResolver = urlResolver;
            _applicationResolver = applicationResolver;
        }

        public string GetOptimizelyVersion()
        {
            var optimizelyAssembly = Assembly.GetAssembly(typeof(IContentRepository));
            var version = optimizelyAssembly.GetName().Version;
            return version.ToString();
        }

        public string GetSiteimprovePluginVersion()
        {
            var optimizelyAssembly = Assembly.GetAssembly(typeof(SiteimproveHelper));
            return optimizelyAssembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0]
                ?? optimizelyAssembly.GetName().Version.ToString(3);
        }

        public string GetExternalUrl(PageData page)
        {
            try
            {
                var internalUrl = _urlResolver.GetUrl(page.ContentLink, page.Language.Name, new UrlResolverArguments
                {
                    ContextMode = ContextMode.Default,
                    ForceCanonical = true,
                    ForceAbsolute = true,
                    AppendPreviewToken = false
                });

                if (internalUrl == null) //can be null for special pages like settings 
                {
                    return null;
                }

                var site = _applicationResolver.GetByContent(page.ContentLink, false) as IRoutableApplication;

                if(site == null) //could be null for pages not located under a startpage
                {
                    return null;
                }

                var siteUrl = site.GetPrimaryHost(page.Language)?.Url ?? site.Url;
                if (siteUrl == null) return null;

                var settings = _settingsRepo.GetSetting();
                if(settings.UrlMap != null)
                {
                    foreach (var pair in settings.UrlMap)
                    {
                        if(Uri.TryCreate(pair.Key, UriKind.Absolute, out Uri settingsSiteUrl))
                        {
                            if (settingsSiteUrl.Host == siteUrl.Host &&
                                settingsSiteUrl.Port == siteUrl.Port &&
                                settingsSiteUrl.Scheme == siteUrl.Scheme)
                            {
                                if(Uri.TryCreate(pair.Value, UriKind.Absolute, out Uri externalUrl))
                                {
                                    siteUrl = externalUrl;
                                    break;
                                }
                            }
                        }
                    }
                }

                var uriBuilder = new UrlBuilder(internalUrl)
                {
                    Host = siteUrl.Host,
                    Port = siteUrl.Port,
                    Scheme = siteUrl.Scheme
                };
                return uriBuilder.Uri.ToString();
            }
            catch (Exception ex)
            {
                _log.Error("Could not resolve pageUrl. Perhaps page is not under a startpage", ex);
                return null;
            }
        }

        public string GetPreviewUrl(PageData page)
        {
            try
            {
                return _urlResolver.GetUrl(page.ContentLink, page.Language.Name, new UrlResolverArguments
                {
                    ContextMode = ContextMode.Edit,
                    ForceAbsolute = true,
                    AppendPreviewToken = false
                });
            }
            catch (Exception ex)
            {
                _log.Warning("Could not resolve the draft preview URL.", ex);
                return null;
            }
        }
    }
}
