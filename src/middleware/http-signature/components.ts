import type { FastifyRequest } from 'fastify';

/**
 * Extract a component value from a request per RFC9421
 */
export function extractComponent(request: FastifyRequest, component: string): string | undefined {
  // Derived components start with @
  if (component.startsWith('@')) {
    return extractDerivedComponent(request, component);
  }

  // Regular headers (case-insensitive lookup)
  const headerValue = request.headers[component.toLowerCase()];
  if (Array.isArray(headerValue)) {
    return headerValue.join(', ');
  }
  return headerValue;
}

function extractDerivedComponent(request: FastifyRequest, component: string): string | undefined {
  switch (component) {
    case '@method':
      return request.method;

    case '@target-uri':
      return `${request.protocol}://${request.hostname}${request.url}`;

    case '@authority':
      return request.hostname;

    case '@scheme':
      return request.protocol;

    case '@path': {
      const url = request.url;
      const queryIndex = url.indexOf('?');
      return queryIndex >= 0 ? url.substring(0, queryIndex) : url;
    }

    case '@query': {
      const url = request.url;
      const queryIndex = url.indexOf('?');
      return queryIndex >= 0 ? url.substring(queryIndex) : '?';
    }

    default:
      return undefined;
  }
}
