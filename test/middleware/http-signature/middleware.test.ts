import { httpSig } from '../../../src/middleware/http-signature/index.js';
import type { FastifyReply } from 'fastify';
import '../../../src/middleware/http-signature/algorithms/rsa-pss-sha512.js';
import { getAlgorithm } from '../../../src/middleware/http-signature/algorithms/index.js';
import { generateKeyPair } from 'jose';
import { buildSignatureBase, buildSignatureParams } from '../../../src/middleware/http-signature/signature-base.js';

interface MockRequest {
  method: string;
  url: string;
  headers: Record<string, string | undefined>;
  hostname: string;
  protocol: string;
  httpSignature?: any;
}

interface MockReply {
  statusCode: number;
  body: any;
  responseHeaders: Record<string, string>;
  code: jest.Mock;
  send: jest.Mock;
  header: jest.Mock;
}

function createMockRequest(overrides: Partial<MockRequest> = {}): MockRequest {
  return {
    method: 'POST',
    url: '/api/data',
    headers: {},
    hostname: 'example.com',
    protocol: 'https',
    ...overrides,
  };
}

function createMockReply(): MockReply {
  const reply: MockReply = {
    statusCode: 200,
    body: null,
    responseHeaders: {},
    code: jest.fn(),
    send: jest.fn(),
    header: jest.fn(),
  };
  reply.code.mockImplementation((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  reply.send.mockImplementation((body: any) => {
    reply.body = body;
    return reply;
  });
  reply.header.mockImplementation((name: string, value: string) => {
    reply.responseHeaders[name] = value;
    return reply;
  });
  return reply;
}

async function callMiddleware(
  middleware: ReturnType<typeof httpSig>,
  request: MockRequest,
  reply: MockReply
) {
  return middleware.call({} as any, request as any, reply as unknown as FastifyReply, jest.fn());
}

// Mock the config
jest.mock('../../../src/config/index.js', () => ({
  config: {
    httpSignature: {
      jwksUrl: 'https://example.com/.well-known/jwks.json',
      maxAge: 300,
      defaultAlgorithm: 'rsa-pss-sha512',
    },
  },
}));

// Mock the key resolver
jest.mock('../../../src/middleware/http-signature/jwks.js', () => {
  let mockPublicKey: any = null;
  return {
    createKeyResolver: jest.fn(() => ({
      resolve: jest.fn(async () => mockPublicKey),
    })),
    getDefaultKeyResolver: jest.fn(() => ({
      resolve: jest.fn(async () => mockPublicKey),
    })),
    setMockPublicKey: (key: any) => {
      mockPublicKey = key;
    },
  };
});

describe('httpSig middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 when Signature header is missing', async () => {
    const middleware = httpSig();
    const request = createMockRequest();
    const reply = createMockReply();

    await callMiddleware(middleware, request, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.body.error).toBe('signature_required');
    expect(reply.responseHeaders['WWW-Authenticate']).toContain('Signature');
  });

  it('should return 401 when Signature-Input header is missing', async () => {
    const middleware = httpSig();
    const request = createMockRequest({
      headers: {
        signature: 'sig1=:dGVzdA==:',
      },
    });
    const reply = createMockReply();

    await callMiddleware(middleware, request, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.body.error).toBe('signature_required');
  });

  it('should return 401 when required components are not covered', async () => {
    const middleware = httpSig({ required: ['content-digest', 'date'] });
    const request = createMockRequest({
      headers: {
        signature: 'sig1=:dGVzdA==:',
        'signature-input': 'sig1=("@method");keyid="k1";alg="rsa-pss-sha512"',
      },
    });
    const reply = createMockReply();

    await callMiddleware(middleware, request, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.body.error).toBe('missing_components');
  });

  it('should verify valid signature and attach info to request', async () => {
    const { publicKey, privateKey } = await generateKeyPair('PS512');

    // Set the mock public key
    const jwksMock = await import('../../../src/middleware/http-signature/jwks.js');
    (jwksMock as any).setMockPublicKey(publicKey);

    const middleware = httpSig();
    const sigInput = {
      label: 'sig1',
      components: ['@method', '@target-uri', '@authority'],
      keyid: 'test-key',
      alg: 'rsa-pss-sha512',
      created: Math.floor(Date.now() / 1000),
    };

    const request = createMockRequest({
      headers: {
        'signature-input': `sig1=("@method" "@target-uri" "@authority");keyid="test-key";alg="rsa-pss-sha512";created=${sigInput.created}`,
      },
    });

    // Create real signature
    const algo = getAlgorithm('rsa-pss-sha512')!;
    const signatureBase = buildSignatureBase(request as any, sigInput);
    const signatureBytes = await algo.sign(privateKey, new TextEncoder().encode(signatureBase));
    const base64Sig = btoa(String.fromCharCode(...signatureBytes));

    request.headers.signature = `sig1=:${base64Sig}:`;

    const reply = createMockReply();

    await callMiddleware(middleware, request, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(request.httpSignature).toBeDefined();
    expect(request.httpSignature.keyId).toBe('test-key');
  });
});
