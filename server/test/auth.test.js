const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');

describe('Auth API', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.user.email).toBe('john@example.com');
      expect(res.body.data.user).not.toHaveProperty('password');
    });

    it('should not register user with existing email', async () => {
      await User.create({
        name: 'Existing User',
        email: 'existing@example.com',
        password: 'password123'
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'New User',
          email: 'existing@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'John Doe'
          // Missing email and password
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should validate email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'John Doe',
          email: 'invalid-email',
          password: 'password123'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should validate password length', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: '12345' // Less than 6 characters
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });
    });

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.user.email).toBe('test@example.com');
    });

    it('should not login with invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'wrong@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should not login with invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com'
          // Missing password
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should get current user with valid token', async () => {
      const user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });

      const { generateToken } = require('../src/config/jwt');
      const token = generateToken(user._id);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('test@example.com');
    });

    it('should not get user without token', async () => {
      const res = await request(app)
        .get('/api/auth/me');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should not get user with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    beforeEach(async () => {
      await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });
    });

    it('should send OTP to existing email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'test@example.com'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('OTP');
    });

    it('should return 404 for non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'nonexistent@example.com'
        });

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('not found');
    });

    it('should validate email format', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'invalid-email'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    let user;
    let otp;

    beforeEach(async () => {
      user = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      });

      // Generate OTP manually for testing
      otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.passwordResetToken = otp;
      user.passwordResetExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
      await user.save();
    });

    it('should reset password with valid OTP', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: 'test@example.com',
          otp: otp,
          password: 'newpassword123'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Password reset successful');

      // Verify password was changed
      const updatedUser = await User.findById(user._id).select('+password');
      const isMatch = await updatedUser.comparePassword('newpassword123');
      expect(isMatch).toBe(true);
    });

    it('should not reset password with invalid OTP', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: 'test@example.com',
          otp: '000000',
          password: 'newpassword123'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should not reset password with expired OTP', async () => {
      // Set OTP to expired
      user.passwordResetExpires = Date.now() - 1000;
      await user.save();

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: 'test@example.com',
          otp: otp,
          password: 'newpassword123'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: 'test@example.com'
          // Missing OTP and password
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});

