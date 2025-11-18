const express = require('express');
const { body } = require('express-validator');
const {
  getChats,
  getOrCreateDirectChat,
  createGroupChat,
  getChat,
  getMessages,
  addParticipant,
  removeParticipant,
  deleteChat,
  leaveChat,
  updateChat,
  uploadChatAttachment,
  forwardMessage
} = require('../controllers/chat');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validation');
const { chatUpload } = require('../utils/s3Upload');

const router = express.Router();

// All routes require authentication
router.use(protect);

router.get('/', getChats);
router.get('/direct/:userId', getOrCreateDirectChat);
router.post('/group',
  body('name').trim().notEmpty().withMessage('Group name is required'),
  body('participantIds').isArray().withMessage('Participants must be an array'),
  validate,
  createGroupChat
);
router.post('/forward',
  body('messageId').notEmpty().withMessage('Message ID is required'),
  body('targetChatIds').isArray().withMessage('Target chat IDs must be an array'),
  validate,
  forwardMessage
);
router.get('/:id', getChat);
router.get('/:id/messages', getMessages);
router.put('/:id', updateChat);
router.post('/:id/leave', leaveChat);
router.post('/:chatId/attachments', chatUpload.single('file'), uploadChatAttachment);
router.post('/:id/participants',
  body('userId').notEmpty().withMessage('User ID is required'),
  validate,
  addParticipant
);
router.delete('/:id/participants/:userId', removeParticipant);
router.delete('/:id', deleteChat);

module.exports = router;

