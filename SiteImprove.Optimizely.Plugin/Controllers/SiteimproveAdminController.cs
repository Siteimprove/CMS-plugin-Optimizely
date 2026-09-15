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
    [AutoValidateAntiforgeryToken]
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

        [HttpGet]
        public ActionResult Index(bool prepublishError = false)
        {
            var settings = _settingsRepo.GetSetting();

            var vm = new SettingsViewModel()
            {
                Token = settings.Token,
                Recheck = settings.Recheck,
                LatestUI = settings.LatestUI,
                ApiUser = settings.ApiUser,
                ApiKey = null,
                PrepublishCheckEnabled = _siteimproveHelper.GetPrepublishCheckEnabled(settings.ApiUser, settings.ApiKey),
                PrepublishError = prepublishError,
                UrlMap = settings.UrlMap,
                PluginVersion = _siteimproveHelper.GetSiteimprovePluginVersion(),
                PluginUrl = _moduleResourceResolver.ResolvePath(Constants.SiteImproveModuleName, "SiteimproveAdmin"),
            };

            return View(vm);
        }

        [HttpPost]
        public ActionResult RotateToken()
        {
            var settings = _settingsRepo.GetSetting();
            var token = _siteimproveHelper.RequestToken();
            if (string.IsNullOrWhiteSpace(token))
                return StatusCode(502, "Siteimprove could not issue a token. Existing settings have been retained.");
            _settingsRepo.SaveToken(token, settings.Recheck, settings.LatestUI,
                settings.ApiUser, settings.ApiKey, settings.UrlMap);
            return RedirectToAction(nameof(Index));
        }

        [HttpPost]
        public ActionResult Save(bool recheck, bool latestUI, string apiUser, string apiKey, IEnumerable<KeyValuePair<string, string>> urlMap)
        {
            var settings = this._settingsRepo.GetSetting();
            settings.Recheck = recheck;
            settings.LatestUI = latestUI;
            settings.ApiUser = apiUser;
            if (!string.IsNullOrWhiteSpace(apiKey)) settings.ApiKey = apiKey;

            settings.UrlMap = new Dictionary<string, string>();
            foreach (var pair in urlMap ?? Array.Empty<KeyValuePair<string, string>>())
            {
                if (Uri.TryCreate(pair.Key, UriKind.Absolute, out Uri _) &&
                    Uri.TryCreate(pair.Value, UriKind.Absolute, out Uri _))
                {
                    settings.UrlMap.TryAdd(pair.Key, pair.Value);
                }
            }

            _settingsRepo.SaveToken(settings.Token, settings.Recheck, settings.LatestUI, settings.ApiUser, settings.ApiKey, settings.UrlMap);

            return RedirectToAction("Index");
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
                return RedirectToAction("Index", new { prepublishError = true });
            }

            return RedirectToAction("Index");
        }
    }
}
