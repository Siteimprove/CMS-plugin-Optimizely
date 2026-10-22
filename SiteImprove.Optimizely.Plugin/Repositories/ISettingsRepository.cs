using System.Collections.Generic;
using SiteImprove.Optimizely.Plugin.Models;

namespace SiteImprove.Optimizely.Plugin.Repositories;

public interface ISettingsRepository
{
    string GetToken();
    void SetToken(string token);
    void SaveSettings(Dictionary<string, string> urlMap);
    Settings GetSetting();
}
