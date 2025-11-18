const express = require('express');
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount
} = require('../controllers/notification');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.put('/:id/read', markAsRead);
router.put('/read-all', markAllAsRead);
router.delete('/:id', deleteNotification);

module.exports = router;

