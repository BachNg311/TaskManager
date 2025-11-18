import React from 'react';
import { Box, CircularProgress } from '@mui/material';

const Loading = ({ fullScreen = false }) => {
  const content = (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        ...(fullScreen && {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: 'background.default',
        }),
      }}
    >
      <CircularProgress />
    </Box>
  );

  return content;
};

export default Loading;

