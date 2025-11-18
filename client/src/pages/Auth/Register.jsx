import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
} from '@mui/material';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../services/authService';
import Loading from '../../components/Common/Loading';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register, refreshUser } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const result = await register(name, email, password);

      if (result.success) {
        // If user chose an avatar, upload it to S3 (optional step)
        if (avatarFile) {
          try {
            await authService.uploadAvatar(avatarFile);
            await refreshUser();
          } catch (uploadErr) {
            console.error('Avatar upload failed:', uploadErr);
            // Do not block registration on avatar failure
          }
        }

        setLoading(false);
        navigate('/dashboard');
      } else {
        setLoading(false);
        setError(result.message || 'Registration failed');
      }
    } catch (err) {
      setLoading(false);
      setError('An unexpected error occurred. Please try again.');
      console.error('Registration error:', err);
    }
  };

  if (loading) {
    return <Loading fullScreen />;
  }

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography component="h1" variant="h4" align="center" gutterBottom>
            Task Manager
          </Typography>
          <Typography component="h2" variant="h5" align="center" gutterBottom>
            Sign Up
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
            {/* Optional avatar upload (placed above name) */}
            <Box
              sx={{
                mb: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  bgcolor: '#e4e6eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 0.5,
                }}
              >
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Avatar preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <Typography variant="body2" color="textSecondary">
                    Avatar
                  </Typography>
                )}
              </Box>
              <Button
                variant="outlined"
                component="label"
                size="small"
              >
                {avatarPreview ? 'Change avatar' : 'Upload avatar (optional)'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setAvatarFile(file);
                      const previewUrl = URL.createObjectURL(file);
                      setAvatarPreview(previewUrl);
                    }
                  }}
                />
              </Button>
            </Box>
            <TextField
              margin="normal"
              required
              fullWidth
              id="name"
              label="Full Name"
              name="name"
              autoComplete="name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="confirmPassword"
              label="Confirm Password"
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
            >
              Sign Up
            </Button>
            <Box textAlign="center">
              <Link to="/login" style={{ textDecoration: 'none' }}>
                <Typography variant="body2" color="primary">
                  Already have an account? Sign In
                </Typography>
              </Link>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default Register;

