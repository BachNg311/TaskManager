import React from 'react';
import { Box, Typography, Paper, Avatar, Grid } from '@mui/material';
import { useAuth } from '../../hooks/useAuth';

const Profile = () => {
  const { user } = useAuth();

  console.log('👤 Profile - user object:', user);
  console.log('🖼️ Profile - user.avatar:', user?.avatar);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Profile
      </Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
              <Avatar
                src={user?.avatar && user.avatar.trim() !== '' ? user.avatar : undefined}
                sx={{
                  width: 100,
                  height: 100,
                  bgcolor: 'primary.main',
                  fontSize: '2.5rem',
                  mb: 2,
                }}
              >
                {user?.name?.charAt(0).toUpperCase()}
              </Avatar>
              <Typography variant="h5">{user?.name}</Typography>
              <Typography variant="body2" color="textSecondary">
                {user?.email}
              </Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Role
              </Typography>
              <Typography variant="body1" sx={{ textTransform: 'capitalize', mb: 2 }}>
                {user?.role}
              </Typography>
              {user?.lastLogin && (
                <>
                  <Typography variant="body2" color="textSecondary" gutterBottom>
                    Last Login
                  </Typography>
                  <Typography variant="body1">
                    {new Date(user.lastLogin).toLocaleString()}
                  </Typography>
                </>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Profile;

