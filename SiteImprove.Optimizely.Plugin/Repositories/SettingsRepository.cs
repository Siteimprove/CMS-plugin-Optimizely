using System.Collections.Generic;
using System.Linq;
using EPiServer.Data;
using EPiServer.Data.Dynamic;
using EPiServer.ServiceLocation;
using SiteImprove.Optimizely.Plugin.Models;

namespace SiteImprove.Optimizely.Plugin.Repositories
{
    [ServiceConfiguration(typeof(ISettingsRepository))]
    public class SettingsRepository : ISettingsRepository
    {
        private static readonly object _lock = new object();

        private static DynamicDataStore SettingStore
        {
            get
            {
                return typeof(Settings).GetOrCreateStore();
            }
        }

        public string GetToken() => GetSetting().Token;

        public void SetToken(string token)
        {
            if (string.IsNullOrWhiteSpace(token)) throw new System.ArgumentException("A token is required.", nameof(token));
            lock (_lock)
            {
                var settings = GetSetting();
                SaveToken(token, settings.Recheck, settings.LatestUI, settings.ApiUser, settings.ApiKey, settings.UrlMap);
            }
        }

        public void SaveSettings(bool recheck, string apiUser, string apiKey, Dictionary<string, string> urlMap)
        {
            lock (_lock)
            {
                // Merge submitted fields with the current token and replacement-only API key.
                var settings = GetSetting();
                SaveToken(settings.Token, recheck, settings.LatestUI, apiUser,
                    string.IsNullOrWhiteSpace(apiKey) ? settings.ApiKey : apiKey, urlMap);
            }
        }

        public void SaveToken(string token, bool recheck = false, bool latestUI = true, string apiUser = null, string apiKey = null, Dictionary<string, string> urlMap = null)
        {
            lock (_lock)
            {
                var current = SettingStore.LoadAll<Settings>().ToArray().FirstOrDefault();
                if (current != null)
                {
                    current.Token = token;
                    current.Recheck = recheck;
                    current.LatestUI = latestUI;
                    current.ApiUser = apiUser;
                    current.ApiKey = apiKey;
                    current.UrlMap = urlMap;
                    SettingStore.Save(current, current.GetIdentity());
                    return;
                }

                SettingStore.Save(new Settings { Token = token, Recheck = recheck, LatestUI = latestUI, ApiUser = apiUser, ApiKey = apiKey, UrlMap = urlMap });
            }
        }

        public Settings GetSetting()
        {
            lock (_lock)
            {
                // Reading settings must not contact Siteimprove or write a new store row.
                return SettingStore.LoadAll<Settings>().FirstOrDefault()
                    ?? new Settings { LatestUI = true, UrlMap = new Dictionary<string, string>() };
            }
        }
    }
}
