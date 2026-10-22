using System.Collections.Generic;

namespace SiteImprove.Optimizely.Plugin.Models;

public class SettingsViewModel
{
    public bool Recheck { get; set; }
    public IList<UrlMapping> UrlMap { get; set; } = new List<UrlMapping>();
    public bool Saved { get; set; }
    public string PluginVersion { get; set; }
    public string PluginUrl { get; set; }
}

public class UrlMapping
{
    public string Key { get; set; }
    public string Value { get; set; }
}
