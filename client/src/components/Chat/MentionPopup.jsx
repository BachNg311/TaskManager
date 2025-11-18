import React from 'react';
import { Paper, List, ListItem, ListItemButton, ListItemAvatar, ListItemText, Avatar, Typography } from '@mui/material';

const MentionPopup = ({ 
  users, 
  position, 
  onSelectUser, 
  onSelectAll,
  showAll = false 
}) => {
  if (!position || users.length === 0) return null;

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        maxWidth: 300,
        maxHeight: 300,
        overflowY: 'auto',
        zIndex: 1300,
        bgcolor: 'background.paper',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      <List dense sx={{ py: 0.5 }}>
        {showAll && (
          <ListItem disablePadding>
            <ListItemButton onClick={onSelectAll} sx={{ py: 0.75 }}>
              <ListItemAvatar sx={{ minWidth: 40 }}>
                <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                  @
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    @all
                  </Typography>
                }
                secondary="Notify everyone in this group"
              />
            </ListItemButton>
          </ListItem>
        )}
        {users.map((user) => (
          <ListItem key={user._id} disablePadding>
            <ListItemButton onClick={() => onSelectUser(user)} sx={{ py: 0.75 }}>
              <ListItemAvatar sx={{ minWidth: 40 }}>
                <Avatar 
                  sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}
                  src={user.avatar}
                >
                  {user.name?.charAt(0).toUpperCase()}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {user.name}
                  </Typography>
                }
                secondary={
                  <Typography variant="caption" color="textSecondary">
                    {user.email}
                  </Typography>
                }
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Paper>
  );
};

export default MentionPopup;

