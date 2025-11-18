import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { getSocketUrl } from '../utils/apiConfig';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const { token, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (isAuthenticated && token) {
      // Socket.IO connects to base URL, not /api
      const socketUrl = getSocketUrl();
      
      const newSocket = io(socketUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      newSocket.on('connect', () => {
        console.log('Socket connected');
        setConnected(true);
      });

      newSocket.on('disconnect', () => {
        console.log('Socket disconnected');
        setConnected(false);
      });

      newSocket.on('error', (error) => {
        console.error('Socket error:', error);
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
        setSocket(null);
        setConnected(false);
      };
    } else {
      if (socket) {
        socket.close();
        setSocket(null);
        setConnected(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token]);

  const joinProject = (projectId) => {
    if (socket && connected) {
      socket.emit('join:project', projectId);
    }
  };

  const leaveProject = (projectId) => {
    if (socket && connected) {
      socket.emit('leave:project', projectId);
    }
  };

  const emitTaskUpdate = (data) => {
    if (socket && connected) {
      socket.emit('task:update', data);
    }
  };

  const emitTaskCreate = (data) => {
    if (socket && connected) {
      socket.emit('task:create', data);
    }
  };

  const emitTaskDelete = (data) => {
    if (socket && connected) {
      socket.emit('task:delete', data);
    }
  };

  const emitComment = (data) => {
    if (socket && connected) {
      socket.emit('comment:add', data);
    }
  };

  const value = {
    socket,
    connected,
    joinProject,
    leaveProject,
    emitTaskUpdate,
    emitTaskCreate,
    emitTaskDelete,
    emitComment,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

