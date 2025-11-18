import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Assignment as TaskIcon,
  ViewKanban as KanbanIcon,
  RateReview as ReviewIcon,
  Chat as ChatIcon,
  AccountCircle as ProfileIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import NotificationBell from '../Common/NotificationBell';

const drawerWidth = 260;

// Base menu; visibility is filtered later by user role where needed
const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { text: 'Tasks', icon: <TaskIcon />, path: '/tasks' },
  { text: 'Task Board', icon: <KanbanIcon />, path: '/taskboard' },
  // Review page should be visible only for managers/admins
  { text: 'Review', icon: <ReviewIcon />, path: '/review', roles: ['manager', 'admin'] },
  { text: 'Chat', icon: <ChatIcon />, path: '/chat' },
];

const Layout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  console.log('🏠 Layout - user object:', user);
  console.log('🖼️ Layout - user.avatar:', user?.avatar);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    handleMenuClose();
  };

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar
        sx={{
          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
          color: 'white',
          minHeight: { xs: '56px', sm: '64px' },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Typography 
          variant="h6" 
          noWrap 
          component="div" 
          sx={{ 
            fontWeight: 700, 
            fontSize: { xs: '1.1rem', sm: '1.25rem' },
            background: 'linear-gradient(135deg, #ffffff 0%, #e0e7ff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Task Manager
        </Typography>
      </Toolbar>
      <Divider />
      <List sx={{ flex: 1, pt: 2, px: 1 }}>
        {menuItems
          .filter(item => !item.roles || item.roles.includes(user?.role))
          .map((item) => {
          const isSelected = location.pathname === item.path;
          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                selected={isSelected}
                onClick={() => {
                  navigate(item.path);
                  setMobileOpen(false);
                }}
                sx={{
                  borderRadius: 2,
                  py: 1.5,
                  px: 2,
                  mb: 0.5,
                  transition: 'all 0.2s',
                  '&.Mui-selected': {
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    color: 'white',
                    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                      transform: 'translateX(4px) scale(1.02)',
                    },
                    '& .MuiListItemIcon-root': {
                      color: 'white',
                    },
                  },
                  '&:hover': {
                    backgroundColor: 'rgba(99, 102, 241, 0.08)',
                    transform: 'translateX(4px)',
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    color: isSelected ? 'white' : 'text.secondary',
                    minWidth: 40,
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{
                    fontWeight: isSelected ? 600 : 500,
                    fontSize: '0.95rem',
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar
            src={user?.avatar && user.avatar.trim() !== '' ? user.avatar : undefined}
            sx={{
              width: { xs: 36, sm: 40 },
              height: { xs: 36, sm: 40 },
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
            }}
          >
            {user?.name?.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0, display: { xs: 'none', sm: 'block' } }}>
            <Typography variant="body2" fontWeight={600} noWrap sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
              {user?.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
              {user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1)}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          backdropFilter: 'blur(20px)',
          backgroundColor: { xs: 'rgba(255, 255, 255, 0.95)', sm: 'rgba(255, 255, 255, 0.9)' },
          borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <Toolbar sx={{ minHeight: { xs: '56px', sm: '64px' }, px: { xs: 1.5, sm: 3 } }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{
              mr: 2,
              display: { sm: 'none' },
              color: 'text.primary',
            }}
          >
            <MenuIcon />
          </IconButton>
          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={{
              flexGrow: 1,
              fontWeight: 600,
              color: 'text.primary',
              fontSize: { xs: '1rem', sm: '1.25rem' },
            }}
          >
            {menuItems.find((item) => item.path === location.pathname)?.text || 'Task Manager'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 } }}>
            <NotificationBell />
            <Box sx={{ display: { xs: 'none', lg: 'flex' }, flexDirection: 'column', alignItems: 'flex-end' }}>
              <Typography variant="body2" fontWeight={600} color="text.primary" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                {user?.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                {user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1)}
              </Typography>
            </Box>
            <IconButton
              onClick={handleMenuOpen}
              size="small"
              sx={{
                '&:hover': {
                  transform: 'scale(1.05)',
                },
                transition: 'transform 0.2s',
              }}
            >
              <Avatar
                src={user?.avatar && user.avatar.trim() !== '' ? user.avatar : undefined}
                sx={{
                  width: { xs: 36, sm: 40 },
                  height: { xs: 36, sm: 40 },
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                  '&:hover': {
                    transform: 'scale(1.05)',
                  },
                }}
              >
                {user?.name?.charAt(0).toUpperCase()}
              </Avatar>
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              PaperProps={{
                elevation: 8,
                sx: {
                  mt: 1.5,
                  borderRadius: 2,
                  minWidth: 200,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                },
              }}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <MenuItem
                onClick={() => {
                  navigate('/profile');
                  handleMenuClose();
                }}
                sx={{
                  borderRadius: 1,
                  mx: 1,
                  my: 0.5,
                  '&:hover': {
                    backgroundColor: 'rgba(99, 102, 241, 0.08)',
                  },
                }}
              >
                <ProfileIcon sx={{ mr: 1.5 }} fontSize="small" />
                Profile
              </MenuItem>
              <MenuItem
                onClick={handleLogout}
                sx={{
                  borderRadius: 1,
                  mx: 1,
                  my: 0.5,
                  '&:hover': {
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  },
                }}
              >
                <LogoutIcon sx={{ mr: 1.5 }} fontSize="small" />
                Logout
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: { xs: '280px', sm: drawerWidth },
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: drawerWidth,
              borderRight: '1px solid rgba(0,0,0,0.05)',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, sm: 2, md: 3, lg: 4 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: { xs: 7, sm: 8 },
          backgroundColor: 'background.default',
          minHeight: { xs: 'calc(100vh - 56px)', sm: 'calc(100vh - 64px)' },
          maxWidth: '100%',
          overflowX: 'hidden',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;

