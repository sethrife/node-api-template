import { FastifyRequest, FastifyReply } from 'fastify';
import { Controller, Get, Post, Put, Delete } from '../decorators/route.decorator';

interface User {
  id: number;
  name: string;
  email: string;
}

@Controller('/users')
export class UserController {
  private users: User[] = [
    { id: 1, name: 'John Doe', email: 'john@example.com' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
  ];

  @Get('/')
  async getAllUsers(request: FastifyRequest, reply: FastifyReply) {
    return reply.send(this.users);
  }

  @Get('/:id')
  async getUserById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const id = parseInt(request.params.id);
    const user = this.users.find(u => u.id === id);

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send(user);
  }

  @Post('/')
  async createUser(
    request: FastifyRequest<{ Body: Omit<User, 'id'> }>,
    reply: FastifyReply
  ) {
    const newUser: User = {
      id: this.users.length + 1,
      ...request.body
    };

    this.users.push(newUser);
    return reply.status(201).send(newUser);
  }

  @Put('/:id')
  async updateUser(
    request: FastifyRequest<{ Params: { id: string }; Body: Partial<Omit<User, 'id'>> }>,
    reply: FastifyReply
  ) {
    const id = parseInt(request.params.id);
    const userIndex = this.users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      return reply.status(404).send({ error: 'User not found' });
    }

    this.users[userIndex] = { ...this.users[userIndex], ...request.body };
    return reply.send(this.users[userIndex]);
  }

  @Delete('/:id')
  async deleteUser(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const id = parseInt(request.params.id);
    const userIndex = this.users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      return reply.status(404).send({ error: 'User not found' });
    }

    this.users.splice(userIndex, 1);
    return reply.status(204).send();
  }
}
