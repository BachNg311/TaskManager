const Task = require('../models/Task');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { upload, getFileType, deleteFileFromS3, s3, extractS3KeyFromUrl, addSignedUrlToUserAvatar } = require('../utils/s3Upload');

// Store io instance to emit events from controllers
let ioInstance = null;

const setIOInstance = (io) => {
  ioInstance = io;
};

const getIOInstance = () => {
  return ioInstance;
};

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

// Helper function to get all managers and admins
const getAllManagers = async () => {
  const managers = await User.find({
    role: { $in: ['manager', 'admin'] },
    isActive: { $ne: false }
  }).select('_id name email');
  return managers;
};

// Helper to add signed URLs to user avatars in tasks
const processTaskForResponse = (task) => {
  if (!task) return task;
  
  const taskObj = task.toObject ? task.toObject() : task;
  
  // Process assignedTo (can be array or single user)
  if (taskObj.assignedTo) {
    taskObj.assignedTo = addSignedUrlToUserAvatar(taskObj.assignedTo);
  }
  
  // Process createdBy (single user)
  if (taskObj.createdBy) {
    taskObj.createdBy = addSignedUrlToUserAvatar(taskObj.createdBy);
  }
  
  // Process comments.user if exists
  if (taskObj.comments && Array.isArray(taskObj.comments)) {
    taskObj.comments = taskObj.comments.map(comment => {
      if (comment.user) {
        comment.user = addSignedUrlToUserAvatar(comment.user);
      }
      return comment;
    });
  }
  
  return taskObj;
};

const getTodayUTC = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const parseDateOnlyInput = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    }
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

