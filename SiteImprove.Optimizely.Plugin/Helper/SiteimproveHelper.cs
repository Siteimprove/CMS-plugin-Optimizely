using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Text;
using EPiServer;
using EPiServer.Core;
using EPiServer.Logging;
using EPiServer.ServiceLocation;
using EPiServer.Web;
using EPiServer.Web.Routing;
using Newtonsoft.Json;
using SiteImprove.Optimizely.Plugin.Repositories;

namespace SiteImprove.Optimizely.Plugin.Helper
{
    [ServiceConfiguration(typeof(ISiteimproveHelper))]
    public class SiteimproveHelper : ISiteimproveHelper
    {
        private readonly ILogger _log;
        private readonly Func<HttpClient> _createHttpClient;

        private readonly ISettingsRepository _settingsRepo;

        public SiteimproveHelper(ISettingsRepository settingsRepository)
            : this(settingsRepository, () => new HttpClient(), LogManager.GetLogger(typeof(SiteimproveHelper)))
        {
        }

        internal SiteimproveHelper(ISettingsRepository settingsRepository, Func<HttpClient> createHttpClient, ILogger log)
        {
            _settingsRepo = settingsRepository;
            _createHttpClient = createHttpClient;
            _log = log;
        }

        public string GetOptimizelyVersion()
        {
            var optimizelyAssembly = Assembly.GetAssembly(typeof(EPiServer.Core.Licensing));
            var version = optimizelyAssembly.GetName().Version;
            return version.ToString();
        }

        public string GetSiteimprovePluginVersion()
        {
            var optimizelyAssembly = Assembly.GetAssembly(typeof(SiteimproveHelper));
            var version = optimizelyAssembly.GetName().Version;
            return version.ToString(3);
        }

        public string GetExternalUrl(PageData page)
        {
            try
            {
                var internalUrl = ServiceLocator.Current.GetInstance<IUrlResolver>().GetUrl(page.ContentLink);

                if (internalUrl == null) //can be null for special pages like settings 
                {
                    return null;
                }

                var site = ServiceLocator.Current.GetInstance<ISiteDefinitionResolver>().GetByContent(page.ContentLink, false);

                if(site == null) //could be null for pages not located under a startpage
                {
                    return null;
                }

                var siteUrl = site.SiteUrl;

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

        public bool GetPrepublishCheckEnabled(string apiUser, string apiKey)
        {
            using (var client = _createHttpClient())
            {
                bool enabled = false;

                var byteArray = Encoding.ASCII.GetBytes($"{apiUser}:{apiKey}");
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(byteArray));
                client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
                var content = "";
                try
                {
                    var response = client.GetAsync($"{Constants.SiteImproveApiUrl}/settings/content_checking").Result;
                    if(response.IsSuccessStatusCode)
                    {
                        content = response.Content.ReadAsStringAsync().Result;
                        enabled = JsonConvert.DeserializeObject<dynamic>(content)["is_ready"];
                    } 
                    else
                    {
                        _log.Error($"Could not get prepublish check status. Returned status: {response.StatusCode} and reason: {response.ReasonPhrase}");
                    }
                }
                catch (Exception ex)
                {
                    _log.Error($"Could not get prepublish check status. From {content}", ex);
                }

                return enabled;
            }
        }

        public bool EnablePrepublishCheck(string apiUser, string apiKey)
        {
            using (var client = _createHttpClient())
            {
                var byteArray = Encoding.ASCII.GetBytes($"{apiUser}:{apiKey}");
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(byteArray));
                client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

                try
                {
                    var response = client.PostAsync($"{Constants.SiteImproveApiUrl}/settings/content_checking", null).Result;

                    if(!response.IsSuccessStatusCode)
                    {
                        _log.Error($"Could not enable prepublish check. Returned status: {response.StatusCode} and reason: {response.ReasonPhrase}");
                        return false;
                    }
                }
                catch (Exception ex)
                {
                    _log.Error("Could not enable prepublish check.", ex);
                    return false;
                }
            }

            return true;
        }

        public string RequestToken()
        {
            var response = string.Empty;
            try
            {
                using (var client = _createHttpClient())
                {
                    // Request a token from Siteimprove
                    var version = GetOptimizelyVersion();
                    string data = client.GetStringAsync(string.Format("{0}?cms=Optimizely {1}", Constants.SiteImproveTokenUrl, version)).Result;
                    response = JsonConvert.DeserializeObject<dynamic>(data)["token"];
                }
            }
            catch (Exception ex)
            {
                _log.Error("An error occured requesting token. perhaps its a wrong version - a version is required for generating a token ", ex);
            }
            return response;
        }

        public void PassEvent(string type, string url, string token)
        {
            var data = new { url, type, token };
            try
            {
                using (var client = _createHttpClient())
                {
                    var content = new StringContent(JsonConvert.SerializeObject(data), Encoding.UTF8, "application/json");
                    using var response = client.PostAsync(Constants.SiteImproveRecheckUrl, content).Result;
                    response.EnsureSuccessStatusCode();
                }
                _log.Information($"Siteimprove recheck called with type {type} for url {url}");
            }
            catch (Exception ex)
            {
                _log.Error(string.Format("An error occured requesting {0}. perhaps token is missing? - A token are required for this operation ", type), ex);
            }
        }
    }
}
