const { validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Format errors for consistent response
    const errorMessages = errors.array().map(err => err.msg);
    return res.status(400).json({
      success: false,
      message: errorMessages.join(', '),
      errors: errors.array()
    });
  }
  next();
};

module.exports = validate;

