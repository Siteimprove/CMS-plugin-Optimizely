using System.Globalization;
using EPiServer;
using EPiServer.Core;
using EPiServer.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Repositories;

namespace SiteImprove.Optimizely.Plugin.Controllers
{
    [Authorize(Policy = Constants.SiteImproveEditorPolicy)]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public class SiteimproveController : Controller
    {
        private readonly ISettingsRepository _settingsRepo;
        private readonly ISiteimproveHelper _siteimproveHelper;
        private readonly IContentLoader _contentLoader;
        private readonly IContentAccessEvaluator _accessEvaluator;
        private readonly IAuthorizationService _authorization;

        public SiteimproveController(ISettingsRepository settingsRepo, ISiteimproveHelper siteimproveHelper,
            IContentLoader contentLoader, IContentAccessEvaluator accessEvaluator, IAuthorizationService authorization)
        {
            _settingsRepo = settingsRepo;
            _siteimproveHelper = siteimproveHelper;
            _contentLoader = contentLoader;
            _accessEvaluator = accessEvaluator;
            _authorization = authorization;
        }

        [HttpGet]
        [AllowAnonymous]
        public async System.Threading.Tasks.Task<ActionResult> IsAuthorized()
        {
            var result = await _authorization.AuthorizeAsync(User, null, Constants.SiteImproveEditorPolicy);
            return result.Succeeded ? Json(true) : StatusCode(403);
        }

        [HttpGet]
        public JsonResult Token() => Json(_settingsRepo.GetToken());

        [HttpGet]
        public ActionResult PageUrl(string contentId, string locale)
        {
            if (!ContentReference.TryParse(contentId, out var reference) || ContentReference.IsNullOrEmpty(reference))
                return BadRequest(new { status = "invalid-content" });
            if (string.IsNullOrWhiteSpace(locale))
                return BadRequest(new { status = "invalid-language" });
            try { CultureInfo.GetCultureInfo(locale); }
            catch (CultureNotFoundException) { return BadRequest(new { status = "invalid-language" }); }

            if (!_contentLoader.TryGet<IContent>(reference, new LanguageSelector(locale), out var content))
                return NotFound(new { status = "content-not-found" });
            if (!_accessEvaluator.HasAccess(content, User, AccessLevel.Read)) return StatusCode(403);
            if (content is not PageData page)
                return Json(new { url = (string)null, isDomain = false, status = "no-page-context" });

            var url = _siteimproveHelper.GetExternalUrl(page);
            return Json(new { url, isDomain = false, status = url == null ? "no-public-url" : "ready" });
        }
    }
}
