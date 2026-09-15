import { mkdirSync, writeFileSync } from 'node:fs';

// Live errors can contain credentials, cookies, URLs and report content.
// Only fixed test names and statuses may leave the browser run.
export default class SafeReporter {
  results = [];
  onTestEnd(test, result) {
    this.results.push({ test: test.title, status: result.status, durationMs: result.duration });
  }
  onError() {}
  onEnd(result) {
    mkdirSync('artifacts/live', { recursive: true });
    writeFileSync('artifacts/live/result.json', JSON.stringify({ status: result.status, tests: this.results }, null, 2));
  }
}
