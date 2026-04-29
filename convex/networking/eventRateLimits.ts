import { HOUR, MINUTE, RateLimiter, type RateLimitConfig } from '@convex-dev/rate-limiter';
import { components } from '../_generated/api';
import { MutationCtx, QueryCtx } from '../_generated/server';
import { networkingError } from './auth';

export const eventRateLimitNames = [
  'eventRegistrationPerRequester',
  'eventRegistrationPerEvent',
  'eventDirectorySearch',
  'eventOwnerReviewDecision',
  'eventConnectionIntent',
  'eventContactReveal',
  'eventOrganizerAction',
] as const;

export type EventRateLimitName = (typeof eventRateLimitNames)[number];

type RateLimitCtx = (MutationCtx | QueryCtx) & {
  runMutation?: unknown;
};

type FallbackWindow = {
  count: number;
  windowStart: number;
};

export const eventRateLimitConfigs: Record<EventRateLimitName, RateLimitConfig> = {
  eventRegistrationPerRequester: { kind: 'fixed window', rate: 5, period: HOUR },
  eventRegistrationPerEvent: { kind: 'fixed window', rate: 240, period: HOUR },
  eventDirectorySearch: { kind: 'fixed window', rate: 120, period: MINUTE },
  eventOwnerReviewDecision: { kind: 'fixed window', rate: 30, period: MINUTE },
  eventConnectionIntent: { kind: 'fixed window', rate: 30, period: MINUTE },
  eventContactReveal: { kind: 'fixed window', rate: 60, period: MINUTE },
  eventOrganizerAction: { kind: 'fixed window', rate: 120, period: MINUTE },
};

const rateLimiter = new RateLimiter(components.rateLimiter, eventRateLimitConfigs);
const fallbackWindows = new Map<string, FallbackWindow>();
const testOverrides = new Map<EventRateLimitName, RateLimitConfig>();

export async function enforceEventRateLimit(
  ctx: RateLimitCtx,
  name: EventRateLimitName,
  keyParts: Array<string | number | undefined | null>,
) {
  const key = normalizeRateLimitKey(keyParts);
  const config = testOverrides.get(name) ?? eventRateLimitConfigs[name];

  if (hasComponentMutationContext(ctx)) {
    const status = await rateLimiter.limit(ctx as MutationCtx, name, { key });
    if (!status.ok) {
      throwRateLimitError(status.retryAfter);
    }
    return status;
  }

  return enforceFallbackRateLimit(name, key, config);
}

export function resetEventRateLimitTestState() {
  fallbackWindows.clear();
  testOverrides.clear();
}

export function setEventRateLimitTestOverride(
  name: EventRateLimitName,
  config: RateLimitConfig,
) {
  testOverrides.set(name, config);
}

function hasComponentMutationContext(ctx: RateLimitCtx): ctx is MutationCtx {
  return typeof ctx.runMutation === 'function';
}

function enforceFallbackRateLimit(
  name: EventRateLimitName,
  key: string,
  config: RateLimitConfig,
) {
  const now = Date.now();
  const storageKey = `${name}:${key}`;
  const current = fallbackWindows.get(storageKey);
  const windowStart =
    current && now - current.windowStart < config.period ? current.windowStart : now;
  const count = current && windowStart === current.windowStart ? current.count + 1 : 1;
  fallbackWindows.set(storageKey, { count, windowStart });

  const capacity = config.capacity ?? config.rate;
  if (count > capacity) {
    const retryAfter = Math.max(1, config.period - (now - windowStart));
    throwRateLimitError(retryAfter);
  }
  return { ok: true as const, retryAfter: undefined };
}

function throwRateLimitError(retryAfter: number | undefined) {
  const seconds = retryAfter === undefined ? 'later' : `${Math.ceil(retryAfter / 1000)}s`;
  throw networkingError(
    'event_rate_limited',
    `Too many event requests. Retry ${seconds}.`,
  );
}

function normalizeRateLimitKey(keyParts: Array<string | number | undefined | null>) {
  return keyParts
    .map((part) => String(part ?? 'unknown').trim().toLowerCase())
    .filter(Boolean)
    .join(':')
    .slice(0, 240);
}
