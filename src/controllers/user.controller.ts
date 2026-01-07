import { FastifyRequest, FastifyReply } from 'fastify';
import { Controller, Get, Post, Put, Delete } from '../decorators/route.decorator.js';
import { Schema } from '../decorators/schema.decorator.js';
import {
  User,
  CreateUserDto,
  UpdateUserDto,
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
} from '../schemas/user.schema.js';

@Controller('/users')
export class UserController {
  private users: User[] = [
    { id: 1, name: 'John Doe', email: 'john@example.com' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
  ];

  @Get('/')
  async getAllUsers(request: FastifyRequest, reply: FastifyReply) {
    return reply.send(this.users);
  }

  @Get('/:id')
  @Schema({ params: userIdParamSchema })
  async getUserById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const id = parseInt(request.params.id);
    const user = this.users.find((u) => u.id === id);

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send(user);
  }

  @Post('/')
  @Schema({ body: createUserSchema })
  async createUser(request: FastifyRequest<{ Body: CreateUserDto }>, reply: FastifyReply) {
    const newUser: User = {
      id: this.users.length + 1,
      ...request.body,
    };

    this.users.push(newUser);
    return reply.status(201).send(newUser);
  }

  @Put('/:id')
  @Schema({
    params: userIdParamSchema,
    body: updateUserSchema,
  })
  async updateUser(
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateUserDto }>,
    reply: FastifyReply
  ) {
    const id = parseInt(request.params.id);
    const userIndex = this.users.findIndex((u) => u.id === id);

    if (userIndex === -1) {
      return reply.status(404).send({ error: 'User not found' });
    }

    this.users[userIndex] = { ...this.users[userIndex], ...request.body };
    return reply.send(this.users[userIndex]);
  }

  @Delete('/:id')
  @Schema({ params: userIdParamSchema })
  async deleteUser(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const id = parseInt(request.params.id);
    const userIndex = this.users.findIndex((u) => u.id === id);

    if (userIndex === -1) {
      return reply.status(404).send({ error: 'User not found' });
    }

    this.users.splice(userIndex, 1);
    return reply.status(204).send();
  }
}
