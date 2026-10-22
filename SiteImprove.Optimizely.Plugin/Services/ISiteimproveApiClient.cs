using System.Threading;
using System.Threading.Tasks;

namespace SiteImprove.Optimizely.Plugin.Services;

public interface ISiteimproveApiClient
{
    Task<string> RequestTokenAsync(string cmsVersion, CancellationToken cancellationToken);
}
