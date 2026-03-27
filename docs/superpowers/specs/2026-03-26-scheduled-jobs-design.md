# Scheduled Jobs Design

**Date:** 2026-03-26
**Status:** Approved

## Overview

Add support for cron-style scheduled jobs to the Fastify application. Jobs are defined using class decorators (mirroring the existing controller pattern), registered via a utility function, and managed by a `SchedulerService` backed by `node-schedule`. A built-in HTTP controller exposes endpoints for listing jobs and triggering them manually.

---

## Architecture

Five new pieces:

| Piece | Location | Responsibility |
|---|---|---|
| `node-schedule` (npm) | dependency | Cron expression parsing, job scheduling |
| `SchedulerService` | `src/services/scheduler.service.ts` | Register jobs, track running state, handle retry, expose `run`/`list`/`stop` |
| `scheduler.plugin.ts` | `src/plugins/scheduler.plugin.ts` | Fastify plugin, decorates `app.scheduler`, calls `stop()` on server close |
| `@Job` / `@Cron` decorators | `src/decorators/cron.decorator.ts` | Attach metadata to job classes and methods |
| `registerJobs()` | `src/utils/registerJobs.ts` | Scans metadata, registers tasks with `app.scheduler`, registers `JobsController` routes |

Jobs are defined in classes under `src/jobs/`. `app.ts` calls `registerJobs(app, [...])` after the scheduler plugin is registered.

---

## Components

### `SchedulerService`

Core service managing all job lifecycle.

**Data structures:**

```typescript
interface JobDefinition {
  name: string;
  schedule: string;
  handler: () => Promise<void>;
  retry?: { attempts: number; delayMs: number };
}

interface JobState {
  definition: JobDefinition;
  running: boolean;
  task: schedule.Job;
}
```

**Execution logic on each cron tick:**
1. If `running === true` → skip (non-overlapping guard)
2. Set `running = true`
3. Call `handler()`
4. On success → set `running = false`
5. On error → retry up to `attempts` times. Between each retry, wait using `await new Promise(resolve => setTimeout(resolve, delayMs))`. Log each failure with job name and attempt number. After all retries exhausted, log the final error. Set `running = false` in all cases.

**Note on testing:** Because retries use `setTimeout`, unit tests that exercise retry logic must use `jest.useFakeTimers()` and advance timers manually to avoid real waits.

**Public API:**
- `add(definition: JobDefinition): void` — register a job; throws `InvalidCronExpressionError` if the cron expression is invalid; throws `DuplicateJobError` if a job with the same name is already registered
- `run(name: string): { alreadyRunning: boolean }` — trigger a job immediately using the same non-overlap logic as a cron tick: if `running === true`, skip and return `{ alreadyRunning: true }` without calling the handler; throws `JobNotFoundError` if no job with that name exists
- `list(): Array<{ name: string; schedule: string; running: boolean }>` — current state of all jobs
- `stop(): Promise<void>` — cancels all `node-schedule` tasks synchronously. Any retry loop already in-flight runs to completion; `stop()` does not wait for in-flight handlers. Resolves once all tasks are cancelled.

**Error types:**
```typescript
export class JobNotFoundError extends Error {
  constructor(name: string) {
    super(`Job not found: ${name}`);
    this.name = 'JobNotFoundError';
  }
}

export class DuplicateJobError extends Error {
  constructor(name: string) {
    super(`Job already registered: ${name}`);
    this.name = 'DuplicateJobError';
  }
}

export class InvalidCronExpressionError extends Error {
  constructor(expression: string) {
    super(`Invalid cron expression: ${expression}`);
    this.name = 'InvalidCronExpressionError';
  }
}
```

### `scheduler.plugin.ts`

Follows the same pattern as existing plugins:

```typescript
const schedulerPlugin: FastifyPluginAsync = async (fastify) => {
  const service = new SchedulerService(fastify.log);
  fastify.addHook('onClose', async () => { await service.stop(); });
  fastify.decorate('scheduler', service);
};
export default fp(schedulerPlugin, { name: 'scheduler' });
```

### `@Job` and `@Cron` Decorators

```typescript
// Marks a class as containing scheduled jobs.
// This guard prevents non-job classes accidentally passed to registerJobs() from being processed.
@Job()
export class ReportJob {

  @Cron('0 9 * * 1-5', { name: 'weekly-report', retry: { attempts: 3, delayMs: 5000 } })
  async sendWeeklyReport() { ... }

  @Cron('*/5 * * * *', { name: 'health-ping' })
  async pingHealthCheck() { ... }
}
```

`@Job()` calls `Reflect.defineMetadata('isJob', true, target)` on the class constructor. `registerJobs()` reads it back with `Reflect.getMetadata('isJob', JobClass)` and skips any class where this returns falsy, guarding against accidental registration of non-job classes.

`@Cron(expression, options)` appends `{ methodName, expression, ...options }` to a metadata array stored under a dedicated `Symbol('crons')` on `target.constructor` — exactly mirroring how `@Get`/`@Post` append `{ method, path, methodName }` entries to a `Symbol('routes')` array on `target.constructor`.

Both decorator files must include `import 'reflect-metadata'` at the top, matching the convention in `src/decorators/route.decorator.ts`.

