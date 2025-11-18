const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRE = process.env.JWT_EXPIRE;

const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: JWT_EXPIRE,
  });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

module.exports = {
  generateToken,
  verifyToken,
  JWT_SECRET,
  JWT_EXPIRE
};

