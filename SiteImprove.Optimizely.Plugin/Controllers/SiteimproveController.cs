using System.Linq;
using System.Net;
using System.Security.Principal;
using EPiServer;
using EPiServer.Core;
using EPiServer.ServiceLocation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SiteImprove.Optimizely.Plugin.Helper;
using SiteImprove.Optimizely.Plugin.Repositories;

namespace SiteImprove.Optimizely.Plugin.Controllers
{
    [Authorize(Policy = Constants.SiteImproveAuthorizationPolicy)]
    public class SiteimproveController : Controller
    {
        private readonly ISettingsRepository _settingsRepo;
        private readonly ISiteimproveHelper _siteimproveHelper;

        public SiteimproveController(ISettingsRepository settingsRepo, ISiteimproveHelper siteimproveHelper)
        {
            _settingsRepo = settingsRepo;
            _siteimproveHelper = siteimproveHelper;
        }

        [HttpGet]
        [AllowAnonymous]
        public bool IsAuthorized()
        {
            IPrincipal user = HttpContext.User;
            if (user == null || user.Identity == null || !user.Identity.IsAuthenticated || !Constants.SiteImproveAuthorizationPolicyRoles.Any(user.IsInRole))
            {
                Response.StatusCode = (int)HttpStatusCode.Forbidden;
                return false;
            }

            return true;
        }

        public JsonResult Token()
        {
            return Json(_settingsRepo.GetToken());
        }

        public ActionResult PageUrl(string contentId, string locale)
        {
            var contentRep = ServiceLocator.Current.GetInstance<IContentRepository>();
            var content = contentRep.Get<IContent>(
                new ContentReference(contentId),
                LanguageSelector.Fallback(locale, false));

            if (content is PageData page)
            {
                var externalUrl = _siteimproveHelper.GetExternalUrl(page, locale);
                return Json(new { url = externalUrl, isDomain = false });
            }

            return StatusCode((int)HttpStatusCode.BadRequest);
        }
    }
}
