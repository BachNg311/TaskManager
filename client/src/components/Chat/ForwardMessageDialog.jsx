import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Checkbox,
  TextField,
  Box,
  Typography,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  Forward as ForwardIcon,
  Search as SearchIcon,
  Group as GroupIcon,
  Person as PersonIcon,
} from '@mui/icons-material';

const ForwardMessageDialog = ({ open, onClose, message, chats, currentUserId, onForward }) => {
  const [selectedChatIds, setSelectedChatIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Filter out the current chat and search
  const availableChats = useMemo(() => {
    if (!chats || !message) return [];
    
    return chats.filter(chat => {
      // Don't show the chat where the message is from
      if (chat._id === message.chat?._id || chat._id === message.chat) return false;
      
      // Don't show chats user has left
      if (chat.hasLeft || chat.isFormerParticipant) return false;
      
      // Search filter
      if (searchQuery) {
        const chatName = getChatName(chat).toLowerCase();
        return chatName.includes(searchQuery.toLowerCase());
      }
      
      return true;
    });
  }, [chats, message, searchQuery]);

  const getChatName = (chat) => {
    if (chat.type === 'group') {
      return chat.name;
    }
    // For direct chat, check for nickname first
    const nickname = chat.nicknames?.get?.(currentUserId) || chat.nicknames?.[currentUserId];
    if (nickname && nickname.trim()) {
      return nickname;
    }
    // Show other participant's name
    const otherParticipant = chat.participants?.find(
      (p) => (p._id || p) !== currentUserId
    );
    return otherParticipant?.name || 'Unknown User';
  };

  const getChatAvatar = (chat) => {
    if (chat.type === 'group') {
      return {
        src: null,
        fallback: chat.name?.charAt(0).toUpperCase() || 'G'
      };
    }
    const otherParticipant = chat.participants?.find(
      (p) => (p._id || p) !== currentUserId
    );
    const avatarUrl = otherParticipant?.avatar || otherParticipant?.avatarUrl;
    return {
      src: avatarUrl && avatarUrl.trim() !== '' ? avatarUrl : null,
      fallback: otherParticipant?.name?.charAt(0).toUpperCase() || 'U'
    };
  };

  const handleToggleChat = (chatId) => {
    setSelectedChatIds((prev) =>
      prev.includes(chatId)
        ? prev.filter((id) => id !== chatId)
        : [...prev, chatId]
    );
  };

  const handleForward = async () => {
    if (selectedChatIds.length === 0) return;

    setLoading(true);
    try {
      await onForward(message._id, selectedChatIds);
      handleClose();
    } catch (error) {
      console.error('Error forwarding message:', error);
      alert(error.message || 'Failed to forward message');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setSelectedChatIds([]);
      setSearchQuery('');
      onClose();
    }
  };

  const getMessagePreview = () => {
    if (!message) return '';
    
    if (message.text) {
      return message.text.length > 100 
        ? `${message.text.substring(0, 100)}...` 
        : message.text;
    }
    
    if (message.attachments && message.attachments.length > 0) {
      const count = message.attachments.length;
      return `${count} ${count === 1 ? 'attachment' : 'attachments'}`;
    }
    
    return 'Message';
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ForwardIcon />
          <Typography variant="h6">Forward Message</Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        {/* Message Preview */}
        <Box
          sx={{
            p: 2,
            mb: 2,
            bgcolor: '#f5f5f5',
            borderRadius: 2,
            borderLeft: '4px solid #6366f1',
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Forwarding:
          </Typography>
          <Typography variant="body2">{getMessagePreview()}</Typography>
          {message?.forwardedFrom && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Originally from: {message.forwardedFrom.name}
            </Typography>
          )}
        </Box>

        {/* Search */}
        <TextField
          fullWidth
          placeholder="Search chats..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
          }}
          sx={{ mb: 2 }}
        />

        {/* Selected Count */}
        {selectedChatIds.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Chip
              label={`${selectedChatIds.length} chat${selectedChatIds.length === 1 ? '' : 's'} selected`}
              color="primary"
              size="small"
            />
          </Box>
        )}

        {/* Chat List */}
        <List sx={{ maxHeight: 400, overflow: 'auto' }}>
          {availableChats.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                {searchQuery ? 'No chats found' : 'No chats available'}
              </Typography>
            </Box>
          ) : (
            availableChats.map((chat) => {
              const avatarData = getChatAvatar(chat);
              const isSelected = selectedChatIds.includes(chat._id);

              return (
                <ListItem key={chat._id} disablePadding>
                  <ListItemButton
                    onClick={() => handleToggleChat(chat._id)}
                    selected={isSelected}
                    sx={{
                      borderRadius: 1,
                      mb: 0.5,
                      '&.Mui-selected': {
                        bgcolor: 'rgba(99, 102, 241, 0.08)',
                      },
                    }}
                  >
                    <Checkbox
                      checked={isSelected}
                      sx={{ mr: 1 }}
                      color="primary"
                    />
                    <ListItemAvatar>
                      <Avatar
                        src={avatarData.src || undefined}
                        sx={{
                          bgcolor: chat.type === 'group' ? '#6366f1' : '#10b981',
                        }}
                      >
                        {avatarData.fallback}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {getChatName(chat)}
                          {chat.type === 'group' && (
                            <GroupIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                          )}
                          {chat.type === 'direct' && (
                            <PersonIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                          )}
                        </Box>
                      }
                      secondary={
                        chat.type === 'group'
                          ? `${chat.participants?.length || 0} participants`
                          : null
                      }
                    />
                  </ListItemButton>
                </ListItem>
              );
            })
          )}
        </List>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleForward}
          variant="contained"
          disabled={loading || selectedChatIds.length === 0}
          startIcon={loading ? <CircularProgress size={20} /> : <ForwardIcon />}
        >
          {loading
            ? 'Forwarding...'
            : `Forward to ${selectedChatIds.length} chat${selectedChatIds.length === 1 ? '' : 's'}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ForwardMessageDialog;

