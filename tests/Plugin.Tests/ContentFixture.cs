using EPiServer.Core;

namespace Plugin.Tests;

internal static class ContentFixture
{
    // Optimizely normally supplies these built-in properties when loading a Page.
    internal static PageData Page(int id = 42, int workId = 0)
    {
        var page = new PageData();
        page.Property.Add("PageLink", new PropertyPageReference(new PageReference(id, workId)));
        page.Property.Add("PageStartPublish", new PropertyDate(DateTime.Now.AddDays(-1)));
        page.Property.Add("PageStopPublish", new PropertyDate());
        page.Property.Add("PageWorkStatus", new PropertyNumber((int)VersionStatus.Published));
        return page;
    }
}
