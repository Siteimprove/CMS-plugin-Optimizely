using EPiServer.Core;
using EPiServer.Framework.DataAnnotations;
using EPiServer.Framework.Web;
using EPiServer.Framework.Web.Mvc;
using EPiServer.Web;
using EPiServer.Web.Mvc;
using Microsoft.AspNetCore.Mvc;

namespace CmsHost;

[TemplateDescriptor(Inherited = true, TemplateTypeCategory = TemplateTypeCategories.MvcController,
    Tags = new[] { RenderingTags.Preview, RenderingTags.Edit }, AvailableWithoutTag = false)]
[RequireClientResources]
public class BlockPreviewController : ActionControllerBase, IRenderTemplate<RegressionBlock>
{
    public IActionResult Index(IContent currentContent) => View("BlockPreview", (RegressionBlock)currentContent);
}
