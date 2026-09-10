using EPiServer.ServiceLocation;
using Microsoft.Extensions.DependencyInjection;

namespace Plugin.Tests;

public abstract class ServiceFixture : IDisposable
{
    protected readonly ServiceCollection Services = new();
    private ServiceProvider provider;

    protected void UseServices()
    {
        provider?.Dispose();
        provider = Services.BuildServiceProvider();
        ServiceLocator.SetServiceProvider(provider);
    }

    public virtual void Dispose()
    {
        ServiceLocator.SetServiceProvider(new ServiceCollection().BuildServiceProvider());
        provider?.Dispose();
    }
}
