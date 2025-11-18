import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  CircularProgress,
} from '@mui/material';
import { Edit as EditIcon } from '@mui/icons-material';

const EditChatDialog = ({ open, onClose, chat, onUpdate, currentUserId }) => {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nickname, setNickname] = useState('');

  useEffect(() => {
    if (chat) {
      if (chat.type === 'group') {
        setName(chat.name || '');
        setDescription(chat.description || '');
      } else if (chat.type === 'direct') {
        // Get the current user's nickname for this chat
        const currentNickname = chat.nicknames?.get?.(currentUserId) || 
                               chat.nicknames?.[currentUserId] || 
                               '';
        setNickname(currentNickname);
      }
    }
  }, [chat, currentUserId]);

  const handleSubmit = async () => {
    if (!chat) return;

    setLoading(true);
    try {
      let updateData = {};

      if (chat.type === 'group') {
        if (!name.trim()) {
          alert('Group name is required');
          setLoading(false);
          return;
        }
        updateData = {
          name: name.trim(),
          description: description.trim(),
        };
      } else if (chat.type === 'direct') {
        updateData = {
          nickname: nickname.trim(),
        };
      }

      await onUpdate(chat._id, updateData);
      onClose();
    } catch (error) {
      console.error('Error updating chat:', error);
      alert(error.message || 'Failed to update chat');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  if (!chat) return null;

  const isGroupChat = chat.type === 'group';
  const otherParticipant = !isGroupChat
    ? chat.participants?.find((p) => p._id !== currentUserId)
    : null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <EditIcon />
          <Typography variant="h6">
            {isGroupChat ? 'Edit Group Chat' : 'Edit Nickname'}
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        {isGroupChat ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Group Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              required
              disabled={loading}
              inputProps={{ maxLength: 100 }}
              helperText={`${name.length}/100 characters`}
            />
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={3}
              disabled={loading}
              inputProps={{ maxLength: 500 }}
              helperText={`${description.length}/500 characters`}
            />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Set a custom nickname for{' '}
              <strong>{otherParticipant?.name || 'this contact'}</strong>. This is only visible to
              you.
            </Typography>
            <TextField
              label="Nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              fullWidth
              disabled={loading}
              placeholder={otherParticipant?.name || 'Enter nickname'}
              inputProps={{ maxLength: 100 }}
              helperText={
                nickname.trim()
                  ? `${nickname.length}/100 characters`
                  : 'Leave empty to use their real name'
              }
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading || (isGroupChat && !name.trim())}
          startIcon={loading ? <CircularProgress size={20} /> : <EditIcon />}
        >
          {loading ? 'Updating...' : 'Update'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditChatDialog;

