using System.Net;
using System.Security.Claims;
using System.Text.Encodings.Web;
using EPiServer.Framework.Initialization;
using EPiServer.Framework.Modules;
using EPiServer.ServiceLocation;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using SiteImprove.Optimizely.Plugin.Controllers;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Infrastructure;
using SiteImprove.Optimizely.Plugin.Models;
using SiteImprove.Optimizely.Plugin.Repositories;
using Xunit;

namespace Plugin.Tests;

public class AuthorizationTests
{
    private static TestServer Server()
    {
        return new TestServer(new WebHostBuilder().ConfigureServices(services => {
            services.AddLogging();
            services.AddRouting();
            services.AddAuthentication("Fixture").AddScheme<AuthenticationSchemeOptions, FixtureAuthentication>("Fixture", _ => { });
            // Use the production policy registration, controller attributes and middleware.
            new InitializationModule().ConfigureContainer(new ServiceConfigurationContext(HostType.WebApplication, services));
            services.AddControllersWithViews().AddApplicationPart(typeof(SiteimproveController).Assembly);
            var settings = new Mock<ISettingsRepository>();
            settings.Setup(x => x.GetToken()).Returns("fixture-token");
            settings.Setup(x => x.GetSetting()).Returns(new Settings { Token = "fixture-token" });
            services.AddSingleton(settings.Object);
            services.AddSingleton(Mock.Of<ISiteimproveHelper>());
            services.AddSingleton(Mock.Of<IModuleResourceResolver>());
        }).Configure(app => {
            app.UseRouting();
            app.UseAuthentication();
            app.UseAuthorization();
            app.UseEndpoints(endpoints => endpoints.MapControllerRoute("default", "{controller}/{action}"));
        }));
    }

    [Theory]
    [InlineData("Administrators")]
    [InlineData("WebAdmins")]
    [InlineData("CmsAdmins")]
    [InlineData("SiteimproveAdmins")]
    public async Task Configured_roles_can_access_the_plugin(string role)
    {
        using var server = Server();
        using var client = server.CreateClient();
        client.DefaultRequestHeaders.Add("X-Fixture-Role", role);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/Siteimprove/Token")).StatusCode);
        Assert.Equal("true", await client.GetStringAsync("/Siteimprove/IsAuthorized"));
        var save = await client.PostAsync("/SiteimproveAdmin/Save", new FormUrlEncodedContent(new Dictionary<string, string> {
            ["urlMap[0].Key"] = "https://cms.example", ["urlMap[0].Value"] = "https://public.example"
        }));
        Assert.Equal(HttpStatusCode.Redirect, save.StatusCode);
    }

    [Theory]
    [InlineData(null, HttpStatusCode.Unauthorized)]
    [InlineData("Editors", HttpStatusCode.Forbidden)]
    public async Task Anonymous_and_unauthorized_users_cannot_read_or_change_protected_settings(string role, HttpStatusCode expected)
    {
        using var server = Server();
        using var client = server.CreateClient();
        if (role != null) client.DefaultRequestHeaders.Add("X-Fixture-Role", role);
        foreach (var path in new[] { "/Siteimprove/Token", "/Siteimprove/PageUrl?contentId=42&locale=en", "/SiteimproveAdmin/Index" })
            Assert.Equal(expected, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(expected, (await client.PostAsync("/SiteimproveAdmin/Save", new FormUrlEncodedContent(new Dictionary<string, string>()))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/Siteimprove/IsAuthorized")).StatusCode);
    }

    private sealed class FixtureAuthentication : AuthenticationHandler<AuthenticationSchemeOptions>
    {
#if NET6_0
        public FixtureAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, ISystemClock clock)
            : base(options, logger, encoder, clock) { }
#else
        public FixtureAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
            : base(options, logger, encoder) { }
#endif

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Fixture-Role", out var role)) return Task.FromResult(AuthenticateResult.NoResult());
            var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.Name, "fixture-user"), new Claim(ClaimTypes.Role, role.ToString()) }, "Fixture");
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), "Fixture")));
        }
    }
}
