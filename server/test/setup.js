// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Setup before all tests
beforeAll(async () => {
  // Create in-memory MongoDB instance
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Connect to in-memory database (no options needed for mongoose 8+)
  await mongoose.connect(mongoUri);
});

// Cleanup after each test
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// Cleanup after all tests
afterAll(async () => {
  // Close database connection
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  
  // Stop MongoDB Memory Server
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// Set test timeout
jest.setTimeout(30000);

// Suppress console logs during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

