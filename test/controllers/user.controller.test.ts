import { buildApp } from '../../src/app.js';
import { FastifyInstance } from 'fastify';

describe('UserController', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /users', () => {
    it('should return all users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users',
      });

      expect(response.statusCode).toBe(200);
      const users = JSON.parse(response.body);
      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);
    });
  });

  describe('GET /users/:id', () => {
    it('should return a user by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/1',
      });

      expect(response.statusCode).toBe(200);
      const user = JSON.parse(response.body);
      expect(user).toHaveProperty('id', 1);
      expect(user).toHaveProperty('name');
      expect(user).toHaveProperty('email');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/users/999',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'User not found');
    });
  });

  describe('POST /users', () => {
    it('should create a new user', async () => {
      const newUser = {
        name: 'Test User',
        email: 'test@example.com',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/users',
        payload: newUser,
      });

      expect(response.statusCode).toBe(201);
      const user = JSON.parse(response.body);
      expect(user).toHaveProperty('id');
      expect(user.name).toBe(newUser.name);
      expect(user.email).toBe(newUser.email);
    });
  });

  describe('PUT /users/:id', () => {
    it('should update an existing user', async () => {
      const updates = {
        name: 'Updated Name',
      };

      const response = await app.inject({
        method: 'PUT',
        url: '/users/1',
        payload: updates,
      });

      expect(response.statusCode).toBe(200);
      const user = JSON.parse(response.body);
      expect(user.name).toBe(updates.name);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/users/999',
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /users/:id', () => {
    it('should delete an existing user', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/users/2',
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/users/999',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /users/:id - application/x-www-form-urlencoded', () => {
    it('should update a user from valid form data', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/users/1',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'name=Form+Updated',
      });

      expect(response.statusCode).toBe(200);
      const user = JSON.parse(response.body);
      expect(user.name).toBe('Form Updated');
    });

    it('should return 400 with validation details when form data fails schema validation', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/users/1',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'email=not-an-email',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Bad Request');
      expect(body.details).toBeDefined();
    });
  });

  describe('POST /users - application/x-www-form-urlencoded', () => {
    it('should create a user from valid form data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/users',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'name=Form+User&email=form%40example.com',
      });

      expect(response.statusCode).toBe(201);
      const user = JSON.parse(response.body);
      expect(user.name).toBe('Form User');
      expect(user.email).toBe('form@example.com');
    });

    it('should return 400 with validation details when form data fails schema validation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/users',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'name=&email=not-an-email',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Bad Request');
      expect(body.details).toBeDefined();
      expect(body.details.length).toBeGreaterThan(0);
    });
  });
});
