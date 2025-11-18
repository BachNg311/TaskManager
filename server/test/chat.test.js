const request = require('supertest');
const app = require('../src/app');
const Chat = require('../src/models/Chat');
const Message = require('../src/models/Message');
const User = require('../src/models/User');
const { generateToken } = require('../src/config/jwt');

describe('Chat API', () => {
  let user1Token;
  let user2Token;
  let user3Token;
  let user1Id;
  let user2Id;
  let user3Id;

  beforeEach(async () => {
    const user1 = await User.create({
      name: 'User 1',
      email: `user1${Date.now()}@example.com`,
      password: 'password123'
    });
    user1Id = user1._id;
    user1Token = generateToken(user1._id);

    const user2 = await User.create({
      name: 'User 2',
      email: `user2${Date.now()}@example.com`,
      password: 'password123'
    });
    user2Id = user2._id;
    user2Token = generateToken(user2._id);

    const user3 = await User.create({
      name: 'User 3',
      email: `user3${Date.now()}@example.com`,
      password: 'password123'
    });
    user3Id = user3._id;
    user3Token = generateToken(user3._id);
  });

  describe('GET /api/chats', () => {
    beforeEach(async () => {
      await Chat.create({
        type: 'direct',
        participants: [user1Id, user2Id],
        createdBy: user1Id
      });
    });

    it('should get all chats for user', async () => {
      const res = await request(app)
        .get('/api/chats')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/chats/direct/:userId', () => {
    it('should create a new direct chat', async () => {
      const res = await request(app)
        .get(`/api/chats/direct/${user2Id}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('direct');
      expect(res.body.data.participants).toHaveLength(2);
    });

    it('should return existing direct chat if it exists', async () => {
      const chat = await Chat.create({
        type: 'direct',
        participants: [user1Id, user2Id],
        createdBy: user1Id
      });

      const res = await request(app)
        .get(`/api/chats/direct/${user2Id}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data._id.toString()).toBe(chat._id.toString());
    });

    it('should not allow creating chat with self', async () => {
      const res = await request(app)
        .get(`/api/chats/direct/${user1Id}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/chats/group', () => {
    it('should create a new group chat', async () => {
      const res = await request(app)
        .post('/api/chats/group')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Test Group',
          description: 'Test Description',
          participantIds: [user2Id.toString(), user3Id.toString()]
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('group');
      expect(res.body.data.name).toBe('Test Group');
      expect(res.body.data.participants).toHaveLength(3); // user1 + user2 + user3
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/chats/group')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          description: 'Test Description'
          // Missing name and participantIds
        });

      expect(res.statusCode).toBe(400);
    });

    it('should require at least 2 participants', async () => {
      const res = await request(app)
        .post('/api/chats/group')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Test Group',
          participantIds: [user2Id.toString()] // Only 1 participant
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/chats/:id', () => {
    let chatId;

    beforeEach(async () => {
      const chat = await Chat.create({
        type: 'direct',
        participants: [user1Id, user2Id],
        createdBy: user1Id
      });
      chatId = chat._id;
    });

    it('should get a single chat', async () => {
      const res = await request(app)
        .get(`/api/chats/${chatId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id.toString()).toBe(chatId.toString());
    });

    it('should not allow non-participant to access chat', async () => {
      const res = await request(app)
        .get(`/api/chats/${chatId}`)
        .set('Authorization', `Bearer ${user3Token}`);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/chats/:id/messages', () => {
    let chatId;

    beforeEach(async () => {
      const chat = await Chat.create({
        type: 'direct',
        participants: [user1Id, user2Id],
        createdBy: user1Id
      });
      chatId = chat._id;

      await Message.create([
        {
          chat: chatId,
          sender: user1Id,
          text: 'Message 1'
        },
        {
          chat: chatId,
          sender: user2Id,
          text: 'Message 2'
        }
      ]);
    });

    it('should get messages for a chat', async () => {
      const res = await request(app)
        .get(`/api/chats/${chatId}/messages`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('pagination');
    });

    it('should paginate messages', async () => {
      const res = await request(app)
        .get(`/api/chats/${chatId}/messages?page=1&limit=1`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.limit).toBe(1);
    });
  });

  describe('POST /api/chats/:id/participants', () => {
    let groupChatId;

    beforeEach(async () => {
      const chat = await Chat.create({
        type: 'group',
        name: 'Test Group',
        participants: [user1Id, user2Id],
        createdBy: user1Id
      });
      groupChatId = chat._id;
    });

    it('should add participant to group chat', async () => {
      const res = await request(app)
        .post(`/api/chats/${groupChatId}/participants`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          userId: user3Id.toString()
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.participants).toHaveLength(3);
    });

    it('should not add duplicate participant', async () => {
      const res = await request(app)
        .post(`/api/chats/${groupChatId}/participants`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          userId: user2Id.toString() // Already a participant
        });

      expect(res.statusCode).toBe(400);
    });
  });
});

