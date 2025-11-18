# API Tests

This directory contains comprehensive tests for all API endpoints.

## Test Structure

```
test/
├── setup.js              # Test setup and teardown
├── helpers/
│   └── auth.js          # Authentication helper functions
├── auth.test.js         # Authentication API tests
├── task.test.js         # Task API tests
├── user.test.js         # User API tests
├── project.test.js      # Project API tests
└── chat.test.js         # Chat API tests
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage
```

## Test Coverage

The tests cover:

### Authentication (`auth.test.js`)
- ✅ User registration
- ✅ User login
- ✅ Get current user
- ✅ Validation errors
- ✅ Authentication errors

### Tasks (`task.test.js`)
- ✅ Create task
- ✅ Get all tasks
- ✅ Get single task
- ✅ Update task
- ✅ Delete task
- ✅ Get task statistics
- ✅ Filtering and pagination

### Users (`user.test.js`)
- ✅ Get all users (admin only)
- ✅ Get single user
- ✅ Update user
- ✅ Role-based authorization

### Projects (`project.test.js`)
- ✅ Create project
- ✅ Get all projects
- ✅ Get single project
- ✅ Update project
- ✅ Add members to project

### Chat (`chat.test.js`)
- ✅ Get all chats
- ✅ Create/get direct chat
- ✅ Create group chat
- ✅ Get chat messages
- ✅ Add participants to group chat
- ✅ Access control

## Test Database

Tests use MongoDB Memory Server, which creates an in-memory MongoDB instance. No actual database connection is required.

## Notes

- All tests are isolated and run in parallel
- Database is cleaned after each test
- Authentication tokens are generated for each test
- Tests verify both success and error cases

