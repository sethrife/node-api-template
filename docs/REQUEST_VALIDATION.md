# Request Validation Guide

## Overview

This application uses **Zod** for runtime request validation integrated with Fastify through a custom decorator-based system. Validation is declarative, type-safe, and automatically enforced for all decorated routes.

## How It Works

### Architecture

The validation system consists of four main components:

1. **`@Schema` Decorator** (`src/decorators/schema.decorator.ts`)
   - Attaches Zod schemas to route handler methods
   - Stores schema metadata using `reflect-metadata`

2. **Validation Prehandler** (`src/utils/validation.ts`)
   - Fastify preHandler hook that runs before route handlers
   - Validates request data against Zod schemas
   - Returns 400 errors with detailed validation messages on failure

3. **Schema Files** (`src/schemas/`)
   - Reusable Zod schema definitions
   - Type inference for TypeScript types
   - Schema composition and transformation

4. **Controller Registration** (`src/utils/registerControllers.ts`)
   - Automatically attaches validation prehandlers to decorated routes
   - Integrates validation with existing middleware

### Request Flow

```
1. Request arrives → Fastify
2. Route matched → Controller method identified
3. Prehandler runs → Validation executed (if @Schema present)
   ├─ Valid → Continue to handler
   └─ Invalid → Return 400 with error details
4. Route handler executes → Response sent
```

## Usage

### Basic Validation

Add the `@Schema` decorator to any route handler to enable validation:

```typescript
import { Schema } from '../decorators/schema.decorator.js';
import { createUserSchema } from '../schemas/user.schema.js';

@Controller('/users')
export class UserController {
  @Post('/')
  @Schema({ body: createUserSchema })
  async createUser(request: FastifyRequest<{ Body: CreateUserDto }>, reply: FastifyReply) {
    // request.body is validated and typed
    const newUser = {
      id: generateId(),
      ...request.body
    };
    return reply.status(201).send(newUser);
  }
}
```

### Validating Multiple Parts

You can validate `body`, `params`, `querystring`, and `headers`:

```typescript
@Put('/:id')
@Schema({
  params: userIdParamSchema,    // Validate route parameters
  body: updateUserSchema,       // Validate request body
  querystring: paginationSchema // Validate query parameters
})
async updateUser(
  request: FastifyRequest<{
    Params: { id: string };
    Body: UpdateUserDto;
    Querystring: PaginationQuery;
  }>,
  reply: FastifyReply
) {
  // All parts are validated
  const { id } = request.params;
  const userData = request.body;
  const { limit, offset } = request.query;
  // ...
}
```

### Inline Schemas

For simple validations, define schemas inline:

```typescript
import { z } from 'zod';

@Get('/search')
@Schema({
  querystring: z.object({
    q: z.string().min(1, 'Search query is required'),
    limit: z.coerce.number().min(1).max(100).default(10)
  })
})
async search(request: FastifyRequest, reply: FastifyReply) {
  // Validation applied inline
}
```

## Creating Schemas

### Basic Schema Definition

```typescript
// src/schemas/user.schema.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email format'),
  age: z.number().int().min(0).max(150).optional()
});

// Export TypeScript type
export type CreateUserDto = z.infer<typeof createUserSchema>;
```

### Schema Composition

Zod provides powerful composition methods:

```typescript
// Base schema
export const userSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['admin', 'user', 'guest'])
});

// Omit fields for creation (id is auto-generated)
export const createUserSchema = userSchema.omit({ id: true });

// All fields optional for partial update
export const updateUserSchema = userSchema.omit({ id: true }).partial();

// Pick specific fields
export const userSummarySchema = userSchema.pick({
  id: true,
  name: true
});

// Extend with additional fields
export const userWithTimestampsSchema = userSchema.extend({
  createdAt: z.date(),
  updatedAt: z.date()
});
```

### Type Coercion

Query parameters are strings by default. Use `z.coerce` for automatic conversion:

```typescript
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z.string().optional()
});

// Query: ?limit=20&offset=5
// Result: { limit: 20, offset: 5 } (numbers, not strings)
```

### Custom Validation

