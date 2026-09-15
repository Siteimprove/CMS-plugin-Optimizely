using EPiServer.Core;
using Microsoft.AspNetCore.Mvc;
using SiteImprove.Optimizely.Plugin.Controllers;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Models;
using SiteImprove.Optimizely.Plugin.Repositories;
using Xunit;

public class AdminTests
{
    [Fact]
    public void TokenRotationPreservesConfiguration()
    {
        var repo = new MemorySettings();
        var controller = new SiteimproveAdminController(repo, new Helper(), null);
        Assert.IsType<RedirectToActionResult>(controller.RotateToken());
        Assert.Equal("new-token", repo.Settings.Token);
        Assert.True(repo.Settings.Recheck);
        Assert.Equal("key", repo.Settings.ApiKey);
        Assert.Equal("user", repo.Settings.ApiUser);
        Assert.Equal("https://public.example", repo.Settings.UrlMap["https://cms.example"]);
    }

    [Fact]
    public void FailedTokenRotationDoesNotWriteSettings()
    {
        var repo = new MemorySettings();
        var controller = new SiteimproveAdminController(repo, new Helper { Token = "" }, null);
        Assert.Equal(502, Assert.IsType<ObjectResult>(controller.RotateToken()).StatusCode);
        Assert.Equal("old-token", repo.Settings.Token);
        Assert.Equal(0, repo.Writes);
    }

    [Fact]
    public void SavingBlankApiKeyPreservesExistingCredential()
    {
        var repo = new MemorySettings();
        var controller = new SiteimproveAdminController(repo, new Helper(), null);
        controller.Save(true, true, "user", "", repo.Settings.UrlMap.ToArray());
        Assert.Equal("key", repo.Settings.ApiKey);
        Assert.Single(repo.Settings.UrlMap);
    }

    [Fact]
    public void SavingWithoutMappingsDoesNotThrow()
    {
        var repo = new MemorySettings();
        new SiteimproveAdminController(repo, new Helper(), null).Save(false, true, "user", "replacement", null);
        Assert.Empty(repo.Settings.UrlMap);
        Assert.Equal("replacement", repo.Settings.ApiKey);
    }

    private class MemorySettings : ISettingsRepository
    {
        public Settings Settings = new() { Token = "old-token", Recheck = true, LatestUI = true,
            ApiUser = "user", ApiKey = "key", UrlMap = new() { ["https://cms.example"] = "https://public.example" } };
        public int Writes;
        public string GetToken() => Settings.Token;
        public Settings GetSetting() => Settings;
        public void SaveToken(string token, bool recheck = false, bool latestUI = true, string apiUser = null,
            string apiKey = null, Dictionary<string, string> urlMap = null)
        {
            Writes++;
            Settings = new() { Token = token, Recheck = recheck, LatestUI = latestUI, ApiUser = apiUser, ApiKey = apiKey, UrlMap = urlMap };
        }
    }
    private class Helper : ISiteimproveHelper
    {
        public string Token = "new-token";
        public string RequestToken() => Token;
        public string GetOptimizelyVersion() => "13.0.0";
        public string GetSiteimprovePluginVersion() => "5.0.0";
        public string GetExternalUrl(PageData page) => null;
        public void PassEvent(string type, string url, string token) { }
        public bool GetPrepublishCheckEnabled(string user, string key) => true;
        public bool EnablePrepublishCheck(string user, string key) => true;
    }
}
