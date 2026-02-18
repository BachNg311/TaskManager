import React, { useEffect, useState, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Box, Paper, Typography, Card, CardContent, Chip } from '@mui/material';
import { Person as PersonIcon, AttachFile as AttachFileIcon, CheckCircle as CheckCircleIcon } from '@mui/icons-material';
import { useTasks } from '../../context/TaskContext';
import { taskService } from '../../services/taskService';
import Loading from '../../components/Common/Loading';
import { format } from 'date-fns';

const columns = [
  { id: 'todo', title: 'To Do', color: '#9e9e9e' },
  { id: 'in-progress', title: 'In Progress', color: '#2196f3' },
  { id: 'review', title: 'Review', color: '#ff9800' },
  { id: 'done', title: 'Done', color: '#4caf50' },
];

const KanbanBoard = () => {
  const { tasks, loading, setFilters, fetchTasks, updateTaskInContext } = useTasks();
  const [, setIsDragging] = useState(false);
  const [localTasks, setLocalTasks] = useState([]);
  const [pendingUpdates, setPendingUpdates] = useState(new Set());
  const pendingUpdatesRef = useRef(new Set());
  const tasksRef = useRef(tasks);
  // Track expected status for pending tasks
  const expectedStatusRef = useRef(new Map());

  useEffect(() => {
    // Clear filters for task board view to show all tasks
    setFilters({ status: '', priority: '', assignedTo: '', project: '', search: '' });
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep tasks ref in sync
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Initial sync - only when tasks first load
  useEffect(() => {
    if (tasks.length > 0 && localTasks.length === 0) {
      setLocalTasks(tasks);
    }
  }, [tasks, localTasks.length]);

  // Keep ref in sync
  useEffect(() => {
    pendingUpdatesRef.current = pendingUpdates;
  }, [pendingUpdates]);

  // Sync local tasks with context tasks, but preserve optimistic updates
  useEffect(() => {
    // COMPLETELY skip sync if we have any pending updates
    // This prevents context from overwriting our optimistic updates
    if (pendingUpdatesRef.current.size > 0) {
      return;
    }
    
    // Only sync when there are no pending updates
    if (tasks.length > 0) {
      setLocalTasks((prevLocal) => {
        // If localTasks is empty, sync
        if (prevLocal.length === 0) {
          return tasks;
        }
        
        // Simple sync - no pending updates, so safe to sync
        return tasks;
      });
    }
  }, [tasks]);

  const getTasksByStatus = (status) => {
    return localTasks.filter((task) => task.status === status);
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = async (result) => {
    setIsDragging(false);
    const { destination, source, draggableId } = result;

    // If dropped outside a droppable area, do nothing
    if (!destination) {
      return;
    }

    // If dropped in the same position, do nothing
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    // Find the task being moved
    const task = localTasks.find((t) => {
      const taskId = t._id?.toString() || t._id;
      return taskId === draggableId;
    });

    if (!task) {
      console.error('Task not found:', draggableId);
      return;
    }

    // If status hasn't changed, do nothing
    if (task.status === destination.droppableId) {
      return;
    }

    // Optimistically update the UI immediately
    const taskIdStr = task._id.toString();
    const updatedTask = { ...task, status: destination.droppableId };
    
    // Mark this task as having a pending update and track expected status
    setPendingUpdates((prev) => {
      const next = new Set(prev);
      next.add(taskIdStr);
      pendingUpdatesRef.current = next;
      expectedStatusRef.current.set(taskIdStr, destination.droppableId);
      return next;
    });
    
    // Update local state immediately - this will persist because pendingUpdates prevents sync
    setLocalTasks((prev) => {
      const updated = prev.map((t) => {
        const tId = t._id?.toString() || t._id;
        if (tId === taskIdStr) {
          return updatedTask;
        }
        return t;
      });
      return updated;
    });

    // Update in the backend directly using the dedicated status endpoint
    try {
      const response = await taskService.updateTaskStatus(task._id, destination.droppableId);
      // API interceptor returns response.data, and server returns { success: true, data: task }
      // taskService returns response.data || response
      // So response is either { success: true, data: task } or just task
      console.log('📥 Raw response from updateTaskStatus:', response);
      const updatedTaskFromServer = response?.data || response;
      console.log('📦 Extracted task from response:', updatedTaskFromServer);
      
      // Verify the server response has the correct status
      if (updatedTaskFromServer && updatedTaskFromServer.status === destination.droppableId) {
        console.log('✅ Task status updated successfully:', {
          taskId: taskIdStr,
          oldStatus: task.status,
          newStatus: updatedTaskFromServer.status,
          task: updatedTaskFromServer
        });
        
        // Update local state with server response - this ensures we have the latest data
        setLocalTasks((prev) =>
          prev.map((t) => {
            const tId = t._id?.toString() || t._id;
            if (tId === taskIdStr) {
              return updatedTaskFromServer;
            }
            return t;
          })
        );
        
        // IMPORTANT: Update the context immediately with the server response
        // This ensures when user navigates away and comes back, the context has the correct state
        // We update the context directly without making another API call since we already have the updated task
        updateTaskInContext(updatedTaskFromServer);
        console.log('✅ Context updated with server response');
        
        // Remove from pending updates immediately since we've updated both local and context
        setPendingUpdates((prev) => {
          const next = new Set(prev);
          next.delete(taskIdStr);
          pendingUpdatesRef.current = next;
          expectedStatusRef.current.delete(taskIdStr);
          return next;
        });
      } else {
        console.error('Server response status mismatch:', {
          expected: destination.droppableId,
          received: updatedTaskFromServer?.status,
          fullResponse: updatedTaskFromServer
        });
        throw new Error('Server response status does not match expected status');
      }
    } catch (error) {
      console.error('Error updating task:', error);
      console.error('Error details:', {
        taskId: task._id,
        taskTitle: task.title,
        fromStatus: task.status,
        toStatus: destination.droppableId,
        errorMessage: error.message,
        errorResponse: error.response?.data
      });
      
      // Revert optimistic update on error
      setLocalTasks((prev) =>
        prev.map((t) => {
          const tId = t._id?.toString() || t._id;
          if (tId === taskIdStr) {
            return task;
          }
          return t;
        })
      );
      
        // Remove from pending updates and clear expected status
        setPendingUpdates((prev) => {
          const next = new Set(prev);
          next.delete(taskIdStr);
          pendingUpdatesRef.current = next;
          expectedStatusRef.current.delete(taskIdStr);
          return next;
        });
    }
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

  if (loading) {
    return <Loading />;
  }

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }}>
          Task Board
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Drag and drop tasks to update their status
        </Typography>
      </Box>
      <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2, px: 1 }}>
          {columns.map((column) => (
            <Box
              key={column.id}
              sx={{
                flex: 1,
                minWidth: 280,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 2.5,
                  pb: 2,
                  borderBottom: '2px solid',
                  borderColor: `${column.color}20`,
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    color: column.color,
                    fontWeight: 700,
                    fontSize: '1rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {column.title}
                </Typography>
                <Chip
                  label={getTasksByStatus(column.id).length}
                  size="small"
                  sx={{
                    bgcolor: `${column.color}15`,
                    color: column.color,
                    fontWeight: 600,
                    minWidth: 32,
                  }}
                />
              </Box>
              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <Box
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    sx={{
                      flex: 1,
                      minHeight: 500,
                      bgcolor: snapshot.isDraggingOver ? `${column.color}08` : 'background.paper',
                      borderRadius: 3,
                      p: 2,
                      border: snapshot.isDraggingOver ? '2px dashed' : '2px solid',
                      borderColor: snapshot.isDraggingOver ? column.color : 'rgba(0, 0, 0, 0.06)',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: snapshot.isDraggingOver ? `0 4px 20px ${column.color}30` : '0 2px 8px rgba(0,0,0,0.04)',
                    }}
                  >
                    {getTasksByStatus(column.id).map((task, index) => (
                      <Draggable
                        key={task._id}
                        draggableId={String(task._id)}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <Card
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            sx={{
                              mb: 2,
                              cursor: snapshot.isDragging ? 'grabbing' : 'grab',
                              opacity: snapshot.isDragging ? 0.8 : 1,
                              transform: snapshot.isDragging ? 'rotate(2deg) scale(1.02)' : 'none',
                              boxShadow: snapshot.isDragging 
                                ? '0 12px 32px rgba(0,0,0,0.25)' 
                                : '0 2px 8px rgba(0,0,0,0.08)',
                              transition: snapshot.isDragging ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                              userSelect: 'none',
                              touchAction: 'none',
                              WebkitUserSelect: 'none',
                              border: '1px solid rgba(0, 0, 0, 0.06)',
                              borderRadius: 2,
                              '&:hover': {
                                boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
                                transform: 'translateY(-2px)',
                              },
                              '& *': {
                                pointerEvents: snapshot.isDragging ? 'none' : 'auto',
                              },
                            }}
                            style={provided.draggableProps.style}
                          >
                            <CardContent>
                              <Typography variant="h6" gutterBottom>
                                {task.title}
                              </Typography>
                              {task.description && (
                                <Typography
                                  variant="body2"
                                  color="textSecondary"
                                  sx={{ mb: 1 }}
                                >
                                  {task.description.substring(0, 100)}
                                  {task.description.length > 100 ? '...' : ''}
                                </Typography>
                              )}
                              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
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
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                                  <PersonIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                  <Typography
                                    variant="caption"
                                    color="textSecondary"
                                  >
                                    {Array.isArray(task.assignedTo) 
                                      ? task.assignedTo.map(a => a.name || a.email || a).join(', ')
                                      : (task.assignedTo.name || task.assignedTo.email || task.assignedTo)}
                                  </Typography>
                                </Box>
                              )}
                              {task.attachments && task.attachments.length > 0 && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                  <AttachFileIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                                  <Typography variant="caption" color="textSecondary">
                                    {task.attachments.length} {task.attachments.length === 1 ? 'file' : 'files'}
                                  </Typography>
                                </Box>
                              )}
                              {task.checklist && task.checklist.length > 0 && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                  <CheckCircleIcon sx={{ fontSize: 14, color: task.checklist.filter(item => item.completed).length === task.checklist.length ? 'success.main' : 'text.secondary' }} />
                                  <Typography variant="caption" color="textSecondary">
                                    {task.checklist.filter(item => item.completed).length}/{task.checklist.length} completed
                                  </Typography>
                                </Box>
                              )}
                              {/* Show "Pending Review" badge for tasks in review status */}
                              {task.status === 'review' && (
                                <Box sx={{ mt: 1 }}>
                                  <Chip
                                    label="⏳ Pending Manager Approval"
                                    size="small"
                                    sx={{
                                      bgcolor: 'warning.light',
                                      color: 'warning.dark',
                                      fontWeight: 600,
                                      fontSize: '0.7rem'
                                    }}
                                  />
                                </Box>
                              )}
                            </CardContent>
                          </Card>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </Box>
                )}
              </Droppable>
            </Box>
          ))}
        </Box>
      </DragDropContext>
    </Box>
  );
};

export default KanbanBoard;

