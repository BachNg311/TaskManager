import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Chip,
  OutlinedInput,
  IconButton,
  Typography,
  Alert,
} from '@mui/material';
import { useTasks } from '../../context/TaskContext';
import { userService } from '../../services/userService';
import { taskService } from '../../services/taskService';
import { AttachFile as AttachFileIcon, Delete as DeleteIcon, Image as ImageIcon, InsertDriveFile as FileIcon } from '@mui/icons-material';
import ChecklistInput from './ChecklistInput';
import { useAuth } from '../../hooks/useAuth';

const TaskDialog = ({ open, onClose, task, canEdit = true }) => {
  const { createTask, updateTask, updateTaskInContext } = useTasks();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    dueDate: '',
    assignedTo: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [downloadingIndex, setDownloadingIndex] = useState(null);
  const [checklist, setChecklist] = useState([]);

  // Determine if user is a member who can only edit checklist
  const isMember = user?.role === 'member';
  
  // Helper to extract ID as string for comparison
  // Handles various shapes: string, {_id}, {id}, {userId}, plain ObjectId-like
  const getUserId = (userObj) => {
    if (!userObj) return null;
    // If it's already a string, use it directly
    if (typeof userObj === 'string') return userObj;

    // Common user shapes
    if (userObj._id) return userObj._id.toString();
    if (userObj.id) return userObj.id.toString();
    if (userObj.userId) return userObj.userId.toString();

    // Fallback: try toString (for ObjectId-like values)
    try {
      return userObj.toString();
    } catch (e) {
      return null;
    }
  };
  
  const currentUserId = getUserId(user);
  const isAssignedToTask = task && task.assignedTo && (
    Array.isArray(task.assignedTo) 
      ? task.assignedTo.some(a => getUserId(a) === currentUserId)
      : getUserId(task.assignedTo) === currentUserId
  );
  
  const canOnlyEditChecklist = isMember && task && isAssignedToTask && canEdit;
  const canEditAllFields = canEdit && (!isMember || !task);
  
  // Debug logging
  console.log('🔍 TaskDialog Permissions:', {
    isMember,
    currentUserId,
    taskAssignedTo: task?.assignedTo,
    isAssignedToTask,
    canOnlyEditChecklist,
    canEditAllFields,
    canEdit
  });

  useEffect(() => {
    if (task) {
      // Handle both array and single value for backward compatibility
      let assignedToValue = [];
      if (task.assignedTo) {
        if (Array.isArray(task.assignedTo)) {
          assignedToValue = task.assignedTo.map(a => a._id || a);
        } else {
          assignedToValue = [task.assignedTo._id || task.assignedTo];
        }
      }
      
      setFormData({
        title: task.title || '',
        description: task.description || '',
        status: task.status || 'todo',
        priority: task.priority || 'medium',
        dueDate: task.dueDate ? (() => {
          const date = new Date(task.dueDate);
          const year = date.getUTCFullYear();
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const day = String(date.getUTCDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        })() : '',
        assignedTo: assignedToValue,
      });
      // Set attachments
      setAttachments(task.attachments || []);
      // Set checklist
      setChecklist(task.checklist || []);
    } else {
      setFormData({
        title: '',
        description: '',
        status: 'todo',
        priority: 'medium',
        dueDate: '',
        assignedTo: [],
      });
      setAttachments([]);
      setChecklist([]);
    }
    setError('');
  }, [task, open]);

  // Fetch users when dialog opens
  useEffect(() => {
    if (open && canEdit) {
      const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
          const response = await userService.getUsers();
          const usersData = response.data || response || [];
          // Filter to only show employees (members), exclude managers and admins
          // Also filter out inactive users and sort by name
          setUsers(usersData
            .filter(user => user.role === 'member' && user.isActive !== false)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
          );
        } catch (error) {
          console.error('Error fetching users:', error);
        } finally {
          setLoadingUsers(false);
        }
      };
      fetchUsers();
    }
  }, [open]);

  const buildLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('-').map(Number);
    if (parts.length === 3 && parts.every((val) => !Number.isNaN(val))) {
      const [year, month, day] = parts;
      return new Date(year, month - 1, day);
    }
    const parsed = new Date(dateStr);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const normalizeDate = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  };

  const handleRemoveAssignee = (userId) => {
    if (!canEditAllFields) return;
    setFormData((prev) => ({
      ...prev,
      assignedTo: prev.assignedTo.filter((id) => id !== userId),
    }));
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (!canEditAllFields || files.length === 0) return;

    setUploadingFiles(true);
    setError('');

    try {
      const uploadPromises = files.map(file => taskService.uploadFile(file));
      const uploadedFiles = await Promise.all(uploadPromises);
      
      const newAttachments = uploadedFiles.map(result => result.data);
      setAttachments(prev => [...prev, ...newAttachments]);
    } catch (error) {
      console.error('Error uploading files:', error);
      setError(error.message || 'Failed to upload files');
    } finally {
      setUploadingFiles(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const handleDownloadAttachment = async (attachment, index) => {
    if (!attachment?.url) return;
    try {
      setDownloadingIndex(index);
      const response = await taskService.getAttachmentDownloadUrl(task?._id, attachment.url);
      const downloadUrl = response?.url;
      if (downloadUrl) {
        window.open(downloadUrl, '_blank', 'noopener');
      } else {
        throw new Error('Download URL not available');
      }
    } catch (error) {
      console.error('Error downloading attachment:', error);
      setError(error?.message || error?.response?.data?.message || 'Unable to download attachment');
    } finally {
      setDownloadingIndex(null);
    }
  };

  const handleRemoveAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!canEdit && !canOnlyEditChecklist) {
      onClose();
      return;
    }

    // If member can only edit checklist, update only checklist
    if (canOnlyEditChecklist) {
      setLoading(true);
      setError('');

      try {
        console.log('📋 Sending checklist update:', {
          taskId: task._id,
          checklist,
          checklistLength: checklist.length
        });

        // Call backend checklist endpoint
        const response = await taskService.updateTaskChecklist(task._id, checklist);
        console.log('📋 Checklist update response (raw):', response);

        // At this point Axios only resolves for HTTP 2xx.
        // All real server errors (400/403/404/500) go to the catch block.
        // So ANY resolved response here is treated as success.

        // Normalize structure in case interceptors or backend changed shape
        const taskPayload = response?.data || response?.task || response;
        const message = response?.message || (typeof response === 'string' ? response : null);

        // Update the task in context if we have a task payload
        if (updateTaskInContext && taskPayload && taskPayload._id) {
          console.log('📝 Updating task in context with checklist result');
          updateTaskInContext(taskPayload);
        }

        // Show success message if provided
        if (message && message.includes('review')) {
          alert(message);
        }

        setLoading(false);
        console.log('✅ Checklist update treated as success (no HTTP error)');
        onClose();
      } catch (err) {
        console.error('❌ Checklist update error:', {
          error: err,
          message: err.message,
          response: err.response,
          status: err.response?.status,
          data: err.response?.data
        });
        setLoading(false);

        // Handle specific error codes
        if (err.response?.status === 429) {
          setError('Too many requests. Please wait a moment and try again.');
        } else if (err.response?.status === 403) {
          setError('You do not have permission to update this task.');
        } else if (err.response?.status === 404) {
          setError('Task not found.');
        } else {
          setError(err.response?.data?.message || err.message || 'Failed to update checklist');
        }
      }
      return;
    }

    const today = normalizeDate(new Date());
    const selectedDate = normalizeDate(buildLocalDate(formData.dueDate));

    // Validate all fields when creating a new task
    if (!task) {
      if (!formData.title.trim()) {
        setError('Title is required');
        return;
      }
      if (!formData.description.trim()) {
        setError('Description is required');
        return;
      }
      if (!formData.dueDate) {
        setError('Due Date is required');
        return;
      }
      // Validate due date is in the future
      if (!selectedDate || !today || selectedDate <= today) {
        setError('Due date must be in the future');
        return;
      }
      if (!formData.assignedTo || formData.assignedTo.length === 0) {
        setError('At least one employee must be assigned');
        return;
      }
    } else {
      // When editing, title and assignedTo are required
      if (!formData.title.trim()) {
        setError('Title is required');
        return;
      }
      // Validate due date is in the future (if provided)
      if (formData.dueDate) {
        if (!selectedDate || !today || selectedDate <= today) {
          setError('Due date must be in the future');
          return;
        }
      }
      if (!formData.assignedTo || formData.assignedTo.length === 0) {
        setError('At least one employee must be assigned');
        return;
      }
    }

    setLoading(true);
    setError('');

    // Handle dueDate - ensure it's sent as a proper date string
    // Create date as UTC midnight to avoid timezone conversion issues
    let dueDateValue = undefined;
    if (formData.dueDate) {
      const dateStr = formData.dueDate;
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Create date as UTC midnight to avoid timezone shift
        // This ensures the date stored matches what the user selected
        const [year, month, day] = dateStr.split('-').map(Number);
        // Create date in UTC to avoid timezone conversion
        const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        dueDateValue = utcDate.toISOString();
      } else {
        dueDateValue = formData.dueDate;
      }
    }

    // Ensure attachments is a proper array with correct structure
    const formattedAttachments = Array.isArray(attachments) 
      ? attachments.map(att => ({
          url: att.url || att,
          name: att.name || 'Unknown',
          type: att.type || 'file',
          size: att.size || 0
        }))
      : [];

    // Create task data object, ensuring attachments is properly formatted
    const taskData = {
      title: formData.title,
      description: formData.description,
      status: formData.status,
      priority: formData.priority,
      dueDate: dueDateValue,
      assignedTo: Array.isArray(formData.assignedTo) ? formData.assignedTo : (formData.assignedTo ? [formData.assignedTo] : []),
      attachments: formattedAttachments, // Explicitly set as array
      checklist: checklist, // Add checklist
    };
    
    // Remove undefined values
    Object.keys(taskData).forEach(key => {
      if (taskData[key] === undefined) {
        delete taskData[key];
      }
    });

    // Debug: Log what we're sending
    console.log('=== FRONTEND: Sending task data ===');
    console.log('attachments type:', typeof taskData.attachments);
    console.log('attachments is array:', Array.isArray(taskData.attachments));
    console.log('attachments value:', JSON.stringify(taskData.attachments, null, 2));

    const result = task
      ? await updateTask(task._id, taskData)
      : await createTask(taskData);

    setLoading(false);

    if (result.success) {
      // Show success message if task moved to review
      if (result.message && result.message.includes('review')) {
        alert(result.message);
      }
      onClose();
    } else {
      setError(result.message || 'Failed to save task');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {task ? (canEditAllFields ? 'Edit Task' : (canOnlyEditChecklist ? 'Update Task Checklist' : 'Task Details')) : 'Create New Task'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {error && (
            <Box sx={{ color: 'error.main', fontSize: '0.875rem' }}>{error}</Box>
          )}
          {canOnlyEditChecklist && (
            <Box sx={{ 
              p: 1.5, 
              bgcolor: 'info.light', 
              borderRadius: 1,
              mb: 1
            }}>
              <Typography variant="body2" sx={{ color: 'info.dark' }}>
                ℹ️ You can only update the checklist items for this task. Complete all items to move the task to review for manager approval.
              </Typography>
            </Box>
          )}
          <TextField
            label="Title"
            required
            fullWidth
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            disabled={!canEditAllFields}
            InputProps={{ readOnly: !canEditAllFields }}
          />
          <TextField
            label="Description"
            multiline
            rows={4}
            fullWidth
            required={!task}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            disabled={!canEditAllFields}
            InputProps={{ readOnly: !canEditAllFields }}
          />
          <FormControl fullWidth required={!task}>
            <InputLabel>Status</InputLabel>
            <Select
              value={formData.status}
              label="Status"
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              disabled={!canEditAllFields}
            >
              <MenuItem value="todo">To Do</MenuItem>
              <MenuItem value="in-progress">In Progress</MenuItem>
              <MenuItem value="review">Review</MenuItem>
              <MenuItem value="done">Done</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth required={!task}>
            <InputLabel>Priority</InputLabel>
            <Select
              value={formData.priority}
              label="Priority"
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              disabled={!canEditAllFields}
            >
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="urgent">Urgent</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Due Date"
            type="date"
            fullWidth
            required={!task}
            InputLabelProps={{ shrink: true }}
            inputProps={{
              min: (() => {
                // Set minimum date to tomorrow (since today is not allowed)
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                return tomorrow.toISOString().split('T')[0];
              })()
            }}
            value={formData.dueDate}
            onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
            disabled={!canEditAllFields}
            InputProps={{ readOnly: !canEditAllFields }}
          />
          {canEditAllFields ? (
            <FormControl fullWidth required>
              <InputLabel>Assigned To Employees</InputLabel>
            <Select
                multiple
                value={formData.assignedTo}
                label="Assigned To Employees"
                onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
              disabled={!canEditAllFields || loadingUsers}
                input={<OutlinedInput label="Assigned To Employees" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => {
                      const user = users.find(u => u._id === value);
                      return (
                        <Chip
                          key={value}
                          label={user ? user.name : value}
                          size="small"
                        onDelete={canEditAllFields ? () => handleRemoveAssignee(value) : undefined}
                        />
                      );
                    })}
                  </Box>
                )}
              >
                {users.map((user) => (
                  <MenuItem key={user._id} value={user._id}>
                    {user.name} {user.email ? `(${user.email})` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Assigned To
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {Array.isArray(task?.assignedTo) && task.assignedTo.length > 0
                  ? task.assignedTo.map(a => a.name || a.email || '').filter(Boolean).join(', ')
                  : 'Not assigned'}
              </Typography>
            </Box>
          )}
          
          {/* File Upload Section */}
          <Box>
            <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
              Attachments
            </Typography>
            {canEditAllFields && (
              <>
                <input
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                  style={{ display: 'none' }}
                  id="file-upload"
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  disabled={uploadingFiles}
                />
                <label htmlFor="file-upload">
                  <Button
                    variant="outlined"
                    component="span"
                    startIcon={<AttachFileIcon />}
                    disabled={uploadingFiles}
                    sx={{ mb: 1 }}
                  >
                    {uploadingFiles ? 'Uploading...' : 'Add Files'}
                  </Button>
                </label>
              </>
            )}
            
            {/* Display uploaded files */}
            {attachments.length > 0 && (
              <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {attachments.map((attachment, index) => (
                  <Box
                    key={index}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: 1,
                      bgcolor: '#f5f5f5',
                      borderRadius: 1,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                      {attachment.type === 'image' ? (
                        <ImageIcon color="primary" />
                      ) : (
                        <FileIcon color="action" />
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" noWrap>
                          {attachment.name}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {attachment.size ? `${(attachment.size / 1024).toFixed(2)} KB` : ''}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {attachment.url && (
                        <Button
                          size="small"
                          onClick={() => handleDownloadAttachment(attachment, index)}
                          disabled={downloadingIndex === index}
                        >
                          {downloadingIndex === index ? 'Downloading...' : 'Download'}
                        </Button>
                      )}
                      {canEditAllFields && (
                        <IconButton
                          size="small"
                          onClick={() => handleRemoveAttachment(index)}
                          sx={{ ml: 1 }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          {/* Checklist Section */}
          <Box sx={{ mt: 3 }}>
            <ChecklistInput
              checklist={checklist}
              onChange={setChecklist}
              disabled={!canEditAllFields && !canOnlyEditChecklist}
              canToggleItems={canEditAllFields || canOnlyEditChecklist}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          {canEditAllFields || canOnlyEditChecklist ? 'Cancel' : 'Close'}
        </Button>
        {(canEditAllFields || canOnlyEditChecklist) && (
          <Button onClick={handleSubmit} variant="contained" disabled={loading}>
            {loading ? 'Saving...' : (canOnlyEditChecklist ? 'Update Checklist' : (task ? 'Update' : 'Create'))}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default TaskDialog;

