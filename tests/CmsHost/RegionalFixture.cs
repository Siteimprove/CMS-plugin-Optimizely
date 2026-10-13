using System.Globalization;
using EPiServer;
using EPiServer.Core;
using EPiServer.DataAbstraction;
using EPiServer.DataAccess;
using EPiServer.Security;
using EPiServer.Web;
using EPiServer.Web.Routing;
using SiteImprove.Optimizely.Plugin.Helper;

namespace CmsHost;

public static class RegionalFixture
{
    public sealed record Target(string Name, string ContentId, string Locale, string SourceLanguage, string Path);
    private static readonly List<Target> Targets = new();

    public static void Seed(IServiceProvider services, StandardPage start)
    {
        var content = services.GetRequiredService<IContentRepository>();
        var languages = services.GetRequiredService<ILanguageBranchRepository>();
        var settings = services.GetRequiredService<ContentLanguageSettingRepository>();
        foreach (var locale in new[] { "en-US", "fr-CA", "es-419", "en-GB" })
        {
            var culture = CultureInfo.GetCultureInfo(locale);
            var branch = languages.Load(culture)?.CreateWritableClone() ?? new LanguageBranch(culture);
            branch.Enabled = true;
            languages.Save(branch);
            settings.Save(new ContentLanguageSetting(start.ContentLink, locale, null, new[] { "en" }, true));
            var translatedStart = content.CreateLanguageBranch<StandardPage>(start.ContentLink, culture);
            translatedStart.Name = "First page";
            translatedStart.Heading = "First page";
            content.Save(translatedStart, SaveAction.Publish, AccessLevel.NoAccess);
        }

        var inherited = Publish(content, start.ContentLink, "Inherited regional page", "inherited-regional-page");
        foreach (var locale in new[] { "en-US", "es-419" })
            Targets.Add(new Target("inherited", inherited.ContentLink.ID.ToString(), locale, "en",
                $"/{locale.ToLowerInvariant()}/inherited-regional-page/"));

        var translated = Publish(content, start.ContentLink, "Translated regional page", "translated-regional-page");
        var french = content.CreateLanguageBranch<StandardPage>(translated.ContentLink, CultureInfo.GetCultureInfo("fr-CA"));
        french.Name = "Translated regional page";
        french.URLSegment = "page-regionale-traduite";
        french.Heading = "French Canadian translation";
        var frenchLink = content.Save(french, SaveAction.Publish, AccessLevel.NoAccess);
        Targets.Add(new Target("translated", frenchLink.ID.ToString(), "fr-CA", "fr-CA", "/fr-ca/page-regionale-traduite/"));

        var draft = (StandardPage)french.CreateWritableClone();
        draft.Heading = "French Canadian draft";
        var draftLink = content.Save(draft, SaveAction.Save | SaveAction.ForceNewVersion, AccessLevel.NoAccess);
        Targets.Add(new Target("draft", draftLink.ToString(), "fr-CA", "fr-CA", "/fr-ca/page-regionale-traduite/"));

        var replacement = Publish(content, start.ContentLink, "Replacement language page", "replacement-language-page");
        settings.Save(new ContentLanguageSetting(replacement.ContentLink, "en-GB", "en", Array.Empty<string>(), true));
        Targets.Add(new Target("replacement", replacement.ContentLink.ID.ToString(), "en-GB", "en", ""));

        var unavailable = Publish(content, start.ContentLink, "No regional fallback", "no-regional-fallback");
        settings.Save(new ContentLanguageSetting(unavailable.ContentLink, "en-US", null, Array.Empty<string>(), true));
        Targets.Add(new Target("no-fallback", unavailable.ContentLink.ID.ToString(), "en-US", "", ""));
    }

    private static StandardPage Publish(IContentRepository content, ContentReference parent, string name, string segment)
    {
        var page = content.GetDefault<StandardPage>(parent, CultureInfo.GetCultureInfo("en"));
        page.Name = name;
        page.URLSegment = segment;
        page.Heading = name;
        var reference = content.Save(page, SaveAction.Publish, AccessLevel.NoAccess);
        return content.Get<StandardPage>(reference, CultureInfo.GetCultureInfo("en"));
    }

    public static object Describe(IContentRepository content, IUrlResolver urls, ISiteimproveHelper helper)
    {
        return Targets.Select(target =>
        {
            var reference = new ContentReference(target.ContentId);
            var loaded = content.TryGet<StandardPage>(reference, LanguageSelector.Fallback(target.Locale, false), out var page);
            return new
            {
                target.Name, target.ContentId, target.Locale, target.SourceLanguage, target.Path,
                loadedLanguage = loaded ? page.Language.Name : null,
                branches = content.GetLanguageBranches<StandardPage>(reference.ToReferenceWithoutVersion()).Select(p => p.Language.Name),
                cmsUrl = urls.GetUrl(reference.ToReferenceWithoutVersion(), target.Locale,
                    new UrlResolverArguments { ContextMode = ContextMode.Default }),
                publishUrl = loaded ? helper.GetExternalUrl(page) : null
            };
        }).ToArray();
    }
}
