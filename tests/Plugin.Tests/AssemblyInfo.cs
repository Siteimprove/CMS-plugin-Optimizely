using Xunit;

// The plugin uses Optimizely's process-wide ServiceLocator.
[assembly: CollectionBehavior(DisableTestParallelization = true)]
