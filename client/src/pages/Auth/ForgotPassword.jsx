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
import { authService } from '../../services/authService';
import Loading from '../../components/Common/Loading';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (!otpSent) {
        // Step 1: send OTP
        const response = await authService.forgotPassword(email);
        const data = response.data || response;
        setMessage(data.message || 'OTP has been sent to your email address.');
        setOtpSent(true);
      } else {
        // Step 2: verify OTP and reset password
        if (!otp || otp.length !== 6) {
          setError('Please enter the 6-digit OTP sent to your email.');
          setLoading(false);
          return;
        }

        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }

        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          setLoading(false);
          return;
        }

        const response = await authService.resetPassword(email, otp, password);
        const data = response.data || response;
        setMessage(data.message || 'Password has been reset successfully.');

        // Redirect back to login after short delay
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
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
            Forgot Password
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
              {error}
            </Alert>
          )}
          {message && (
            <Alert severity="success" sx={{ mt: 2, mb: 2 }}>
              {message}
            </Alert>
          )}
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus={!otpSent}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={otpSent}
            />
            {otpSent && (
              <>
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  id="otp"
                  label="6-digit OTP"
                  name="otp"
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  inputProps={{
                    inputMode: 'numeric',
                    pattern: '[0-9]*',
                    maxLength: 6,
                    style: {
                      letterSpacing: '0.5rem',
                      textAlign: 'center',
                      fontSize: '1.4rem',
                    },
                  }}
                />
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  name="password"
                  label="New Password"
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
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </>
            )}
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
            >
              {otpSent ? 'Reset Password' : 'Send OTP'}
            </Button>
            <Box textAlign="center">
              <Link to="/login" style={{ textDecoration: 'none' }}>
                <Typography variant="body2" color="primary">
                  Back to Sign In
                </Typography>
              </Link>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default ForgotPassword;


