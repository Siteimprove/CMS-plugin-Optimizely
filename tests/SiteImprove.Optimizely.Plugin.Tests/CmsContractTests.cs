using EPiServer.Core;
using EPiServer.VisualBuilder;
using Xunit;

public class CmsContractTests
{
    [Fact]
    public void VisualBuilderExperiencePagesUseThePageIntegration()
    {
        Assert.True(typeof(PageData).IsAssignableFrom(typeof(ExperienceData)));
    }
}
