import React, { createContext, useContext, useState, useEffect } from 'react';
import { notificationService } from '../services/notificationService';
import { useSocket } from './SocketContext';
import Snackbar from '@mui/material/Snackbar';
import MuiAlert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [inlineNotification, setInlineNotification] = useState(null);
  const { socket, connected } = useSocket();

  // Fetch notifications
  const fetchNotifications = async (params = {}) => {
    setLoading(true);
    try {
      console.log('📥 Fetching notifications with params:', params);
      const response = await notificationService.getNotifications(params);
      console.log('📥 Notifications response:', response);
      
      const notificationsData = response.data || [];
      console.log('📥 Setting notifications:', notificationsData.length, 'items');
      setNotifications(notificationsData);
      
      if (response.unreadCount !== undefined) {
        console.log('📥 Setting unread count:', response.unreadCount);
        setUnreadCount(response.unreadCount);
      }
    } catch (error) {
      console.error('❌ Error fetching notifications:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch unread count
  const fetchUnreadCount = async () => {
    try {
      const response = await notificationService.getUnreadCount();
      setUnreadCount(response.count || 0);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  // Mark notification as read
  const markAsRead = async (notificationId) => {
    try {
      const response = await notificationService.markAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n =>
          n._id === notificationId ? { ...n, isRead: true, readAt: new Date() } : n
        )
      );
      
      // Update unread count from server response
      if (response.unreadCount !== undefined) {
        setUnreadCount(response.unreadCount);
      } else {
        // Fallback: fetch unread count from server
        fetchUnreadCount();
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      const response = await notificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true, readAt: new Date() })));
      
      // Update unread count from server response (should be 0)
      if (response.unreadCount !== undefined) {
        setUnreadCount(response.unreadCount);
      } else {
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  // Delete notification
  const deleteNotification = async (notificationId) => {
    try {
      console.log('🗑️ Deleting notification:', notificationId);
      const response = await notificationService.deleteNotification(notificationId);
      console.log('✅ Delete response:', response);
      
      // Optimistically remove from UI
      setNotifications(prev => {
        const filtered = prev.filter(n => n._id !== notificationId);
        console.log('📋 Notifications after delete:', filtered.length);
        return filtered;
      });
      
      // Update unread count from server response
      if (response.unreadCount !== undefined) {
        console.log('📊 Updating unread count to:', response.unreadCount);
        setUnreadCount(response.unreadCount);
      } else {
        // Fallback: fetch unread count from server
        console.log('⚠️ No unread count in response, fetching...');
        fetchUnreadCount();
      }
    } catch (error) {
      console.error('❌ Error deleting notification:', error);
      console.error('Error details:', error.response?.data || error.message);
    }
  };

  // Add new notification (from WebSocket)
  const addNotification = (notification) => {
    // Ensure notification has required fields
    const newNotification = {
      ...notification,
      isRead: notification.isRead || false,
      createdAt: notification.createdAt || new Date().toISOString(),
    };
    setNotifications(prev => [newNotification, ...prev]);
    if (!newNotification.isRead) {
      setUnreadCount(prev => prev + 1);
    }
  };

  const showInlineNotification = (notification) => {
    setInlineNotification({
      key: Date.now(),
      title: notification.title,
      message: notification.message
    });
  };

  // Initial fetch - fetch all notifications
  useEffect(() => {
    console.log('🚀 Initial notification fetch on mount');
    fetchNotifications(); // No limit = fetch all
    fetchUnreadCount(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for WebSocket notifications and handle reconnection
  useEffect(() => {
    if (connected && socket) {
      const handleNotification = (notification) => {
        console.log('🔔 Received notification via WebSocket:', notification);
        addNotification(notification);
        // Show browser notification if permission granted, otherwise fallback to inline toast
        if ('Notification' in window) {
          if (Notification.permission === 'granted') {
            new Notification(notification.title, {
              body: notification.message,
              icon: '/favicon.ico'
            });
          } else {
            showInlineNotification(notification);
          }
        } else {
          showInlineNotification(notification);
        }
      };

      socket.on('notification:new', handleNotification);

      return () => {
        socket.off('notification:new', handleNotification);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, connected]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const value = {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    addNotification
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <Snackbar
        open={Boolean(inlineNotification)}
        autoHideDuration={5000}
        onClose={() => setInlineNotification(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {inlineNotification ? (
          <MuiAlert onClose={() => setInlineNotification(null)} severity="info" sx={{ width: '100%' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {inlineNotification.title}
            </Typography>
            <Typography variant="body2">
              {inlineNotification.message}
            </Typography>
          </MuiAlert>
        ) : null}
      </Snackbar>
    </NotificationContext.Provider>
  );
};

