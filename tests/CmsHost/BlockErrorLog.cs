using Microsoft.Extensions.Logging;

namespace CmsHost;

// Retain counts only; exception messages and content never leave the logger.
public sealed class BlockErrorLog : ILoggerProvider
{
    private long errors;
    private long typeMismatches;
    public object Snapshot() => new { errors = Interlocked.Read(ref errors), typeMismatches = Interlocked.Read(ref typeMismatches) };
    public ILogger CreateLogger(string categoryName) => new Counter(this);
    public void Dispose() { }

    private sealed class Counter(BlockErrorLog owner) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel level) => level >= LogLevel.Warning;
        public void Log<TState>(LogLevel level, EventId id, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (level >= LogLevel.Error) Interlocked.Increment(ref owner.errors);
            if (exception?.ToString().Contains("TypeMismatchException", StringComparison.Ordinal) == true
                || formatter(state, exception).Contains("TypeMismatchException", StringComparison.Ordinal))
                Interlocked.Increment(ref owner.typeMismatches);
        }
    }
}
