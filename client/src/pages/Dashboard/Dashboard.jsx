import React, { useEffect, useState } from 'react';
import { Grid, Paper, Typography, Box, Card, CardContent, Chip, Button } from '@mui/material';
import {
  Assignment as TaskIcon,
  CheckCircle as DoneIcon,
  Schedule as InProgressIcon,
  Warning as UrgentIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { taskService } from '../../services/taskService';
import { useTasks } from '../../context/TaskContext';
import { useAuth } from '../../hooks/useAuth';
import Loading from '../../components/Common/Loading';
import StatCard from '../../components/Dashboard/StatCard';
import TaskDialog from '../../components/Tasks/TaskDialog';
import { format } from 'date-fns';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const { tasks, fetchTasks } = useTasks();
  const { user } = useAuth();
  
  // Check if user is manager or admin
  const canDownloadReport = user?.role === 'manager' || user?.role === 'admin';
  const canManageTasks = user?.role === 'manager' || user?.role === 'admin';

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await taskService.getTaskStats();
        setStats(response.data || response);
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    // Ensure tasks are loaded
    if (tasks.length === 0) {
      fetchTasks();
    }
  }, [fetchTasks, tasks.length]);

  if (loading) {
    return <Loading />;
  }

  const statusCounts = {
    todo: stats?.byStatus?.find((s) => s._id === 'todo')?.count || 0,
    'in-progress': stats?.byStatus?.find((s) => s._id === 'in-progress')?.count || 0,
    review: stats?.byStatus?.find((s) => s._id === 'review')?.count || 0,
    done: stats?.byStatus?.find((s) => s._id === 'done')?.count || 0,
  };

  const priorityCounts = {
    urgent: stats?.byPriority?.find((s) => s._id === 'urgent')?.count || 0,
    high: stats?.byPriority?.find((s) => s._id === 'high')?.count || 0,
    medium: stats?.byPriority?.find((s) => s._id === 'medium')?.count || 0,
    low: stats?.byPriority?.find((s) => s._id === 'low')?.count || 0,
  };

  // Prepare data for charts with improved colors
  const statusChartData = [
    { name: 'To Do', value: statusCounts.todo, color: '#9e9e9e', fill: '#9e9e9e' },
    { name: 'In Progress', value: statusCounts['in-progress'], color: '#2196f3', fill: '#2196f3' },
    { name: 'Review', value: statusCounts.review, color: '#ff9800', fill: '#ff9800' },
    { name: 'Done', value: statusCounts.done, color: '#4caf50', fill: '#4caf50' },
  ];

  const priorityChartData = [
    { name: 'Low', value: priorityCounts.low, fill: '#81c784' },
    { name: 'Medium', value: priorityCounts.medium, fill: '#64b5f6' },
    { name: 'High', value: priorityCounts.high, fill: '#ffb74d' },
    { name: 'Urgent', value: priorityCounts.urgent, fill: '#e57373' },
  ];

  // Get recent tasks (last 5)
  const recentTasks = tasks
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

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

  const handleDownloadReport = async () => {
    setDownloading(true);
    try {
      await taskService.downloadEmployeeTaskReport();
    } catch (error) {
      console.error('Error downloading report:', error);
      alert('Failed to download report. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleViewTask = async (task) => {
    // Fetch full task details to ensure we have all information (comments, attachments, etc.)
    try {
      const fullTask = await taskService.getTask(task._id);
      setSelectedTask(fullTask.data || fullTask || task);
      setOpenDialog(true);
    } catch (error) {
      console.error('Error fetching task details:', error);
      // Fallback to using task from context if fetch fails
      setSelectedTask(task);
      setOpenDialog(true);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
            Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Welcome back, {user?.name}! Here's your task overview.
          </Typography>
        </Box>
        {canDownloadReport && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadReport}
            disabled={downloading}
            sx={{
              borderRadius: 2,
              px: 3,
              py: 1.5,
              textTransform: 'none',
              fontWeight: 500,
            }}
          >
            {downloading ? 'Downloading...' : 'Download Report'}
          </Button>
        )}
      </Box>
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Tasks"
            value={Object.values(statusCounts).reduce((a, b) => a + b, 0)}
            icon={<TaskIcon />}
            color="#1976d2"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="In Progress"
            value={statusCounts['in-progress']}
            icon={<InProgressIcon />}
            color="#ed6c02"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Completed"
            value={statusCounts.done}
            icon={<DoneIcon />}
            color="#2e7d32"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Urgent"
            value={priorityCounts.urgent}
            icon={<UrgentIcon />}
            color="#d32f2f"
          />
        </Grid>

        {/* Task Distribution Pie Chart */}
        <Grid item xs={12} md={6}>
          <Paper 
            sx={{ 
              p: 3,
              borderRadius: 3,
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              height: '100%',
            }}
          >
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: 'text.primary', mb: 3 }}>
              Task Distribution
            </Typography>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={statusChartData.filter(item => item.value > 0)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent, value }) => 
                    value > 0 ? `${name}: ${(percent * 100).toFixed(0)}%` : ''
                  }
                  outerRadius={100}
                  innerRadius={40}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {statusChartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.fill}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                  formatter={(value, name) => [value, name]}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ paddingTop: '20px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Task Priority Bar Chart */}
        <Grid item xs={12} md={6}>
          <Paper 
            sx={{ 
              p: 3,
              borderRadius: 3,
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              height: '100%',
            }}
          >
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: 'text.primary', mb: 3 }}>
              Tasks by Priority
            </Typography>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart 
                data={priorityChartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="#e0e0e0"
                  vertical={false}
                />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#666', fontSize: 12 }}
                  axisLine={{ stroke: '#e0e0e0' }}
                />
                <YAxis 
                  tick={{ fill: '#666', fontSize: 12 }}
                  axisLine={{ stroke: '#e0e0e0' }}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                  cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
                />
                <Bar 
                  dataKey="value" 
                  radius={[8, 8, 0, 0]}
                >
                  {priorityChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Recent Tasks */}
        <Grid item xs={12}>
          <Paper 
            sx={{ 
              p: 3,
              borderRadius: 3,
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
              border: '1px solid rgba(0, 0, 0, 0.06)',
            }}
          >
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: 'text.primary', mb: 3 }}>
              Recent Tasks
            </Typography>
            {recentTasks.length === 0 ? (
              <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
                No tasks yet. Create your first task!
              </Typography>
            ) : (
              <Box sx={{ mt: 2 }}>
                {recentTasks.map((task) => (
                  <Card
                    key={task._id}
                    sx={{
                      mb: 2,
                      cursor: 'pointer',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      border: '1px solid rgba(0, 0, 0, 0.06)',
                      '&:hover': { 
                        bgcolor: 'action.hover',
                        transform: 'translateY(-4px)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      }
                    }}
                    onClick={() => handleViewTask(task)}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="h6" component="div">
                            {task.title}
                          </Typography>
                          {task.description && (
                            <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                              {task.description.substring(0, 100)}
                              {task.description.length > 100 ? '...' : ''}
                            </Typography>
                          )}
                          <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
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
                            {task.dueDate && (
                              <Typography variant="caption" color="textSecondary" sx={{ alignSelf: 'center' }}>
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
                          </Box>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      <TaskDialog
        open={openDialog}
        onClose={() => {
          setOpenDialog(false);
          setSelectedTask(null);
        }}
        task={selectedTask}
        canEdit={true}
      />
    </Box>
  );
};

export default Dashboard;