// @desc    Get all tasks
// @route   GET /api/tasks
// @access  Private
const getTasks = async (req, res) => {
  try {
    const {
      status,
      priority,
      assignedTo,
      project,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = { isArchived: false };

    // Filter by user role - members can only see tasks assigned to them
    // Managers and admins can see all tasks
    if (req.user.role === 'member') {
      query.assignedTo = { $in: [req.user._id] };
    }

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (assignedTo) {
      // Members can only filter by themselves for security
      if (req.user.role === 'member') {
        query.assignedTo = { $in: [req.user._id] };
      } else {
        // Managers and admins can filter by any employee
        // Handle both single ID and array of IDs
        if (Array.isArray(assignedTo)) {
          query.assignedTo = { $in: assignedTo };
        } else {
          query.assignedTo = { $in: [assignedTo] };
        }
      }
    }
    if (project) query.project = project;

    // Text search
    if (search) {
      query.$text = { $search: search };
    }

    // Pagination
    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);
    // Only calculate skip if we have a valid limit (for pagination)
    // If limit is 0 or very high, we're fetching all tasks, so skip should be 0
    const skip = (parsedLimit > 0 && parsedLimit < 50000) ? (parsedPage - 1) * parsedLimit : 0;

    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Build query with optional limit (if limit is 0 or very high, don't apply limit)
    let taskQuery = Task.find(query)
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .populate('project', 'name color')
      .sort(sort)
      .skip(skip);
    
    // Only apply limit if it's a reasonable number (not 0 and not extremely high)
    // This allows fetching all tasks when limit is set to 0 or a very high number
    if (parsedLimit > 0 && parsedLimit < 50000) {
      taskQuery = taskQuery.limit(parsedLimit);
    }

    const tasks = await taskQuery;

    const total = await Task.countDocuments(query);

    // Add signed URLs to user avatars in tasks
    const tasksWithSignedAvatars = tasks.map(task => processTaskForResponse(task));

    res.json({
      success: true,
      data: tasksWithSignedAvatars,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single task
// @route   GET /api/tasks/:id
// @access  Private
const getTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .populate('project', 'name color')
      .populate('comments.user', 'name email avatar');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Check access - members can only view tasks assigned to them
    // Managers and admins can view all tasks
    if (req.user.role === 'member') {
      const assignedToArray = Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo] : []);
      const isAssigned = assignedToArray.some(assignee => assignee.toString() === req.user._id.toString());
      if (!isAssigned) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this task'
        });
      }
    }

    // Add signed URLs to user avatars
    const taskWithSignedAvatars = processTaskForResponse(task);

    res.json({
      success: true,
      data: taskWithSignedAvatars
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create task
// @route   POST /api/tasks
// @access  Private (Manager/Admin only)
const createTask = async (req, res) => {
  try {
    if (req.user.role === 'member') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to create tasks.'
      });
    }

    // Validate that assignedTo is required and is an array of employees (members)
    if (!req.body.assignedTo || !Array.isArray(req.body.assignedTo) || req.body.assignedTo.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Task must be assigned to at least one employee'
      });
    }

    // Validate all assigned users
    const assignedUsers = await User.find({ _id: { $in: req.body.assignedTo } });
    if (assignedUsers.length !== req.body.assignedTo.length) {
      return res.status(404).json({
        success: false,
        message: 'One or more assigned users not found'
      });
    }
    
    // Check all users are members
    const nonMembers = assignedUsers.filter(u => u.role !== 'member');
    if (nonMembers.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Tasks can only be assigned to employees (members), not managers or admins'
      });
    }

    // Validate due date is in the future (compare date-only to avoid timezone drift)
    if (req.body.dueDate) {
      const normalizedDueDate = parseDateOnlyInput(req.body.dueDate);
      const todayUTC = getTodayUTC();
      if (!normalizedDueDate || normalizedDueDate <= todayUTC) {
        return res.status(400).json({
          success: false,
          message: 'Due date must be in the future'
        });
      }
    }

    // Parse attachments if they come as a string
    let attachments = [];
    if (req.body.attachments) {
      console.log('Received attachments type:', typeof req.body.attachments);
      console.log('Received attachments value:', req.body.attachments);
      
      if (typeof req.body.attachments === 'string') {
        try {
          // Try to parse as JSON first
          attachments = JSON.parse(req.body.attachments);
        } catch (e) {
          // If JSON parsing fails, try to extract array from string representation
          try {
            // Handle string that looks like: "[\n' + ' {\n' + " url: '...',\n" + ..."
            // This is a malformed string representation, try to extract the actual data
            let cleaned = req.body.attachments;
            
            // Remove string concatenation markers
            cleaned = cleaned.replace(/\n' \+ '/g, '');
            cleaned = cleaned.replace(/\n"/g, '\n"');
            
            // Try to extract objects using regex
            const objectMatches = cleaned.match(/\{[^}]+\}/g);
            if (objectMatches) {
              attachments = objectMatches.map(match => {
                const urlMatch = match.match(/url:\s*['"]([^'"]+)['"]/);
                const nameMatch = match.match(/name:\s*['"]([^'"]+)['"]/);
                const typeMatch = match.match(/type:\s*['"]([^'"]+)['"]/);
                const sizeMatch = match.match(/size:\s*(\d+)/);
                
                return {
                  url: urlMatch ? urlMatch[1] : '',
                  name: nameMatch ? nameMatch[1] : 'Unknown',
                  type: typeMatch ? typeMatch[1] : 'file',
                  size: sizeMatch ? parseInt(sizeMatch[1]) : 0
                };
              });
            } else {
              throw new Error('Could not extract attachment objects from string');
            }
          } catch (e2) {
            console.error('Error parsing attachments:', req.body.attachments);
            console.error('Parse error:', e2);
            return res.status(400).json({
              success: false,
              message: 'Invalid attachments format: ' + e2.message
            });
          }
        }
      } else if (Array.isArray(req.body.attachments)) {
        attachments = req.body.attachments;
      }
      
      // Ensure all attachments have the required structure matching the schema
      attachments = attachments.map(att => {
        if (typeof att === 'string') {
          // If it's just a URL string, convert to object
          return { 
            url: att, 
            name: 'Unknown', 
            type: 'file', 
            size: 0,
            uploadedAt: new Date()
          };
        }
        // Ensure all required fields are present and properly typed
        return {
          url: String(att.url || ''),
          name: String(att.name || 'Unknown'),
          type: String(att.type || 'file'),
          size: Number(att.size || 0),
          uploadedAt: att.uploadedAt ? new Date(att.uploadedAt) : new Date()
        };
      });
      
      console.log('Parsed attachments:', JSON.stringify(attachments, null, 2));
      console.log('Attachments type check:', Array.isArray(attachments));
    }

    // Build task data, ensuring attachments are properly formatted
    const taskData = {
      ...req.body,
      createdBy: req.user._id
    };
    
    // Explicitly set attachments after parsing to avoid any string issues
    taskData.attachments = attachments;

    const task = await Task.create(taskData);

    // Populate fields
    await task.populate('assignedTo', 'name email avatar');
    await task.populate('createdBy', 'name email avatar');
    await task.populate('project', 'name color');

    // Create notifications for all assigned users (except the creator)
    const io = getIOInstance();
    // Extract user IDs from populated user objects
    const assignedUserIds = Array.isArray(task.assignedTo) 
      ? task.assignedTo.map(u => u._id || u)
      : [(task.assignedTo?._id || task.assignedTo)];
    
    for (const assignedUserId of assignedUserIds) {
      if (assignedUserId) {
        // Get the actual ID string (handle both ObjectId and populated user object)
        let assignedUserIdStr;
        if (typeof assignedUserId === 'string') {
          assignedUserIdStr = assignedUserId;
        } else if (assignedUserId._id) {
          assignedUserIdStr = assignedUserId._id.toString();
        } else {
          assignedUserIdStr = assignedUserId.toString();
        }
        
        const currentUserIdStr = req.user._id.toString();
        
        if (assignedUserIdStr !== currentUserIdStr) {
          const notification = await Notification.create({
            user: assignedUserIdStr,
            type: 'task_assigned',
            title: 'New Task Assigned',
            message: `${req.user.name} assigned you a task: ${task.title}`,
            relatedTask: task._id,
            relatedProject: task.project
          });

          // Emit notification via WebSocket - ensure userId is a string
          if (io) {
            console.log(`📢 Emitting notification to user:${assignedUserIdStr}`, {
              notificationId: notification._id,
              type: notification.type,
              title: notification.title
            });
            io.to(`user:${assignedUserIdStr}`).emit('notification:new', {
              _id: notification._id,
              type: notification.type,
              title: notification.title,
              message: notification.message,
              relatedTask: task._id,
              relatedProject: task.project,
              createdAt: notification.createdAt
            });
          }
        }
      }
    }

    // Add signed URLs to user avatars
    const taskWithSignedAvatars = processTaskForResponse(task);

    res.status(201).json({
      success: true,
      data: taskWithSignedAvatars
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update task
// @route   PUT /api/tasks/:id
// @access  Private
const updateTask = async (req, res) => {
  try {
    if (req.user.role === 'member') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update tasks.'
      });
    }

    // Parse attachments - handle string format that looks like: "[\n' + ' {\n' + " url: '...',\n" + ..."
    let attachmentsArray = [];
    
    let attachmentsProvided = false;

    if (req.body.attachments !== undefined) {
      attachmentsProvided = true;
      if (typeof req.body.attachments === 'string') {
        // Try to parse as JSON first
        try {
          attachmentsArray = JSON.parse(req.body.attachments);
        } catch (e) {
          // If JSON parse fails, extract objects from the malformed string
          // Format: "[\n' + ' {\n' + " url: '...',\n" + " name: '...',\n" + ..."
          try {
            const str = req.body.attachments;
            // Remove string concatenation markers
            let cleaned = str.replace(/\\n' \+ '/g, '').replace(/\\n"/g, '\\n"').replace(/\n' \+ '/g, '').replace(/\n"/g, '\n"');
            
            // Extract URL, name, type, size, uploadedAt from the string
            // Pattern: url: '...', name: '...', type: '...', size: ...
            const urlMatches = str.match(/url:\s*['"]([^'"]+)['"]/g) || [];
            const nameMatches = str.match(/name:\s*['"]([^'"]+)['"]/g) || [];
            const typeMatches = str.match(/type:\s*['"]([^'"]+)['"]/g) || [];
            const sizeMatches = str.match(/size:\s*(\d+)/g) || [];
            const uploadedAtMatches = str.match(/uploadedAt:\s*([^\s,}]+)/g) || [];
            
            // Extract values from matches
            const urls = urlMatches.map(m => m.match(/['"]([^'"]+)['"]/)[1]);
            const names = nameMatches.map(m => m.match(/['"]([^'"]+)['"]/)[1]);
            const types = typeMatches.map(m => m.match(/['"]([^'"]+)['"]/)[1]);
            const sizes = sizeMatches.map(m => parseInt(m.match(/(\d+)/)[1]));
            const uploadedAts = uploadedAtMatches.map(m => {
              const dateStr = m.match(/uploadedAt:\s*(.+)/)[1];
              return new Date(dateStr);
            });
            
            // Build array of attachment objects
            const maxLength = Math.max(urls.length, names.length, types.length, sizes.length);
            for (let i = 0; i < maxLength; i++) {
              attachmentsArray.push({
                url: urls[i] || '',
                name: names[i] || 'Unknown',
                type: types[i] || 'file',
                size: sizes[i] || 0,
                uploadedAt: uploadedAts[i] || new Date()
              });
            }
          } catch (e2) {
            console.error('Failed to parse attachments string:', e2);
            attachmentsArray = [];
          }
        }
      } else if (Array.isArray(req.body.attachments)) {
        attachmentsArray = req.body.attachments;
      }
    }
    
    // Remove from req.body IMMEDIATELY so it doesn't interfere
    delete req.body.attachments;
    
    let task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Check access - members can update tasks they created or are assigned to
    if (req.user.role === 'member') {
      const isCreator = task.createdBy.toString() === req.user._id.toString();
      const assignedToArray = Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo] : []);
      const isAssigned = assignedToArray.some(assignee => assignee.toString() === req.user._id.toString());
      
      if (!isCreator && !isAssigned) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this task'
        });
      }
    }

    // Track if assignees changed
    const oldAssignees = Array.isArray(task.assignedTo) 
      ? task.assignedTo.map(a => a.toString()) 
      : (task.assignedTo ? [task.assignedTo.toString()] : []);
    const newAssignees = req.body.assignedTo || [];

    // Validate assignedTo only if it's provided in the update
    if (req.body.assignedTo !== undefined) {
      if (!Array.isArray(req.body.assignedTo) || req.body.assignedTo.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Task must be assigned to at least one employee'
        });
      }

      // Validate all assigned users
      const assignedUsers = await User.find({ _id: { $in: req.body.assignedTo } });
      if (assignedUsers.length !== req.body.assignedTo.length) {
        return res.status(404).json({
          success: false,
          message: 'One or more assigned users not found'
        });
      }
      
      // Check all users are members
      const nonMembers = assignedUsers.filter(u => u.role !== 'member');
      if (nonMembers.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Tasks can only be assigned to employees (members), not managers or admins'
        });
      }
    }

    // Validate due date is in the future (if provided)
    if (req.body.dueDate) {
      const normalizedDueDate = parseDateOnlyInput(req.body.dueDate);
      const todayUTC = getTodayUTC();
      if (!normalizedDueDate || normalizedDueDate <= todayUTC) {
        return res.status(400).json({
          success: false,
          message: 'Due date must be in the future'
        });
      }
    }

    // Get existing attachments before update
    const oldAttachments = task.attachments ? task.attachments.map(att => ({
      url: att.url,
      name: att.name,
      type: att.type,
      size: att.size,
      uploadedAt: att.uploadedAt
    })) : [];

    // Use attachmentsArray if provided, otherwise keep existing task attachments
    let finalAttachments = attachmentsProvided
      ? attachmentsArray
      : oldAttachments;

    // Ensure finalAttachments is definitely an array of objects
    if (!Array.isArray(finalAttachments)) {
      console.error('ERROR: finalAttachments is not an array!', typeof finalAttachments);
      finalAttachments = [];
    }
    
    // Find attachments that were removed (exist in old but not in new)
    const oldAttachmentUrls = oldAttachments.map(att => att.url);
    const newAttachmentUrls = finalAttachments.map(att => att.url);
    const removedAttachmentUrls = oldAttachmentUrls.filter(url => !newAttachmentUrls.includes(url));
    
    // Delete removed attachments from S3
    if (removedAttachmentUrls.length > 0) {
      console.log(`Deleting ${removedAttachmentUrls.length} attachment(s) from S3...`);
      for (const url of removedAttachmentUrls) {
        try {
          await deleteFileFromS3(url);
          console.log(`Successfully deleted attachment from S3: ${url}`);
        } catch (error) {
          console.error(`Error deleting attachment from S3 (${url}):`, error);
          // Continue with other deletions even if one fails
        }
      }
    }

    // Build update data - attachments is already removed from req.body
    const updateData = {
      ...req.body
    };
    
    // Add attachments separately to ensure it's an array of objects
    // Make absolutely sure it's an array
    updateData.attachments = Array.isArray(finalAttachments) ? finalAttachments : [];
    
    // Update the task - simple and direct
    task = await Task.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { 
        new: true, 
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    // Now validate the updated task
    try {
      const validationError = task.validateSync();
      if (validationError) {
        console.error('Post-update validation error:', validationError);
        // Don't fail, just log - the update already succeeded
      }
    } catch (validationError) {
      console.error('Post-update validation error:', validationError);
    }

    // Auto-move to review if all checklist items are completed
    if (task.checklist && task.checklist.length > 0) {
      const allCompleted = task.checklist.every(item => item.completed);
      
      // If all items completed and task is not already in review or done, move to review
      if (allCompleted && task.status !== 'review' && task.status !== 'done') {
        task.status = 'review';
        await task.save();
        console.log(`✅ All checklist items completed. Moving task ${task._id} to review status.`);
      }
      // If not all completed and task is in review (but not done), move back to in-progress
      else if (!allCompleted && task.status === 'review') {
        task.status = 'in-progress';
        await task.save();
        console.log(`⚠️ Checklist incomplete. Moving task ${task._id} back to in-progress.`);
      }
    }

    // Populate after save
    task = await Task.findById(task._id)
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .populate('project', 'name color');

    // Create notifications for newly assigned users (except the creator)
    const io = getIOInstance();
    const newAssigneeIds = newAssignees.map(a => a.toString());
    const newlyAssigned = newAssigneeIds.filter(id => !oldAssignees.includes(id));
    
    for (const newAssigneeId of newlyAssigned) {
      if (newAssigneeId !== req.user._id.toString()) {
        const notification = await Notification.create({
          user: newAssigneeId,
          type: 'task_assigned',
          title: 'Task Assigned',
          message: `${req.user.name} assigned you a task: ${task.title}`,
          relatedTask: task._id,
          relatedProject: task.project
        });

        // Emit notification via WebSocket - ensure userId is a string
        if (io) {
          console.log(`📢 Emitting task assignment notification to user:${newAssigneeId}`);
          io.to(`user:${newAssigneeId}`).emit('notification:new', {
            _id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            relatedTask: task._id,
            relatedProject: task.project,
            createdAt: notification.createdAt
          });
        }
      }
    }

    // Notify existing assignees about task updates (except the updater)
    const currentAssignees = Array.isArray(task.assignedTo) 
      ? task.assignedTo.map(a => {
          if (typeof a === 'string') return a;
          if (a._id) return a._id.toString();
          return a.toString();
        })
      : (task.assignedTo ? [(typeof task.assignedTo === 'string' ? task.assignedTo : (task.assignedTo._id ? task.assignedTo._id.toString() : task.assignedTo.toString()))] : []);
    
    for (const assigneeId of currentAssignees) {
      if (assigneeId !== req.user._id.toString() && !newlyAssigned.includes(assigneeId)) {
        const notification = await Notification.create({
          user: assigneeId,
          type: 'task_updated',
          title: 'Task Updated',
          message: `${req.user.name} updated task: ${task.title}`,
          relatedTask: task._id,
          relatedProject: task.project
        });

        // Emit notification via WebSocket - ensure userId is a string
        if (io) {
          console.log(`📢 Emitting task update notification to user:${assigneeId}`);
          io.to(`user:${assigneeId}`).emit('notification:new', {
            _id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            relatedTask: task._id,
            relatedProject: task.project,
            createdAt: notification.createdAt
          });
        }
      }
    }

    // Add signed URLs to user avatars
    const taskWithSignedAvatars = processTaskForResponse(task);

    res.json({
      success: true,
      data: taskWithSignedAvatars
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete task
// @route   DELETE /api/tasks/:id
// @access  Private
const deleteTask = async (req, res) => {
  try {
    if (req.user.role === 'member') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete tasks.'
      });
    }

    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Check access
    if (req.user.role === 'member' && 
        task.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this task'
      });
    }

    // Delete all attachments from S3 before deleting the task
    if (task.attachments && task.attachments.length > 0) {
      console.log(`Deleting ${task.attachments.length} attachment(s) from S3 for task ${task._id}...`);
      for (const attachment of task.attachments) {
        if (attachment.url) {
          try {
            await deleteFileFromS3(attachment.url);
            console.log(`Successfully deleted attachment from S3: ${attachment.url}`);
          } catch (error) {
            console.error(`Error deleting attachment from S3 (${attachment.url}):`, error);
            // Continue with other deletions even if one fails
          }
        }
      }
    }

    await task.deleteOne();

    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Add comment to task
