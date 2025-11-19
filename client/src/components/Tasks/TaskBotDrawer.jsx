import React, { useEffect, useMemo, useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Divider,
  TextField,
  Button,
  Chip,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
  Send as SendIcon,
  AutoAwesome as AutoAwesomeIcon,
} from '@mui/icons-material';
import { userService } from '../../services/userService';
import { taskService } from '../../services/taskService';
import { useTasks } from '../../context/TaskContext';
import { useAuth } from '../../hooks/useAuth';

const DEFAULT_SUGGESTIONS = [
  'Create a QA checklist for the mobile release',
  'Break down onboarding improvements into tasks',
  'Plan a marketing launch for Q1',
];

const formatDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDefaultDueDateString = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return formatDateInput(date);
};

const getEarliestDueDateString = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return formatDateInput(date);
};

const isFutureDate = (value) => {
  if (!value) return false;
  const candidate = new Date(value);
  if (Number.isNaN(candidate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return candidate > today;
};

const MessageBubble = ({ message }) => {
  const isAssistant = message.role === 'assistant';
  const dateFormatter = (value) => {
    if (!value) return 'No due date';
    try {
      return new Date(value).toLocaleDateString();
    } catch (error) {
      return value;
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isAssistant ? 'flex-start' : 'flex-end',
        mb: 2,
      }}
    >
      <Box
        sx={{
          maxWidth: '90%',
          bgcolor: isAssistant ? 'grey.100' : 'primary.main',
          color: isAssistant ? 'text.primary' : 'primary.contrastText',
          px: 2,
          py: 1.5,
          borderRadius: 3,
          borderBottomLeftRadius: isAssistant ? 0 : 3,
          borderBottomRightRadius: isAssistant ? 3 : 0,
          boxShadow: 1,
        }}
      >
        <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
          {message.text}
        </Typography>
        {Array.isArray(message.tasks) && message.tasks.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, display: 'block' }}>
              {message.tasks.length === 1 ? 'Created task' : 'Created tasks'}
            </Typography>
            {message.tasks.map((task) => (
              <Box
                key={task._id}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 1.5,
                  mb: 1,
                  bgcolor: 'background.paper',
                  color: 'text.primary',
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {task.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {task.description}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Chip size="small" label={`Priority: ${task.priority}`} color="primary" variant="outlined" />
                  <Chip size="small" label={`Due: ${dateFormatter(task.dueDate)}`} variant="outlined" />
                  <Chip size="small" label={`${task.checklist?.length || 0} checklist items`} variant="outlined" />
                </Stack>
              </Box>
            ))}
          </Box>
        )}
        {message.isError && (
          <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
            {message.errorDetails}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

const TaskBotDrawer = ({ open, onClose }) => {
  const { fetchTasks } = useTasks();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [assignedTo, setAssignedTo] = useState([]);
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState(getDefaultDueDateString());
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Hi! I’m TaskBot. Tell me what needs to get done and I’ll create actionable tasks with checklists.',
    },
  ]);
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  const memberOptions = useMemo(
    () =>
      users
        .filter((employee) => employee.role === 'member' && employee.isActive !== false)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [users]
  );

  useEffect(() => {
    const fetchMembers = async () => {
      setLoadingUsers(true);
      try {
        const response = await userService.getUsers();
        setUsers(response.data || response || []);
      } catch (err) {
        console.error('Failed to fetch users for TaskBot:', err);
      } finally {
        setLoadingUsers(false);
      }
    };
    if (open) {
      fetchMembers();
    }
  }, [open]);

useEffect(() => {
  if (!open) return;
  const firstName = user?.name?.split(' ')?.[0] || user?.name || 'there';
  setMessages([
    {
      role: 'assistant',
      text: `Hi ${firstName}! I’m TaskBot. Describe the work you need and I’ll spin up tasks automatically.`,
    },
  ]);
  setPrompt('');
  setError('');
  setAssignedTo([]);
  setPriority('medium');
  setDueDate(getDefaultDueDateString());
  setSuggestions(DEFAULT_SUGGESTIONS);
}, [open, user?.name]);

  const handleSend = async () => {
    if (!prompt.trim()) {
      setError('Please describe what you need TaskBot to create.');
      return;
    }
    if (assignedTo.length === 0) {
      setError('Select at least one employee to assign the tasks to.');
      return;
    }
    if (!dueDate) {
      setError('Please select a preferred due date.');
      return;
    }
    if (!isFutureDate(dueDate)) {
      setError('Preferred due date must be in the future.');
      return;
    }
    setError('');

    const userMessage = {
      role: 'user',
      text: prompt.trim(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setPrompt('');

    setLoading(true);
    try {
      const response = await taskService.generateTasksWithAI({
        prompt: userMessage.text,
        assignedTo,
        fallbackPriority: priority,
        fallbackDueDate: dueDate,
      });

      const data = response.data || response;
      const assistantMessage = {
        role: 'assistant',
        text: data.summary || 'Created the requested tasks successfully.',
        tasks: data.createdTasks || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
      if (Array.isArray(data.followUpQuestions) && data.followUpQuestions.length > 0) {
        setSuggestions(data.followUpQuestions);
      }
      await fetchTasks();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to generate tasks. Please try again.';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: message,
          isError: true,
          errorDetails: message,
        },
      ]);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (text) => {
    setPrompt(text);
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 480 } } }}>
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <AutoAwesomeIcon color="primary" />
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                TaskBot
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Powered by Gemini 2.5 Flash
              </Typography>
            </Box>
          </Stack>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Divider sx={{ mb: 2 }} />

        <Stack spacing={2}>
          <FormControl fullWidth required>
            <InputLabel>Assign to employees</InputLabel>
            <Select
              multiple
              label="Assign to employees"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              input={<OutlinedInput label="Assign to employees" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => {
                    const employee = memberOptions.find((member) => member._id === value || member.id === value);
                    return <Chip key={value} label={employee?.name || employee?.email || value} />;
                  })}
                </Box>
              )}
              disabled={loadingUsers || loading}
            >
              {memberOptions.map((employee) => (
                <MenuItem key={employee._id} value={employee._id}>
                  {employee.name || employee.email}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl fullWidth required>
              <InputLabel>Default priority</InputLabel>
              <Select
                label="Default priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={loading}
              >
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="urgent">Urgent</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              label="Preferred due date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: getEarliestDueDateString() }}
              required
              disabled={loading}
            />
          </Stack>
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ flex: 1, overflowY: 'auto', pr: 1 }}>
          {messages.map((message, index) => (
            <MessageBubble key={`${message.role}-${index}-${message.text.substring(0, 10)}`} message={message} />
          ))}
        </Box>

        {error && (
          <Typography variant="body2" color="error" sx={{ mb: 1 }}>
            {error}
          </Typography>
        )}

        <Stack spacing={1} sx={{ mt: 2 }}>
          <TextField
            placeholder="Ask TaskBot to create tasks..."
            multiline
            minRows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={loading}
          />
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
            onClick={handleSend}
            disabled={loading}
            sx={{ alignSelf: 'flex-end' }}
          >
            {loading ? 'Generating...' : 'Send to TaskBot'}
          </Button>
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            Try one of these prompts:
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {suggestions.map((suggestion) => (
              <Chip
                key={suggestion}
                label={suggestion}
                onClick={() => handleSuggestionClick(suggestion)}
                sx={{ mb: 1 }}
              />
            ))}
          </Stack>
        </Box>
      </Box>
    </Drawer>
  );
};

export default TaskBotDrawer;


