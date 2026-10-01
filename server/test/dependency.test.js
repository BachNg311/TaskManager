const request = require('supertest');
const app = require('../src/app');
const Task = require('../src/models/Task');
const User = require('../src/models/User');
const Notification = require('../src/models/Notification');
const { generateToken } = require('../src/config/jwt');

describe('Task Dependencies', () => {
  let manager;
  let managerToken;
  let member;
  let memberToken;

  beforeEach(async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
    manager = await User.create({
      name: 'Dep Manager',
      email: `depmgr${suffix}@example.com`,
      password: 'password123',
      role: 'manager'
    });
    managerToken = generateToken(manager._id);

    member = await User.create({
      name: 'Dep Member',
      email: `depmem${suffix}@example.com`,
      password: 'password123',
      role: 'member'
    });
    memberToken = generateToken(member._id);
  });

  const createTaskDoc = (title, assignedTo = []) =>
    Task.create({
      title,
      description: 'dependency test task',
      status: 'todo',
      priority: 'medium',
      assignedTo,
      createdBy: manager._id
    });

  const addDependency = (taskId, dependencyId, token = managerToken) =>
    request(app)
      .post(`/api/tasks/${taskId}/dependencies`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dependencyId });

  it('manager can add a dependency; the task becomes blocked', async () => {
    const dep = await createTaskDoc('Build API');
    const task = await createTaskDoc('Build UI');

    const res = await addDependency(task._id, dep._id);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.dependencies).toHaveLength(1);
    expect(res.body.data.dependencies[0]._id).toBe(dep._id.toString());
    expect(res.body.data.isBlocked).toBe(true);

    const detail = await request(app)
      .get(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.isBlocked).toBe(true);
    expect(detail.body.data.blockingTasks).toHaveLength(1);
  });

  it('rejects self-dependency', async () => {
    const task = await createTaskDoc('Solo task');
    const res = await addDependency(task._id, task._id);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/itself/);
  });

  it('rejects duplicate dependencies', async () => {
    const dep = await createTaskDoc('Dep');
    const task = await createTaskDoc('Task');

    const first = await addDependency(task._id, dep._id);
    expect(first.status).toBe(201);

    const second = await addDependency(task._id, dep._id);
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/already added/);
  });

  it('rejects circular dependencies (A -> B -> A)', async () => {
    const a = await createTaskDoc('Task A');
    const b = await createTaskDoc('Task B');

    const ab = await addDependency(a._id, b._id);
    expect(ab.status).toBe(201);

    const ba = await addDependency(b._id, a._id);
    expect(ba.status).toBe(400);
    expect(ba.body.message).toMatch(/circular/);
  });

  it('rejects indirect cycles (A -> B -> C -> A)', async () => {
    const a = await createTaskDoc('Task A');
    const b = await createTaskDoc('Task B');
    const c = await createTaskDoc('Task C');

    expect((await addDependency(a._id, b._id)).status).toBe(201);
    expect((await addDependency(b._id, c._id)).status).toBe(201);

    const res = await addDependency(c._id, a._id);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/circular/);
  });

  it('returns 404 for a nonexistent dependency task', async () => {
    const task = await createTaskDoc('Task');
    const fakeId = '507f1f77bcf86cd799439011';
    const res = await addDependency(task._id, fakeId);
    expect(res.status).toBe(404);
  });

  it('rejects an invalid dependencyId format', async () => {
    const task = await createTaskDoc('Task');
    const res = await request(app)
      .post(`/api/tasks/${task._id}/dependencies`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ dependencyId: 'not-a-mongo-id' });
    expect(res.status).toBe(400);
  });

  it('member cannot add dependencies', async () => {
    const dep = await createTaskDoc('Dep');
    const task = await createTaskDoc('Task');
    const res = await addDependency(task._id, dep._id, memberToken);
    expect(res.status).toBe(403);
  });

  it('blocked task cannot move to in-progress or done', async () => {
    const dep = await createTaskDoc('Dep');
    const task = await createTaskDoc('Task');
    await addDependency(task._id, dep._id);

    for (const status of ['in-progress', 'done']) {
      const res = await request(app)
        .patch(`/api/tasks/${task._id}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/blocked/);
      expect(res.body.blockingTasks).toHaveLength(1);
      expect(res.body.blockingTasks[0].title).toBe('Dep');
    }
  });

  it('completing a dependency unblocks the task and notifies assignees', async () => {
    const dep = await createTaskDoc('Migrations');
    const task = await createTaskDoc('Feature work', [member._id]);
    await addDependency(task._id, dep._id);

    // Completing the dependency...
    const doneRes = await request(app)
      .patch(`/api/tasks/${dep._id}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'done' });
    expect(doneRes.status).toBe(200);

    // ...notifies the dependent's assignees
    const notifications = await Notification.find({
      user: member._id,
      type: 'task_unblocked'
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].relatedTask.toString()).toBe(task._id.toString());

    // ...and the task is no longer blocked
    const detail = await request(app)
      .get(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(detail.body.data.isBlocked).toBe(false);

    // ...so it can now start
    const startRes = await request(app)
      .patch(`/api/tasks/${task._id}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'in-progress' });
    expect(startRes.status).toBe(200);
    expect(startRes.body.data.status).toBe('in-progress');
  });

  it('a task blocked by multiple deps stays blocked until all complete', async () => {
    const dep1 = await createTaskDoc('Dep 1');
    const dep2 = await createTaskDoc('Dep 2');
    const task = await createTaskDoc('Task', [member._id]);
    await addDependency(task._id, dep1._id);
    await addDependency(task._id, dep2._id);

    await request(app)
      .patch(`/api/tasks/${dep1._id}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'done' });

    // Still blocked by dep2 -> no notification yet
    const mid = await Notification.find({ user: member._id, type: 'task_unblocked' });
    expect(mid).toHaveLength(0);

    const stillBlocked = await request(app)
      .patch(`/api/tasks/${task._id}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'in-progress' });
    expect(stillBlocked.status).toBe(400);
    expect(stillBlocked.body.blockingTasks).toHaveLength(1);

    await request(app)
      .patch(`/api/tasks/${dep2._id}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'done' });

    const after = await Notification.find({ user: member._id, type: 'task_unblocked' });
    expect(after).toHaveLength(1);
  });

  it('can remove a dependency, unblocking the task', async () => {
    const dep = await createTaskDoc('Dep');
    const task = await createTaskDoc('Task');
    await addDependency(task._id, dep._id);

    const res = await request(app)
      .delete(`/api/tasks/${task._id}/dependencies/${dep._id}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.dependencies).toHaveLength(0);

    const detail = await request(app)
      .get(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(detail.body.data.isBlocked).toBe(false);
  });

  it('removing a nonexistent dependency returns 404', async () => {
    const task = await createTaskDoc('Task');
    const fakeId = '507f1f77bcf86cd799439011';
    const res = await request(app)
      .delete(`/api/tasks/${task._id}/dependencies/${fakeId}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(404);
  });

  it('deleting a dependency task removes it from dependents', async () => {
    const dep = await createTaskDoc('Dep');
    const task = await createTaskDoc('Task');
    await addDependency(task._id, dep._id);

    const del = await request(app)
      .delete(`/api/tasks/${dep._id}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(del.status).toBe(200);

    const refreshed = await Task.findById(task._id).lean();
    expect(refreshed.dependencies).toHaveLength(0);
  });

  it('lists dependents of a task', async () => {
    const dep = await createTaskDoc('Dep');
    const t1 = await createTaskDoc('Task 1', [member._id]);
    const t2 = await createTaskDoc('Task 2');
    await addDependency(t1._id, dep._id);
    await addDependency(t2._id, dep._id);

    const res = await request(app)
      .get(`/api/tasks/${dep._id}/dependents`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);

    // Members only see dependents assigned to them
    const memberRes = await request(app)
      .get(`/api/tasks/${dep._id}/dependents`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberRes.status).toBe(200);
    expect(memberRes.body.count).toBe(1);
    expect(memberRes.body.data[0].title).toBe('Task 1');
  });

  it('accepts dependencies on task creation', async () => {
    const dep = await createTaskDoc('Dep');
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        title: 'New task with dep',
        description: 'created with an initial dependency',
        status: 'todo',
        priority: 'high',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        assignedTo: [member._id.toString()],
        dependencies: [dep._id.toString()]
      });
    expect(res.status).toBe(201);

    const detail = await request(app)
      .get(`/api/tasks/${res.body.data._id}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(detail.body.data.isBlocked).toBe(true);
    expect(detail.body.data.dependencies).toHaveLength(1);
  });

  it('lists tasks with isBlocked computed in a single batch', async () => {
    const dep = await createTaskDoc('Dep');
    const blocked = await createTaskDoc('Blocked task');
    const free = await createTaskDoc('Free task');
    await addDependency(blocked._id, dep._id);

    const res = await request(app)
      .get('/api/tasks?limit=50')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(200);

    const byId = Object.fromEntries(res.body.data.map(t => [t._id, t]));
    expect(byId[blocked._id.toString()].isBlocked).toBe(true);
    expect(byId[free._id.toString()].isBlocked).toBe(false);
  });
});
