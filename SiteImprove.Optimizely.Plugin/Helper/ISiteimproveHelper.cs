using EPiServer.Core;

namespace SiteImprove.Optimizely.Plugin.Helper
{
    public interface ISiteimproveHelper
    {
        string GetOptimizelyVersion();
        string GetSiteimprovePluginVersion();
        string RequestToken();
        void PassEvent(string type, string url, string token);
        string GetExternalUrl(PageData page);
        // Keep existing custom helpers compatible; they can override regional URL resolution.
        string GetExternalUrl(PageData page, string language) => GetExternalUrl(page);
        bool GetPrepublishCheckEnabled(string apiUser, string apiKey);
        bool EnablePrepublishCheck(string apiUser, string apiKey);
    }
}
