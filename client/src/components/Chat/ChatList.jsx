import React, { useState, useEffect } from 'react';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Typography,
  Box,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText as MenuItemText
} from '@mui/material';
import { format, formatDistanceToNow } from 'date-fns';
import { MoreVert as MoreVertIcon, Delete as DeleteIcon, Logout as LogoutIcon } from '@mui/icons-material';

const ChatList = ({ chats, selectedChat, onSelectChat, getChatName, getChatAvatar, onDeleteChat, onLeaveChat }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedChatForMenu, setSelectedChatForMenu] = useState(null);
  const [, setTick] = useState(0);

  // Force re-render every 30 seconds to update "X minutes ago" timestamps
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);
  const getLastMessagePreview = (chat) => {
    if (chat.lastMessage) {
      const text = chat.lastMessage.text?.trim();
      if (text) {
        return text.substring(0, 50);
      }
      if (chat.lastMessage.attachments && chat.lastMessage.attachments.length > 0) {
        const count = chat.lastMessage.attachments.length;
        const hasImages = chat.lastMessage.attachments.every(att => att.type?.startsWith('image'));
        const label = hasImages ? 'photo' : 'attachment';
        return `📎 ${count} ${label}${count > 1 ? 's' : ''}`;
      }
      return 'Media';
    }
    return 'No messages yet';
  };

  const getLastMessageTime = (chat) => {
    if (chat.lastMessageAt) {
      return formatDistanceToNow(new Date(chat.lastMessageAt), { addSuffix: true });
    }
    return '';
  };

  const handleMenuOpen = (event, chat) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedChatForMenu(chat);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedChatForMenu(null);
  };

  const handleDelete = () => {
    if (selectedChatForMenu && onDeleteChat) {
      onDeleteChat(selectedChatForMenu);
    }
    handleMenuClose();
  };

  const handleLeave = () => {
    if (selectedChatForMenu && onLeaveChat) {
      onLeaveChat(selectedChatForMenu);
    }
    handleMenuClose();
  };

  return (
    <List sx={{ flex: 1, overflowY: 'auto', p: 0 }}>
      {chats.length === 0 ? (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="textSecondary">
            No chats yet
          </Typography>
        </Box>
      ) : (
        chats.map((chat) => (
          <ListItem 
            key={chat._id} 
            disablePadding
            secondaryAction={
              <IconButton
                edge="end"
                size="small"
                onClick={(e) => handleMenuOpen(e, chat)}
                sx={{
                  opacity: 0.7,
                  '&:hover': {
                    opacity: 1,
                    bgcolor: 'rgba(0, 0, 0, 0.04)',
                  },
                }}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            }
          >
            <ListItemButton
              selected={selectedChat?._id === chat._id}
              onClick={() => onSelectChat(chat)}
              sx={{
                borderRadius: 0,
                px: 2,
                py: 1.5,
                pr: 6, // Add padding for menu button
                transition: 'background-color 0.15s',
                '&.Mui-selected': {
                  bgcolor: '#e4e6eb',
                  '&:hover': {
                    bgcolor: '#e4e6eb'
                  }
                },
                '&:hover': {
                  bgcolor: '#f2f3f5',
                }
              }}
            >
              <ListItemAvatar>
                {(() => {
                  const avatarData = getChatAvatar(chat);
                  return (
                    <Avatar 
                      src={avatarData?.src || undefined}
                      sx={{ 
                        bgcolor: '#e4e6eb',
                        color: '#1c1e21',
                        fontWeight: 600,
                        width: 56,
                        height: 56,
                      }}
                    >
                      {avatarData?.fallback || 'U'}
                    </Avatar>
                  );
                })()}
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <Typography 
                      variant="subtitle1" 
                      noWrap 
                      sx={{ 
                        fontWeight: 600,
                        fontSize: '0.9375rem',
                        color: '#1c1e21',
                        flex: 1,
                      }}
                    >
                      {getChatName(chat)}
                    </Typography>
                    {chat.lastMessageAt && (
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          ml: 1,
                          color: '#8a8d91',
                          fontSize: '0.75rem',
                          flexShrink: 0,
                        }}
                      >
                        {getLastMessageTime(chat)}
                      </Typography>
                    )}
                  </Box>
                }
                secondary={
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: chat.hasLeft ? '#d97706' : '#65676b',
                      fontSize: '0.8125rem',
                      mt: 0.25,
                      fontStyle: chat.hasLeft ? 'italic' : 'normal',
                    }}
                  >
                    {chat.hasLeft ? 'You left this chat' : getLastMessagePreview(chat)}
                  </Typography>
                }
              />
            </ListItemButton>
          </ListItem>
        ))
      )}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        {selectedChatForMenu?.type === 'group' && onLeaveChat && (
          <MenuItem onClick={handleLeave} disabled={Boolean(selectedChatForMenu?.hasLeft)}>
            <ListItemIcon>
              <LogoutIcon fontSize="small" sx={{ color: selectedChatForMenu?.hasLeft ? '#9ca3af' : '#0084ff' }} />
            </ListItemIcon>
            <MenuItemText>{selectedChatForMenu?.hasLeft ? 'Already left' : 'Leave Chat'}</MenuItemText>
          </MenuItem>
        )}
        <MenuItem onClick={handleDelete} sx={{ color: '#ef4444' }}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" sx={{ color: '#ef4444' }} />
          </ListItemIcon>
          <MenuItemText>Delete Chat</MenuItemText>
        </MenuItem>
      </Menu>
    </List>
  );
};

export default ChatList;

