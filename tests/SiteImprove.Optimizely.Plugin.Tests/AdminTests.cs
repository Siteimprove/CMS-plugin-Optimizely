using EPiServer.Core;
using Microsoft.AspNetCore.Mvc;
using SiteImprove.Optimizely.Plugin.Controllers;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Models;
using SiteImprove.Optimizely.Plugin.Repositories;
using Xunit;
using Microsoft.AspNetCore.Http;
using SiteImprove.Optimizely.Plugin.Services;

public class AdminTests
{
    [Fact]
    public async Task TokenRotationPreservesConfiguration()
    {
        var repo = new MemorySettings();
        var controller = Controller(repo);
        Assert.IsType<RedirectToActionResult>(await controller.RotateToken());
        Assert.Equal("new-token", repo.Settings.Token);
        Assert.True(repo.Settings.Recheck);
        Assert.Equal("key", repo.Settings.ApiKey);
        Assert.Equal("user", repo.Settings.ApiUser);
        Assert.Equal("https://public.example", repo.Settings.UrlMap["https://cms.example"]);
    }

    [Fact]
    public async Task FailedTokenRotationDoesNotWriteSettings()
    {
        var repo = new MemorySettings();
        var controller = Controller(repo, new Api { Token = "" });
        var redirect = Assert.IsType<RedirectToActionResult>(await controller.RotateToken());
        Assert.Equal(ContentCheckStatus.Unavailable, redirect.RouteValues["operationError"]);
        Assert.Equal("old-token", repo.Settings.Token);
        Assert.Equal(0, repo.Writes);
    }

    [Fact]
    public async Task TokenRotationKeepsSettingsChangedWhileTheRequestIsPending()
    {
        var repo = new MemorySettings();
        var token = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        var controller = Controller(repo, new Api { PendingToken = token.Task });
        var rotation = controller.RotateToken();
        repo.Settings.UrlMap["https://cms.example"] = "https://updated.example";
        repo.Settings.ApiKey = "replacement";
        token.SetResult("new-token");
        await rotation;
        Assert.Equal("replacement", repo.Settings.ApiKey);
        Assert.Equal("https://updated.example", repo.Settings.UrlMap["https://cms.example"]);
    }

    [Fact]
    public void SavingBlankApiKeyPreservesExistingCredential()
    {
        var repo = new MemorySettings();
        var controller = Controller(repo);
        controller.Save(true, "user", "", repo.Settings.UrlMap.ToArray());
        Assert.Equal("key", repo.Settings.ApiKey);
        Assert.Single(repo.Settings.UrlMap);
    }

    [Fact]
    public void SavingWithoutMappingsDoesNotThrow()
    {
        var repo = new MemorySettings();
        Controller(repo).Save(false, "user", "replacement", null);
        Assert.Empty(repo.Settings.UrlMap);
        Assert.Equal("replacement", repo.Settings.ApiKey);
    }

    private static SiteimproveAdminController Controller(MemorySettings repo, Api api = null) =>
        new(repo, new Helper(), null, api ?? new Api())
        { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() } };

    private class Api : ISiteimproveApiClient
    {
        public string Token = "new-token";
        public Task<string> PendingToken;
        public Task<string> RequestTokenAsync(string version, System.Threading.CancellationToken ct) => PendingToken ?? Task.FromResult(Token);
        public Task<ContentCheckStatus> GetPrepublishStatusAsync(string user, string key, System.Threading.CancellationToken ct) => Task.FromResult(ContentCheckStatus.Enabled);
        public Task<ContentCheckStatus> EnablePrepublishCheckAsync(string user, string key, System.Threading.CancellationToken ct) => Task.FromResult(ContentCheckStatus.Enabled);
        public Task<bool> RecheckAsync(string url, string token, System.Threading.CancellationToken ct) => Task.FromResult(true);
    }

    private class MemorySettings : ISettingsRepository
    {
        public Settings Settings = new() { Token = "old-token", Recheck = true, LatestUI = true,
            ApiUser = "user", ApiKey = "key", UrlMap = new() { ["https://cms.example"] = "https://public.example" } };
        public int Writes;
        public string GetToken() => Settings.Token;
        public Settings GetSetting() => Settings;
        public void SetToken(string token) => SaveToken(token, Settings.Recheck, Settings.LatestUI, Settings.ApiUser, Settings.ApiKey, Settings.UrlMap);
        public void SaveToken(string token, bool recheck = false, bool latestUI = true, string apiUser = null,
            string apiKey = null, Dictionary<string, string> urlMap = null)
        {
            Writes++;
            Settings = new() { Token = token, Recheck = recheck, LatestUI = latestUI, ApiUser = apiUser, ApiKey = apiKey, UrlMap = urlMap };
        }
    }
    private class Helper : ISiteimproveHelper
    {
        public string GetOptimizelyVersion() => "13.0.0";
        public string GetSiteimprovePluginVersion() => "5.0.0";
        public string GetExternalUrl(PageData page) => null;
        public string GetPreviewUrl(PageData page) => null;
    }
}
