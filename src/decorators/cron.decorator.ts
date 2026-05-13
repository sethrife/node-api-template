import 'reflect-metadata';

const CRONS_KEY = Symbol('crons');

export interface CronDefinition {
  methodName: string;
  expression: string;
  name: string;
  retry?: { attempts: number; delayMs: number };
  runOnStartup?: boolean;
}

export interface CronOptions {
  name: string;
  retry?: { attempts: number; delayMs: number };
  runOnStartup?: boolean;
}

export function Job() {
  return function (target: Function) {
    Reflect.defineMetadata('isJob', true, target);
  };
}

export function Cron(expression: string, options: CronOptions) {
  return function (target: any, propertyKey: string) {
    const crons: CronDefinition[] = Reflect.getMetadata(CRONS_KEY, target.constructor) || [];
    crons.push({
      methodName: propertyKey,
      expression,
      name: options.name,
      retry: options.retry,
      runOnStartup: options.runOnStartup,
    });
    Reflect.defineMetadata(CRONS_KEY, crons, target.constructor);
  };
}

export function isJobClass(target: any): boolean {
  return Reflect.getMetadata('isJob', target) === true;
}

export function getCrons(target: any): CronDefinition[] {
  return Reflect.getMetadata(CRONS_KEY, target) || [];
}
