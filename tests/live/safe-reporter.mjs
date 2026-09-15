import { mkdirSync, writeFileSync } from 'node:fs';

// Live errors can contain credentials, cookies, URLs and report content.
// Only fixed test names and statuses may leave the browser run.
const stages = new Set(['live: entitlement', 'live: CMS login', 'live: public URL mapping',
  'live: draft preview', 'live: open login popup', 'live: identity username',
  'live: identity password', 'live: submit login', 'live: report panel', 'live: mapped report data']);

export default class SafeReporter {
  results = [];
  stages = new Map();
  onStepBegin(test, result, step) {
    if (step.category === 'test.step' && stages.has(step.title))
      this.stages.set(result, step.title);
  }
  onTestEnd(test, result) {
    this.results.push({ test: test.title, status: result.status, durationMs: result.duration,
      lastStage: this.stages.get(result) ?? null });
  }
  onError() {}
  onEnd(result) {
    mkdirSync('artifacts/live', { recursive: true });
    writeFileSync('artifacts/live/result.json', JSON.stringify({ status: result.status, tests: this.results }, null, 2));
  }
}
