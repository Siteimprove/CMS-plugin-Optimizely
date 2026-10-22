using System;
using System.Collections.Generic;
using System.Linq;
using EPiServer.Framework.Modules;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Models;
using SiteImprove.Optimizely.Plugin.Repositories;

namespace SiteImprove.Optimizely.Plugin.Controllers;

[Authorize(Policy = Constants.SiteImproveAuthorizationPolicy)]
[AutoValidateAntiforgeryToken]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class SiteimproveAdminController(ISettingsRepository settingsRepo, ISiteimproveHelper helper,
    IModuleResourceResolver resources) : Controller
{
    [ViewData]
    public string Title { get; set; } = "Siteimprove";

    [HttpGet]
    public ActionResult Index(bool saved = false)
    {
        var settings = settingsRepo.GetSetting();
        return SettingsView(new SettingsViewModel
        {
            Recheck = settings.Recheck,
            Saved = saved,
            UrlMap = settings.UrlMap?.Select(pair => new UrlMapping { Key = pair.Key, Value = pair.Value }).ToList()
                ?? new List<UrlMapping>()
        });
    }

    [HttpPost]
    public ActionResult Save(bool recheck, List<UrlMapping> urlMap)
    {
        var rows = urlMap ?? new List<UrlMapping>();
        var mappings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < rows.Count; i++)
        {
            var row = rows[i];
            if (string.IsNullOrWhiteSpace(row.Key) && string.IsNullOrWhiteSpace(row.Value)) continue;
            var validSource = TryOrigin(row.Key, out var source);
            var validTarget = TryOrigin(row.Value, out var target);
            if (!validSource) ModelState.AddModelError($"urlMap[{i}].Key", "Enter a CMS origin such as https://cms.example.com, without a path, query or sign-in details.");
            if (!validTarget) ModelState.AddModelError($"urlMap[{i}].Value", "Enter a public origin such as https://www.example.com, without a path, query or sign-in details.");
            if (validSource && validTarget && !mappings.TryAdd(source, target))
                ModelState.AddModelError($"urlMap[{i}].Key", "Each CMS origin can have only one public origin.");
        }
        if (!ModelState.IsValid) return SettingsView(new SettingsViewModel { Recheck = recheck, UrlMap = rows });
        settingsRepo.SaveSettings(recheck, mappings);
        return RedirectToAction(nameof(Index), new { saved = true });
    }

    private ActionResult SettingsView(SettingsViewModel model)
    {
        model.PluginVersion = helper.GetSiteimprovePluginVersion();
        model.PluginUrl = resources.ResolvePath(Constants.SiteImproveModuleName, "SiteimproveAdmin");
        return View("Index", model);
    }

    private static bool TryOrigin(string value, out string origin)
    {
        origin = null;
        if (!Uri.TryCreate(value?.Trim(), UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp) ||
            string.IsNullOrEmpty(uri.Host) || !string.IsNullOrEmpty(uri.UserInfo) ||
            uri.AbsolutePath != "/" || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment)) return false;
        origin = uri.GetLeftPart(UriPartial.Authority);
        return true;
    }
}
