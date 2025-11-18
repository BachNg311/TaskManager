const request = require('supertest');
const app = require('../src/app');
const Task = require('../src/models/Task');
const User = require('../src/models/User');
const { generateToken } = require('../src/config/jwt');

describe('Task API', () => {
  let authToken;
  let userId;
  let managerToken;
  let managerId;
  let memberToken;
  let memberId;

  let assigneeId; // Member user to assign tasks to

  beforeEach(async () => {
    // Create manager user (can create tasks)
    const manager = await User.create({
      name: 'Test Manager',
      email: `manager${Date.now()}@example.com`,
      password: 'password123',
      role: 'manager'
    });
    managerId = manager._id;
    managerToken = generateToken(manager._id);

    // Create member user (cannot create tasks, but can be assigned)
    const member = await User.create({
      name: 'Test Member',
      email: `member${Date.now()}@example.com`,
      password: 'password123',
      role: 'member'
    });
    memberId = member._id;
    memberToken = generateToken(member._id);
    assigneeId = memberId; // Use this for task assignments

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

  describe('POST /api/tasks', () => {
    it('should create a new task as manager with assignedTo', async () => {
      // Set due date to tomorrow to avoid validation issues
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dueDate = tomorrow.toISOString().split('T')[0];

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'Test Task',
          description: 'Test Description',
          status: 'todo',
          priority: 'medium',
          dueDate: dueDate,
          assignedTo: [assigneeId]
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Test Task');
      // createdBy is populated, so check _id
      expect(res.body.data.createdBy._id.toString()).toBe(managerId.toString());
      // assignedTo must exist and have at least one assignee
      expect(res.body.data.assignedTo).toBeDefined();
      expect(Array.isArray(res.body.data.assignedTo)).toBe(true);
      expect(res.body.data.assignedTo.length).toBeGreaterThan(0);
    });

    it('should require assignedTo field', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'Test Task',
          description: 'Test Description',
          status: 'todo',
          priority: 'medium'
          // Missing assignedTo
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('must be assigned to at least one employee');
    });

    it('should require assignedTo to be a non-empty array', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'Test Task',
          description: 'Test Description',
          status: 'todo',
          priority: 'medium',
          assignedTo: [] // Empty array
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('must be assigned to at least one employee');
    });

    it('should only allow assigning tasks to members', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'Test Task',
          description: 'Test Description',
          status: 'todo',
          priority: 'medium',
          assignedTo: [managerId] // Trying to assign to manager
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('can only be assigned to employees (members)');
    });

    it('should not allow members to create tasks', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Test Task',
          description: 'Test Description',
          status: 'todo',
          priority: 'medium',
          assignedTo: [assigneeId]
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('not authorized');
    });

    it('should not create task without authentication', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({
          title: 'Test Task'
        });

      expect(res.statusCode).toBe(401);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Test Description',
          assignedTo: [assigneeId]
          // Missing title
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/tasks', () => {
    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      await Task.create([
        {
          title: 'Task 1',
          description: 'Description 1',
          createdBy: userId,
          assignedTo: [assigneeId],
          status: 'todo',
          priority: 'medium',
          dueDate: tomorrow
        },
        {
          title: 'Task 2',
          description: 'Description 2',
          createdBy: userId,
          assignedTo: [assigneeId],
          status: 'in-progress',
          priority: 'medium',
          dueDate: tomorrow
        }
      ]);
    });

    it('should get all tasks for authenticated user', async () => {
      const res = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body).toHaveProperty('pagination');
    });

    it('should filter tasks by status', async () => {
      const res = await request(app)
        .get('/api/tasks?status=todo')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('todo');
    });

    it('should not get tasks without authentication', async () => {
      const res = await request(app)
        .get('/api/tasks');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/tasks/:id', () => {
    let taskId;

    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const task = await Task.create({
        title: 'Test Task',
        description: 'Test Description',
        createdBy: userId,
        assignedTo: [assigneeId],
        status: 'todo',
        priority: 'medium',
        dueDate: tomorrow
      });
      taskId = task._id;
    });

    it('should get a single task', async () => {
      const res = await request(app)
        .get(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Test Task');
    });

    it('should return 404 for non-existent task', async () => {
      const mongoose = require('mongoose');
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/tasks/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/tasks/:id', () => {
    let taskId;

    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const task = await Task.create({
        title: 'Test Task',
        description: 'Test Description',
        createdBy: userId,
        assignedTo: [assigneeId],
        status: 'todo',
        priority: 'medium',
        dueDate: tomorrow
      });
      taskId = task._id;
    });

    it('should update a task', async () => {
      const res = await request(app)
        .put(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated Task',
          status: 'in-progress',
          assignedTo: [assigneeId] // Include assignedTo to avoid validation issues
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Updated Task');
      expect(res.body.data.status).toBe('in-progress');
    });

    it('should not update task without authentication', async () => {
      const res = await request(app)
        .put(`/api/tasks/${taskId}`)
        .send({
          title: 'Updated Task'
        });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    let taskId;

    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const task = await Task.create({
        title: 'Test Task',
        description: 'Test Description',
        createdBy: userId,
        assignedTo: [assigneeId],
        status: 'todo',
        priority: 'medium',
        dueDate: tomorrow
      });
      taskId = task._id;
    });

    it('should delete a task', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify task is deleted
      const deletedTask = await Task.findById(taskId);
      expect(deletedTask).toBeNull();
    });

    it('should not delete task without authentication', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${taskId}`);

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/tasks/stats', () => {
    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      await Task.create([
        { title: 'Task 1', description: 'Desc 1', createdBy: userId, assignedTo: [assigneeId], status: 'todo', priority: 'high', dueDate: tomorrow },
        { title: 'Task 2', description: 'Desc 2', createdBy: userId, assignedTo: [assigneeId], status: 'in-progress', priority: 'medium', dueDate: tomorrow },
        { title: 'Task 3', description: 'Desc 3', createdBy: userId, assignedTo: [assigneeId], status: 'done', priority: 'low', dueDate: tomorrow }
      ]);
    });

    it('should get task statistics', async () => {
      const res = await request(app)
        .get('/api/tasks/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('byStatus');
      expect(res.body.data).toHaveProperty('byPriority');
    });
  });

  describe('PATCH /api/tasks/:id/status', () => {
    let taskId;

    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const task = await Task.create({
        title: 'Test Task',
        description: 'Test Description',
        createdBy: userId,
        assignedTo: [assigneeId],
        status: 'todo',
        priority: 'medium',
        dueDate: tomorrow
      });
      taskId = task._id;
    });

    it('should update task status', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'in-progress'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('in-progress');
    });

    it('should validate status value', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${taskId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'invalid-status'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/tasks/:id/checklist', () => {
    let taskId;

    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const task = await Task.create({
        title: 'Test Task',
        description: 'Test Description',
        createdBy: userId,
        assignedTo: [assigneeId],
        status: 'todo',
        priority: 'medium',
        dueDate: tomorrow
      });
      taskId = task._id;
    });

    it('should update task checklist', async () => {
      const checklist = [
        { text: 'Item 1', completed: false },
        { text: 'Item 2', completed: true }
      ];

      const res = await request(app)
        .patch(`/api/tasks/${taskId}/checklist`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ checklist });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.checklist).toHaveLength(2);
    });
  });

  describe('POST /api/tasks/:id/comments', () => {
    let taskId;

    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const task = await Task.create({
        title: 'Test Task',
        description: 'Test Description',
        createdBy: userId,
        assignedTo: [assigneeId],
        status: 'todo',
        priority: 'medium',
        dueDate: tomorrow
      });
      taskId = task._id;
    });

    it('should add comment to task', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: 'This is a test comment'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.comments).toBeDefined();
      expect(res.body.data.comments.length).toBeGreaterThan(0);
    });

    it('should validate comment text', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: ''
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});

