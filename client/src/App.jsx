import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout/Layout';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ForgotPassword from './pages/Auth/ForgotPassword';
import ResetPassword from './pages/Auth/ResetPassword';
import Dashboard from './pages/Dashboard/Dashboard';
import Tasks from './pages/Tasks/Tasks';
import KanbanBoard from './pages/Kanban/KanbanBoard';
import Profile from './pages/Profile/Profile';
import Chat from './pages/Chat/Chat';
import Review from './pages/Review/Review';
import Loading from './components/Common/Loading';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <Loading />;
  }

  return user ? children : <Navigate to="/login" replace />;
};

// Public Route Component (redirect if already logged in)
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <Loading />;
  }

  return user ? <Navigate to="/dashboard" replace /> : children;
};

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />

      {/* Protected Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="taskboard" element={<KanbanBoard />} />
        <Route path="review" element={<Review />} />
        <Route path="chat" element={<Chat />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;

