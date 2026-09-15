using System;
using System.Collections.Generic;
using EPiServer.Framework.Modules;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Models;
using SiteImprove.Optimizely.Plugin.Repositories;

namespace SiteImprove.Optimizely.Plugin.Controllers
{
    [Authorize(Policy = Constants.SiteImproveAuthorizationPolicy)]
    public class SiteimproveAdminController : Controller
    {
        private readonly ISettingsRepository _settingsRepo;
        private readonly ISiteimproveHelper _siteimproveHelper;
        private readonly IModuleResourceResolver _moduleResourceResolver;

        public SiteimproveAdminController(ISettingsRepository settingsRepo, ISiteimproveHelper siteimproveHelper, IModuleResourceResolver moduleResourceResolver)
        {
            _settingsRepo = settingsRepo;
            _siteimproveHelper = siteimproveHelper;
            _moduleResourceResolver = moduleResourceResolver;
            Title = "SiteImprove";
        }

        [ViewData]
        public string Title { get; set; }

        public ActionResult Index(bool newToken = false, bool prepublishError = false)
        {
            var settings = _settingsRepo.GetSetting();
            if (newToken)
            {
                var token = _siteimproveHelper.RequestToken();
                if (!string.IsNullOrWhiteSpace(token))
                {
                    settings.Token = token;
                    _settingsRepo.SaveToken(settings.Token, settings.Recheck, settings.LatestUI, settings.ApiUser, settings.ApiKey, settings.UrlMap);
                }
            }

            var vm = new SettingsViewModel()
            {
                Token = settings.Token,
                Recheck = settings.Recheck,
                LatestUI = settings.LatestUI,
                ApiUser = settings.ApiUser,
                ApiKey = settings.ApiKey,
                PrepublishCheckEnabled = _siteimproveHelper.GetPrepublishCheckEnabled(settings.ApiUser, settings.ApiKey),
                PrepublishError = prepublishError,
                UrlMap = settings.UrlMap,
                PluginVersion = _siteimproveHelper.GetSiteimprovePluginVersion(),
                PluginUrl = _moduleResourceResolver.ResolvePath(Constants.SiteImproveModuleName, "SiteimproveAdmin"),
            };

            return View(vm);
        }

        [HttpPost]
        public ActionResult Save(bool recheck, bool latestUI, string apiUser, string apiKey, IEnumerable<KeyValuePair<string, string>> urlMap)
        {
            var settings = this._settingsRepo.GetSetting();
            settings.Recheck = recheck;
            settings.LatestUI = latestUI;
            settings.ApiUser = apiUser;
            settings.ApiKey = apiKey;

            settings.UrlMap = new Dictionary<string, string>();
            foreach (var pair in urlMap ?? Array.Empty<KeyValuePair<string, string>>())
            {
                if (IsWebUrl(pair.Key) && IsWebUrl(pair.Value))
                {
                    settings.UrlMap.TryAdd(pair.Key, pair.Value);
                }
            }

            _settingsRepo.SaveToken(settings.Token, settings.Recheck, settings.LatestUI, settings.ApiUser, settings.ApiKey, settings.UrlMap);

            return Redirect(_moduleResourceResolver.ResolvePath(Constants.SiteImproveModuleName, "SiteimproveAdmin"));
        }

        private static bool IsWebUrl(string value)
        {
            return Uri.TryCreate(value, UriKind.Absolute, out Uri uri)
                && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
        }

        [HttpPost]
        public ActionResult EnablePrepublishCheck(bool enablePrepublishCheck = false)
        {
            var settings = _settingsRepo.GetSetting();
            var success = true;

            if (enablePrepublishCheck)
            {
                success = _siteimproveHelper.EnablePrepublishCheck(settings.ApiUser, settings.ApiKey);
            }

            if (!success)
            {
                return Redirect(_moduleResourceResolver.ResolvePath(Constants.SiteImproveModuleName, "SiteimproveAdmin") + "?prepublishError=true");
            }

            return Redirect(_moduleResourceResolver.ResolvePath(Constants.SiteImproveModuleName, "SiteimproveAdmin"));
        }
    }
}
