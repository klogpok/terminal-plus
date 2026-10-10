/**
 * Readiness of one Service run: the moment it goes from `starting` to `running`.
 * Ready = first of: `readyPattern` seen in the output, `healthUrl` answering 2xx, `port` listening
 * on any address. Without criteria: still alive after the liveness period.
 * Not ready within the readiness timeout -> `onUnhealthy` once; checks continue at the slower
 * interval until ready. Everything stops after `onReady` or `dispose`.
 */
import { isPortListening } from './ports.js';
import { stripAnsi } from './output-tail.js';

export interface ReadinessCriteria {
  readyPattern?: string;
  healthUrl?: string;
  port?: number;
}

export interface ReadinessTimings {
  readinessTimeoutMs: number;
  livenessMs: number;
  healthPollMs: number;
  unhealthyPollMs: number;
}

export interface ReadinessOptions {
  criteria: ReadinessCriteria;
  timings: ReadinessTimings;
  /** Is the Service process still alive? Checked before declaring a criteria-less Service ready. */
  isAlive(): boolean;
  onReady(): void;
  onUnhealthy(): void;
}

export interface ReadinessWatch {
  /** Feeds Service output (raw pty data) for the readyPattern check. */
  feed(data: string): void;
  /** Stops every check. Idempotent. */
  dispose(): void;
}

/** How much recent output the readyPattern is matched against. */
const PATTERN_WINDOW = 8_192;

export function watchReadiness(options: ReadinessOptions): ReadinessWatch {
  const { criteria, timings } = options;
  const pattern = criteria.readyPattern !== undefined ? new RegExp(criteria.readyPattern, 'm') : undefined;
  const polled = criteria.healthUrl !== undefined || criteria.port !== undefined;
  const timers = new Set<NodeJS.Timeout>();
  let done = false;
  let unhealthy = false;
  let output = '';

  const later = (ms: number, fn: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      fn();
    }, ms);
    timers.add(timer);
  };

  const dispose = () => {
    done = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    output = '';
  };

  const ready = () => {
    if (done) return;
    dispose();
    options.onReady();
  };

  if (pattern === undefined && !polled) {
    later(timings.livenessMs, () => {
      if (options.isAlive()) ready();
    });
  } else {
    later(timings.readinessTimeoutMs, () => {
      if (done) return;
      unhealthy = true;
      options.onUnhealthy();
    });
  }

  if (polled) {
    const poll = async () => {
      if (done) return;
      const interval = unhealthy ? timings.unhealthyPollMs : timings.healthPollMs;
      const checks: Promise<boolean>[] = [];
      if (criteria.healthUrl !== undefined) checks.push(healthAnswers(criteria.healthUrl, interval));
      if (criteria.port !== undefined) checks.push(isPortListening(criteria.port).catch(() => false));
      const results = await Promise.all(checks);
      if (done) return;
      if (results.some(Boolean)) return ready();
      later(unhealthy ? timings.unhealthyPollMs : timings.healthPollMs, () => void poll());
    };
    later(0, () => void poll());
  }

  return {
    feed(data) {
      if (done || pattern === undefined) return;
      output = (output + data).slice(-PATTERN_WINDOW);
      if (pattern.test(stripAnsi(output))) ready();
    },
    dispose,
  };
}

/** Does `url` answer with a 2xx status (redirects followed)? Never rejects. */
async function healthAnswers(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(Math.max(timeoutMs, 1_000)) });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}
