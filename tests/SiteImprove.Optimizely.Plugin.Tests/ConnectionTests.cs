using Microsoft.Extensions.DependencyInjection;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Repositories;
using SiteImprove.Optimizely.Plugin.Services;
using Xunit;

public class ConnectionTests
{
    [Fact]
    public async Task ExistingConnectionsDoNotContactSiteimprove()
    {
        using var setup = new Setup("existing-token");
        Assert.Equal("existing-token", await setup.Connection.GetTokenAsync(default));
        Assert.Equal(0, setup.Api.Calls);
        Assert.Equal(0, setup.Repo.Writes);
    }

    [Fact]
    public async Task ConcurrentFirstRequestsShareOneConnectionAndPreserveSettingsChanges()
    {
        using var setup = new Setup(null);
        var pending = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        setup.Api.Send = _ => pending.Task;
        var first = setup.Connection.GetTokenAsync(default);
        var second = setup.Connection.GetTokenAsync(default);
        setup.Repo.SaveSettings(new() { ["https://cms.example"] = "https://updated.example" });
        pending.SetResult("new-token");
        Assert.All(await Task.WhenAll(first, second), token => Assert.Equal("new-token", token));
        Assert.Equal(1, setup.Api.Calls);
        Assert.False(setup.Repo.Current.Recheck);
        Assert.Equal("https://updated.example", setup.Repo.Current.UrlMap["https://cms.example"]);
    }

    [Fact]
    public async Task OutagesAreThrottledAndRecoverWithoutAnAdministrator()
    {
        using var setup = new Setup(null);
        setup.Api.Send = _ => Task.FromResult<string>(null);
        Assert.Null(await setup.Connection.GetTokenAsync(default));
        Assert.Null(await setup.Connection.GetTokenAsync(default));
        Assert.Equal(1, setup.Api.Calls);
        Assert.Equal(0, setup.Repo.Writes);
        setup.Clock.Now = setup.Clock.Now.AddMinutes(1);
        setup.Api.Send = _ => Task.FromResult("recovered-token");
        Assert.Equal("recovered-token", await setup.Connection.GetTokenAsync(default));
        Assert.Equal(2, setup.Api.Calls);
    }

    [Fact]
    public async Task CancellationReleasesTheConnectionGate()
    {
        using var setup = new Setup(null);
        setup.Api.Send = async ct => { await Task.Delay(Timeout.Infinite, ct); return null; };
        using var cancelled = new CancellationTokenSource();
        var first = setup.Connection.GetTokenAsync(cancelled.Token);
        cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first);
        setup.Api.Send = _ => Task.FromResult("new-token");
        Assert.Equal("new-token", await setup.Connection.GetTokenAsync(default).WaitAsync(TimeSpan.FromSeconds(5)));
    }

    private sealed class Setup : IDisposable
    {
        private readonly ServiceProvider _services;
        public AdminTests.StoredSettings Repo = new();
        public Api Api = new();
        public Clock Clock = new();
        public SiteimproveConnection Connection;
        public Setup(string token)
        {
            Repo.Current.Token = token;
            _services = new ServiceCollection().AddSingleton<ISettingsRepository>(Repo)
                .AddSingleton<ISiteimproveApiClient>(Api).AddSingleton<ISiteimproveHelper>(new AdminTests.Helper()).BuildServiceProvider();
            Connection = new(_services.GetRequiredService<IServiceScopeFactory>(), Clock);
        }
        public void Dispose() => _services.Dispose();
    }
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private sealed class Api : ISiteimproveApiClient
    {
        public int Calls;
        public Func<CancellationToken, Task<string>> Send = _ => Task.FromResult("new-token");
        public Task<string> RequestTokenAsync(string version, CancellationToken ct) { Interlocked.Increment(ref Calls); return Send(ct); }
    }
}