// @route   POST /api/tasks/:id/comments
// @access  Private
const addComment = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    task.comments.push({
      user: req.user._id,
      text: req.body.text
    });

    await task.save();
    await task.populate('comments.user', 'name email avatar');
    await task.populate('assignedTo', 'name email avatar');
    await task.populate('createdBy', 'name email avatar');

    // Create notifications for all assigned users and creator (except the commenter)
    const io = getIOInstance();
    const assignedUserIds = Array.isArray(task.assignedTo) 
      ? task.assignedTo.map(a => {
          if (typeof a === 'string') return a;
          if (a._id) return a._id.toString();
          return a.toString();
        })
      : (task.assignedTo ? [(typeof task.assignedTo === 'string' ? task.assignedTo : (task.assignedTo._id ? task.assignedTo._id.toString() : task.assignedTo.toString()))] : []);
    
    const creatorId = task.createdBy ? (typeof task.createdBy === 'string' ? task.createdBy : (task.createdBy._id ? task.createdBy._id.toString() : task.createdBy.toString())) : null;
    const allNotifyUsers = [...new Set([...assignedUserIds, creatorId].filter(Boolean))];

    for (const userId of allNotifyUsers) {
      if (userId !== req.user._id.toString()) {
        const userIdStr = userId.toString();
        const notification = await Notification.create({
          user: userIdStr,
          type: 'comment_added',
          title: 'New Comment',
          message: `${req.user.name} commented on task: ${task.title}`,
          relatedTask: task._id,
          relatedProject: task.project
        });

        // Emit notification via WebSocket - ensure userId is a string
        if (io) {
          console.log(`📢 Emitting comment notification to user:${userIdStr}`);
          io.to(`user:${userIdStr}`).emit('notification:new', {
            _id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            relatedTask: task._id,
            relatedProject: task.project,
            createdAt: notification.createdAt
          });
        }
      }
    }

    res.status(201).json({
      success: true,
      data: task.comments[task.comments.length - 1]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update task status
// @route   PATCH /api/tasks/:id/status
// @access  Private
const updateTaskStatus = async (req, res) => {
  try {
    if (req.user.role === 'member') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update tasks.'
      });
    }

    const { status } = req.body;

    if (!['todo', 'in-progress', 'review', 'done'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    let task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Check access - members can update tasks they created or are assigned to
    if (req.user.role === 'member') {
      const isCreator = task.createdBy.toString() === req.user._id.toString();
      const assignedToArray = Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo] : []);
      const isAssigned = assignedToArray.some(assignee => assignee.toString() === req.user._id.toString());
      
      if (!isCreator && !isAssigned) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this task'
        });
      }
    }

    // Special logic for moving from review to done
    if (status === 'done' && task.status === 'review') {
      // Only managers/admins can approve tasks from review to done
      if (req.user.role === 'member') {
        return res.status(403).json({
          success: false,
          message: 'Only managers can approve tasks from review to done'
        });
      }
      
      // Check if all checklist items are completed
      if (task.checklist && task.checklist.length > 0) {
        const allCompleted = task.checklist.every(item => item.completed);
        if (!allCompleted) {
          return res.status(400).json({
            success: false,
            message: 'Cannot mark task as done. All checklist items must be completed first.'
          });
        }
      }
      
      console.log(`✅ Manager ${req.user.name} approved task ${task._id}. Moving to done.`);
    }

    // Prevent moving to done directly if checklist exists and is incomplete
    if (status === 'done' && task.checklist && task.checklist.length > 0) {
      const allCompleted = task.checklist.every(item => item.completed);
      if (!allCompleted) {
        return res.status(400).json({
          success: false,
          message: 'Cannot mark task as done. All checklist items must be completed first.'
        });
      }
    }

    const wasInReview = task.status === 'review';
    task.status = status;
    await task.save();

    task = await Task.findById(task._id)
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .populate('project', 'name color');

    const io = getIOInstance();

    // Send notifications to assigned employees when manager approves task (moves from review to done)
    if (wasInReview && status === 'done') {
      const assignedUserIds = Array.isArray(task.assignedTo) 
        ? task.assignedTo.map(a => {
            if (typeof a === 'string') return a;
            if (a._id) return a._id.toString();
            return a.toString();
          })
        : (task.assignedTo ? [(typeof task.assignedTo === 'string' ? task.assignedTo : (task.assignedTo._id ? task.assignedTo._id.toString() : task.assignedTo.toString()))] : []);
      
      for (const userId of assignedUserIds) {
        const notification = await Notification.create({
          user: userId,
          type: 'task_approved',
          title: 'Task Approved',
          message: `${req.user.name} approved your task: ${task.title}. Task is now complete!`,
          relatedTask: task._id,
          relatedProject: task.project
        });

        // Emit notification via WebSocket
        if (io) {
          io.to(`user:${userId}`).emit('notification:new', {
            _id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            relatedTask: task._id,
            relatedProject: task.project,
            isRead: false,
            createdAt: notification.createdAt
          });
        }
      }
      
      console.log(`📢 Sent approval notifications to ${assignedUserIds.length} employee(s)`);
    }

    // Send notifications when a task is rejected (moved from review back to in-progress)
    if (wasInReview && status === 'in-progress') {
      const assignedUserIds = Array.isArray(task.assignedTo) 
        ? task.assignedTo.map(a => {
            if (typeof a === 'string') return a;
            if (a._id) return a._id.toString();
            return a.toString();
          })
        : (task.assignedTo ? [(typeof task.assignedTo === 'string' ? task.assignedTo : (task.assignedTo._id ? task.assignedTo._id.toString() : task.assignedTo.toString()))] : []);

      for (const userId of assignedUserIds) {
        const notification = await Notification.create({
          user: userId,
          type: 'task_rejected',
          title: 'Task Sent Back for Changes',
          message: `${req.user.name} sent your task back to in-progress: ${task.title}`,
          relatedTask: task._id,
          relatedProject: task.project
        });

        if (io) {
          io.to(`user:${userId}`).emit('notification:new', {
            _id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            relatedTask: task._id,
            relatedProject: task.project,
            isRead: false,
            createdAt: notification.createdAt
          });
        }
      }

      console.log(`📢 Sent rejection notifications to ${assignedUserIds.length} employee(s)`);
    }

    // Add signed URLs to user avatars
    const taskWithSignedAvatars = processTaskForResponse(task);

    res.json({
      success: true,
      data: taskWithSignedAvatars
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update task checklist
// @route   PATCH /api/tasks/:id/checklist
// @access  Private
const updateTaskChecklist = async (req, res) => {
  try {
    const { checklist } = req.body;

    if (!Array.isArray(checklist)) {
      return res.status(400).json({
        success: false,
        message: 'Checklist must be an array'
      });
    }

    let task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Check access - members can update tasks they created or are assigned to
    if (req.user.role === 'member') {
      const isCreator = task.createdBy.toString() === req.user._id.toString();
      const assignedToArray = Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo] : []);
      const isAssigned = assignedToArray.some(assignee => assignee.toString() === req.user._id.toString());
      
      if (!isCreator && !isAssigned) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this task'
        });
      }
    }

    // Update checklist items
    task.checklist = checklist.map(item => ({
      text: item.text,
      completed: item.completed || false,
      completedAt: item.completed ? (item.completedAt || new Date()) : null
    }));

    // Auto-move to review if all checklist items are completed
    let movedToReview = false;
    if (task.checklist.length > 0) {
      const allCompleted = task.checklist.every(item => item.completed);
      
      // If all items completed and task is not already in review or done, move to review
      if (allCompleted && task.status !== 'review' && task.status !== 'done') {
        task.status = 'review';
        movedToReview = true;
        console.log(`✅ All checklist items completed. Moving task ${task._id} to review status.`);
      }
      // If not all completed and task is in review (but not done), move back to in-progress
      else if (!allCompleted && task.status === 'review') {
        task.status = 'in-progress';
        console.log(`⚠️ Checklist incomplete. Moving task ${task._id} back to in-progress.`);
      }
    }

    await task.save();

    task = await Task.findById(task._id)
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .populate('project', 'name color');

    // Send notifications to all managers when task moves to review
    if (movedToReview) {
      const managers = await getAllManagers();
      const io = getIOInstance();
      
      for (const manager of managers) {
        const notification = await Notification.create({
          user: manager._id.toString(),
          type: 'task_pending_review',
          title: 'Task Pending Review',
          message: `${req.user.name} completed all checklist items for task: ${task.title}`,
          relatedTask: task._id,
          relatedProject: task.project
        });

        // Emit notification via WebSocket
        if (io) {
          io.to(`user:${manager._id.toString()}`).emit('notification:new', {
            _id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            relatedTask: task._id,
            relatedProject: task.project,
            isRead: false,
            createdAt: notification.createdAt
          });
        }
      }
      
      console.log(`📢 Sent review notifications to ${managers.length} manager(s)`);
    }

    // Add signed URLs to user avatars
    const taskWithSignedAvatars = processTaskForResponse(task);

    res.json({
      success: true,
      data: taskWithSignedAvatars,
      message: task.status === 'review' ? 'All checklist items completed! Task moved to review.' : 'Checklist updated'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get task statistics
// @route   GET /api/tasks/stats
// @access  Private
const getTaskStats = async (req, res) => {
  try {
    const query = { isArchived: false };

    if (req.user.role === 'member') {
      query.$or = [
        { assignedTo: { $in: [req.user._id] } },
        { createdBy: req.user._id }
      ];
    }

    const stats = await Task.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const priorityStats = await Task.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        byStatus: stats,
        byPriority: priorityStats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Helper function to convert data to CSV
const convertToCSV = (data, headers) => {
  const csvHeaders = headers.join(',');
  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header] || '';
      // Escape commas and quotes in values
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });
  return [csvHeaders, ...csvRows].join('\n');
};

// @desc    Get all users task report
// @route   GET /api/tasks/reports/users
// @access  Private (Admin/Manager only)
const getAllUsersTaskReport = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this report'
      });
    }

    const User = require('../models/User');
    // Only get employees (members) for the report
    const users = await User.find({ isActive: true, role: 'member' }).select('name email role');
    
    const report = await Promise.all(
      users.map(async (user) => {
        const tasks = await Task.find({
          $or: [
            { assignedTo: user._id },
            { createdBy: user._id }
          ],
          isArchived: false
        });

        const stats = {
          total: tasks.length,
          todo: tasks.filter(t => t.status === 'todo').length,
          'in-progress': tasks.filter(t => t.status === 'in-progress').length,
          review: tasks.filter(t => t.status === 'review').length,
          done: tasks.filter(t => t.status === 'done').length
        };

        return {
          'Employee Name': user.name,
          'Email': user.email,
          'Total Tasks': stats.total,
          'To Do': stats.todo,
          'In Progress': stats['in-progress'],
          'Review': stats.review,
          'Done': stats.done
        };
      })
    );

    // Check if CSV format is requested
    if (req.query.format === 'csv') {
      const headers = ['Employee Name', 'Email', 'Total Tasks', 'To Do', 'In Progress', 'Review', 'Done'];
      const csv = convertToCSV(report, headers);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="employee-task-report-${new Date().toISOString().split('T')[0]}.csv"`);
      return res.send(csv);
    }

    // Return JSON format
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get detailed task report
// @route   GET /api/tasks/reports/detailed
// @access  Private (Admin/Manager only)
const getDetailedTaskReport = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this report'
      });
    }

    const query = { isArchived: false };
    const tasks = await Task.find(query)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .populate('project', 'name')
      .sort({ createdAt: -1 });

    const report = tasks.map(task => ({
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      assignedTo: task.assignedTo ? task.assignedTo.name : 'Unassigned',
      createdBy: task.createdBy ? task.createdBy.name : 'Unknown',
      project: task.project ? task.project.name : 'No Project',
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    }));

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Generate a signed URL for downloading an attachment
// @route   GET /api/tasks/attachments/download
// @access  Private
const getAttachmentDownloadUrl = async (req, res) => {
  try {
    const { taskId, url } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'Attachment URL is required'
      });
    }

    const key = extractS3KeyFromUrl(url);
    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'Invalid attachment URL'
      });
    }

    if (taskId) {
      const task = await Task.findById(taskId).select('attachments assignedTo createdBy');
      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Task not found'
        });
      }

      const attachmentExists = (task.attachments || []).some(att => att.url === url);
      if (!attachmentExists) {
        return res.status(404).json({
          success: false,
          message: 'Attachment not found on this task'
        });
      }

      if (req.user.role === 'member') {
        const assignedToArray = Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo] : []);
        const isCreator = task.createdBy?.toString() === req.user._id.toString();
        const isAssigned = assignedToArray.some(assignee => assignee.toString() === req.user._id.toString());
        if (!isCreator && !isAssigned) {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to download this attachment'
          });
        }
      }
    } else if (req.user.role === 'member') {
      const userPrefix = `tasks/${req.user._id}/`;
      if (!key.startsWith(userPrefix)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to download this attachment'
        });
      }
    }

    const signedUrl = await s3.getSignedUrlPromise('getObject', {
      Bucket: BUCKET_NAME,
      Key: key,
      Expires: 60
    });

    return res.json({
      success: true,
      url: signedUrl
    });
  } catch (error) {
    console.error('Error generating attachment download URL:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to generate download link'
    });
  }
};

// @desc    Upload file to S3
// @route   POST /api/tasks/upload
// @access  Private
const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const fileData = {
      url: req.file.location, // S3 file URL
      name: req.file.originalname,
      type: getFileType(req.file.mimetype),
      size: req.file.size
    };

    res.json({
      success: true,
      data: fileData
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload file'
    });
  }
};

module.exports = {
  setIOInstance,
  getTasks,
  getTask,
  createTask,
  updateTask,
  updateTaskStatus,
  updateTaskChecklist,
  deleteTask,
  addComment,
  getTaskStats,
  getAllUsersTaskReport,
  getDetailedTaskReport,
  uploadFile,
  upload, // Export multer upload middleware
  getAttachmentDownloadUrl
};

