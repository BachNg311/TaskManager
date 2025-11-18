import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import './index.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { TaskProvider } from './context/TaskContext';
import { NotificationProvider } from './context/NotificationContext';
import theme from './styles/theme';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <SocketProvider>
            <TaskProvider>
              <NotificationProvider>
                <App />
              </NotificationProvider>
            </TaskProvider>
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);

