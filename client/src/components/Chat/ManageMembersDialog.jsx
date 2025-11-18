import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  IconButton,
  Typography,
  Box,
  TextField,
  Autocomplete,
  Chip,
  CircularProgress,
  Divider
} from '@mui/material';
import {
  PersonRemove as RemoveIcon,
  PersonAdd as AddIcon,
  Close as CloseIcon,
  AdminPanelSettings as AdminIcon
} from '@mui/icons-material';
import { userService } from '../../services/userService';
import { chatService } from '../../services/chatService';
import { useAuth } from '../../hooks/useAuth';

const ManageMembersDialog = ({ open, onClose, chat, onMemberAdded, onMemberRemoved }) => {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState({});
  const { user: currentUser } = useAuth();

  const isCreator = chat?.createdBy?._id === currentUser?._id || chat?.createdBy === currentUser?._id;

  useEffect(() => {
    if (open) {
      fetchUsers();
    }
  }, [open]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await userService.getUsers();
      const allUsers = response.data || response;
      
      // Filter out users who are already participants
      const participantIds = chat?.participants?.map(p => p._id || p) || [];
      const availableUsers = allUsers.filter(
        u => !participantIds.includes(u._id) && u._id !== currentUser._id
      );
      
      setUsers(availableUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedUser || !chat) return;

    setAdding(true);
    try {
      const response = await chatService.addParticipant(chat._id, selectedUser._id);
      if (onMemberAdded) {
        onMemberAdded(response.data || response);
      }
      setSelectedUser(null);
      fetchUsers(); // Refresh available users
    } catch (error) {
      console.error('Error adding member:', error);
      alert(error.response?.data?.message || 'Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!chat) return;

    const member = chat.participants.find(p => (p._id || p) === userId);
    const confirmed = window.confirm(
      `Are you sure you want to remove ${member?.name || 'this user'} from the group?`
    );
    
    if (!confirmed) return;

    setRemoving(prev => ({ ...prev, [userId]: true }));
    try {
      const response = await chatService.removeParticipant(chat._id, userId);
      if (onMemberRemoved) {
        onMemberRemoved(response.data || response);
      }
      fetchUsers(); // Refresh available users
    } catch (error) {
      console.error('Error removing member:', error);
      alert(error.response?.data?.message || 'Failed to remove member');
    } finally {
      setRemoving(prev => ({ ...prev, [userId]: false }));
    }
  };

  const getAvatarSrc = (participant) => {
    const avatarUrl = participant?.avatar || participant?.avatarUrl;
    return avatarUrl && avatarUrl.trim() !== '' ? avatarUrl : null;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Manage Group Members</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {/* Add Member Section */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            Add Members
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Autocomplete
              fullWidth
              options={users}
              getOptionLabel={(option) => option.name || option.email}
              value={selectedUser}
              onChange={(e, newValue) => setSelectedUser(newValue)}
              loading={loadingUsers}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Search users to add..."
                  size="small"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingUsers ? <CircularProgress size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              renderOption={(props, option) => (
                <li {...props}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar 
                      src={getAvatarSrc(option) || undefined}
                      sx={{ width: 32, height: 32 }}
                    >
                      {option.name?.charAt(0).toUpperCase() || 'U'}
                    </Avatar>
                    <Box>
                      <Typography variant="body2">{option.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.email}
                      </Typography>
                    </Box>
                  </Box>
                </li>
              )}
            />
            <Button
              variant="contained"
              startIcon={adding ? <CircularProgress size={16} /> : <AddIcon />}
              onClick={handleAddMember}
              disabled={!selectedUser || adding}
              sx={{ minWidth: 100 }}
            >
              Add
            </Button>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Current Members Section */}
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          Current Members ({chat?.participants?.length || 0})
        </Typography>
        <List sx={{ maxHeight: 400, overflow: 'auto' }}>
          {chat?.participants?.map((participant) => {
            const participantId = participant._id || participant;
            const isCurrentUser = participantId === currentUser._id;
            const isChatCreator = participantId === (chat.createdBy?._id || chat.createdBy);
            const canRemove = isCreator && !isChatCreator && !isCurrentUser;

            return (
              <ListItem
                key={participantId}
                secondaryAction={
                  canRemove ? (
                    <IconButton
                      edge="end"
                      onClick={() => handleRemoveMember(participantId)}
                      disabled={removing[participantId]}
                      sx={{ color: 'error.main' }}
                    >
                      {removing[participantId] ? (
                        <CircularProgress size={20} />
                      ) : (
                        <RemoveIcon />
                      )}
                    </IconButton>
                  ) : null
                }
              >
                <ListItemAvatar>
                  <Avatar src={getAvatarSrc(participant) || undefined}>
                    {participant.name?.charAt(0).toUpperCase() || 'U'}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1">
                        {participant.name}
                        {isCurrentUser && ' (You)'}
                      </Typography>
                      {isChatCreator && (
                        <Chip
                          icon={<AdminIcon />}
                          label="Creator"
                          size="small"
                          color="primary"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                    </Box>
                  }
                  secondary={participant.email}
                />
              </ListItem>
            );
          })}
        </List>

        {!isCreator && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Only the group creator can add or remove members.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ManageMembersDialog;

