import 'reflect-metadata';

// Override global mock with one that captures callbacks
const mockJobs = new Map<string, { cancel: jest.Mock; _callback: () => void }>();
jest.mock('node-schedule', () => ({
  scheduleJob: jest.fn((name: string, _expression: string, callback: () => void) => {
    const job = { cancel: jest.fn().mockReturnValue(true), _callback: callback };
    mockJobs.set(name, job);
    return job;
  }),
}));

import {
  SchedulerService,
  JobNotFoundError,
  DuplicateJobError,
  InvalidCronExpressionError,
} from '../../src/services/scheduler.service.js';

function createMockLog() {
  return { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } as any;
}

describe('SchedulerService', () => {
  let scheduler: SchedulerService;
  let log: ReturnType<typeof createMockLog>;

  beforeEach(() => {
    mockJobs.clear();
    jest.clearAllMocks();
    log = createMockLog();
    scheduler = new SchedulerService(log);
  });

  describe('error classes', () => {
    it('JobNotFoundError has correct name and message', () => {
      const err = new JobNotFoundError('my-job');
      expect(err.name).toBe('JobNotFoundError');
      expect(err.message).toBe('Job not found: my-job');
      expect(err).toBeInstanceOf(Error);
    });

    it('DuplicateJobError has correct name and message', () => {
      const err = new DuplicateJobError('my-job');
      expect(err.name).toBe('DuplicateJobError');
      expect(err.message).toBe('Job already registered: my-job');
      expect(err).toBeInstanceOf(Error);
    });

    it('InvalidCronExpressionError has correct name and message', () => {
      const err = new InvalidCronExpressionError('bad-cron');
      expect(err.name).toBe('InvalidCronExpressionError');
      expect(err.message).toBe('Invalid cron expression: bad-cron');
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe('add()', () => {
    it('registers a job by calling scheduleJob with the name and expression', () => {
      const schedule = jest.requireMock('node-schedule');
      const handler = jest.fn().mockResolvedValue(undefined);

      scheduler.add({ name: 'my-job', schedule: '* * * * *', handler });

      expect(schedule.scheduleJob).toHaveBeenCalledWith(
        'my-job',
        '* * * * *',
        expect.any(Function)
      );
    });

    it('job appears in list() after add()', () => {
      scheduler.add({ name: 'my-job', schedule: '* * * * *', handler: jest.fn().mockResolvedValue(undefined) });

      const jobs = scheduler.list();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({ name: 'my-job', schedule: '* * * * *', running: false });
    });
  });

  describe('add() validation', () => {
    it('throws DuplicateJobError when adding a job with an existing name', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      scheduler.add({ name: 'j', schedule: '* * * * *', handler });

      expect(() => scheduler.add({ name: 'j', schedule: '* * * * *', handler }))
        .toThrow(DuplicateJobError);
    });

    it('throws InvalidCronExpressionError when node-schedule returns null', () => {
      const schedule = jest.requireMock('node-schedule');
      schedule.scheduleJob.mockReturnValueOnce(null);

      expect(() =>
        scheduler.add({ name: 'bad', schedule: 'not-valid', handler: jest.fn().mockResolvedValue(undefined) })
      ).toThrow(InvalidCronExpressionError);
    });

    it('throws InvalidCronExpressionError when node-schedule throws', () => {
      const schedule = jest.requireMock('node-schedule');
      schedule.scheduleJob.mockImplementationOnce(() => { throw new Error('invalid cron'); });

      expect(() =>
        scheduler.add({ name: 'bad2', schedule: 'not-valid', handler: jest.fn().mockResolvedValue(undefined) })
      ).toThrow(InvalidCronExpressionError);
    });
  });

  describe('non-overlap (tick)', () => {
    it('skips execution when job is already running', async () => {
      // Handler never resolves — keeps running = true indefinitely
      const handler = jest.fn(() => new Promise<void>(() => {}));
      scheduler.add({ name: 'slow', schedule: '* * * * *', handler });

      // First run — starts executing (handler never resolves, so running stays true)
      scheduler.run('slow');
      // Verify running is true
      expect(scheduler.list()[0].running).toBe(true);

      // Trigger tick directly (simulates cron firing again)
      const job = mockJobs.get('slow')!;
      job._callback();  // triggers tick — should be skipped

      // Handler should only have been called once
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('run()', () => {
    it('returns { alreadyRunning: false } and triggers handler', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      scheduler.add({ name: 'j', schedule: '* * * * *', handler });

      const result = scheduler.run('j');

      expect(result).toEqual({ alreadyRunning: false });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('returns { alreadyRunning: true } and does not call handler when running', () => {
      const handler = jest.fn(() => new Promise<void>(() => {}));  // never resolves
      scheduler.add({ name: 'slow', schedule: '* * * * *', handler });

      scheduler.run('slow');                       // starts — running = true
      const result = scheduler.run('slow');        // second call

      expect(result).toEqual({ alreadyRunning: true });
      expect(handler).toHaveBeenCalledTimes(1);   // handler NOT called again
    });

    it('throws JobNotFoundError for unknown job name', () => {
      expect(() => scheduler.run('does-not-exist')).toThrow(JobNotFoundError);
    });
  });

  describe('list()', () => {
    it('returns empty array when no jobs registered', () => {
      expect(scheduler.list()).toEqual([]);
    });

    it('returns all registered jobs with name, schedule, and running state', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      scheduler.add({ name: 'a', schedule: '* * * * *', handler });
      scheduler.add({ name: 'b', schedule: '0 * * * *', handler });

      const jobs = scheduler.list();
      expect(jobs).toHaveLength(2);
      expect(jobs).toContainEqual({ name: 'a', schedule: '* * * * *', running: false });
      expect(jobs).toContainEqual({ name: 'b', schedule: '0 * * * *', running: false });
    });
  });

  describe('stop()', () => {
    it('calls cancel() on all scheduled tasks', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      scheduler.add({ name: 'a', schedule: '* * * * *', handler });
      scheduler.add({ name: 'b', schedule: '* * * * *', handler });

      await scheduler.stop();

      expect(mockJobs.get('a')!.cancel).toHaveBeenCalled();
      expect(mockJobs.get('b')!.cancel).toHaveBeenCalled();
    });

    it('resolves immediately (no waiting for in-flight handlers)', async () => {
      const handler = jest.fn(() => new Promise<void>(() => {}));  // never resolves
      scheduler.add({ name: 'slow', schedule: '* * * * *', handler });
      scheduler.run('slow');  // starts executing

      // stop() should resolve immediately, not block on the in-flight handler
      await expect(scheduler.stop()).resolves.toBeUndefined();
    });
  });

  describe('retry logic', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('retries the configured number of times and logs each failure', async () => {
      jest.useFakeTimers();

      const handler = jest.fn().mockRejectedValue(new Error('always fails'));
      scheduler.add({
        name: 'retry-job',
        schedule: '* * * * *',
        handler,
        retry: { attempts: 2, delayMs: 1000 },
      });

      scheduler.run('retry-job');
      await jest.runAllTimersAsync();

      // 1 initial + 2 retries = 3 total calls
      expect(handler).toHaveBeenCalledTimes(3);
      // Each failure is logged
      expect(log.error).toHaveBeenCalledTimes(3);
    });

    it('sets running to false after exhausting all retries', async () => {
      jest.useFakeTimers();

      const handler = jest.fn().mockRejectedValue(new Error('fail'));
      scheduler.add({
        name: 'exhausted',
        schedule: '* * * * *',
        handler,
        retry: { attempts: 1, delayMs: 500 },
      });

      scheduler.run('exhausted');
      await jest.runAllTimersAsync();

      expect(scheduler.list()[0].running).toBe(false);
    });

    it('stops retrying as soon as a retry succeeds', async () => {
      jest.useFakeTimers();

      const handler = jest.fn()
        .mockRejectedValueOnce(new Error('first fail'))
        .mockResolvedValue(undefined);

      scheduler.add({
        name: 'succeeds-on-retry',
        schedule: '* * * * *',
        handler,
        retry: { attempts: 3, delayMs: 100 },
      });

      scheduler.run('succeeds-on-retry');
      await jest.runAllTimersAsync();

      expect(handler).toHaveBeenCalledTimes(2);  // initial + 1 retry
      expect(scheduler.list()[0].running).toBe(false);
    });
  });
});
