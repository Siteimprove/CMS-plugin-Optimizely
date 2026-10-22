using System.Collections.Generic;
using EPiServer.Data;
using EPiServer.Data.Dynamic;

namespace SiteImprove.Optimizely.Plugin.Models
{
    [EPiServerDataStore(AutomaticallyCreateStore = true, AutomaticallyRemapStore = true)]
    public class Settings
    {
        public Identity Id { get; set; }

        public string Token { get; set; }

        public bool Recheck { get; set; }

        // Retained for existing DDS stores. These fields no longer control the SDK or access.
        public bool LatestUI { get; set; }

        public string ApiUser { get; set; }

        public string ApiKey { get; set; }

        public Dictionary<string,string> UrlMap { get; set; }
    }
}
