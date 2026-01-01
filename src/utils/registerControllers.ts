import { FastifyInstance } from 'fastify';
import { getRoutes, getPrefix } from '../decorators/route.decorator';

export function registerControllers(app: FastifyInstance, controllers: any[]) {
  for (const Controller of controllers) {
    const instance = new Controller();
    const prefix = getPrefix(Controller);
    const routes = getRoutes(Controller);

    for (const route of routes) {
      const { method, path, methodName } = route;
      // Handle path concatenation: if path is '/' and prefix exists, use prefix only
      const fullPath = path === '/' && prefix ? prefix : prefix + path;
      const handler = instance[methodName].bind(instance);

      switch (method) {
        case 'GET':
          app.get(fullPath, handler);
          break;
        case 'POST':
          app.post(fullPath, handler);
          break;
        case 'PUT':
          app.put(fullPath, handler);
          break;
        case 'DELETE':
          app.delete(fullPath, handler);
          break;
        case 'PATCH':
          app.patch(fullPath, handler);
          break;
      }
    }
  }
}
