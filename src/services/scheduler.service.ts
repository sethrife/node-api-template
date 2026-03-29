import schedule from 'node-schedule';
import type { FastifyBaseLogger } from 'fastify';
import { contextLoggerStorage } from '../utils/logger.js';

export interface JobDefinition {
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

export class SchedulerService {
  private jobs = new Map<string, JobState>();

  constructor(private log: FastifyBaseLogger) {}

  add(definition: JobDefinition): void {
    if (this.jobs.has(definition.name)) {
      throw new DuplicateJobError(definition.name);
    }

    let task: schedule.Job | null;
    try {
      task = schedule.scheduleJob(definition.name, definition.schedule, () => {
        this.tick(definition.name);
      });
    } catch {
      throw new InvalidCronExpressionError(definition.schedule);
    }

    if (!task) {
      throw new InvalidCronExpressionError(definition.schedule);
    }

    this.jobs.set(definition.name, { definition, running: false, task });
  }

  list(): Array<{ name: string; schedule: string; running: boolean }> {
    return Array.from(this.jobs.values()).map(({ definition, running }) => ({
      name: definition.name,
      schedule: definition.schedule,
      running,
    }));
  }

  run(name: string): { alreadyRunning: boolean } {
    const state = this.jobs.get(name);
    if (!state) {
      throw new JobNotFoundError(name);
    }
    if (state.running) {
      return { alreadyRunning: true };
    }
    this.execute(state);  // fire and forget — do NOT await
    return { alreadyRunning: false };
  }

  async stop(): Promise<void> {
    for (const state of this.jobs.values()) {
      state.task.cancel();
    }
  }

  private tick(name: string): void {
    const state = this.jobs.get(name);
    if (!state || state.running) return;
    this.execute(state);  // fire and forget
  }

  private async execute(state: JobState): Promise<void> {
    state.running = true;
    const { handler, name, retry } = state.definition;
    const jobLog = this.log.child({ job: name });

    try {
      await contextLoggerStorage.run(jobLog, async () => {
        const maxAttempts = (retry?.attempts ?? 0) + 1;  // 1 initial + N retries
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
}
