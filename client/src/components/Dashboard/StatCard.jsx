import React from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';

const StatCard = ({ title, value, icon, color }) => {
  return (
    <Card
      sx={{
        height: '100%',
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${color} 0%, ${color}dd 100%)`,
        },
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ flex: 1 }}>
            <Typography
              color="text.secondary"
              gutterBottom
              variant="body2"
              sx={{ fontWeight: 500, mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.75rem' }}
            >
              {title}
            </Typography>
            <Typography
              variant="h3"
              component="div"
              sx={{
                fontWeight: 700,
                background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                lineHeight: 1.2,
              }}
            >
              {value}
            </Typography>
          </Box>
          <Box
            sx={{
              background: `linear-gradient(135deg, ${color}15 0%, ${color}25 100%)`,
              color: color,
              borderRadius: 3,
              p: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              ml: 2,
              '& svg': {
                fontSize: 32,
              },
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default StatCard;

