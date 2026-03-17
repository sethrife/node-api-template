# Design: application/x-www-form-urlencoded Support

**Date:** 2026-03-16
**Status:** Approved

## Overview

Add support for parsing `application/x-www-form-urlencoded` request bodies globally across all routes. Fastify only parses `application/json` by default; this change registers `@fastify/formbody` to handle flat key-value form data.

## Scope

- Flat key-value parsing only (e.g., `name=John&email=foo%40bar.com`)
- Global — all routes can receive urlencoded bodies without any per-route configuration
- No nested object/array support (e.g., no `user[name]=John` style)

## Components

### New: `src/plugins/formbody.plugin.ts`

Wraps `@fastify/formbody` in `fastify-plugin` following the existing plugin pattern used by `redis.plugin.ts`, `cache.plugin.ts`, etc. Uses the default parser (Node's built-in `querystring` module).

### Modified: `src/app.ts`

Import and register `formbodyPlugin` alongside the other plugins in `buildApp()`.

### New dependency

- `@fastify/formbody` added to `dependencies` in `package.json`

### New test: `test/plugins/formbody.test.ts`

- Verifies flat key-value urlencoded bodies are parsed into objects
- Verifies Zod coercion works (urlencoded values are strings; `z.coerce.number()` converts them)

## Schema Authoring Note

All urlencoded values arrive as strings. Schemas that expect numbers must use `z.coerce.number()` — the same guidance already documented for query params in `docs/REQUEST_VALIDATION.md`. No changes to the validation layer are required.

## What Is Not Changing

- JSON body parsing — unchanged, still the default
- Validation layer (`src/utils/validation.ts`) — no changes needed
- Route decorators (`@Schema`, `@Controller`, etc.) — no changes needed
- Existing tests — no changes needed