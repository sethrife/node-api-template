# Job Logger Design

**Date:** 2026-03-28
**Status:** Approved

## Overview

Enable job handlers to call `logger()` and receive a `FastifyBaseLogger` pre-scoped with `{ job: <name> }` as a bound field. This reuses the existing `contextLoggerStorage` / `logger()` mechanism — no new API, no handler signature changes.

---

## Changes

### `src/app.ts`

Add `configureLogger` to the import from `./utils/logger.js` and call `configureLogger(app)` inside `buildApp()` immediately after the `Fastify` instance is created — before the `onRequest` hook and before any plugins are registered. Remove the `configureLogger(app)` call and its import from `src/index.ts`.

This ensures `baseLogger` is always initialised whenever `buildApp()` is called, including in tests. `configureLogger` is idempotent (it simply reassigns `baseLogger = app.log`), so calling it twice is harmless, but removing the `index.ts` call keeps things clean.

### `src/services/scheduler.service.ts`

Import `contextLoggerStorage` from `../utils/logger.js`.

In `execute()`, wrap the entire retry loop in `contextLoggerStorage.run(jobLog, async () => { ... })` where `jobLog = this.log.child({ job: name })`. Use `try/finally` to guarantee `state.running = false` always executes:

```typescript
private async execute(state: JobState): Promise<void> {
  state.running = true;
  const { handler, name, retry } = state.definition;
  const jobLog = this.log.child({ job: name });

  try {
    await contextLoggerStorage.run(jobLog, async () => {
      const maxAttempts = (retry?.attempts ?? 0) + 1;
      const delayMs = retry?.delayMs ?? 0;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await handler();
          return;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          jobLog.error({ attempt, error: error.message }, 'Job execution failed');
          if (attempt < maxAttempts) {
            await new Promise<void>(resolve => setTimeout(resolve, delayMs));
          }
        }
      }
    });
  } finally {
    state.running = false;
  }
}
```

`logger()` called from anywhere in the handler call stack returns `jobLog` for the duration of the execution. After `contextLoggerStorage.run()` completes, `logger()` reverts to its previous value (request logger or base logger). The `try/finally` ensures `state.running` is reset even if the inner logic ever throws.

Note: error logging inside the callback uses `jobLog` directly (not `this.log`) so the `job` field is inherited from the child logger rather than manually attached.

---

## What Does Not Change

- `logger()` function — no modification
- `contextLoggerStorage` — reused as-is
- Handler signature — remains `() => Promise<void>`
- Job class definitions — no changes needed

---

## Testing

**`test/services/scheduler.service.test.ts`** — add tests:
- When a job handler calls `logger()`, it returns a logger scoped to the job (not `undefined`, not the base logger). Verify by having the handler capture `logger()` and assert the result is truthy.
- After job execution completes, `logger()` called outside the handler returns the base logger (not `jobLog`) — confirms context isolation.
- Two simultaneous jobs each receive independent logger contexts (concurrent isolation).

**`test/utils/logger.test.ts`** (new) — unit tests:
- `logger()` returns `baseLogger` when no async context is set (after `configureLogger` has been called)
- `logger()` returns the store value when `contextLoggerStorage` has a value set via `contextLoggerStorage.run()`
- `logger()` returns `undefined` when neither `configureLogger` has been called nor a store is set (edge case — not a supported usage pattern, documents the fallback behaviour)

**`app.ts` change** — existing tests implicitly cover this: since `buildApp()` is called in every integration test and `configureLogger` now runs inside it, `baseLogger` is set for all test runs.

---

## File Checklist

Modified files:
- `src/app.ts` — import `configureLogger` from `./utils/logger.js`; call `configureLogger(app)` inside `buildApp()` before plugin registration
- `src/index.ts` — remove `configureLogger(app)` call and its import
- `src/services/scheduler.service.ts` — import `contextLoggerStorage`; wrap execute body in `try/finally` with `contextLoggerStorage.run()`

New files:
- `test/utils/logger.test.ts` — unit tests for `logger()`
