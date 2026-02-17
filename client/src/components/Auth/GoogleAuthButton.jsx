import React, { useEffect, useRef, useState } from 'react';
import { Box, Divider, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

// Reusable Google OAuth button using Google Identity Services
const GoogleAuthButton = ({ mode = 'login', onError }) => {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [initialised, setInitialised] = useState(false);
  const [configMissing, setConfigMissing] = useState(false);
  const buttonElRef = useRef(null);

  const handleGoogleCallbackResponse = async (response) => {
    try {
      const idToken = response.credential;
      const result = await loginWithGoogle(idToken);

      if (result.success) {
        navigate('/dashboard');
      } else if (onError) {
        onError(result.message || 'Google sign-in failed');
      }
    } catch (err) {
      console.error('Google auth error:', err);
      if (onError) {
        onError('Google sign-in failed');
      }
    }
  };

  useEffect(() => {
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.warn('REACT_APP_GOOGLE_CLIENT_ID is not set');
      setConfigMissing(true);
      return;
    }

    const initGoogle = () => {
      if (!window.google || !window.google.accounts || !window.google.accounts.id) {
        return;
      }

      if (!buttonElRef.current) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCallbackResponse,
      });

      // Clear previous render (important during hot reload)
      buttonElRef.current.innerHTML = '';

      window.google.accounts.id.renderButton(buttonElRef.current, {
          theme: 'outline',
          size: 'large',
          // Google expects a number of pixels, not a percentage string
          width: 320,
          text: mode === 'login' ? 'signin_with' : 'signup_with',
        });
      setInitialised(true);
    };

    if (window.google && window.google.accounts && window.google.accounts.id) {
      initGoogle();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initGoogle;
    document.body.appendChild(script);

    return () => {
      // Keep script loaded for the lifetime of the app
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box sx={{ mt: 2, mb: 1 }}>
      <Divider sx={{ mb: 2 }}>
        <Typography variant="body2" color="textSecondary">
          Or continue with
        </Typography>
      </Divider>
      {configMissing ? (
        <Typography variant="body2" color="textSecondary" sx={{ textAlign: 'center' }}>
          Google sign-in is not configured. Set <code>REACT_APP_GOOGLE_CLIENT_ID</code> and restart the client.
        </Typography>
      ) : null}
      <Box
        ref={buttonElRef}
        sx={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          opacity: initialised ? 1 : 0.7,
          // Ensure the rendered iframe stays centered/responsive
          '& iframe': {
            maxWidth: '100%'
          }
        }}
      />
    </Box>
  );
};

export default GoogleAuthButton;
