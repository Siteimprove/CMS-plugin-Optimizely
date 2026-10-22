using System.Collections.Generic;
using System.Linq;
using EPiServer.Data;
using EPiServer.Data.Dynamic;
using EPiServer.ServiceLocation;
using SiteImprove.Optimizely.Plugin.Models;

namespace SiteImprove.Optimizely.Plugin.Repositories;

[ServiceConfiguration(typeof(ISettingsRepository))]
public class SettingsRepository : ISettingsRepository
{
    private static readonly object Sync = new();
    private static DynamicDataStore SettingStore => typeof(Settings).GetOrCreateStore();

    public string GetToken() => GetSetting().Token;

    public void SetToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token)) throw new System.ArgumentException("A token is required.", nameof(token));
        lock (Sync)
        {
            var settings = GetSetting();
            settings.Token = token;
            SaveCurrent(settings);
        }
    }

    public void SaveSettings(Dictionary<string, string> urlMap)
    {
        lock (Sync)
        {
            // Merge editable fields with the latest connection rather than a stale form snapshot.
            var settings = GetSetting();
            settings.UrlMap = urlMap ?? new Dictionary<string, string>();
            SaveCurrent(settings);
        }
    }

    private void SaveCurrent(Settings settings)
    {
        settings.Recheck = false;
        settings.LatestUI = true;
        settings.ApiUser = null;
        settings.ApiKey = null;
        Persist(settings);
    }

    public Settings GetSetting()
    {
        lock (Sync)
        {
            // Reading settings must not contact Siteimprove or write a new store row.
            return LoadSettings() ?? new Settings { LatestUI = true, UrlMap = new Dictionary<string, string>() };
        }
    }

    protected virtual Settings LoadSettings() => SettingStore.LoadAll<Settings>().FirstOrDefault();
    protected virtual void Persist(Settings settings)
    {
        if (settings.Id != null) SettingStore.Save(settings, settings.GetIdentity());
        else SettingStore.Save(settings);
    }
}
