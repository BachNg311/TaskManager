const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');
const { generateToken } = require('../../src/config/jwt');

/**
 * Create a test user and return user data and token
 */
const createTestUser = async (userData = {}) => {
  const defaultUser = {
    name: 'Test User',
    email: `test${Date.now()}@example.com`,
    password: 'password123',
    role: 'member',
    ...userData
  };

  const user = await User.create(defaultUser);
  const token = generateToken(user._id);

  return { user, token };
};

/**
 * Get authenticated request with token
 */
const getAuthenticatedRequest = async (userData = {}) => {
  const { user, token } = await createTestUser(userData);
  return {
    request: request(app),
    user,
    token
  };
};

/**
 * Create multiple test users
 */
const createTestUsers = async (count = 2) => {
  const users = [];
  for (let i = 0; i < count; i++) {
    const { user, token } = await createTestUser({
      name: `Test User ${i + 1}`,
      email: `test${i + 1}${Date.now()}@example.com`
    });
    users.push({ user, token });
  }
  return users;
};

module.exports = {
  createTestUser,
  getAuthenticatedRequest,
  createTestUsers
};

