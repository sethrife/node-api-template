# Fastify TypeScript API

A Node.js TypeScript API application built with Fastify, featuring decorator-based routing and Jest testing.

## Features

- **TypeScript**: Full TypeScript support with strict type checking
- **Decorators**: Custom decorators for clean, declarative routing
- **Fastify**: High-performance web framework
- **Jest**: Comprehensive testing with ts-jest
- **Reflect Metadata**: Support for experimental decorators

## Project Structure

```
src/
├── controllers/          # Route controllers with decorators
│   ├── health.controller.ts
│   ├── health.controller.test.ts
│   ├── user.controller.ts
│   └── user.controller.test.ts
├── decorators/           # Custom decorators
│   └── route.decorator.ts
├── utils/                # Utility functions
│   └── registerControllers.ts
├── app.ts                # Fastify app configuration
└── index.ts              # Application entry point
```

## Installation

```bash
npm install
```

## Usage

### Development

Run the application in development mode with ts-node:

```bash
npm run dev
```

### Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

### Production

Run the compiled application:

```bash
npm start
```

### Testing

Run tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Run tests with coverage:

```bash
npm run test:coverage
```

## Decorator Usage

### Controller Decorator

```typescript
@Controller('/api/users')
export class UserController {
  // Controller methods
}
```

### Route Decorators

```typescript
@Get('/')
async getAllUsers(request: FastifyRequest, reply: FastifyReply) {
  // Handler logic
}

@Post('/')
async createUser(request: FastifyRequest, reply: FastifyReply) {
  // Handler logic
}

@Put('/:id')
async updateUser(request: FastifyRequest, reply: FastifyReply) {
  // Handler logic
}

@Delete('/:id')
async deleteUser(request: FastifyRequest, reply: FastifyReply) {
  // Handler logic
}
```

## API Endpoints

### Health Check

- `GET /health` - Returns API health status

### Users

- `GET /users` - Get all users
- `GET /users/:id` - Get user by ID
- `POST /users` - Create new user
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user

## Configuration

The application uses the following environment variables:

- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: 0.0.0.0)

## TypeScript Configuration

The project is configured with:

- `experimentalDecorators: true` - Enable decorator syntax
- `emitDecoratorMetadata: true` - Emit metadata for decorators
- `strict: true` - Enable all strict type checking options

## Documentation

- [Authentication](./AUTH.md) - JWT authentication and authorization
- [Middleware](./MIDDLEWARE.md) - HTTP signature verification
- [Request Validation](./REQUEST_VALIDATION.md) - Zod-based request validation
- [Request Context](./REQUEST_CONTEXT.md) - Request-scoped data storage
- [Distributed Locking](./DISTRIBUTED_LOCK_USAGE.md) - Redis-based distributed locks
- [Cache](./CACHE.md) - In-memory caching with LRU eviction and TTL