Use `.refine()` for complex validation logic:

```typescript
export const passwordSchema = z.object({
  password: z.string().min(8),
  confirmPassword: z.string()
}).refine(
  (data) => data.password === data.confirmPassword,
  {
    message: "Passwords don't match",
    path: ['confirmPassword']
  }
);
```

### Conditional Validation

```typescript
export const contactSchema = z.object({
  type: z.enum(['email', 'phone']),
  value: z.string()
}).refine(
  (data) => {
    if (data.type === 'email') {
      return z.string().email().safeParse(data.value).success;
    }
    if (data.type === 'phone') {
      return /^\d{10}$/.test(data.value);
    }
    return false;
  },
  { message: 'Value must match the selected type' }
);
```

### Transformations

Transform data during validation:

```typescript
export const dateRangeSchema = z.object({
  startDate: z.string().transform((str) => new Date(str)),
  endDate: z.string().transform((str) => new Date(str))
});

// Input: { startDate: "2024-01-01", endDate: "2024-12-31" }
// Output: { startDate: Date, endDate: Date }
```

## Error Handling

### Error Response Format

When validation fails, the API returns a standardized error response:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": [
    {
      "path": "email",
      "message": "Invalid email format",
      "code": "invalid_format"
    },
    {
      "path": "age",
      "message": "Number must be greater than or equal to 0",
      "code": "too_small"
    }
  ]
}
```

### Error Fields

- **`statusCode`**: HTTP status code (always 400 for validation errors)
- **`error`**: Error type string
- **`message`**: General error message
- **`details`**: Array of validation errors
  - **`path`**: Field path (e.g., `"email"`, `"address.city"`)
  - **`message`**: Human-readable error message
  - **`code`**: Zod error code (e.g., `"invalid_type"`, `"too_small"`)

### Logging

Validation errors are automatically logged using Fastify's request logger:

```json
{
  "level": 30,
  "validationErrors": [...],
  "msg": "Request validation failed"
}
```

This helps with debugging while keeping error responses clean for clients.

## Common Patterns

### Parameter Validation

```typescript
// Numeric ID
export const numericIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID must be numeric')
});

// UUID
export const uuidIdParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format')
});

// Slug
export const slugParamSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Invalid slug format')
});
```

### Pagination

```typescript
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  offset: z.coerce.number().int().min(0).default(0)
});
```

### Search

```typescript
export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required').max(200),
  ...paginationQuerySchema.shape // Extend with pagination
});
```

### File Upload Metadata

```typescript
export const fileUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimetype: z.string().regex(/^[a-z]+\/[a-z0-9\-\+\.]+$/),
  size: z.number().int().min(1).max(10 * 1024 * 1024) // 10MB max
});
```

### Enum Validation

```typescript
export const userRoleSchema = z.enum(['admin', 'user', 'guest']);

export const sortOrderSchema = z.enum(['asc', 'desc']).default('asc');
```

### Array Validation

```typescript
export const createOrderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().min(1).max(100)
    })
  ).min(1, 'At least one item is required').max(50)
});
```

## Best Practices

### 1. Organize Schemas by Domain

```
src/schemas/
├── user.schema.ts       # User-related schemas
├── product.schema.ts    # Product-related schemas
├── order.schema.ts      # Order-related schemas
└── common.schema.ts     # Reusable common schemas
```

### 2. Export Types Alongside Schemas

```typescript
export const createUserSchema = z.object({ ... });
export type CreateUserDto = z.infer<typeof createUserSchema>;
```

This ensures TypeScript types stay in sync with validation schemas.

### 3. Use Descriptive Error Messages

```typescript
// Good
z.string().min(1, 'Name is required')
z.string().email('Invalid email format')

// Avoid
z.string().min(1)
z.string().email()
```

### 4. Validate at System Boundaries

Apply validation to:
- User input (request bodies, query params, route params)
- External APIs (webhook payloads, third-party responses)
- Configuration data

**Don't validate:**
- Internal function calls
- Data from your own database
- Trusted services

### 5. Reuse Common Schemas

```typescript
// common.schema.ts
export const emailSchema = z.string().email('Invalid email format');
export const phoneSchema = z.string().regex(/^\d{10}$/, 'Phone must be 10 digits');

