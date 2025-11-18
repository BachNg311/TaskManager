const request = require('supertest');
const app = require('../src/app');
const Project = require('../src/models/Project');
const User = require('../src/models/User');
const { generateToken } = require('../src/config/jwt');

describe('Project API', () => {
  let authToken;
  let userId;
  let managerToken;
  let managerId;
  let memberToken;
  let memberId;

  beforeEach(async () => {
    // Create manager user (can create projects)
    const manager = await User.create({
      name: 'Test Manager',
      email: `manager${Date.now()}@example.com`,
      password: 'password123',
      role: 'manager'
    });
    managerId = manager._id;
    managerToken = generateToken(manager._id);

    // Create member user (cannot create projects)
    const member = await User.create({
      name: 'Test Member',
      email: `member${Date.now()}@example.com`,
      password: 'password123',
      role: 'member'
    });
    memberId = member._id;
    memberToken = generateToken(member._id);

    // Default user (manager for backward compatibility)
    const user = await User.create({
      name: 'Test User',
      email: `test${Date.now()}@example.com`,
      password: 'password123',
      role: 'manager'
    });
    userId = user._id;
    authToken = generateToken(user._id);
  });

  // Project creation removed - projects must be created manually in database
  // Tests for project creation have been removed

  describe('GET /api/projects', () => {
    beforeEach(async () => {
      await Project.create([
        {
          name: 'Project 1',
          owner: userId
        },
        {
          name: 'Project 2',
          owner: userId
        }
      ]);
    });

    it('should get all projects for user', async () => {
      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('GET /api/projects/:id', () => {
    let projectId;

    beforeEach(async () => {
      const project = await Project.create({
        name: 'Test Project',
        owner: userId
      });
      projectId = project._id;
    });

    it('should get a single project', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Project');
    });

    it('should return 404 for non-existent project', async () => {
      const mongoose = require('mongoose');
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/projects/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/projects/:id', () => {
    let projectId;

    beforeEach(async () => {
      const project = await Project.create({
        name: 'Test Project',
        owner: userId
      });
      projectId = project._id;
    });

    it('should update a project', async () => {
      const res = await request(app)
        .put(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Updated Project',
          description: 'Updated Description'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Project');
    });
  });

  describe('POST /api/projects/:id/members', () => {
    let projectId;
    let otherUserId;

    beforeEach(async () => {
      const project = await Project.create({
        name: 'Test Project',
        owner: userId
      });
      projectId = project._id;

      const otherUser = await User.create({
        name: 'Other User',
        email: `other${Date.now()}@example.com`,
        password: 'password123'
      });
      otherUserId = otherUser._id;
    });

    it('should add a member to project', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: otherUserId.toString()
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.members).toHaveLength(1);
    });
  });
});

