const redis = require('redis');

let redisClient = null;

const connectRedis = async () => {
  try {
    if (process.env.REDIS_URL) {
      redisClient = redis.createClient({
        url: process.env.REDIS_URL,
      });
    } else if (process.env.REDIS_HOST) {
      redisClient = redis.createClient({
        socket: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT),
        },
        password: process.env.REDIS_PASSWORD,
      });
    } else {
      // Only show message in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log('ℹ️  Redis not configured');
      }
      return;
    }

    redisClient.on('error', (err) => {
      console.error('❌ Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis Connected');
    });

    await redisClient.connect();
  } catch (error) {
    console.error('❌ Redis connection error:', error.message);
    // Don't exit - Redis is optional for caching
  }
};

const getRedisClient = () => redisClient;

module.exports = connectRedis;
module.exports.getRedisClient = getRedisClient;

