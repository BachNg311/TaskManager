import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import {
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  AttachFile as AttachFileIcon,
  AutoAwesome as AutoAwesomeIcon,
} from '@mui/icons-material';
import { useTasks } from '../../context/TaskContext';
import { useAuth } from '../../hooks/useAuth';
import TaskDialog from '../../components/Tasks/TaskDialog';
import TaskBotDrawer from '../../components/Tasks/TaskBotDrawer';
import Loading from '../../components/Common/Loading';
import { userService } from '../../services/userService';
import { format } from 'date-fns';

const Tasks = () => {
  const { tasks, loading, filters, setFilters, deleteTask, fetchTasks } = useTasks();
  const { user } = useAuth();
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [taskBotOpen, setTaskBotOpen] = useState(false);

  const canManageTasks = user?.role === 'manager' || user?.role === 'admin';
  const isMember = user?.role === 'member';

  // Fetch users for employee filter
  React.useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      try {
        const response = await userService.getUsers();
        setUsers(response.data || response || []);
      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, []);

  // Clear filters on mount to show all tasks
  React.useEffect(() => {
    setFilters({ status: '', priority: '', assignedTo: '', project: '', search: '' });
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMenuOpen = (event, taskId) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedTaskId(taskId);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedTaskId(null);
  };

  const handleEdit = (task) => {
    setSelectedTask(task);
    setOpenDialog(true);
    handleMenuClose();
  };

  const handleView = (task) => {
    setSelectedTask(task);
    setOpenDialog(true);
  };

  const handleDelete = async (taskId) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      await deleteTask(taskId);
    }
    handleMenuClose();
  };

  const handleCreate = () => {
    setSelectedTask(null);
    setOpenDialog(true);
  };

  const getPriorityColor = (priority) => {
    const colors = {
      low: 'default',
      medium: 'primary',
      high: 'warning',
      urgent: 'error',
    };
    return colors[priority] || 'default';
  };

  const getStatusColor = (status) => {
    const colors = {
      todo: 'default',
      'in-progress': 'info',
      review: 'warning',
      done: 'success',
    };
    return colors[status] || 'default';
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
            Tasks
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage and track all your tasks
          </Typography>
        </Box>
        {canManageTasks && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleCreate}
              sx={{
                borderRadius: 2,
                px: 3,
                py: 1.5,
                textTransform: 'none',
                fontWeight: 500,
              }}
            >
              New Task
            </Button>
            <Button
              variant="outlined"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => setTaskBotOpen(true)}
              sx={{
                borderRadius: 2,
                px: 3,
                py: 1.5,
                textTransform: 'none',
                fontWeight: 500,
              }}
            >
              TaskBot
            </Button>
          </Box>
        )}
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <TextField
            fullWidth
            label="Search"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Search tasks..."
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              value={filters.status}
              label="Status"
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="todo">To Do</MenuItem>
              <MenuItem value="in-progress">In Progress</MenuItem>
              <MenuItem value="review">Review</MenuItem>
              <MenuItem value="done">Done</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <FormControl fullWidth>
            <InputLabel>Priority</InputLabel>
            <Select
              value={filters.priority}
              label="Priority"
              onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="urgent">Urgent</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        {!isMember && (
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth>
              <InputLabel>Employee</InputLabel>
              <Select
                value={filters.assignedTo}
                label="Employee"
                onChange={(e) => setFilters({ ...filters, assignedTo: e.target.value })}
                disabled={loadingUsers}
              >
                <MenuItem value="">All</MenuItem>
                {users.map((userItem) => (
                  <MenuItem key={userItem._id} value={userItem._id}>
                    {userItem.name || userItem.email}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        )}
      </Grid>

      {loading ? (
        <Loading />
      ) : (
        <Grid container spacing={2}>
          {tasks.length === 0 ? (
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography align="center" color="textSecondary">
                    No tasks found. Create your first task!
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ) : (
            tasks.map((task) => (
              <Grid item xs={12} sm={6} md={4} key={task._id}>
                <Card onClick={() => handleView(task)} sx={{ cursor: 'pointer' }}>
                  <CardActionArea disableRipple>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="h6" component="div">
                        {task.title}
                      </Typography>
                      {canManageTasks && (
                        <IconButton
                          size="small"
                          onClick={(e) => handleMenuOpen(e, task._id)}
                        >
                          <MoreVertIcon />
                        </IconButton>
                      )}
                    </Box>
                    {task.description && (
                      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                        {task.description.substring(0, 100)}
                        {task.description.length > 100 ? '...' : ''}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                      <Chip
                        label={task.status}
                        size="small"
                        color={getStatusColor(task.status)}
                      />
                      <Chip
                        label={task.priority}
                        size="small"
                        color={getPriorityColor(task.priority)}
                      />
                    </Box>
                    {task.dueDate && (
                      <Typography variant="caption" color="textSecondary">
                        Due: {(() => {
                          // Handle date without timezone conversion
                          const date = new Date(task.dueDate);
                          // Use UTC methods to avoid timezone shift
                          const year = date.getUTCFullYear();
                          const month = date.getUTCMonth();
                          const day = date.getUTCDate();
                          const localDate = new Date(year, month, day);
                          return format(localDate, 'MMM dd, yyyy');
                        })()}
                      </Typography>
                    )}
                    {task.assignedTo && (
                      <Typography variant="caption" display="block" color="textSecondary" sx={{ mt: 1 }}>
                        Assigned to: {Array.isArray(task.assignedTo) 
                          ? task.assignedTo.map(a => a.name || a.email || a).join(', ')
                          : (task.assignedTo.name || task.assignedTo.email || task.assignedTo)}
                      </Typography>
                    )}
                    {task.attachments && task.attachments.length > 0 && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                        <AttachFileIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        <Typography variant="caption" color="textSecondary">
                          {task.attachments.length} {task.attachments.length === 1 ? 'attachment' : 'attachments'}
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))
          )}
        </Grid>
      )}

      {canManageTasks && (
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem
            onClick={() => handleEdit(tasks.find((t) => t._id === selectedTaskId))}
          >
            <EditIcon sx={{ mr: 1 }} fontSize="small" />
            Edit
          </MenuItem>
          <MenuItem onClick={() => handleDelete(selectedTaskId)}>
            <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
            Delete
          </MenuItem>
        </Menu>
      )}

      <TaskDialog
        open={openDialog}
        onClose={() => {
          setOpenDialog(false);
          setSelectedTask(null);
        }}
        task={selectedTask}
        canEdit={true}
      />
      <TaskBotDrawer open={taskBotOpen} onClose={() => setTaskBotOpen(false)} />
    </Box>
  );
};

export default Tasks;

