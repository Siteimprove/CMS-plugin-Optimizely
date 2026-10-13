namespace SiteImprove.Optimizely.Plugin.Models;

public enum ContentCheckStatus
{
    Unconfigured,
    Enabled,
    Disabled,
    InvalidCredentials,
    AccessDenied,
    Unavailable
}

public static class ContentCheckStatusMessages
{
    public static string Describe(this ContentCheckStatus status) => status switch
    {
        ContentCheckStatus.Enabled => "Enabled",
        ContentCheckStatus.Disabled => "Disabled. You can request activation below.",
        ContentCheckStatus.Unconfigured => "Save the Siteimprove API username and key to check availability.",
        ContentCheckStatus.InvalidCredentials => "Siteimprove rejected the API credentials. Check the username and replace the key.",
        ContentCheckStatus.AccessDenied => "The account cannot access content checking. Verify its permissions and subscription with Siteimprove.",
        _ => "Siteimprove could not be reached or returned an unexpected response. Retry the status check."
    };
}
