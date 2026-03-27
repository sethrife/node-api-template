import { Job, Cron } from '../decorators/cron.decorator.js';

@Job()
export class ExampleJob {
  @Cron('0 * * * *', { name: 'example-hourly' })
  async run() {
    // Example: log a message every hour
    // In a real job, inject logger via constructor or use contextLoggerStorage
  }
}
