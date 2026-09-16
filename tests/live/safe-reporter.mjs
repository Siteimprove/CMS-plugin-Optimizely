import { safeDiagnostics } from './diagnostics.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

// Live errors can contain credentials, cookies, URLs and report content.
// Only fixed test names and statuses may leave the browser run.
const stages = new Set(['live: entitlement', 'live: CMS login', 'live: public URL mapping',
  'live: draft preview', 'live: open login popup', 'live: identity username',
  'live: identity password', 'live: submit login', 'live: report panel', 'live: mapped report data',
  'live: start prepublish', 'live: draft handoff', 'live: loading-state exit',
  'live: completed scan result', 'live: accessibility results', 'live: WCAG 1.1.1 issue detected', 'live: WCAG 1.1.1 issue cleared']);

export default class SafeReporter {
  results = [];
  stages = new Map();
  onStepBegin(test, result, step) {
    if (step.category === 'test.step' && stages.has(step.title))
      this.stages.set(result, step.title);
  }
  onTestEnd(test, result) {
    let diagnostics = {};
    for (const annotation of result.annotations ?? []) {
      if (annotation.type !== 'live-diagnostics') continue;
      try { Object.assign(diagnostics, safeDiagnostics(JSON.parse(annotation.description))); } catch {}
    }
    this.results.push({ test: test.title, status: result.status, durationMs: result.duration,
      lastStage: this.stages.get(result) ?? null, diagnostics });
  }
  onError() {}
  onEnd(result) {
    mkdirSync('artifacts/live', { recursive: true });
    writeFileSync('artifacts/live/result.json', JSON.stringify({ status: result.status, tests: this.results }, null, 2));
  }
}
