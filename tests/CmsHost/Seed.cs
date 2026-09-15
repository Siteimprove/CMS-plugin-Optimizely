using System.Globalization;
using EPiServer;
using EPiServer.Cms.UI.AspNetIdentity;
using EPiServer.Core;
using EPiServer.DataAbstraction;
using EPiServer.DataAccess;
using EPiServer.Security;
using EPiServer.Web;
using Microsoft.AspNetCore.Identity;
using SiteImprove.Optimizely.Plugin.Repositories;

namespace CmsHost;

public static class Seed
{
    public static volatile bool Ready;

    public static async Task RunAsync(IServiceProvider provider)
    {
        using var scope = provider.CreateScope();
        var services = scope.ServiceProvider;
        var roles = services.GetRequiredService<RoleManager<IdentityRole>>();
        foreach (var role in new[] { "WebEditors", "WebAdmins", "SiteimproveAdmins" })
            if (!await roles.RoleExistsAsync(role)) Check(await roles.CreateAsync(new IdentityRole(role)));
        var users = services.GetRequiredService<UserManager<ApplicationUser>>();
        foreach (var name in new[] { "editor", "restricted" })
        {
            var user = await users.FindByNameAsync(name);
            if (user == null)
            {
                user = new ApplicationUser { UserName = name, Email = name + "@example.invalid", IsApproved = true };
                Check(await users.CreateAsync(user, Environment.GetEnvironmentVariable("CMS_EDITOR_PASSWORD")
                    ?? throw new InvalidOperationException("CMS_EDITOR_PASSWORD is required.")));
            }
            var desiredRoles = name == "editor" ? new[] { "WebEditors", "WebAdmins", "SiteimproveAdmins" } : new[] { "WebEditors" };
            foreach (var role in desiredRoles)
                if (!await users.IsInRoleAsync(user, role)) Check(await users.AddToRoleAsync(user, role));
        }
        var settings = services.GetRequiredService<ISettingsRepository>();
        // Seed a synthetic token before any client-resource discovery can request an external token.
        settings.SaveToken("localhost-stub-token", recheck: false, latestUI: true);
        var content = services.GetRequiredService<IContentRepository>();
        var languages = services.GetRequiredService<ILanguageBranchRepository>();
        if (languages.Load(CultureInfo.GetCultureInfo("en")) is not { Enabled: true })
        {
            var language = languages.Load(CultureInfo.GetCultureInfo("en"))?.CreateWritableClone()
                ?? new LanguageBranch(CultureInfo.GetCultureInfo("en"));
            language.Enabled = true;
            languages.Save(language);
        }
        var start = content.GetChildren<StandardPage>(ContentReference.RootPage).FirstOrDefault(p => p.Name == "First page");
        if (start == null)
        {
            start = content.GetDefault<StandardPage>(ContentReference.RootPage, CultureInfo.GetCultureInfo("en"));
            start.Name = "First page";
            start.Heading = "First page";
            content.Save(start, SaveAction.Publish, AccessLevel.NoAccess);
        }
        if (!content.GetChildren<StandardPage>(start.ContentLink).Any(p => p.Name == "Second page"))
        {
            var second = content.GetDefault<StandardPage>(start.ContentLink, CultureInfo.GetCultureInfo("en"));
            second.Name = "Second page";
            second.Heading = "Second page";
            content.Save(second, SaveAction.Publish, AccessLevel.NoAccess);
        }
        var sites = services.GetRequiredService<ISiteDefinitionRepository>();
        if (!sites.List().Any())
            sites.Save(new SiteDefinition
            {
                Name = "Package integration test", StartPage = start.ContentLink,
                SiteUrl = new Uri("http://localhost:5000/"),
                Hosts = new List<HostDefinition> { new() { Name = "localhost:5000", Language = CultureInfo.GetCultureInfo("en"), Type = HostDefinitionType.Primary } }
            });
        Ready = true;
    }

    private static void Check(IdentityResult result)
    {
        if (!result.Succeeded) throw new InvalidOperationException(string.Join(", ", result.Errors.Select(e => e.Code)));
    }
}
