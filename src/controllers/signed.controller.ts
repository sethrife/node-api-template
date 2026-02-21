import { FastifyRequest, FastifyReply } from 'fastify';
import { Controller, Get, Post } from '../decorators/route.decorator.js';
import { httpSig, createSigner } from '../middleware/http-signature/index.js';
import { config } from '../config/index.js';

@Controller('/api/signed')
export class SignedController {
  /**
   * Endpoint requiring HTTP signature with default components
   * Requires: @method, @target-uri, @authority
   */
  @Get('/secure', httpSig())
  async getSecure(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      message: 'Request signature verified',
      signature: {
        keyId: request.httpSignature?.keyId,
        algorithm: request.httpSignature?.algorithm,
        components: request.httpSignature?.components,
      },
    });
  }

  /**
   * Endpoint requiring HTTP signature with content-digest
   * Ensures the request body hasn't been tampered with
   */
  @Post('/data', httpSig({ required: ['@method', '@target-uri', 'content-digest', 'content-type'] }))
  async postData(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      message: 'Signed request accepted',
      signature: {
        keyId: request.httpSignature?.keyId,
        algorithm: request.httpSignature?.algorithm,
        components: request.httpSignature?.components,
        created: request.httpSignature?.created,
      },
      receivedBody: request.body,
    });
  }

  /**
   * Endpoint requiring signature with specific algorithm
   * Only allows rsa-pss-sha512 signatures
   */
  @Post(
    '/strict',
    httpSig({
      required: ['@method', '@target-uri', 'content-digest', 'date'],
      algorithms: ['rsa-pss-sha512'],
      maxAge: 60, // Signature must be less than 60 seconds old
    })
  )
  async postStrict(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      message: 'Strict signature requirements met',
      signature: request.httpSignature,
    });
  }

  /**
   * Demonstrates signing an outgoing request
   * This endpoint makes a signed HTTP request to an external service
   */
  @Post('/proxy')
  async proxyRequest(request: FastifyRequest<{ Body: { targetUrl: string; payload: unknown } }>, reply: FastifyReply) {
    const { targetUrl, payload } = request.body;

    // Check if signing is configured
    if (!config.httpSignature.privateKey || !config.httpSignature.keyId) {
      return reply.code(503).send({
        error: 'signing_not_configured',
        message: 'HTTP signature signing is not configured. Set HTTP_SIG_PRIVATE_KEY and HTTP_SIG_KEY_ID.',
      });
    }

    try {
      // Create a signer for outgoing requests
      const signer = await createSigner({
        keyId: config.httpSignature.keyId,
        privateKey: config.httpSignature.privateKey,
        algorithm: config.httpSignature.defaultAlgorithm,
        components: ['@method', '@target-uri', 'content-digest', 'content-type', 'date'],
      });

      const body = JSON.stringify(payload);

      // Sign the outgoing request
      const signedHeaders = await signer.sign({
        method: 'POST',
        url: targetUrl,
        headers: {
          'Content-Type': 'application/json',
          Date: new Date().toUTCString(),
        },
        body,
      });

      // Make the signed request
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: signedHeaders,
        body,
      });

      const responseData = await response.text();

      return reply.send({
        message: 'Signed request sent successfully',
        signedWith: {
          keyId: config.httpSignature.keyId,
          algorithm: config.httpSignature.defaultAlgorithm,
        },
        response: {
          status: response.status,
          body: responseData,
        },
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'signing_failed',
        message: error instanceof Error ? error.message : 'Failed to sign request',
      });
    }
  }

  /**
   * Example endpoint showing combined JWT + HTTP signature auth
   * Uncomment jwtAuth to require both authentication methods
   */
  @Post(
    '/double-auth',
    // jwtAuth('admin'),  // Uncomment to also require JWT
    httpSig({ required: ['@method', '@target-uri', 'authorization'] })
  )
  async doubleAuth(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      message: 'Both JWT and HTTP signature verified',
      httpSignature: request.httpSignature,
      // user: request.user,  // Available when jwtAuth is enabled
    });
  }

  /**
   * Call an external API protected by OAuth2 (client credentials flow)
   * Uses the 'partner' provider configured via OAUTH2_PARTNER_* env vars
   */
  @Post('/oauth2-proxy')
  async oauth2Proxy(
    request: FastifyRequest<{ Body: { targetUrl: string } }>,
    reply: FastifyReply
  ) {
    const { targetUrl } = request.body;

    try {
      // Use OAuth2 client to make authenticated request
      const response = await request.server.oauth2.fetch('partner', targetUrl);
      const data = await response.text();

      return reply.send({
        message: 'OAuth2 authenticated request successful',
        response: {
          status: response.status,
          body: data,
        },
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'oauth2_request_failed',
        message: error instanceof Error ? error.message : 'Failed to make OAuth2 request',
      });
    }
  }

  /**
   * Call an external API using token exchange (user context)
   * Exchanges the incoming user's JWT for a downstream token
   */
  @Post('/oauth2-exchange')
  async oauth2Exchange(
    request: FastifyRequest<{ Body: { targetUrl: string } }>,
    reply: FastifyReply
  ) {
    const { targetUrl } = request.body;
    const userToken = request.headers.authorization?.replace('Bearer ', '');

    if (!userToken) {
      return reply.code(401).send({
        error: 'missing_token',
        message: 'Authorization header with Bearer token required',
      });
    }

    try {
      // Exchange user token for downstream service token
      const response = await request.server.oauth2.fetch('partner', targetUrl, {
        tokenExchange: { subjectToken: userToken },
      });
      const data = await response.text();

      return reply.send({
        message: 'Token exchange request successful',
        response: {
          status: response.status,
          body: data,
        },
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'token_exchange_failed',
        message: error instanceof Error ? error.message : 'Failed to exchange token',
      });
    }
  }

  /**
   * Call an external API with both OAuth2 and HTTP signature
   * Demonstrates combining both authentication methods
   */
  @Post('/oauth2-signed')
  async oauth2Signed(
    request: FastifyRequest<{ Body: { targetUrl: string; payload: unknown } }>,
    reply: FastifyReply
  ) {
    const { targetUrl, payload } = request.body;

    if (!config.httpSignature.privateKey || !config.httpSignature.keyId) {
      return reply.code(503).send({
        error: 'signing_not_configured',
        message: 'HTTP signature signing not configured',
      });
    }

    try {
      // Create HTTP signer
      const signer = await createSigner({
        keyId: config.httpSignature.keyId,
        privateKey: config.httpSignature.privateKey,
        algorithm: config.httpSignature.defaultAlgorithm,
        components: ['@method', '@target-uri', 'content-digest', 'content-type'],
      });

      // Make request with OAuth2 + HTTP signature
      const response = await request.server.oauth2.fetch('partner', targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signer, // Adds HTTP signature on top of OAuth2
      });

      const data = await response.text();

      return reply.send({
        message: 'OAuth2 + HTTP signature request successful',
        response: {
          status: response.status,
          body: data,
        },
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'request_failed',
        message: error instanceof Error ? error.message : 'Request failed',
      });
    }
  }
}
