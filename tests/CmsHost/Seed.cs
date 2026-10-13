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
    public static string LiveContentId = "";

    public static async Task RunAsync(IServiceProvider provider)
    {
        if (Environment.GetEnvironmentVariable("CMS_UPGRADE_PHASE") == "after")
        {
            // Preserve the existing database exactly: no users, settings, pages or drafts are reseeded.
            Ready = true;
            return;
        }
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
        var live = Environment.GetEnvironmentVariable("CMS_SITEIMPROVE_MODE") == "live";
        if (!live) settings.SaveToken("localhost-stub-token", recheck: false, latestUI: true);
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
        // Fixture authors must be able to read draft versions, not just published pages.
        var permissions = new ContentAccessControlList { IsInherited = false };
        permissions.AddEntry(new AccessControlEntry("Everyone", AccessLevel.Read, SecurityEntityType.Role));
        permissions.AddEntry(new AccessControlEntry("WebEditors", AccessLevel.Read | AccessLevel.Create | AccessLevel.Edit, SecurityEntityType.Role));
        services.GetRequiredService<IContentSecurityRepository>().Save(start.ContentLink, permissions, SecuritySaveType.Replace);
        if (!live && !content.GetChildren<StandardPage>(start.ContentLink).Any(p => p.Name == "Second page"))
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
        if (live)
        {
            var crawled = new Uri(Environment.GetEnvironmentVariable("SITEIMPROVE_CRAWLED_URL")!);
            var target = start;
            var index = 0;
            foreach (var segment in crawled.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries))
            {
                var child = content.GetDefault<StandardPage>(target.ContentLink, CultureInfo.GetCultureInfo("en"));
                child.Name = "Live test page " + ++index;
                child.URLSegment = segment;
                child.Heading = "Synthetic live test content";
                content.Save(child, SaveAction.Publish, AccessLevel.NoAccess);
                target = child;
            }
            CreateDraft(content, target);
            // Rechecks stay disabled: this smoke test only reads existing reports.
            settings.SaveToken(null, recheck: false, latestUI: true,
                apiUser: Environment.GetEnvironmentVariable("SITEIMPROVE_API_USERNAME"),
                apiKey: Environment.GetEnvironmentVariable("SITEIMPROVE_API_KEY"),
                urlMap: new Dictionary<string, string> { ["http://localhost:5000/"] = crawled.GetLeftPart(UriPartial.Authority) + "/" });
        }
        else
        {
            var target = content.GetDefault<StandardPage>(start.ContentLink, CultureInfo.GetCultureInfo("en"));
            target.Name = "Draft test page";
            target.URLSegment = "draft-test-page";
            target.Heading = "Synthetic draft test content";
            content.Save(target, SaveAction.Publish, AccessLevel.NoAccess);
            CreateDraft(content, target);
        }
        if (Environment.GetEnvironmentVariable("CMS_UPGRADE_PHASE") == "before")
        {
            settings.SaveToken("upgrade-preserved-token", recheck: true, latestUI: true,
                apiUser: "upgrade-api-user", apiKey: "upgrade-api-key",
                urlMap: new Dictionary<string, string>
                {
                    ["http://localhost:5000/"] = "https://upgrade.example.invalid/",
                    ["https://secondary.example.invalid/"] = "https://mapped.example.invalid/"
                });
        }
        Ready = true;
    }


    private static void CreateDraft(IContentRepository content, StandardPage target)
    {
        var draft = (StandardPage)target.CreateWritableClone();
        draft.TestMarker = Environment.GetEnvironmentVariable("CMS_DRAFT_MARKER")!;
        draft.IncludeTestImage = true;
        draft.ImageAlternative = "";
        LiveContentId = content.Save(draft, SaveAction.Save | SaveAction.ForceNewVersion, AccessLevel.NoAccess).ToString();
    }

    public static string FixLiveDraft(IContentRepository content)
    {
        var draft = (StandardPage)content.Get<StandardPage>(new ContentReference(LiveContentId)).CreateWritableClone();
        draft.ImageAlternative = "Blue square for the prepublish test";
        draft.TestMarker = Environment.GetEnvironmentVariable("CMS_DRAFT_FIXED_MARKER")!;
        LiveContentId = content.Save(draft, SaveAction.Save | SaveAction.ForceNewVersion, AccessLevel.NoAccess).ToString();
        return LiveContentId;
    }

    private static void Check(IdentityResult result)
    {
        if (!result.Succeeded) throw new InvalidOperationException(string.Join(", ", result.Errors.Select(e => e.Code)));
    }
}
