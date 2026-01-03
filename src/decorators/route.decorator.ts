import 'reflect-metadata';

const ROUTES_KEY = Symbol('routes');

export interface RouteDefinition {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  methodName: string;
}

export function Controller(prefix: string = '') {
  return function (target: Function) {
    Reflect.defineMetadata('prefix', prefix, target);

    if (!Reflect.hasMetadata(ROUTES_KEY, target)) {
      Reflect.defineMetadata(ROUTES_KEY, [], target);
    }
  };
}

export function Get(path: string = '') {
  return function (target: any, propertyKey: string) {
    const routes: RouteDefinition[] = Reflect.getMetadata(ROUTES_KEY, target.constructor) || [];
    routes.push({
      method: 'GET',
      path,
      methodName: propertyKey,
    });
    Reflect.defineMetadata(ROUTES_KEY, routes, target.constructor);
  };
}

export function Post(path: string = '') {
  return function (target: any, propertyKey: string) {
    const routes: RouteDefinition[] = Reflect.getMetadata(ROUTES_KEY, target.constructor) || [];
    routes.push({
      method: 'POST',
      path,
      methodName: propertyKey,
    });
    Reflect.defineMetadata(ROUTES_KEY, routes, target.constructor);
  };
}

export function Put(path: string = '') {
  return function (target: any, propertyKey: string) {
    const routes: RouteDefinition[] = Reflect.getMetadata(ROUTES_KEY, target.constructor) || [];
    routes.push({
      method: 'PUT',
      path,
      methodName: propertyKey,
    });
    Reflect.defineMetadata(ROUTES_KEY, routes, target.constructor);
  };
}

export function Delete(path: string = '') {
  return function (target: any, propertyKey: string) {
    const routes: RouteDefinition[] = Reflect.getMetadata(ROUTES_KEY, target.constructor) || [];
    routes.push({
      method: 'DELETE',
      path,
      methodName: propertyKey,
    });
    Reflect.defineMetadata(ROUTES_KEY, routes, target.constructor);
  };
}

export function getRoutes(target: any): RouteDefinition[] {
  return Reflect.getMetadata(ROUTES_KEY, target) || [];
}

export function getPrefix(target: any): string {
  return Reflect.getMetadata('prefix', target) || '';
}
