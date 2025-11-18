const Notification = require('../models/Notification');

// @desc    Get all notifications for current user
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 0, unreadOnly = false } = req.query;
    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);
    
    const query = { user: req.user._id };
    if (unreadOnly === 'true') {
      query.isRead = false;
    }

    // Build query with sorting
    let notificationQuery = Notification.find(query)
      .populate('relatedTask', 'title status priority')
      .populate('relatedProject', 'name color')
      .sort({ createdAt: -1 });

    // Only apply pagination if limit is specified and > 0
    if (parsedLimit > 0) {
      const skip = (parsedPage - 1) * parsedLimit;
      notificationQuery = notificationQuery.skip(skip).limit(parsedLimit);
    }

    const notifications = await notificationQuery;
    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ user: req.user._id, isRead: false });

    res.json({
      success: true,
      data: notifications,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: parsedLimit > 0 ? Math.ceil(total / parsedLimit) : 1
      },
      unreadCount
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    // Get updated unread count
    const unreadCount = await Notification.countDocuments({
      user: req.user._id,
      isRead: false
    });

    res.json({
      success: true,
      data: notification,
      unreadCount
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    // Get updated unread count (should be 0)
    const unreadCount = await Notification.countDocuments({
      user: req.user._id,
      isRead: false
    });

    res.json({
      success: true,
      message: 'All notifications marked as read',
      unreadCount
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
const deleteNotification = async (req, res) => {
  try {
    console.log('🗑️ DELETE notification request:', {
      notificationId: req.params.id,
      userId: req.user._id
    });

    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id
    });

    if (!notification) {
      console.log('❌ Notification not found:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    console.log('✅ Notification deleted:', notification._id);

    // Get updated unread count after deletion
    const unreadCount = await Notification.countDocuments({
      user: req.user._id,
      isRead: false
    });

    console.log('📊 Unread count after delete:', unreadCount);

    res.json({
      success: true,
      message: 'Notification deleted',
      unreadCount,
      wasUnread: !notification.isRead
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get unread notification count
// @route   GET /api/notifications/unread-count
// @access  Private
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user._id,
      isRead: false
    });

    res.json({
      success: true,
      count
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount
};

