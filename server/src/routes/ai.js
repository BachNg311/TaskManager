const express = require('express');
const { body } = require('express-validator');
const { createTasksWithGemini, summarizeChatWithGemini, summarizeTaskWithGemini } = require('../controllers/ai');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validation');

const router = express.Router();

router.use(protect);

router.post(
  '/task-bot',
  authorize('manager', 'admin'),
  [
    body('prompt').trim().notEmpty().withMessage('Prompt is required'),
    body('assignedTo')
      .isArray({ min: 1 })
      .withMessage('Please select at least one employee to assign the tasks.'),
  ],
  validate,
  createTasksWithGemini
);

router.post(
  '/chat-summary',
  [
    body('chatId').isMongoId().withMessage('Chat ID is required.'),
    body('limit')
      .optional()
      .isInt({ min: 20, max: 200 })
      .withMessage('Limit must be between 20 and 200 messages.'),
  ],
  validate,
  summarizeChatWithGemini
);

router.post(
  '/task-summary',
  [
    body('taskId').isMongoId().withMessage('Task ID is required.'),
  ],
  validate,
  summarizeTaskWithGemini
);

module.exports = router;


