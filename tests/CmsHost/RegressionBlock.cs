using EPiServer.Core;
using EPiServer.DataAnnotations;

namespace CmsHost;

[ContentType(DisplayName = "Regression block", GUID = "d79aeb73-f761-418b-b3ba-86838db73599")]
public class RegressionBlock : BlockData
{
    public virtual string Text { get; set; } = "";
}
