import React, { useState } from 'react';
import {
  IconButton,
  Badge,
  Popover,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Divider,
  Button,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  CheckCircle as CheckCircleIcon,
  Delete as DeleteIcon,
  Assignment as TaskIcon,
  Comment as CommentIcon,
  Chat as ChatIcon,
  Person as PersonIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useNotifications } from '../../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

const NotificationBell = () => {
  const [anchorEl, setAnchorEl] = useState(null);
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchNotifications,
    fetchUnreadCount,
  } = useNotifications();
  const navigate = useNavigate();

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.isRead) {
      await markAsRead(notification._id);
    }
    
    // Navigate based on notification type
    if (notification.relatedTask) {
      navigate('/tasks');
      // You could also navigate to a specific task detail page if you have one
    } else if (
      notification.type === 'message' || 
      notification.type === 'group_message' || 
      notification.type === 'mention' || 
      notification.type === 'mention_all' ||
      notification.type === 'chat_added' ||
      notification.type === 'chat_removed' ||
      notification.type === 'nickname_set' ||
      notification.type === 'forward_message'
    ) {
      navigate('/chat');
    }
    
    handleClose();
  };

  const handleDelete = async (e, notificationId) => {
    e.stopPropagation();
    await deleteNotification(notificationId);
  };

  const handleRefresh = async () => {
    console.log('🔄 Manually refreshing notifications...');
    await fetchNotifications();
    await fetchUnreadCount();
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'task_assigned':
      case 'task_updated':
      case 'task_pending_review':
      case 'task_approved':
      case 'task_rejected':
        return <TaskIcon fontSize="small" />;
      case 'comment_added':
        return <CommentIcon fontSize="small" />;
      case 'message':
      case 'group_message':
      case 'mention':
      case 'mention_all':
      case 'chat_added':
      case 'chat_removed':
      case 'nickname_set':
      case 'forward_message':
        return <ChatIcon fontSize="small" />;
      default:
        return <NotificationsIcon fontSize="small" />;
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'task_assigned':
        return 'primary';
      case 'task_updated':
        return 'info';
      case 'task_pending_review':
        return 'warning';
      case 'task_approved':
        return 'success';
      case 'task_rejected':
        return 'error';
      case 'comment_added':
        return 'warning';
      case 'message':
      case 'group_message':
        return 'success';
      case 'mention':
      case 'mention_all':
        return 'error';
      case 'chat_added':
        return 'success';
      case 'chat_removed':
        return 'error';
      case 'nickname_set':
        return 'info';
      case 'forward_message':
        return 'success';
      default:
        return 'default';
    }
  };

  const open = Boolean(anchorEl);
  const id = open ? 'notification-popover' : undefined;

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          color="inherit"
          onClick={handleClick}
          sx={{
            color: 'text.primary',
            '&:hover': {
              backgroundColor: 'rgba(99, 102, 241, 0.08)',
            },
          }}
        >
          <Badge badgeContent={unreadCount} color="error">
            <NotificationsIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            width: { xs: '90vw', sm: 400 },
            maxHeight: 600,
            mt: 1.5,
            borderRadius: 2,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Notifications {loading && '...'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip title="Refresh">
                <IconButton
                  size="small"
                  onClick={handleRefresh}
                  disabled={loading}
                  sx={{ 
                    color: 'primary.main',
                    '&:hover': { bgcolor: 'primary.light' }
                  }}
                >
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {unreadCount > 0 && (
                <Button
                  size="small"
                  onClick={markAllAsRead}
                  startIcon={<CheckCircleIcon />}
                  sx={{ textTransform: 'none' }}
                >
                  Mark all read
                </Button>
              )}
            </Box>
          </Box>
          <Divider sx={{ mb: 1 }} />
          {notifications.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <NotificationsIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                No notifications
              </Typography>
              {unreadCount > 0 && (
                <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
                  Count mismatch: {unreadCount} unread but no notifications loaded
                </Typography>
              )}
            </Box>
          ) : (
            <List sx={{ maxHeight: 500, overflow: 'auto', p: 0 }}>
              {notifications.map((notification, index) => (
                <React.Fragment key={notification._id}>
                  <ListItem
                    disablePadding
                    sx={{
                      position: 'relative',
                      bgcolor: notification.isRead ? 'transparent' : 'rgba(99, 102, 241, 0.04)',
                      '&:hover': {
                        bgcolor: notification.isRead
                          ? 'rgba(0, 0, 0, 0.04)'
                          : 'rgba(99, 102, 241, 0.08)',
                      },
                    }}
                  >
                    <ListItemButton
                      onClick={() => handleNotificationClick(notification)}
                      sx={{ py: 1.5, px: 2, pr: 6 }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: 40,
                          height: 40,
                          borderRadius: '50%',
                          bgcolor: `${getNotificationColor(notification.type)}.light`,
                          color: `${getNotificationColor(notification.type)}.main`,
                          mr: 2,
                        }}
                      >
                        {getNotificationIcon(notification.type)}
                      </Box>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: notification.isRead ? 500 : 600,
                                flex: 1,
                              }}
                            >
                              {notification.title}
                            </Typography>
                            {!notification.isRead && (
                              <Box
                                sx={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  bgcolor: 'primary.main',
                                }}
                              />
                            )}
                          </Box>
                        }
                        secondary={
                          <>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: 'block', mb: 0.5 }}
                            >
                              {notification.message}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Chip
                                label={notification.type.replace('_', ' ')}
                                size="small"
                                color={getNotificationColor(notification.type)}
                                sx={{ height: 20, fontSize: '0.65rem' }}
                              />
                              <Typography variant="caption" color="text.secondary">
                                {formatDistanceToNow(new Date(notification.createdAt), {
                                  addSuffix: true,
                                })}
                              </Typography>
                            </Box>
                          </>
                        }
                      />
                    </ListItemButton>
                    <IconButton
                      size="small"
                      onClick={(e) => handleDelete(e, notification._id)}
                      sx={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        '&:hover': {
                          bgcolor: 'error.light',
                          color: 'error.main',
                        },
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItem>
                  {index < notifications.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>
      </Popover>
    </>
  );
};

export default NotificationBell;

