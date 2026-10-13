using System.Collections.Generic;
using EPiServer.Framework.Web.Resources;
using EPiServer.Shell;

namespace SiteImprove.Optimizely.Plugin.Infrastructure;

[ClientResourceProvider]
public class ClientResourceProvider : IClientResourceProvider
{
    public IEnumerable<ClientResource> GetClientResources() => new[]
    {
        new ClientResource
        {
            Name = "siteimprove.smallbox",
            Path = "https://cdn.siteimprove.net/cms/overlay-v2.js",
            ResourceType = ClientResourceType.Script
        }
    };
}
