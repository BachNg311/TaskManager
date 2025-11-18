const express = require('express');
const { body } = require('express-validator');
const {
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
  upload,
  getAttachmentDownloadUrl
} = require('../controllers/task');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Validation rules for creating tasks (all fields required)
const createTaskValidation = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('status').isIn(['todo', 'in-progress', 'review', 'done']).withMessage('Status is required and must be one of: todo, in-progress, review, done'),
  body('priority').isIn(['low', 'medium', 'high', 'urgent']).withMessage('Priority is required and must be one of: low, medium, high, urgent'),
  body('dueDate').notEmpty().withMessage('Due Date is required').custom((value) => {
    // Accept both ISO8601 format and YYYY-MM-DD format
    const dateRegex = /^\d{4}-\d{2}-\d{2}/;
    if (!dateRegex.test(value)) {
      throw new Error('Due Date must be a valid date');
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new Error('Due Date must be a valid date');
    }
    return true;
  }),
  body('assignedTo').isArray({ min: 1 }).withMessage('Assigned To Employee is required and must be a non-empty array'),
  body('assignedTo.*').isMongoId().withMessage('Each assigned user must be a valid user ID')
];

// Validation rules for updating tasks (fields optional)
const updateTaskValidation = [
  body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
  body('status').optional().isIn(['todo', 'in-progress', 'review', 'done']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent'])
];

router.get('/stats', getTaskStats);
router.get('/reports/users', authorize('admin', 'manager'), getAllUsersTaskReport);
router.get('/reports/detailed', authorize('admin', 'manager'), getDetailedTaskReport);
router.post('/upload', upload.single('file'), uploadFile); // File upload endpoint
router.get('/attachments/download', getAttachmentDownloadUrl);
router.get('/', getTasks);
router.get('/:id', getTask);
// Only managers and admins can create tasks
router.post('/', authorize('manager', 'admin'), createTaskValidation, validate, createTask);
router.put('/:id', updateTaskValidation, validate, updateTask);
router.patch('/:id/status', 
  body('status').isIn(['todo', 'in-progress', 'review', 'done']).withMessage('Invalid status'),
  validate,
  updateTaskStatus
);
router.patch('/:id/checklist', updateTaskChecklist);
router.delete('/:id', deleteTask);
router.post('/:id/comments', 
  body('text').trim().notEmpty().withMessage('Comment text is required'),
  validate,
  addComment
);

module.exports = router;

