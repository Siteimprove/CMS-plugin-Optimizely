using EPiServer.Hosting;

namespace CmsHost;

public class Program
{
    public static async Task Main(string[] args)
    {
        if (args is ["--verify-package", var version])
        {
            var assembly = typeof(SiteImprove.Optimizely.Plugin.Helper.SiteimproveHelper).Assembly;
            var expected = new Version(version.Split('-')[0]);
            if (assembly.GetName().Version?.ToString(3) != expected.ToString(3))
                throw new InvalidOperationException("Candidate assembly version does not match the package.");
            var info = System.Reflection.CustomAttributeExtensions.GetCustomAttribute<System.Reflection.AssemblyInformationalVersionAttribute>(assembly)?.InformationalVersion;
            if (info != version && !(info?.StartsWith(version + "+", StringComparison.Ordinal) ?? false))
                throw new InvalidOperationException("Candidate informational version does not match the package.");
            Console.WriteLine("Candidate assembly versions match the package.");
            return;
        }
        using var host = Host.CreateDefaultBuilder(args)
            .ConfigureCmsDefaults()
            .ConfigureWebHostDefaults(web => web.UseStartup<Startup>().UseUrls("http://localhost:5000"))
            .Build();
        await host.StartAsync();
        await Seed.RunAsync(host.Services);
        await host.WaitForShutdownAsync();
    }
}
