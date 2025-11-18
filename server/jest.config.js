module.exports = {
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/node_modules/', '/test/'],
  testMatch: ['**/test/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/config/**'
  ],
  setupFilesAfterEnv: ['<rootDir>/test/setup.js']
};

