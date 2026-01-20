import 'reflect-metadata';
import { registerControllers } from '../../src/utils/registerControllers.js';
import { Controller, Get, Post, Put, Delete, Patch } from '../../src/decorators/route.decorator.js';
import { Schema } from '../../src/decorators/schema.decorator.js';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

function createMockApp() {
  const routes: Array<{
    method: string;
    path: string;
    options: any;
    handler: Function;
  }> = [];

  const app = {
    get: jest.fn((path: string, ...args: any[]) => {
      const [options, handler] = args.length === 2 ? args : [{}, args[0]];
      routes.push({ method: 'GET', path, options, handler });
    }),
    post: jest.fn((path: string, ...args: any[]) => {
      const [options, handler] = args.length === 2 ? args : [{}, args[0]];
      routes.push({ method: 'POST', path, options, handler });
    }),
    put: jest.fn((path: string, ...args: any[]) => {
      const [options, handler] = args.length === 2 ? args : [{}, args[0]];
      routes.push({ method: 'PUT', path, options, handler });
    }),
    delete: jest.fn((path: string, ...args: any[]) => {
      const [options, handler] = args.length === 2 ? args : [{}, args[0]];
      routes.push({ method: 'DELETE', path, options, handler });
    }),
    patch: jest.fn((path: string, ...args: any[]) => {
      const [options, handler] = args.length === 2 ? args : [{}, args[0]];
      routes.push({ method: 'PATCH', path, options, handler });
    }),
    _routes: routes,
  };

  return app as unknown as FastifyInstance & { _routes: typeof routes };
}

