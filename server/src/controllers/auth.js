const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { generateToken } = require('../config/jwt');
const { validationResult } = require('express-validator');
const { sendEmail } = require('../utils/email');
const { generateSignedUrl } = require('../utils/s3Upload');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { name, email, password } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Registration always creates 'member' role
    // Managers and admins must be created by existing admins or via seed script
    const user = await User.create({
      name,
      email,
      password,
      role: 'member'
    });

    // Generate token
    const token = generateToken(user._id);

    // Convert to plain object for response and exclude password
    const userObj = user.toObject();
    delete userObj.password;

    res.status(201).json({
      success: true,
      data: {
        user: userObj,
        token
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Check if user exists and get password
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Generate signed URL for avatar if it's an S3 URL
    let avatarUrl = user.avatar;
    if (avatarUrl && avatarUrl.includes('s3.amazonaws.com')) {
      const signedUrl = generateSignedUrl(avatarUrl, 60 * 60 * 24 * 7); // 7 days
      if (signedUrl) {
        avatarUrl = signedUrl;
      }
    }

    res.json({
      success: true,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: avatarUrl
        },
        token
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Login or register with Google OAuth
// @route   POST /api/auth/google
// @access  Public
const googleLogin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'idToken is required'
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Google account does not have an email address'
      });
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name: name || email.split('@')[0],
        email,
        // Random password – not used for Google login, but required by schema
        password: crypto.randomBytes(32).toString('hex'),
        role: 'member',
        avatar: picture || ''
      });
    } else if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    const token = generateToken(user._id);

    let avatarUrl = user.avatar;
    if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.includes('s3.amazonaws.com')) {
      const signedUrl = generateSignedUrl(avatarUrl, 60 * 60 * 24 * 7); // 7 days
      if (signedUrl) {
        avatarUrl = signedUrl;
      }
    } else if (!avatarUrl && picture) {
      avatarUrl = picture;
    }

    return res.json({
      success: true,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: avatarUrl
        },
        token
      }
    });
  } catch (error) {
    console.error('Google login error:', error);
    return res.status(401).json({
      success: false,
      message: 'Google authentication failed'
    });
  }
};

// @desc    Forgot password - send 6-digit OTP email (valid 5 minutes)
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Account does not exist with this email.',
      });
    }

    // Generate 6-digit numeric OTP
    const otp = (Math.floor(100000 + Math.random() * 900000)).toString();

    // Store OTP and set expiry to 5 minutes
    user.passwordResetToken = otp;
    user.passwordResetExpires = Date.now() + 5 * 60 * 1000; // 5 minutes

    await user.save({ validateBeforeSave: false });

    const subject = 'Reset your Task Manager password';
    const html = `
      <p>Hello ${user.name || ''},</p>
      <p>You recently requested to reset your password for your Task Manager account.</p>
      <p>Your one-time password (OTP) is:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${otp}</p>
      <p>This code will expire in <strong>5 minutes</strong>.</p>
      <p>If you did not request a password reset, you can safely ignore this email.</p>
    `;

    try {
      await sendEmail({ to: user.email, subject, html });

      return res.json({
        success: true,
        message: 'OTP has been sent to your email address. It is valid for 5 minutes.',
      });
    } catch (emailError) {
      console.error('Error sending reset email:', emailError);

      // Clean up tokens on failure
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        message: 'Error sending password reset email. Please try again later.',
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Reset password using OTP
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, otp, password } = req.body;

    const user = await User.findOne({
      email,
      passwordResetToken: otp,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+password');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'OTP is invalid or has expired.',
      });
    }

    // Set new password
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save();

    // Optionally log the user in immediately
    const tokenJwt = generateToken(user._id);

    res.json({
      success: true,
      message: 'Password has been reset successfully.',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
        },
        token: tokenJwt,
      },
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const userObj = user.toObject();
    
    // Generate signed URL for avatar if it exists and is an S3 URL
    if (userObj.avatar && userObj.avatar.includes('s3.amazonaws.com')) {
      const signedUrl = generateSignedUrl(userObj.avatar, 60 * 60 * 24 * 7); // 7 days
      if (signedUrl) {
        userObj.avatar = signedUrl;
      }
    }
    
    res.json({
      success: true,
      data: userObj
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Upload profile image (stored in S3)
// @route   POST /api/auth/upload-avatar
// @access  Private
const uploadAvatar = async (req, res) => {
  try {
    let avatarUrl = null;

    // Prefer S3-uploaded file if present
    if (req.file && req.file.location) {
      avatarUrl = req.file.location;
    } else if (req.body.avatar) {
      // Fallback to direct URL / base64 string if provided
      avatarUrl = req.body.avatar;
    }

    if (!avatarUrl) {
      return res.status(400).json({
        success: false,
        message: 'Avatar image is required',
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: avatarUrl },
      { new: true, runValidators: true }
    ).select('-password');

    const userObj = user.toObject();
    
    // Generate signed URL for avatar if it's an S3 URL
    if (userObj.avatar && userObj.avatar.includes('s3.amazonaws.com')) {
      const signedUrl = generateSignedUrl(userObj.avatar, 60 * 60 * 24 * 7); // 7 days
      if (signedUrl) {
        userObj.avatar = signedUrl;
      }
    }

    res.json({
      success: true,
      data: userObj,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
  uploadAvatar,
  forgotPassword,
  resetPassword,
  googleLogin,
};

