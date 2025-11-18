const express = require('express');
const { body } = require('express-validator');
const {
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  addMember
} = require('../controllers/project');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Validation rules
const projectValidation = [
  body('name').trim().notEmpty().withMessage('Project name is required')
];

router.get('/', getProjects);
router.get('/:id', getProject);
// Project creation removed - projects must be created manually in database
router.put('/:id', projectValidation, validate, updateProject);
router.delete('/:id', deleteProject);
router.post('/:id/members', 
  body('userId').notEmpty().withMessage('User ID is required'),
  validate,
  addMember
);

module.exports = router;

