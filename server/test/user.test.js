const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const { generateToken } = require('../src/config/jwt');

describe('User API', () => {
  let adminToken;
  let memberToken;
  let adminId;
  let memberId;

  beforeEach(async () => {
    const admin = await User.create({
      name: 'Admin User',
      email: `admin${Date.now()}@example.com`,
      password: 'password123',
      role: 'admin'
    });
    adminId = admin._id;
    adminToken = generateToken(admin._id);

    const member = await User.create({
      name: 'Member User',
      email: `member${Date.now()}@example.com`,
      password: 'password123',
      role: 'member'
    });
    memberId = member._id;
    memberToken = generateToken(member._id);
  });

  describe('GET /api/users', () => {
    it('should get all users for admin', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should not allow member to get all users', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.statusCode).toBe(403);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/users');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/users/:id', () => {
    it('should get a single user', async () => {
      const res = await request(app)
        .get(`/api/users/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id.toString()).toBe(memberId.toString());
      expect(res.body.data).not.toHaveProperty('password');
    });

    it('should return 404 for non-existent user', async () => {
      const mongoose = require('mongoose');
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/users/:id', () => {
    it('should allow user to update themselves', async () => {
      const res = await request(app)
        .put(`/api/users/${memberId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          name: 'Updated Name'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Name');
    });

    it('should allow admin to update any user', async () => {
      const res = await request(app)
        .put(`/api/users/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Admin Updated Name'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.name).toBe('Admin Updated Name');
    });

    it('should not allow member to update other users', async () => {
      const otherUser = await User.create({
        name: 'Other User',
        email: `other${Date.now()}@example.com`,
        password: 'password123'
      });

      const res = await request(app)
        .put(`/api/users/${otherUser._id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          name: 'Hacked Name'
        });

      expect(res.statusCode).toBe(403);
    });
  });
});

