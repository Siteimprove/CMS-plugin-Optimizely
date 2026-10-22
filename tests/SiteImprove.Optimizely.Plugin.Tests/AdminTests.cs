using System.Reflection;
using EPiServer.Core;
using EPiServer.Framework.Modules;
using Microsoft.AspNetCore.Mvc;
using SiteImprove.Optimizely.Plugin.Controllers;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Infrastructure;
using SiteImprove.Optimizely.Plugin.Models;
using SiteImprove.Optimizely.Plugin.Repositories;
using Xunit;

public class AdminTests
{
    [Fact]
    public void OldCredentialsAndUiSelectionDoNotReachTheSettingsView()
    {
        var repo = new StoredSettings();
        var result = Assert.IsType<ViewResult>(Controller(repo).Index());
        var model = Assert.IsType<SettingsViewModel>(result.Model);
        Assert.True(model.Recheck);
        Assert.Single(model.UrlMap);
        Assert.DoesNotContain(typeof(SettingsViewModel).GetProperties(), p =>
            new[] { "Token", "ApiUser", "ApiKey", "LatestUI", "PrepublishStatus" }.Contains(p.Name));
        Assert.Equal(0, repo.Writes);
        Assert.Equal("old-key", repo.Current.ApiKey);
        var script = Assert.Single(new ClientResourceProvider().GetClientResources());
        Assert.Equal("https://cdn.siteimprove.net/cms/overlay-v2.js", script.Path);
    }

    [Fact]
    public void SavingMigratesLegacyConfigurationAndPreservesTheConnection()
    {
        var repo = new StoredSettings();
        // The connection can change after an administrator opened the form.
        repo.SetToken("new-token");
        var result = Assert.IsType<RedirectToActionResult>(Controller(repo).Save(false, Rows(" HTTPS://CMS.EXAMPLE:443/ ", "https://public.example/")));
        Assert.Equal(true, result.RouteValues["saved"]);
        Assert.Equal("new-token", repo.Current.Token);
        Assert.False(repo.Current.Recheck);
        Assert.True(repo.Current.LatestUI);
        Assert.Null(repo.Current.ApiKey);
        Assert.Null(repo.Current.ApiUser);
        Assert.Equal("https://public.example", repo.Current.UrlMap["https://cms.example"]);
    }

    [Fact]
    public void AutomaticConnectionPreservesMappingsAndRecheckChoice()
    {
        var repo = new StoredSettings();
        repo.SetToken("new-token");
        Assert.True(repo.Current.Recheck);
        Assert.Equal("https://public.example", repo.Current.UrlMap["https://cms.example"]);
        Assert.True(repo.Current.LatestUI);
        Assert.Null(repo.Current.ApiKey);
    }

    [Theory]
    [InlineData("javascript:alert(1)", "https://public.example")]
    [InlineData("https://cms.example", "file:///tmp/page")]
    [InlineData("https://cms.example", "")]
    [InlineData("", "https://public.example")]
    [InlineData("https://user:secret@cms.example", "https://public.example")]
    [InlineData("https://cms.example/path", "https://public.example")]
    [InlineData("https://cms.example", "https://public.example/?token=value")]
    [InlineData("https://cms.example", "https://public.example/#fragment")]
    public void InvalidMappingsReturnSubmittedValuesWithoutChangingStoredSettings(string source, string target)
    {
        var repo = new StoredSettings();
        var controller = Controller(repo);
        var result = Assert.IsType<ViewResult>(controller.Save(false, Rows(source, target)));
        Assert.False(controller.ModelState.IsValid);
        Assert.Equal(0, repo.Writes);
        Assert.True(repo.Current.Recheck);
        var row = Assert.Single(Assert.IsType<SettingsViewModel>(result.Model).UrlMap);
        Assert.Equal(source, row.Key);
        Assert.Equal(target, row.Value);
    }

    [Fact]
    public void DuplicateOriginsAreRejectedRatherThanSilentlyDiscarded()
    {
        var repo = new StoredSettings();
        var controller = Controller(repo);
        var rows = Rows("https://cms.example", "https://public.example");
        rows.Add(new() { Key = "https://CMS.EXAMPLE:443/", Value = "https://other.example" });
        Assert.IsType<ViewResult>(controller.Save(false, rows));
        Assert.False(controller.ModelState.IsValid);
        Assert.Equal(0, repo.Writes);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void EmptyMappingsCanBeRemoved(bool includeBlankRow)
    {
        var repo = new StoredSettings();
        Controller(repo).Save(false, includeBlankRow ? Rows(" ", " ") : null);
        Assert.Empty(repo.Current.UrlMap);
        Assert.Equal("old-token", repo.Current.Token);
    }

    [Fact]
    public void ReadingFreshSettingsDoesNotWriteOrRequireAConnection()
    {
        var repo = new StoredSettings { Current = null };
        var settings = repo.GetSetting();
        Assert.Null(settings.Token);
        Assert.True(settings.LatestUI);
        Assert.Empty(settings.UrlMap);
        Assert.Equal(0, repo.Writes);
    }

    private static List<UrlMapping> Rows(string source, string target) => new() { new() { Key = source, Value = target } };
    private static SiteimproveAdminController Controller(StoredSettings repo) => new(repo, new Helper(), DispatchProxy.Create<IModuleResourceResolver, Resources>());

    public class Resources : DispatchProxy
    {
        protected override object Invoke(MethodInfo method, object[] args) => "/Optimizely/SiteImprove.Optimizely.Plugin/SiteimproveAdmin";
    }
    public class StoredSettings : SettingsRepository
    {
        public Settings Current = new() { Token = "old-token", Recheck = true, LatestUI = false,
            ApiUser = "old-user", ApiKey = "old-key", UrlMap = new() { ["https://cms.example"] = "https://public.example" } };
        public int Writes;
        protected override Settings LoadSettings() => Current;
        protected override void Persist(Settings settings) { Current = settings; Writes++; }
    }
    public class Helper : ISiteimproveHelper
    {
        public string GetOptimizelyVersion() => "13.0.0";
        public string GetSiteimprovePluginVersion() => "5.0.0";
        public string GetExternalUrl(PageData page) => null;
        public string GetPreviewUrl(PageData page) => null;
    }
}
