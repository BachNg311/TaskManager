import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemButton,
  Avatar,
  Tabs,
  Tab
} from '@mui/material';
import { useAuth } from '../../hooks/useAuth';
import { chatService } from '../../services/chatService';
import { userService } from '../../services/userService';

const NewChatDialog = ({ open, onClose, onChatCreated, existingChats = [] }) => {
  const [tabValue, setTabValue] = useState(0);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (open) {
      fetchUsers();
    }
  }, [open, existingChats, tabValue]);

  const fetchUsers = async () => {
    try {
      const response = await userService.getUsers();
      const usersData = response.data || response || [];
      
      console.log('Fetched users for chat:', usersData.length);
      
      // For direct message tab: filter out users with existing direct chats
      // For group chat tab: show all users (including those with existing direct chats and managers)
      let availableUsers;
      
      if (tabValue === 0) {
        // Direct Message tab: filter out users with existing direct chats
        const existingDirectChatUserIds = new Set();
        existingChats.forEach(chat => {
          if (chat.type === 'direct' && chat.participants) {
            // Find the other participant (not current user)
            const otherParticipant = chat.participants.find(
              p => (p._id?.toString() || p._id) !== (user._id?.toString() || user._id)
            );
            if (otherParticipant) {
              const otherId = otherParticipant._id?.toString() || otherParticipant._id;
              existingDirectChatUserIds.add(otherId);
            }
          }
        });
        
        // Filter out current user, inactive users, and users with existing direct chats
        availableUsers = usersData.filter((u) => {
          const userId = u._id?.toString() || u._id;
          const currentUserId = user._id?.toString() || user._id;
          return (
            userId !== currentUserId && 
            u.isActive !== false && 
            !existingDirectChatUserIds.has(userId)
          );
        });
      } else {
        // Group Chat tab: show all active users (members, managers, admins)
        // Include users even if they have existing direct chats
        availableUsers = usersData.filter((u) => {
          const userId = u._id?.toString() || u._id;
          const currentUserId = user._id?.toString() || user._id;
          return (
            userId !== currentUserId && 
            u.isActive !== false
          );
        });
      }
      
      console.log('Available users after filtering:', availableUsers.length);
      setUsers(availableUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      // Set empty array on error to show "No members available" message
      setUsers([]);
    }
  };

  const handleCreateDirectChat = async () => {
    if (!selectedUser) return;

    setLoading(true);
    try {
      const chat = await chatService.getOrCreateDirectChat(selectedUser._id);
      onChatCreated(chat);
      onClose();
      resetForm();
    } catch (error) {
      console.error('Error creating direct chat:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroupChat = async () => {
    if (!groupName || selectedParticipants.length < 2) return;

    setLoading(true);
    try {
      const chat = await chatService.createGroupChat({
        name: groupName,
        description: groupDescription,
        participantIds: selectedParticipants
      });
      onChatCreated(chat);
      onClose();
      resetForm();
    } catch (error) {
      console.error('Error creating group chat:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedUser(null);
    setGroupName('');
    setGroupDescription('');
    setSelectedParticipants([]);
    setTabValue(0);
  };

  const toggleParticipant = (userId) => {
    setSelectedParticipants((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Chat</DialogTitle>
      <DialogContent>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} sx={{ mb: 2 }}>
          <Tab label="Direct Message" />
          <Tab label="Group Chat" />
        </Tabs>

        {tabValue === 0 ? (
          <Box>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
              Select a member to start a direct conversation
            </Typography>
            <Typography variant="caption" color="textSecondary" sx={{ mb: 2, display: 'block' }}>
              All members: {users.length} available
            </Typography>
            <List sx={{ maxHeight: 400, overflowY: 'auto' }}>
              {users.length === 0 ? (
                <ListItem>
                  <ListItemText 
                    primary="No members available" 
                    secondary="All members will appear here"
                  />
                </ListItem>
              ) : (
                users.map((u) => (
                  <ListItem key={u._id} disablePadding>
                    <ListItemButton
                      selected={selectedUser?._id === u._id}
                      onClick={() => setSelectedUser(u)}
                    >
                      <ListItemAvatar>
                        <Avatar 
                          src={u.avatar && u.avatar.trim() !== '' ? u.avatar : undefined}
                          sx={{ bgcolor: 'primary.main' }}
                        >
                          {u.name?.charAt(0).toUpperCase()}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText 
                        primary={u.name} 
                        secondary={`${u.email}${u.role ? ` • ${u.role}` : ''}`}
                      />
                    </ListItemButton>
                  </ListItem>
                ))
              )}
            </List>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Group Name"
              required
              fullWidth
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <TextField
              label="Description (Optional)"
              fullWidth
              multiline
              rows={2}
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
            />
            <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
              Select participants (at least 2 members or managers)
            </Typography>
            <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block' }}>
              All users: {users.length} available
            </Typography>
            <List sx={{ maxHeight: 300, overflowY: 'auto' }}>
              {users.length === 0 ? (
                <ListItem>
                  <ListItemText 
                    primary="No members available" 
                    secondary="All members will appear here"
                  />
                </ListItem>
              ) : (
                users.map((u) => (
                  <ListItem key={u._id} disablePadding>
                    <ListItemButton onClick={() => toggleParticipant(u._id)}>
                      <ListItemAvatar>
                        <Avatar 
                          src={u.avatar && u.avatar.trim() !== '' ? u.avatar : undefined}
                          sx={{ bgcolor: 'primary.main' }}
                        >
                          {u.name?.charAt(0).toUpperCase()}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText 
                        primary={u.name} 
                        secondary={`${u.email}${u.role ? ` • ${u.role}` : ''}`}
                      />
                      {selectedParticipants.includes(u._id) && (
                        <Chip label="Selected" size="small" color="primary" />
                      )}
                    </ListItemButton>
                  </ListItem>
                ))
              )}
            </List>
            {selectedParticipants.length > 0 && (
              <Box>
                <Typography variant="caption" color="textSecondary">
                  Selected: {selectedParticipants.length} participant(s)
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={tabValue === 0 ? handleCreateDirectChat : handleCreateGroupChat}
          variant="contained"
          disabled={
            loading ||
            (tabValue === 0 ? !selectedUser : !groupName || selectedParticipants.length < 2)
          }
        >
          {tabValue === 0 ? 'Start Chat' : 'Create Group'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewChatDialog;

