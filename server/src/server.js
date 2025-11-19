const app = require('./app');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/database');
const connectRedis = require('./config/redis');
const socketHandler = require('./sockets');
const { setIOInstance: setChatIOInstance } = require('./controllers/chat');
const { setIOInstance: setTaskIOInstance } = require('./controllers/task');
const { setIOInstance: setAiIOInstance } = require('./controllers/ai');

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with CORS for both localhost and production
const allowedSocketOrigins = [
  'http://localhost:3000',
  'https://task-manager-client-eight-kappa.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedSocketOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all in development
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Set io instance for controllers to use
setChatIOInstance(io);
setTaskIOInstance(io);
setAiIOInstance(io);

// Initialize Socket.IO handler
socketHandler(io);

// Connect to MongoDB
connectDB();

// Connect to Redis (optional, for caching)
connectRedis();

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

module.exports = { server, io };

