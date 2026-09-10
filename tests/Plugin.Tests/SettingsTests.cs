using EPiServer.Data;
using EPiServer.Data.Dynamic;
using EPiServer.Framework.Modules;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Newtonsoft.Json;
using SiteImprove.Optimizely.Plugin.Controllers;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Models;
using SiteImprove.Optimizely.Plugin.Repositories;
using Xunit;

namespace Plugin.Tests;

public class SettingsTests : ServiceFixture
{
    private Settings stored;
    private readonly Mock<ISiteimproveHelper> helper = new();
    private readonly SettingsRepository repository;

    public SettingsTests()
    {
        var store = new Mock<DynamicDataStore>(MockBehavior.Strict, (StoreDefinition)null);
        store.Setup(x => x.LoadAll<Settings>()).Returns(() => stored == null ? Array.Empty<Settings>() : new[] { Clone(stored) });
        store.Setup(x => x.Save(It.IsAny<object>())).Returns((object value) => Save(value));
        store.Setup(x => x.Save(It.IsAny<object>(), It.IsAny<Identity>())).Returns((object value, Identity id) => Save(value));
        repository = new SettingsRepository(() => store.Object);
        Services.AddSingleton(helper.Object);
        UseServices();
        helper.Setup(x => x.RequestToken()).Returns("new-token");
    }

    private Identity Save(object value)
    {
        stored = Clone((Settings)value);
        stored.Id ??= Identity.NewIdentity();
        return stored.Id;
    }

    private static Settings Clone(Settings settings) => JsonConvert.DeserializeObject<Settings>(JsonConvert.SerializeObject(settings));
    private static Dictionary<string, string> Mapping() => new() { ["https://cms.example"] = "https://public.example" };

    [Fact]
    public void First_save_and_reload_preserve_all_configuration_including_url_mappings()
    {
        repository.SaveToken("token", true, false, "fixture-user", "fixture-key", Mapping());
        AssertConfiguration(repository.GetSetting(), "token");
    }

    [Fact]
    public void Updating_settings_changes_the_existing_record_and_preserves_mapping()
    {
        repository.SaveToken("old-token");
        var id = stored.Id;
        repository.SaveToken("token", true, false, "fixture-user", "fixture-key", Mapping());
        AssertConfiguration(repository.GetSetting(), "token");
        Assert.Equal(id, stored.Id);
    }

    [Fact]
    public void Existing_token_is_reused_without_contacting_the_token_service()
    {
        repository.SaveToken("existing-token");
        Assert.Equal("existing-token", repository.GetToken());
        Assert.Equal("existing-token", repository.GetToken());
        helper.Verify(x => x.RequestToken(), Times.Never);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Automatically_creating_a_missing_token_preserves_existing_configuration(bool getSetting)
    {
        stored = new Settings { Token = "", Recheck = true, LatestUI = false, ApiUser = "fixture-user", ApiKey = "fixture-key", UrlMap = Mapping() };
        if (getSetting) repository.GetSetting();
        else repository.GetToken();
        AssertConfiguration(repository.GetSetting(), "new-token");
        helper.Verify(x => x.RequestToken(), Times.Once);
    }

    [Theory]
    [InlineData("new-token")]
    [InlineData("")]
    public void Manual_token_renewal_preserves_settings_and_keeps_a_working_token_on_failure(string response)
    {
        stored = new Settings { Token = "existing-token", Recheck = true, LatestUI = false, ApiUser = "fixture-user", ApiKey = "fixture-key", UrlMap = Mapping() };
        helper.Setup(x => x.RequestToken()).Returns(response);
        new SiteimproveAdminController(repository, helper.Object, Mock.Of<IModuleResourceResolver>()).Index(newToken: true);
        AssertConfiguration(repository.GetSetting(), string.IsNullOrEmpty(response) ? "existing-token" : response);
    }

    private static void AssertConfiguration(Settings value, string token)
    {
        Assert.Equal(token, value.Token);
        Assert.True(value.Recheck);
        Assert.False(value.LatestUI);
        Assert.Equal("fixture-user", value.ApiUser);
        Assert.Equal("fixture-key", value.ApiKey);
        Assert.NotNull(value.UrlMap);
        Assert.Equal("https://public.example", value.UrlMap["https://cms.example"]);
    }

    [Fact]
    public void Unavailable_token_service_does_not_save_an_empty_first_record()
    {
        helper.Setup(x => x.RequestToken()).Returns("");
        var settings = repository.GetSetting();
        Assert.NotNull(settings);
        Assert.True(settings.LatestUI);
        Assert.True(string.IsNullOrEmpty(settings.Token));
        Assert.Null(stored);
    }

    [Fact]
    public void Concurrent_first_token_requests_generate_and_store_one_token()
    {
        var tokens = new string[10];
        Parallel.For(0, tokens.Length, i => tokens[i] = repository.GetToken());
        Assert.All(tokens, token => Assert.Equal("new-token", token));
        helper.Verify(x => x.RequestToken(), Times.Once);
    }
}
