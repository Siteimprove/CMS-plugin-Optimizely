using EPiServer.Framework;
using EPiServer.Framework.Initialization;
using EPiServer.ServiceLocation;
using EPiServer.Shell.Modules;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.Linq;
using SiteImprove.Optimizely.Plugin.Services;

namespace SiteImprove.Optimizely.Plugin.Infrastructure
{
    [InitializableModule]
    [ModuleDependency(typeof(ServiceContainerInitialization))]
    public class InitializationModule : IConfigurableModule
    {
        public void ConfigureContainer(ServiceConfigurationContext context)
        {
            context.Services.AddHttpClient(SiteimproveApiClient.ClientName, client =>
                client.Timeout = SiteimproveApiClient.RequestTimeout);
            context.Services.AddTransient<ISiteimproveApiClient, SiteimproveApiClient>();
            context.Services.Configure<RecheckQueueOptions>(_ => { });
            context.Services.AddSingleton<SiteimproveRecheckQueue>();
            context.Services.AddSingleton<ISiteimproveRecheckQueue>(services => services.GetRequiredService<SiteimproveRecheckQueue>());
            context.Services.AddHostedService(services => services.GetRequiredService<SiteimproveRecheckQueue>());

            context.Services.AddAuthorization(options =>
            {
                options.AddPolicy(Constants.SiteImproveAuthorizationPolicy,
                    p => p.RequireAuthenticatedUser().RequireRole(Constants.SiteImproveAuthorizationPolicyRoles));
                options.AddPolicy(Constants.SiteImproveEditorPolicy,
                    p => p.RequireAuthenticatedUser().RequireRole(Constants.SiteImproveEditorRoles));
            });

            context.Services.Configure<ProtectedModuleOptions>(
                pm =>
                {
                    if (!pm.Items.Any(i => i.Name.Equals(Constants.SiteImproveModuleName, StringComparison.OrdinalIgnoreCase)))
                    {
                        pm.Items.Add(new ModuleDetails { Name = Constants.SiteImproveModuleName });
                    }
                });
        }

        public void Initialize(InitializationEngine context)
        {
        }

        public void Uninitialize(InitializationEngine context)
        {
        }
    }
}