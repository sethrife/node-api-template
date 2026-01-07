import { FastifyInstance } from 'fastify';
import { getRoutes, getPrefix } from '../decorators/route.decorator.js';
import { RouteSchema } from '../decorators/schema.decorator.js';
import { createValidationPrehandler } from './validation.js';

export function registerControllers(app: FastifyInstance, controllers: any[]) {
  for (const Controller of controllers) {
    const instance = new Controller();
    const prefix = getPrefix(Controller);
    const routes = getRoutes(Controller);

    for (const route of routes) {
      const { method, path, methodName, middleware } = route;
      // Handle path concatenation: if path is '/' and prefix exists, use prefix only
      const fullPath = path === '/' && prefix ? prefix : prefix + path;
      const handler = instance[methodName].bind(instance);

      // Check for schema metadata
      const schema: RouteSchema | undefined = Reflect.getMetadata('schema', instance, methodName);

      // Normalize middleware to array and add validation prehandler if schema exists
      let preHandler = middleware ? (Array.isArray(middleware) ? middleware : [middleware]) : [];

      // Add validation prehandler if schema exists
      if (schema) {
        preHandler = [...preHandler, createValidationPrehandler(schema)];
      }

      // Register with options if middleware or schema exists
      const routeOptions = preHandler.length > 0 ? { preHandler } : {};

      switch (method) {
        case 'GET':
          app.get(fullPath, routeOptions, handler);
          break;
        case 'POST':
          app.post(fullPath, routeOptions, handler);
          break;
        case 'PUT':
          app.put(fullPath, routeOptions, handler);
          break;
        case 'DELETE':
          app.delete(fullPath, routeOptions, handler);
          break;
        case 'PATCH':
          app.patch(fullPath, routeOptions, handler);
          break;
      }
    }
  }
}
