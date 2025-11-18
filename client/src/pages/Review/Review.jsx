import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  Grid,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Person as PersonIcon,
  CalendarToday as CalendarIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { taskService } from '../../services/taskService';
import { useAuth } from '../../context/AuthContext';
import TaskDialog from '../../components/Tasks/TaskDialog';

const Review = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [approving, setApproving] = useState(null);

  useEffect(() => {
    fetchReviewTasks();
  }, []);

  const fetchReviewTasks = async () => {
    try {
      setLoading(true);
      // Fetch all tasks with status=review, high limit to bypass pagination
      const response = await taskService.getTasks(
        { status: 'review' },
        { limit: 50000 }
      );
      // taskService.getTasks returns backend payload: { success, data, pagination }
      const reviewTasks = response.data || response || [];
      setTasks(reviewTasks);
    } catch (error) {
      console.error('Error fetching review tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (taskId) => {
    try {
      setApproving(taskId);
      await taskService.updateTaskStatus(taskId, 'done');
      // Remove from list
      setTasks(prev => prev.filter(t => t._id !== taskId));
      alert('Task approved successfully!');
    } catch (error) {
      console.error('Error approving task:', error);
      alert(error.response?.data?.message || 'Failed to approve task');
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (taskId) => {
    try {
      setApproving(taskId);
      await taskService.updateTaskStatus(taskId, 'in-progress');
      // Remove from list
      setTasks(prev => prev.filter(t => t._id !== taskId));
      alert('Task sent back to in-progress');
    } catch (error) {
      console.error('Error rejecting task:', error);
      alert(error.response?.data?.message || 'Failed to reject task');
    } finally {
      setApproving(null);
    }
  };

  const handleViewTask = (task) => {
    setSelectedTask(task);
    setDialogOpen(true);
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'error';
      case 'high':
        return 'warning';
      case 'medium':
        return 'info';
      case 'low':
        return 'success';
      default:
        return 'default';
    }
  };

  if (user?.role === 'member') {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          You don't have permission to access this page. Only managers can review tasks.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 600 }}>
          Tasks Pending Review
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Review and approve tasks that have all checklist items completed
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : tasks.length === 0 ? (
        <Alert severity="info">
          No tasks pending review at the moment. Great job team! 🎉
        </Alert>
      ) : (
        <Grid container spacing={3}>
          {tasks.map((task) => {
            const completedItems = task.checklist?.filter(item => item.completed).length || 0;
            const totalItems = task.checklist?.length || 0;
            const allCompleted = totalItems > 0 && completedItems === totalItems;

            return (
              <Grid item xs={12} md={6} lg={4} key={task._id}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    border: '2px solid',
                    borderColor: allCompleted ? 'success.light' : 'warning.light',
                    '&:hover': {
                      boxShadow: 6,
                      transform: 'translateY(-4px)',
                      transition: 'all 0.3s',
                    },
                  }}
                >
                  <CardContent sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                      <Chip
                        label={task.priority}
                        size="small"
                        color={getPriorityColor(task.priority)}
                      />
                      {allCompleted && (
                        <Chip
                          label="✓ Ready"
                          size="small"
                          color="success"
                          sx={{ fontWeight: 600 }}
                        />
                      )}
                    </Box>

                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                      {task.title}
                    </Typography>

                    {task.description && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 2 }}
                      >
                        {task.description.substring(0, 100)}
                        {task.description.length > 100 ? '...' : ''}
                      </Typography>
                    )}

                    {task.dueDate && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                        <CalendarIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">
                          Due: {format(new Date(task.dueDate), 'MMM dd, yyyy')}
                        </Typography>
                      </Box>
                    )}

                    {task.assignedTo && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                        <PersonIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">
                          {Array.isArray(task.assignedTo)
                            ? task.assignedTo.map(a => a.name || a.email || a).join(', ')
                            : (task.assignedTo.name || task.assignedTo.email || task.assignedTo)}
                        </Typography>
                      </Box>
                    )}

                    {totalItems > 0 && (
                      <Box
                        sx={{
                          mt: 2,
                          p: 1.5,
                          bgcolor: allCompleted ? 'success.light' : 'warning.light',
                          borderRadius: 1,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            color: allCompleted ? 'success.dark' : 'warning.dark',
                          }}
                        >
                          Checklist: {completedItems}/{totalItems} completed
                        </Typography>
                      </Box>
                    )}
                  </CardContent>

                  <CardActions sx={{ p: 2, pt: 0, gap: 1 }}>
                    <Button
                      size="small"
                      onClick={() => handleViewTask(task)}
                      sx={{ flex: 1 }}
                    >
                      View Details
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<CancelIcon />}
                      onClick={() => handleReject(task._id)}
                      disabled={approving === task._id}
                      sx={{ flex: 1 }}
                    >
                      {approving === task._id ? 'Processing...' : 'Reject'}
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={<CheckCircleIcon />}
                      onClick={() => handleApprove(task._id)}
                      disabled={approving === task._id || !allCompleted}
                      sx={{ flex: 1 }}
                    >
                      {approving === task._id ? 'Approving...' : 'Approve'}
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Task Dialog */}
      {selectedTask && (
        <TaskDialog
          open={dialogOpen}
          onClose={() => {
            setDialogOpen(false);
            setSelectedTask(null);
            fetchReviewTasks(); // Refresh list after dialog closes
          }}
          task={selectedTask}
          canEdit={false} // View only
        />
      )}
    </Box>
  );
};

export default Review;

