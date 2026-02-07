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
}
