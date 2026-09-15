using EPiServer.Cms.UI.AspNetIdentity;
using Microsoft.AspNetCore.DataProtection;
using EPiServer.Data;
using EPiServer.Web.Routing;
using EPiServer.Framework.Modules;
using SiteImprove.Optimizely.Plugin;

namespace CmsHost;

public class Startup
{
    public void ConfigureServices(IServiceCollection services)
    {
        if (Environment.GetEnvironmentVariable("CMS_TEST_HOST") != "1")
            throw new InvalidOperationException("This disposable host requires CMS_TEST_HOST=1.");
        services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo("App_Data/keys"));
        services.AddCmsAspNetIdentity<ApplicationUser>();
        services.AddCms();
        services.Configure<DataAccessOptions>(o => { o.UpdateDatabaseSchema = true; o.CreateDatabaseSchema = true; });
        if (Environment.GetEnvironmentVariable("CMS_SITEIMPROVE_MODE") != "live")
        {
            services.AddSingleton<ExternalStub>();
            services.AddHttpClient("Siteimprove").ConfigurePrimaryHttpMessageHandler(
                sp => sp.GetRequiredService<ExternalStub>()).SetHandlerLifetime(Timeout.InfiniteTimeSpan);
        }
        else
        {
            services.AddHttpClient("Siteimprove").ConfigurePrimaryHttpMessageHandler(() => new LiveReadOnlyHandler());
        }
    }

    public void Configure(IApplicationBuilder app)
    {
        app.Use(async (context, next) =>
        {
            if (context.Request.Host.Host != "localhost" ||
                context.Connection.RemoteIpAddress is not { } ip || !System.Net.IPAddress.IsLoopback(ip))
            {
                context.Response.StatusCode = 403;
                return;
            }
            await next();
        });
        app.UseStaticFiles();
        app.UseRouting();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseEndpoints(endpoints =>
        {
            endpoints.MapContent();
            endpoints.MapControllers();
            endpoints.MapGet("/test/routes", (IModuleResourceResolver resolver) => new
            {
                admin = resolver.ResolvePath(Constants.SiteImproveModuleName, "SiteimproveAdmin"),
                plugin = resolver.ResolvePath(Constants.SiteImproveModuleName, "Siteimprove")
            }).RequireAuthorization();
            endpoints.MapGet("/test/live-target", () =>
                Environment.GetEnvironmentVariable("CMS_SITEIMPROVE_MODE") == "live" && Seed.Ready
                    ? Results.Ok(new { contentId = Seed.LiveContentId }) : Results.NotFound()).RequireAuthorization();
            endpoints.MapGet("/test/ready", () => Seed.Ready ? Results.Ok() : Results.StatusCode(503));
        });
    }
}