describe('registerControllers', () => {
  describe('basic route registration', () => {
    it('should register GET routes', () => {
      @Controller('/api')
      class TestController {
        @Get('/users')
        getUsers() {
          return { users: [] };
        }
      }

      const app = createMockApp();
      registerControllers(app, [TestController]);

      expect(app.get).toHaveBeenCalledWith('/api/users', {}, expect.any(Function));
    });

    it('should register POST routes', () => {
      @Controller('/api')
      class TestController {
        @Post('/users')
        createUser() {
          return { created: true };
        }
      }

      const app = createMockApp();
      registerControllers(app, [TestController]);

      expect(app.post).toHaveBeenCalledWith('/api/users', {}, expect.any(Function));
    });

    it('should register PUT routes', () => {
      @Controller('/api')
      class TestController {
        @Put('/users/:id')
        updateUser() {
          return { updated: true };
        }
      }

      const app = createMockApp();
      registerControllers(app, [TestController]);

      expect(app.put).toHaveBeenCalledWith('/api/users/:id', {}, expect.any(Function));
    });

    it('should register DELETE routes', () => {
      @Controller('/api')
      class TestController {
        @Delete('/users/:id')
        deleteUser() {
          return { deleted: true };
        }
      }

      const app = createMockApp();
      registerControllers(app, [TestController]);

      expect(app.delete).toHaveBeenCalledWith('/api/users/:id', {}, expect.any(Function));
    });

    it('should register PATCH routes', () => {
      @Controller('/api')
      class TestController {
        @Patch('/users/:id')
        patchUser() {
          return { patched: true };
        }
      }

      const app = createMockApp();
      registerControllers(app, [TestController]);

      expect(app.patch).toHaveBeenCalledWith('/api/users/:id', {}, expect.any(Function));
    });
  });

  describe('path handling', () => {
    it('should concatenate prefix and path', () => {
      @Controller('/api/v1')
      class TestController {
        @Get('/users')
        getUsers() {}
      }

      const app = createMockApp();
      registerControllers(app, [TestController]);

      expect(app.get).toHaveBeenCalledWith('/api/v1/users', {}, expect.any(Function));
    });

    it('should use only prefix when path is "/" and prefix exists', () => {
      @Controller('/api')
      class TestController {
        @Get('/')
        root() {}
      }

      const app = createMockApp();
      registerControllers(app, [TestController]);

      expect(app.get).toHaveBeenCalledWith('/api', {}, expect.any(Function));
    });

    it('should handle empty prefix', () => {
      @Controller('')
      class TestController {
        @Get('/users')
        getUsers() {}
      }

      const app = createMockApp();
      registerControllers(app, [TestController]);

      expect(app.get).toHaveBeenCalledWith('/users', {}, expect.any(Function));
    });

    it('should handle no prefix (default)', () => {
      @Controller()
      class TestController {
        @Get('/users')
        getUsers() {}
      }

      const app = createMockApp();
      registerControllers(app, [TestController]);

      expect(app.get).toHaveBeenCalledWith('/users', {}, expect.any(Function));
    });
  });

  describe('middleware handling', () => {
    it('should register route with single middleware', () => {
      const middleware = jest.fn();

      @Controller('/api')
      class TestController {
        @Get('/protected', middleware)
        protectedRoute() {}
      }

      const app = createMockApp();
      registerControllers(app, [TestController]);

      expect(app.get).toHaveBeenCalledWith(
        '/api/protected',
        { preHandler: [middleware] },
        expect.any(Function)
      );
    });

    it('should register route with multiple middleware', () => {
      const middleware1 = jest.fn();
      const middleware2 = jest.fn();

      @Controller('/api')
      class TestController {
        @Get('/protected', [middleware1, middleware2])
        protectedRoute() {}
      }

      const app = createMockApp();
      registerControllers(app, [TestController]);

      expect(app.get).toHaveBeenCalledWith(
        '/api/protected',
        { preHandler: [middleware1, middleware2] },
        expect.any(Function)
      );
    });
  });

  describe('schema validation', () => {
    it('should add validation prehandler when schema is defined', () => {
      @Controller('/api')
      class TestController {
        @Post('/users')
        @Schema({
          body: z.object({
            name: z.string(),
          }),
        })
        createUser() {}
      }

      const app = createMockApp();
      registerControllers(app, [TestController]);

      expect(app.post).toHaveBeenCalledWith(
        '/api/users',
        { preHandler: [expect.any(Function)] },
        expect.any(Function)
      );
    });

    it('should add validation prehandler after middleware', () => {
      const middleware = jest.fn();

      @Controller('/api')
      class TestController {
        @Post('/users', middleware)
        @Schema({
          body: z.object({
            name: z.string(),
          }),
        })
        createUser() {}
      }

      const app = createMockApp();
      registerControllers(app, [TestController]);

      const call = (app.post as jest.Mock).mock.calls[0];
      const options = call[1];

      expect(options.preHandler).toHaveLength(2);
      expect(options.preHandler[0]).toBe(middleware);
      expect(options.preHandler[1]).not.toBe(middleware);
    });
  });

  describe('handler binding', () => {
    it('should bind handler to controller instance', async () => {
      @Controller('/api')
      class TestController {
        private value = 'test';

        @Get('/value')
        getValue() {
          return this.value;
        }
      }

      const app = createMockApp();
      registerControllers(app, [TestController]);

      const handler = app._routes[0].handler;
      const result = handler();

      expect(result).toBe('test');
    });
  });

  describe('multiple controllers', () => {
    it('should register routes from multiple controllers', () => {
      @Controller('/users')
      class UserController {
        @Get('/')
        list() {}
      }

      @Controller('/posts')
      class PostController {
        @Get('/')
        list() {}
      }

      const app = createMockApp();
      registerControllers(app, [UserController, PostController]);

      expect(app.get).toHaveBeenCalledTimes(2);
      expect(app.get).toHaveBeenCalledWith('/users', {}, expect.any(Function));
      expect(app.get).toHaveBeenCalledWith('/posts', {}, expect.any(Function));
    });
  });

  describe('multiple routes per controller', () => {
    it('should register all routes from a controller', () => {
      @Controller('/api')
      class TestController {
        @Get('/users')
        listUsers() {}

        @Post('/users')
        createUser() {}

        @Get('/users/:id')
        getUser() {}

        @Put('/users/:id')
        updateUser() {}

        @Delete('/users/:id')
        deleteUser() {}
      }

      const app = createMockApp();
      registerControllers(app, [TestController]);

      expect(app.get).toHaveBeenCalledTimes(2);
      expect(app.post).toHaveBeenCalledTimes(1);
      expect(app.put).toHaveBeenCalledTimes(1);
      expect(app.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty controllers array', () => {
      const app = createMockApp();

      expect(() => registerControllers(app, [])).not.toThrow();
    });

    it('should handle controller with no routes', () => {
      @Controller('/api')
      class EmptyController {}

      const app = createMockApp();

      expect(() => registerControllers(app, [EmptyController])).not.toThrow();
      expect(app.get).not.toHaveBeenCalled();
    });
  });
});
