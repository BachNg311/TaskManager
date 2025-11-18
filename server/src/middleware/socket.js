const { verifyToken } = require('../config/jwt');

const protectSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const decoded = verifyToken(token);
      // Ensure userId is always a string for consistent room naming
      socket.userId = decoded.userId?.toString() || decoded.userId;
      next();
    } catch (error) {
      return next(new Error('Authentication error: Invalid token'));
    }
  } catch (error) {
    return next(new Error('Authentication error'));
  }
};

module.exports = { protectSocket };

