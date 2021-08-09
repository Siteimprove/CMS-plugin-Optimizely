﻿using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SiteImprove.Optimizely.Plugin.Models;
using SiteImprove.Optimizely.Plugin.Repositories;

namespace SiteImprove.Optimizely.Plugin.Controllers
{
    [Authorize(Policy = Constants.SiteImproveAuthorizationPolicy)]
    public class SiteimproveAdminController : Controller
    {
        private readonly ISettingsRepository _settingsRepo;
        private readonly ISiteimproveHelper _siteimproveHelper;

        public SiteimproveAdminController(ISettingsRepository settingsRepo, ISiteimproveHelper siteimproveHelper)
        {
            _settingsRepo = settingsRepo;
            _siteimproveHelper = siteimproveHelper;
            Title = "SiteImprove";
        }

        [ViewData]
        public string Title { get; set; }

        public ActionResult Index(bool newToken = false)
        {
            var settings = _settingsRepo.GetSetting();
            if (newToken)
            {
                settings.Token = _siteimproveHelper.RequestToken();
                _settingsRepo.SaveToken(settings.Token, settings.NoRecheck, settings.ApiUser, settings.ApiKey);
            }

            var vm = new SettingsViewModel()
            {
                Token = settings.Token,
                NoRecheck = settings.NoRecheck,
                ApiUser = settings.ApiUser,
                ApiKey = settings.ApiKey,
                PrepublishCheckEnabled = _siteimproveHelper.GetPrepublishCheckEnabled(settings.ApiUser, settings.ApiKey)
            };

            return View(vm);
        }

        [HttpPost]
        public ActionResult Save(bool noRecheck, string apiUser, string apiKey)
        {
            var settings = this._settingsRepo.GetSetting();
            settings.NoRecheck = noRecheck;
            settings.ApiUser = apiUser;
            settings.ApiKey = apiKey;

            _settingsRepo.SaveToken(settings.Token, settings.NoRecheck, settings.ApiUser, settings.ApiKey);

            return RedirectToAction("Index");
        }

        [HttpPost]
        public ActionResult EnablePrepublishCheck(bool enablePrepublishCheck = false)
        {
            var settings = _settingsRepo.GetSetting();

            if (enablePrepublishCheck)
            {
                _siteimproveHelper.EnablePrepublishCheck(settings.ApiUser, settings.ApiKey);
            }

            return RedirectToAction("Index");
        }
    }
}
