using System.Reflection;
using EPiServer;
using EPiServer.Core;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Models;
using SiteImprove.Optimizely.Plugin.Repositories;
using SiteImprove.Optimizely.Plugin.Services;
using Xunit;

public class RecheckQueueTests
{
    [Fact]
    public void FullQueueDoesNotWaitAndDuplicatePendingPagesAreCoalesced()
    {
        using var setup = new Setup(capacity: 1);
        Assert.True(setup.Queue.TryEnqueue(new ContentReference(1), "en"));
        Assert.True(setup.Queue.TryEnqueue(new ContentReference(1), "en"));
        Assert.False(setup.Queue.TryEnqueue(new ContentReference(2), "en"));
        Assert.False(setup.Queue.TryEnqueue(null, "en"));
    }

    [Fact]
    public async Task FailedRequestsAreRetriedUpToTheLimit()
    {
        using var setup = new Setup();
        var third = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        setup.Api.Send = (_, _) => {
            if (setup.Api.Calls == 3) third.TrySetResult();
            return Task.FromResult(false);
        };
        setup.Queue.TryEnqueue(new ContentReference(1), "en");
        await setup.Queue.StartAsync(default);
        await third.Task.WaitAsync(TimeSpan.FromSeconds(5));
        await setup.Queue.StopAsync(default);
        Assert.Equal(3, setup.Api.Calls);
    }

    [Fact]
    public async Task EnqueueDoesNotWaitForTheRemoteApiAndNewPublicationsAreNotLost()
    {
        using var setup = new Setup();
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var second = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        setup.Api.Send = (_, ct) => {
            if (setup.Api.Calls == 1) { entered.TrySetResult(); return release.Task.WaitAsync(ct); }
            second.TrySetResult(); return Task.FromResult(true);
        };
        setup.Queue.TryEnqueue(new ContentReference(1), "en");
        await setup.Queue.StartAsync(default);
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.True(setup.Queue.TryEnqueue(new ContentReference(1), "en"));
        release.SetResult(true);
        await second.Task.WaitAsync(TimeSpan.FromSeconds(5));
        await setup.Queue.StopAsync(default);
        Assert.Equal(2, setup.Api.Calls);
    }

    [Theory]
    [InlineData(false, "token")]
    [InlineData(true, "")]
    public async Task DisabledOrDisconnectedSettingsDoNotSendRequests(bool recheck, string token)
    {
        using var setup = new Setup();
        setup.Repo.Settings.Recheck = recheck;
        setup.Repo.Settings.Token = token;
        setup.Queue.TryEnqueue(new ContentReference(1), "en");
        await setup.Queue.StartAsync(default);
        await setup.Repo.Read.Task.WaitAsync(TimeSpan.FromSeconds(5));
        await setup.Queue.StopAsync(default);
        Assert.Equal(0, setup.Api.Calls);
    }

    private class Setup : IDisposable
    {
        private readonly ServiceProvider _provider;
        public Repo Repo { get; } = new();
        public Api Api { get; } = new();
        public SiteimproveRecheckQueue Queue { get; }
        public Setup(int capacity = 10)
        {
            var loader = DispatchProxy.Create<IContentLoader, LoaderProxy>();
            var page = new PageData();
            page.Property.Add("PageLink", new PropertyContentReference(1));
            page.Property.Add("PageStartPublish", new PropertyDate(DateTime.UtcNow.AddHours(-1)));
            page.Property.Add("PageStopPublish", new PropertyDate());
            page.Property.Add("PagePendingPublish", new PropertyBoolean(false));
            page.Property.Add("PageWorkStatus", new PropertyNumber((int)VersionStatus.Published));
            ((LoaderProxy)(object)loader).Page = page;
            _provider = new ServiceCollection().AddSingleton<ISettingsRepository>(Repo).AddSingleton<ISiteimproveApiClient>(Api)
                .AddSingleton<ISiteimproveConnection>(new Connection(Repo)).AddSingleton<ISiteimproveHelper>(new Helper()).AddSingleton(loader).BuildServiceProvider();
            Queue = new(_provider.GetRequiredService<IServiceScopeFactory>(), Options.Create(new RecheckQueueOptions
            { Capacity = capacity, MaxAttempts = 3, RetryDelay = TimeSpan.Zero }), NullLogger<SiteimproveRecheckQueue>.Instance);
        }
        public void Dispose() { Queue.Dispose(); _provider.Dispose(); }
    }
    public class LoaderProxy : DispatchProxy
    {
        public PageData Page;
        protected override object Invoke(MethodInfo method, object[] args)
        {
            if (method.Name == "TryGet") { args[^1] = Page; return true; }
            throw new NotSupportedException(method.Name);
        }
    }
    private class Repo : ISettingsRepository
    {
        public void SaveSettings(bool recheck, Dictionary<string, string> urlMap) => throw new NotSupportedException();
        public Settings Settings = new() { Token = "token", Recheck = true, LatestUI = true };
        public TaskCompletionSource Read = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public Settings GetSetting() { Read.TrySetResult(); return Settings; }
        public string GetToken() => Settings.Token;
        public void SetToken(string token) => Settings.Token = token;
    }
    private class Connection(Repo repo) : ISiteimproveConnection
    {
        public Task<string> GetTokenAsync(CancellationToken ct) => Task.FromResult(repo.GetToken());
    }
    private class Api : ISiteimproveApiClient
    {
        public int Calls;
        public Func<string, CancellationToken, Task<bool>> Send;
        public Task<bool> RecheckAsync(string url, string token, CancellationToken ct) { Interlocked.Increment(ref Calls); return Send(url, ct); }
        public Task<string> RequestTokenAsync(string version, CancellationToken ct) => throw new NotSupportedException();
    }
    private class Helper : ISiteimproveHelper
    {
        public string GetExternalUrl(PageData page) => "https://public.example/page";
        public string GetPreviewUrl(PageData page) => null;
        public string GetOptimizelyVersion() => "13.0.0";
        public string GetSiteimprovePluginVersion() => "5.0.0-alpha.8";
    }
}
