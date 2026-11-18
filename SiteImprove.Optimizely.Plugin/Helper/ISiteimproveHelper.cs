using EPiServer.Core;

namespace SiteImprove.Optimizely.Plugin.Helper;

public interface ISiteimproveHelper
{
    string GetOptimizelyVersion();
    string GetSiteimprovePluginVersion();
    string GetExternalUrl(PageData page);
    // Keep existing custom helpers compatible; they can override regional URL resolution.
    string GetExternalUrl(PageData page, string language) => GetExternalUrl(page);
    string GetPreviewUrl(PageData page);
}