// user.schema.ts
import { emailSchema, phoneSchema } from './common.schema.js';

export const createUserSchema = z.object({
  email: emailSchema,
  phone: phoneSchema
});
```

### 6. Use `.strict()` for Security-Sensitive Endpoints

By default, Zod strips unknown fields. For extra security:

```typescript
export const loginSchema = z.object({
  username: z.string(),
  password: z.string()
}).strict(); // Reject requests with extra fields
```

### 7. Combine with TypeScript Generics

```typescript
@Get('/:id')
@Schema({ params: userIdParamSchema })
async getUser(
  request: FastifyRequest<{ Params: UserIdParam }>,
  reply: FastifyReply
) {
  // Full type safety
}
```

## Advanced Topics

### Custom Error Handler

To customize error responses globally, modify `src/utils/validation.ts`:

```typescript
return reply.status(400).send({
  success: false,
  errors: error.issues.map((e) => ({
    field: e.path.join('.'),
    error: e.message
  }))
});
```

### Async Validation

For database checks or external API calls:

```typescript
export const uniqueEmailSchema = z.string().email().refine(
  async (email) => {
    const exists = await checkEmailExists(email);
    return !exists;
  },
  { message: 'Email already registered' }
);
```

**Note:** Async validation may impact performance. Use sparingly.

### Schema Testing

Test your schemas independently:

```typescript
import { describe, it, expect } from 'jest';
import { createUserSchema } from '../schemas/user.schema';

describe('createUserSchema', () => {
  it('should validate correct user data', () => {
    const result = createUserSchema.safeParse({
      name: 'John Doe',
      email: 'john@example.com'
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = createUserSchema.safeParse({
      name: 'John Doe',
      email: 'invalid-email'
    });
    expect(result.success).toBe(false);
  });
});
```

## Troubleshooting

### Validation Not Running

**Check:**
1. Is `@Schema` decorator present on the route handler?
2. Is the schema imported correctly?
3. Is `reflect-metadata` imported at the app entry point?

### Type Errors with Spread Operator

If you see `TS2698: Spread types may only be created from object types`:

```typescript
// Solution: Add type assertion
const data = {
  id: 1,
  ...(request.body as CreateUserDto)
};
```

### Headers Validation Not Working

Headers are case-insensitive in HTTP. Normalize them:

```typescript
export const headersSchema = z.object({
  'x-api-key': z.string(),
  'content-type': z.literal('application/json')
});
```

### Coercion Not Working on Query Params

Ensure you're using `z.coerce`:

```typescript
// Wrong
z.number() // Query params are strings!

// Correct
z.coerce.number() // Converts "5" → 5
```

## Migration Guide

### From No Validation

1. Create schema file for your entity
2. Add `@Schema` decorator to routes
3. Update TypeScript types to use `z.infer<>`
4. Test with invalid data to verify

### From JSON Schema

Zod equivalents for common JSON Schema patterns:

| JSON Schema | Zod |
|-------------|-----|
| `{ "type": "string" }` | `z.string()` |
| `{ "type": "number" }` | `z.number()` |
| `{ "type": "integer" }` | `z.number().int()` |
| `{ "minLength": 1 }` | `z.string().min(1)` |
| `{ "maxLength": 100 }` | `z.string().max(100)` |
| `{ "minimum": 0 }` | `z.number().min(0)` |
| `{ "enum": ["a", "b"] }` | `z.enum(["a", "b"])` |
| `{ "required": ["name"] }` | `z.object({ name: z.string() })` (default) |
| `{ "additionalProperties": false }` | `z.object({...}).strict()` |

## Resources

- [Zod Documentation](https://zod.dev)
- [Fastify Validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [TypeScript Type Inference](https://www.typescriptlang.org/docs/handbook/type-inference.html)

## Examples

See the following files for working examples:
- `src/schemas/user.schema.ts` - User validation schemas
- `src/schemas/common.schema.ts` - Reusable common schemas
- `src/controllers/user.controller.ts` - Controller with validation decorators