**`CronOptions`:**
```typescript
interface CronOptions {
  name: string;                              // unique identifier, used for HTTP endpoint
  retry?: { attempts: number; delayMs: number };
}
```

### `registerJobs()`

Mirrors `registerControllers()`:
1. For each job class, check for `@Job` metadata marker; skip if absent
2. Instantiate the class
3. Scan methods for `@Cron` metadata
4. For each decorated method: call `app.scheduler.add({ name, schedule, handler, retry })`
5. After scanning all job classes, register `JobsController` routes on `app` imperatively using closures that capture `app.scheduler` (see `JobsController` section below)

### `JobsController`

Defined in `src/controllers/jobs.controller.ts` as a factory function (not a decorated class) that receives the `SchedulerService` instance via parameter and returns route handler functions. `registerJobs()` calls it as:

```typescript
registerJobsController(app, app.scheduler);
```

The route handlers close over the `SchedulerService` instance, giving them access to `scheduler.run()` and `scheduler.list()` without needing to reach back through `app`. This approach mirrors the internal-infrastructure pattern rather than the user-facing controller pattern.

```
GET  /api/jobs           — list all registered jobs and running state
POST /api/jobs/:name/run — trigger a job by name immediately
```

**`GET /api/jobs`** response (`200`):
```json
[
  { "name": "weekly-report", "schedule": "0 9 * * 1-5", "running": false },
  { "name": "health-ping",   "schedule": "*/5 * * * *",  "running": true  }
]
```

**`POST /api/jobs/:name/run`** responses:
- `202 Accepted` — `{ "name": "...", "alreadyRunning": false }` (job triggered)
- `202 Accepted` — `{ "name": "...", "alreadyRunning": true }` (job was already running, skipped)
- `404 Not Found` — `{ "error": "Job not found", "name": "..." }`

The endpoint fires and returns immediately — it does not await job completion. The controller catches `JobNotFoundError` from `scheduler.run()` and maps it to the `404` response.

---

## Data Flow

```
app.ts
  └── app.register(schedulerPlugin)        → app.scheduler = new SchedulerService
  └── registerJobs(app, [ReportJob, ...])
        ├── scans @Cron metadata
        ├── app.scheduler.add(...)          → node-schedule.scheduleJob(name, cron, tick)
        └── registers JobsController routes (imperative app.get/app.post)

On cron tick:
  node-schedule fires → SchedulerService.tick(name)
    ├── if running: skip
    └── else: run handler with retry logic

On HTTP POST /api/jobs/:name/run:
  JobsController → app.scheduler.run(name) → same tick logic, returns immediately
  JobNotFoundError → 404 response
```

---

## Error Handling

- Invalid cron expression at `add()` time → throws `InvalidCronExpressionError` immediately (caught during `app.ready()`)
- Duplicate job name at `add()` time → throws `DuplicateJobError` immediately (caught during `app.ready()`)
- Handler error → retry up to configured `attempts` with `delayMs` delay (via `setTimeout`); log each failure with job name and attempt number; after exhaustion log final error; scheduler continues running future ticks normally
- `run('unknown-name')` → throws `JobNotFoundError`; controller maps to `404`

---

## Configuration

No new environment variables. Retry options are per-job in the `@Cron` decorator options.

---

## Testing

**`test/services/scheduler.service.test.ts`** — unit tests (uses `jest.useFakeTimers()` for retry delay assertions):
- `add()` registers a job
- `add()` with duplicate name throws `DuplicateJobError`
- `add()` with invalid cron expression throws `InvalidCronExpressionError`
- Non-overlap: second tick while running is skipped
- Retry: retries configured number of times on error, logging each failure, then stops
- Retry: sets `running = false` after exhausting retries
- `run(name)` triggers handler immediately
- `run(name)` returns `{ alreadyRunning: true }` when job is running
- `run('unknown')` throws `JobNotFoundError`
- `list()` returns correct state for all jobs
- `stop()` cancels all tasks

`node-schedule` is mocked — `run(name)` is used directly to exercise handler logic without waiting for real cron ticks.

**`test/utils/registerJobs.test.ts`** — unit tests:
- Scans `@Cron` metadata and calls `scheduler.add()` for each decorated method
- Skips classes without `@Job` marker
- Registers `JobsController` routes on the app

**`test/controllers/jobs.controller.test.ts`** — integration tests via `app.inject()`:
- `GET /api/jobs` returns job list
- `POST /api/jobs/:name/run` returns `202` with `alreadyRunning: false`
- `POST /api/jobs/:name/run` on already-running job returns `202` with `alreadyRunning: true`
- `POST /api/jobs/unknown/run` returns `404`

---

## File Checklist

New files:
- `src/services/scheduler.service.ts`
- `src/plugins/scheduler.plugin.ts`
- `src/decorators/cron.decorator.ts`
- `src/utils/registerJobs.ts`
- `src/controllers/jobs.controller.ts`
- `src/jobs/` (directory, with example job class)
- `test/services/scheduler.service.test.ts`
- `test/utils/registerJobs.test.ts`
- `test/controllers/jobs.controller.test.ts`

Modified files:
- `src/app.ts` — register scheduler plugin, call `registerJobs`
- `src/types/fastify.d.ts` — add `import type { SchedulerService }` and `scheduler: SchedulerService` to `FastifyInstance`
- `package.json` — add `node-schedule` and `@types/node-schedule`
