# CMS-plugin-Optimizely

See [TESTING.md](TESTING.md) for functional tests and GitHub Actions checks.

The Siteimprove CMS Add-On bridges the gap between the Optimizely content management system (CMS) and the Siteimprove Intelligence Platform. With this seamless integration, your team can fix errors and optimize content directly within the Optimizely editing environment. Once the detected issues have been assessed, you can re-check the relevant page in real-time and assess if further actions are needed.

The Siteimprove CMS Add-On provides insights into*:
* Misspellings and broken links
* Readability levels
* Accessibility issues (A, AA, AAA conformance level)
* High-priority policies
* SEO: technical, content, UX, and mobile 
* Page visits and page views
* Feedback rating and comments

*Data shown in the Siteimprove CMS Add-On depends on the Siteimprove services you are subscribed to.

About Siteimprove:

Siteimprove's cloud-based software provides eye-opening insights that empower you and your team to understand, prioritize, and optimize the performance of your website and beyond. With the world’s most comprehensive Digital Presence Optimization (DPO) solution, we provide the clarity and direction needed to run a high-performance website. More than 7,000 organizations around the world trust the Siteimprove Intelligence Platform (SIP) to perfect their digital presence. Learn why at siteimprove.com.

### Installation
Install the nuget package SiteImprove.Optimizely.Plugin from the Optimizely nuget feed
Then the tool will be installed and show up on the right in Edit mode and in Admin mode there will be a Siteimprove tool for configuration

### Configuration
In Admin mode there are a Siteimprove tool to setup configuration

We allow the following groups access:
* Administrators, WebAdmins, CmsAdmins, SiteimproveAdmins

SiteimproveAdmins is a custom group, where you can assign any group in your solution
