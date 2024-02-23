﻿using System.Collections.Generic;
using SiteImprove.Optimizely.Plugin.Models;
namespace SiteImprove.Optimizely.Plugin.Repositories
{
    public interface ISettingsRepository
    {
        string GetToken();
        void SaveToken(string token, bool recheck = false, bool latestUI = true, string apiUser = null, string apiKey = null, Dictionary<string,string> urlMap = null);
        Settings GetSetting();
    }
}
