using System;
using System.Collections.Generic;
using System.Linq;
using EPiServer.Data;
using EPiServer.Data.Dynamic;
using EPiServer.ServiceLocation;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Models;

namespace SiteImprove.Optimizely.Plugin.Repositories
{
    [ServiceConfiguration(typeof(ISettingsRepository))]
    public class SettingsRepository : ISettingsRepository
    {
        private static readonly object _lock = new object();
        private readonly Func<DynamicDataStore> _store;

        public SettingsRepository() : this(() => typeof(Settings).GetOrCreateStore())
        {
        }

        internal SettingsRepository(Func<DynamicDataStore> store)
        {
            _store = store;
        }

        private DynamicDataStore SettingStore
        {
            get
            {
                return _store();
            }
        }

        public string GetToken()
        {
            return GetSetting().Token ?? string.Empty;
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
                var settings = SettingStore.LoadAll<Settings>().ToArray().FirstOrDefault()
                    ?? new Settings { LatestUI = true };

                if (string.IsNullOrWhiteSpace(settings.Token))
                {
                    var siteimproveHelper = ServiceLocator.Current.GetInstance<ISiteimproveHelper>();
                    string token = siteimproveHelper.RequestToken();
                    if (!string.IsNullOrWhiteSpace(token))
                    {
                        settings.Token = token;
                        SaveToken(token, settings.Recheck, settings.LatestUI, settings.ApiUser, settings.ApiKey, settings.UrlMap);
                        settings = SettingStore.LoadAll<Settings>().FirstOrDefault() ?? settings;
                    }
                }

                return settings;
            }
        }
    }
}
