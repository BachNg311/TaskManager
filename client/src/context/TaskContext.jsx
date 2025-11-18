import React, { createContext, useContext, useState, useEffect } from 'react';
import { taskService } from '../services/taskService';
import { useSocket } from './SocketContext';

const TaskContext = createContext();

export const useTasks = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
};

export const TaskProvider = ({ children }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    assignedTo: '',
    project: '',
    search: '',
  });
  const { socket, connected } = useSocket();

  useEffect(() => {
    if (connected && socket) {
      // Listen for real-time updates
      socket.on('task:updated', (data) => {
        setTasks((prev) =>
          prev.map((task) => (task._id === data._id ? data : task))
        );
      });

      socket.on('task:created', (data) => {
        setTasks((prev) => [data, ...prev]);
      });

      socket.on('task:deleted', (data) => {
        setTasks((prev) => prev.filter((task) => task._id !== data._id));
      });

      return () => {
        socket.off('task:updated');
        socket.off('task:created');
        socket.off('task:deleted');
      };
    }
  }, [socket, connected]);

  const fetchTasks = async (options = {}) => {
    setLoading(true);
    try {
      // Default to fetching all tasks (limit 50000 to bypass backend limit) unless specified otherwise
      const fetchOptions = {
        limit: 50000, // High limit to fetch all tasks (backend treats >= 50000 as "no limit")
        ...options
      };
      const response = await taskService.getTasks(filters, fetchOptions);
      setTasks(response.data || response || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const createTask = async (taskData) => {
    try {
      const response = await taskService.createTask(taskData);
      const newTask = response.data || response;
      setTasks((prev) => [newTask, ...prev]);
      return { success: true, data: newTask };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to create task',
      };
    }
  };

  const updateTask = async (taskId, taskData) => {
    try {
      const response = await taskService.updateTask(taskId, taskData);
      const updatedTask = response.data || response;
      setTasks((prev) =>
        prev.map((task) => (task._id === taskId ? updatedTask : task))
      );
      return { success: true, data: updatedTask };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to update task',
      };
    }
  };

  // Update task in context without making an API call (for optimistic updates)
  const updateTaskInContext = (updatedTask) => {
    setTasks((prev) =>
      prev.map((task) => {
        const taskId = task._id?.toString() || task._id;
        const updatedTaskId = updatedTask._id?.toString() || updatedTask._id;
        return taskId === updatedTaskId ? updatedTask : task;
      })
    );
  };

  const deleteTask = async (taskId) => {
    try {
      await taskService.deleteTask(taskId);
      setTasks((prev) => prev.filter((task) => task._id !== taskId));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to delete task',
      };
    }
  };

  useEffect(() => {
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  const value = {
    tasks,
    loading,
    filters,
    setFilters,
    fetchTasks,
    createTask,
    updateTask,
    updateTaskInContext,
    deleteTask,
  };

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
};

