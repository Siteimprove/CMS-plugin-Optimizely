using EPiServer.Core;

namespace SiteImprove.Optimizely.Plugin.Helper;

public interface ISiteimproveHelper
{
    string GetOptimizelyVersion();
    string GetSiteimprovePluginVersion();
    string GetExternalUrl(PageData page);
    string GetPreviewUrl(PageData page);
}
