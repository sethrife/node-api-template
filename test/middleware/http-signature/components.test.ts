import { extractComponent } from '../../../src/middleware/http-signature/components.js';
import type { FastifyRequest } from 'fastify';

function createMockRequest(overrides: Partial<{
  method: string;
  url: string;
  headers: Record<string, string>;
  hostname: string;
  protocol: string;
}>): FastifyRequest {
  return {
    method: overrides.method ?? 'GET',
    url: overrides.url ?? '/api/data',
    headers: overrides.headers ?? {},
    hostname: overrides.hostname ?? 'example.com',
    protocol: overrides.protocol ?? 'https',
  } as FastifyRequest;
}

describe('extractComponent', () => {
  describe('derived components', () => {
    it('should extract @method', () => {
      const request = createMockRequest({ method: 'POST' });
      expect(extractComponent(request, '@method')).toBe('POST');
    });

    it('should extract @target-uri', () => {
      const request = createMockRequest({
        protocol: 'https',
        hostname: 'example.com',
        url: '/api/data?foo=bar',
      });
      expect(extractComponent(request, '@target-uri')).toBe('https://example.com/api/data?foo=bar');
    });

    it('should extract @authority', () => {
      const request = createMockRequest({ hostname: 'example.com' });
      expect(extractComponent(request, '@authority')).toBe('example.com');
    });

    it('should extract @scheme', () => {
      const request = createMockRequest({ protocol: 'https' });
      expect(extractComponent(request, '@scheme')).toBe('https');
    });

    it('should extract @path', () => {
      const request = createMockRequest({ url: '/api/data?foo=bar' });
      expect(extractComponent(request, '@path')).toBe('/api/data');
    });

    it('should extract @query', () => {
      const request = createMockRequest({ url: '/api/data?foo=bar&baz=qux' });
      expect(extractComponent(request, '@query')).toBe('?foo=bar&baz=qux');
    });

    it('should return empty @query when no query string', () => {
      const request = createMockRequest({ url: '/api/data' });
      expect(extractComponent(request, '@query')).toBe('?');
    });
  });

  describe('header components', () => {
    it('should extract header value (case-insensitive)', () => {
      const request = createMockRequest({
        headers: { 'content-type': 'application/json' },
      });
      expect(extractComponent(request, 'content-type')).toBe('application/json');
    });

    it('should return undefined for missing header', () => {
      const request = createMockRequest({ headers: {} });
      expect(extractComponent(request, 'content-type')).toBeUndefined();
    });
  });
});
