const User = require('../models/User');
const { addSignedUrlToUserAvatar } = require('../utils/s3Upload');
const redisModule = require('../config/redis');
const getRedisClient = redisModule.getRedisClient;

// @desc    Get all users
// @route   GET /api/users
// @access  Private (All authenticated users can see members for chat)
const getUsers = async (req, res) => {
  try {
    // All authenticated users can see other members for chat purposes
    const users = await User.find({ isActive: true })
      .select('-password')
      .sort({ name: 1 });

    // Add signed URLs to avatars
    const usersWithSignedAvatars = addSignedUrlToUserAvatar(users);

    res.json({
      success: true,
      data: usersWithSignedAvatars
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private
const getUser = async (req, res) => {
  try {
    // Try Redis cache first
    const client = getRedisClient && getRedisClient();
    const cacheKey = `user:${req.params.id}`;
    if (client) {
      try {
        const cached = await client.get(cacheKey);
        if (cached) return res.json({ success: true, data: JSON.parse(cached), cached: true });
      } catch (err) {
        console.error('Redis GET error for', cacheKey, err);
      }
    }

    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Add signed URL to avatar
    const userWithSignedAvatar = addSignedUrlToUserAvatar(user);

    // Cache user
    if (client) {
      try {
        await client.set(cacheKey, JSON.stringify(userWithSignedAvatar), { EX: 300 });
      } catch (err) {
        console.error('Redis SET error for', cacheKey, err);
      }
    }

    res.json({
      success: true,
      data: userWithSignedAvatar
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private
const updateUser = async (req, res) => {
  try {
    const isPrivilegedUser = req.user.role === 'admin' || req.user.role === 'manager';
    const isSelfUpdate = req.params.id === req.user._id.toString();

    // Users can only update themselves unless they're admin/manager
    if (!isPrivilegedUser && !isSelfUpdate) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this user'
      });
    }

    const allowedFields = isPrivilegedUser
      ? ['name', 'email', 'avatar', 'role', 'isActive']
      : ['name', 'email', 'avatar'];

    const updateData = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided for update'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Add signed URL to avatar
    const userWithSignedAvatar = addSignedUrlToUserAvatar(user);

    // Invalidate user cache
    try {
      const client = getRedisClient && getRedisClient();
      if (client) await client.del(`user:${req.params.id}`);
    } catch (err) {
      console.error('Redis DEL error for user update', req.params.id, err);
    }

    res.json({
      success: true,
      data: userWithSignedAvatar
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getUsers,
  getUser,
  updateUser
};
