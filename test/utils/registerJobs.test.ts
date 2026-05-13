import 'reflect-metadata';
import { Job, Cron, isJobClass, getCrons } from '../../src/decorators/cron.decorator.js';
import { registerJobs } from '../../src/utils/registerJobs.js';
import { FastifyInstance } from 'fastify';

function createMockApp() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    scheduler: {
      add: jest.fn(),
      run: jest.fn().mockReturnValue({ alreadyRunning: false }),
    },
  } as unknown as FastifyInstance;
}

describe('@Job and @Cron decorators', () => {
  it('@Job marks a class so isJobClass returns true', () => {
    @Job()
    class MyJob {}

    expect(isJobClass(MyJob)).toBe(true);
  });

  it('isJobClass returns false for a class without @Job', () => {
    class NotAJob {}
    expect(isJobClass(NotAJob)).toBe(false);
  });

  it('@Cron stores cron definition in class metadata', () => {
    @Job()
    class MyJob {
      @Cron('* * * * *', { name: 'tick' })
      async doWork() {}
    }

    const crons = getCrons(MyJob);
    expect(crons).toHaveLength(1);
    expect(crons[0]).toMatchObject({
      methodName: 'doWork',
      expression: '* * * * *',
      name: 'tick',
    });
  });

  it('@Cron stores runOnStartup when provided', () => {
    @Job()
    class MyJob {
      @Cron('0 * * * *', { name: 'startup-job', runOnStartup: true })
      async doWork() {}
    }

    const crons = getCrons(MyJob);
    expect(crons[0].runOnStartup).toBe(true);
  });

  it('@Cron leaves runOnStartup undefined when not provided', () => {
    @Job()
    class MyJob {
      @Cron('0 * * * *', { name: 'normal-job' })
      async doWork() {}
    }

    const crons = getCrons(MyJob);
    expect(crons[0].runOnStartup).toBeUndefined();
  });

  it('@Cron stores retry options when provided', () => {
    @Job()
    class MyJob {
      @Cron('0 * * * *', { name: 'hourly', retry: { attempts: 2, delayMs: 500 } })
      async doWork() {}
    }

    const crons = getCrons(MyJob);
    expect(crons[0].retry).toEqual({ attempts: 2, delayMs: 500 });
  });

  it('multiple @Cron decorators on same class all appear in getCrons', () => {
    @Job()
    class MyJob {
      @Cron('* * * * *', { name: 'job-a' })
      async taskA() {}

      @Cron('0 * * * *', { name: 'job-b' })
      async taskB() {}
    }

    const crons = getCrons(MyJob);
    expect(crons).toHaveLength(2);
    expect(crons.map(c => c.name)).toContain('job-a');
    expect(crons.map(c => c.name)).toContain('job-b');
  });
});

describe('registerJobs()', () => {
  it('calls scheduler.add() for each @Cron method on a @Job class', () => {
    @Job()
    class TestJob {
      @Cron('* * * * *', { name: 'test-tick' })
      async tick() {}
    }

    const app = createMockApp();
    registerJobs(app, [TestJob]);

    expect((app as any).scheduler.add).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'test-tick', schedule: '* * * * *' })
    );
  });

  it('skips classes without @Job marker', () => {
    class NotAJob {
      @Cron('* * * * *', { name: 'sneaky' })
      async tick() {}
    }

    const app = createMockApp();
    registerJobs(app, [NotAJob as any]);

    expect((app as any).scheduler.add).not.toHaveBeenCalled();
  });

  it('binds handler to the job class instance', () => {
    @Job()
    class TestJob {
      private value = 'instance-value';

      @Cron('* * * * *', { name: 'check-binding' })
      async check() {
        return (this as any).value;
      }
    }

    const app = createMockApp();
    registerJobs(app, [TestJob]);

    const call = (app as any).scheduler.add.mock.calls[0][0];
    // handler should be bound to the instance
    expect(call.handler).toBeDefined();
  });

  it('calls scheduler.run() immediately for crons with runOnStartup: true', () => {
    @Job()
    class TestJob {
      @Cron('0 * * * *', { name: 'startup-tick', runOnStartup: true })
      async tick() {}
    }

    const app = createMockApp();
    registerJobs(app, [TestJob]);

    expect((app as any).scheduler.run).toHaveBeenCalledWith('startup-tick');
  });

  it('does not call scheduler.run() for crons without runOnStartup', () => {
    @Job()
    class TestJob {
      @Cron('0 * * * *', { name: 'normal-tick' })
      async tick() {}
    }

    const app = createMockApp();
    registerJobs(app, [TestJob]);

    expect((app as any).scheduler.run).not.toHaveBeenCalled();
  });

  it('registers GET /api/jobs route', () => {
    const app = createMockApp();
    registerJobs(app, []);

    expect((app as any).get).toHaveBeenCalledWith(
      '/api/jobs',
      expect.any(Function)
    );
  });

  it('registers POST /api/jobs/:name/run route', () => {
    const app = createMockApp();
    registerJobs(app, []);

    expect((app as any).post).toHaveBeenCalledWith(
      '/api/jobs/:name/run',
      expect.any(Function)
    );
  });
});
