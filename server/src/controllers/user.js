const User = require('../models/User');
const { addSignedUrlToUserAvatar } = require('../utils/s3Upload');

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
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Add signed URL to avatar
    const userWithSignedAvatar = addSignedUrlToUserAvatar(user);

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
    // Users can only update themselves unless they're admin/manager
    if (req.user.role !== 'admin' && req.user.role !== 'manager' &&
        req.params.id !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this user'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
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

