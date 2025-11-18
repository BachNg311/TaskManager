const express = require('express');
const { getUsers, getUser, updateUser } = require('../controllers/user');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

// All authenticated users can get users list (needed for chat)
router.get('/', getUsers);
router.get('/:id', getUser);
router.put('/:id', updateUser);

module.exports = router;

