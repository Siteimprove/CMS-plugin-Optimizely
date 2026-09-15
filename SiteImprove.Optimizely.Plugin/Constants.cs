namespace SiteImprove.Optimizely.Plugin
{
    public class Constants
    {
        public const string SiteImproveTokenUrl = "https://my2.siteimprove.com/auth/token";
        public const string SiteImproveRecheckUrl = "https://api-gateway.siteimprove.com/cms-recheck";
        public const string SiteImproveApiUrl = "https://api.siteimprove.com/v2";

        public const string SiteImproveEditorPolicy = "siteimprove:use";
        public static string[] SiteImproveEditorRoles = new []{ "Administrators", "WebAdmins", "CmsAdmins", "SiteimproveAdmins", "CmsEditors", "WebEditors", "SiteimproveEditors" };

        public const string SiteImproveAuthorizationPolicy = "siteimprove:admin";
        public static string[] SiteImproveAuthorizationPolicyRoles = new []{ "Administrators", "WebAdmins", "CmsAdmins", "SiteimproveAdmins" };
        public const string SiteImproveModuleName = "SiteImprove.Optimizely.Plugin";

    }
}
