import { FastifyRequest, FastifyReply } from 'fastify';
import { Controller, Get, Post } from '../decorators/route.decorator.js';
import { jwtAuth } from '../middleware/jwt-auth.js';

@Controller('/api/protected')
export class ProtectedController {
  /**
   * Public endpoint - no authentication required
   */
  @Get('/public')
  async getPublic(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      message: 'This is a public endpoint',
      authenticated: false,
    });
  }

  /**
   * Protected endpoint - requires valid JWT, no specific scope
   */
  @Get('/profile', jwtAuth())
  async getProfile(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      message: 'Profile data',
      user: {
        id: request.user.sub,
        email: request.user.email,
        // All JWT claims available in request.user
      },
    });
  }

  /**
   * Admin endpoint - requires valid JWT with 'admin' scope
   */
  @Get('/admin', jwtAuth('admin'))
  async adminEndpoint(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      message: 'Admin access granted',
      userId: request.user.sub,
    });
  }

  /**
   * Create user endpoint - requires valid JWT with both 'users:write' and 'admin' scopes
   */
  @Post('/users', jwtAuth(['users:write', 'admin']))
  async createUser(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      message: 'User created',
      createdBy: request.user.sub,
    });
  }

  /**
   * Read-only endpoint - requires 'read' scope
   */
  @Get('/data', jwtAuth('read'))
  async getData(request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      message: 'Here is your data',
      data: [1, 2, 3],
    });
  }
}
