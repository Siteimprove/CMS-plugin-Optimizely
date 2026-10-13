using CmsHost;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using Xunit;

namespace Plugin.Tests;

public class BlockErrorLogTests
{
    [Fact]
    public void Log_guard_counts_errors_and_type_mismatches_without_retaining_messages()
    {
        using var provider = new BlockErrorLog();
        var logger = provider.CreateLogger("CMS");
        logger.LogWarning("Ordinary warning");
        Assert.Equal("{\"errors\":0,\"typeMismatches\":0}", JsonSerializer.Serialize(provider.Snapshot()));
        logger.LogError(new InvalidOperationException("private content"), "Request failed");
        logger.LogWarning("TypeMismatchException: private content");
        Assert.Equal("{\"errors\":1,\"typeMismatches\":1}", JsonSerializer.Serialize(provider.Snapshot()));
    }
}
