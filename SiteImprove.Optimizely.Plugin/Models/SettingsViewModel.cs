using System.Collections.Generic;

namespace SiteImprove.Optimizely.Plugin.Models
{
    public class SettingsViewModel
    {
        public string Token { get; set; }

        public bool Recheck { get; set; }

        public bool LatestUI { get; set; }

        public string ApiUser { get; set; }

        public string ApiKey { get; set; }

        public ContentCheckStatus PrepublishStatus { get; set; }

        public ContentCheckStatus? OperationError { get; set; }


        public IDictionary<string, string> UrlMap { get; set; }

        public string PluginVersion { get; set; }

        public string PluginUrl { get; set; }
    }
}