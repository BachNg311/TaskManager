const express = require('express');
const { body } = require('express-validator');
const { register, login, getMe, uploadAvatar, forgotPassword, resetPassword, googleLogin } = require('../controllers/auth');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validation');
const { avatarUpload } = require('../utils/s3Upload');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const loginValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required')
];

const forgotPasswordValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
];

const resetPasswordValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('otp')
    .notEmpty()
    .withMessage('OTP code is required')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

const googleLoginValidation = [
  body('idToken').notEmpty().withMessage('idToken is required'),
];

router.post('/register', registerValidation, validate, register);
router.post('/login', loginValidation, validate, login);
router.get('/me', protect, getMe);
router.post('/upload-avatar', protect, avatarUpload.single('avatar'), uploadAvatar);
router.post('/forgot-password', forgotPasswordValidation, validate, forgotPassword);
router.post('/reset-password', resetPasswordValidation, validate, resetPassword);
router.post('/google', googleLoginValidation, validate, googleLogin);

module.exports = router;

