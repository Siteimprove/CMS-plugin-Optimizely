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
        if (Environment.GetEnvironmentVariable("CMS_SITEIMPROVE_MODE") != "live")
        {
            services.AddSingleton<BlockErrorLog>();
            services.AddSingleton<Microsoft.Extensions.Logging.ILoggerProvider>(sp => sp.GetRequiredService<BlockErrorLog>());
        }
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
                Seed.Ready ? Results.Ok(new { contentId = Seed.LiveContentId }) : Results.NotFound())
                .RequireAuthorization(Constants.SiteImproveAuthorizationPolicy);
            endpoints.MapPost("/test/live-draft/fix", (HttpContext context, EPiServer.IContentRepository content) =>
                Seed.Ready && context.Request.Headers["X-Cms-Test"] == "prepublish"
                    ? Results.Ok(new { contentId = Seed.FixLiveDraft(content) }) : Results.NotFound())
                .RequireAuthorization(Constants.SiteImproveAuthorizationPolicy);
            endpoints.MapGet("/test/upgrade-settings", (SiteImprove.Optimizely.Plugin.Repositories.ISettingsRepository repository) =>
            {
                if (Environment.GetEnvironmentVariable("CMS_UPGRADE_PHASE") is not ("before" or "after"))
                    return Results.NotFound();
                var settings = repository.GetSetting();
                var assembly = typeof(SiteImprove.Optimizely.Plugin.Helper.SiteimproveHelper).Assembly;
                return Results.Ok(new
                {
                    version = assembly.GetName().Version?.ToString(3),
                    settings = new { recordId = settings.Id.ToString(), settings.Token, settings.Recheck,
                        settings.LatestUI, settings.ApiUser, settings.ApiKey, settings.UrlMap }
                });
            }).RequireAuthorization(Constants.SiteImproveAuthorizationPolicy);
            if (Environment.GetEnvironmentVariable("CMS_SITEIMPROVE_MODE") != "live")
            {
                endpoints.MapGet("/test/block-errors", (BlockErrorLog log) => log.Snapshot())
                    .RequireAuthorization(Constants.SiteImproveAuthorizationPolicy);
                endpoints.MapPost("/test/block", (HttpContext context, EPiServer.IContentRepository repository) =>
                {
                    if (context.Request.Headers["X-Cms-Test"] != "block-regression") return Results.NotFound();
                    var block = repository.GetDefault<RegressionBlock>(EPiServer.Core.ContentReference.GlobalBlockFolder);
                    block.Text = "Synthetic block";
                    var content = (EPiServer.Core.IContent)block;
                    content.Name = "Regression block";
                    var reference = repository.Save(content, EPiServer.DataAccess.SaveAction.Publish, EPiServer.Security.AccessLevel.NoAccess);
                    return Results.Ok(new { contentId = reference.ToString() });
                }).RequireAuthorization(Constants.SiteImproveAuthorizationPolicy);
            }
            endpoints.MapGet("/test/ready", () => Seed.Ready ? Results.Ok() : Results.StatusCode(503));
        });
    }
}
