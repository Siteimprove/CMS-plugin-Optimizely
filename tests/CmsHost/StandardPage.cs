using EPiServer.Core;
using EPiServer.DataAnnotations;
using EPiServer.Web.Mvc;
using Microsoft.AspNetCore.Mvc;

namespace CmsHost;

[ContentType(DisplayName = "Standard page", GUID = "ea668fae-6c3f-4a63-9311-54d1d9487d01")]
public class StandardPage : PageData
{
    public virtual string Heading { get; set; } = "";
}

public class StandardPageController : PageController<StandardPage>
{
    public IActionResult Index(StandardPage currentPage) => View(currentPage);
}
