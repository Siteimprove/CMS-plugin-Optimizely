using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using SiteImprove.Optimizely.Plugin.Services;
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
        private readonly ISiteimproveApiClient _api;

        public SiteimproveAdminController(ISettingsRepository settingsRepo, ISiteimproveHelper siteimproveHelper, IModuleResourceResolver moduleResourceResolver, ISiteimproveApiClient api)
        {
            _settingsRepo = settingsRepo;
            _siteimproveHelper = siteimproveHelper;
            _moduleResourceResolver = moduleResourceResolver;
            _api = api;
            Title = "SiteImprove";
        }

        [ViewData]
        public string Title { get; set; }

        [HttpGet]
        public async Task<ActionResult> Index(ContentCheckStatus? operationError = null)
        {
            var settings = _settingsRepo.GetSetting();

            var vm = new SettingsViewModel()
            {
                Token = settings.Token,
                Recheck = settings.Recheck,
                LatestUI = settings.LatestUI,
                ApiUser = settings.ApiUser,
                ApiKey = null,
                PrepublishStatus = await _api.GetPrepublishStatusAsync(settings.ApiUser, settings.ApiKey, HttpContext.RequestAborted),
                OperationError = operationError,
                UrlMap = settings.UrlMap,
                PluginVersion = _siteimproveHelper.GetSiteimprovePluginVersion(),
                PluginUrl = _moduleResourceResolver.ResolvePath(Constants.SiteImproveModuleName, "SiteimproveAdmin"),
            };

            return View(vm);
        }

        [HttpPost]
        public async Task<ActionResult> RotateToken()
        {
            var token = await _api.RequestTokenAsync(_siteimproveHelper.GetOptimizelyVersion(), HttpContext.RequestAborted);
            if (string.IsNullOrWhiteSpace(token))
                return RedirectToAction(nameof(Index), new { operationError = ContentCheckStatus.Unavailable });
            _settingsRepo.SetToken(token);
            return RedirectToAction(nameof(Index));
        }

        [HttpPost]
        public ActionResult Save(bool recheck, string apiUser, string apiKey, IEnumerable<KeyValuePair<string, string>> urlMap)
        {
            var mappings = new Dictionary<string, string>();
            foreach (var pair in urlMap ?? Array.Empty<KeyValuePair<string, string>>())
            {
                if (Uri.TryCreate(pair.Key, UriKind.Absolute, out Uri _) &&
                    Uri.TryCreate(pair.Value, UriKind.Absolute, out Uri _))
                {
                    mappings.TryAdd(pair.Key, pair.Value);
                }
            }

            _settingsRepo.SaveSettings(recheck, apiUser, apiKey, mappings);

            return RedirectToAction("Index");
        }

        [HttpPost]
        public async Task<ActionResult> EnablePrepublishCheck(bool enablePrepublishCheck = false)
        {
            if (!enablePrepublishCheck) return RedirectToAction(nameof(Index));
            var settings = _settingsRepo.GetSetting();
            var result = await _api.EnablePrepublishCheckAsync(settings.ApiUser, settings.ApiKey, HttpContext.RequestAborted);
            return result == ContentCheckStatus.Enabled ? RedirectToAction(nameof(Index))
                : RedirectToAction(nameof(Index), new { operationError = result });
        }
    }
}
