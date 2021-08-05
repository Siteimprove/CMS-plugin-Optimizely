﻿using System.Linq;
using EPiServer.Data;
using EPiServer.Data.Dynamic;
using EPiServer.ServiceLocation;
using SiteImprove.Optimizely.Plugin.Models;

namespace SiteImprove.Optimizely.Plugin.Repositories
{
    [ServiceConfiguration(typeof(ISettingsRepository))]
    public class SettingsRepository : ISettingsRepository
    {
        private static DynamicDataStore SettingStore
        {
            get
            {
                return typeof(Settings).GetOrCreateStore();
            }
        }

        public string GetToken()
        {
            var settings = SettingStore.LoadAll<Settings>().ToArray().FirstOrDefault();

            if (settings == null || string.IsNullOrWhiteSpace(settings.Token))
            {
                var siteimproveHelper = ServiceLocator.Current.GetInstance<ISiteimproveHelper>();
                string token = siteimproveHelper.RequestToken();
                SaveToken(token);

                return token;
            }

            return settings.Token;
        }

        public void SaveToken(string token, bool noRecheck = false, string apiUser = null, string apiKey = null)
        {
            var current = SettingStore.LoadAll<Settings>().ToArray().FirstOrDefault();
            if (current != null)
            {
                current.Token = token;
                current.NoRecheck = noRecheck;
                current.ApiUser = apiUser;
                current.ApiKey = apiKey;
                SettingStore.Save(current, current.GetIdentity());
                return;
            }

            SettingStore.Save(new Settings { Token = token, NoRecheck = noRecheck, ApiUser = apiUser, ApiKey = apiKey });
        }

        public Settings GetSetting()
        {
            var settings = SettingStore.LoadAll<Settings>().ToArray().FirstOrDefault();

            if (settings == null || string.IsNullOrWhiteSpace(settings.Token))
            {
                var siteimproveHelper = ServiceLocator.Current.GetInstance<ISiteimproveHelper>();
                string token = siteimproveHelper.RequestToken();
                SaveToken(token);
                settings = SettingStore.LoadAll<Settings>().ToArray().Single(c => c.Token == token);
            }

            return settings;
        }
    }
}
