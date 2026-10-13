using System.Threading;
using System.Threading.Tasks;
using SiteImprove.Optimizely.Plugin.Models;

namespace SiteImprove.Optimizely.Plugin.Services;

public interface ISiteimproveApiClient
{
    Task<string> RequestTokenAsync(string cmsVersion, CancellationToken cancellationToken);
    Task<ContentCheckStatus> GetPrepublishStatusAsync(string apiUser, string apiKey, CancellationToken cancellationToken);
    Task<ContentCheckStatus> EnablePrepublishCheckAsync(string apiUser, string apiKey, CancellationToken cancellationToken);
    Task<bool> RecheckAsync(string url, string token, CancellationToken cancellationToken);
}
