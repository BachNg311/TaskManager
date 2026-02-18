const Project = require('../models/Project');
const Task = require('../models/Task');
const redisModule = require('../config/redis');
const getRedisClient = redisModule.getRedisClient;

// @desc    Get all projects
// @route   GET /api/projects
// @access  Private
const getProjects = async (req, res) => {
  try {
    const query = { isActive: true };

    // Members can only see projects they're part of
    if (req.user.role === 'member') {
      query.$or = [
        { owner: req.user._id },
        { 'members.user': req.user._id }
      ];
    }

    const projects = await Project.find(query)
      .populate('owner', 'name email avatar')
      .populate('members.user', 'name email avatar')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: projects
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single project
// @route   GET /api/projects/:id
// @access  Private
const getProject = async (req, res) => {
  try {
    // Try Redis cache first
    const client = getRedisClient && getRedisClient();
    const cacheKey = `project:${req.params.id}`;
    if (client) {
      try {
        const cached = await client.get(cacheKey);
        if (cached) {
          const cachedProject = JSON.parse(cached);
          return res.json({ success: true, data: cachedProject, cached: true });
        }
      } catch (err) {
        console.error('Redis GET error for', cacheKey, err);
      }
    }

    const project = await Project.findById(req.params.id)
      .populate('owner', 'name email avatar')
      .populate('members.user', 'name email avatar');

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check access
    const isOwner = project.owner._id.toString() === req.user._id.toString();
    const isMember = project.members.some(
      m => m.user._id.toString() === req.user._id.toString()
    );

    if (req.user.role === 'member' && !isOwner && !isMember) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this project'
      });
    }

    // Get project tasks
    const tasks = await Task.find({ project: project._id, isArchived: false })
      .populate('assignedTo', 'name email avatar')
      .sort({ createdAt: -1 });

    const result = { ...project.toObject(), tasks };

    // Cache project (short TTL)
    if (client) {
      try {
        await client.set(cacheKey, JSON.stringify(result), { EX: 300 });
      } catch (err) {
        console.error('Redis SET error for', cacheKey, err);
      }
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Project creation removed - projects must be created manually in database
// const createProject = async (req, res) => { ... }

// @desc    Update project
// @route   PUT /api/projects/:id
// @access  Private
const updateProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check access
    const isOwner = project.owner.toString() === req.user._id.toString();
    const isAdmin = project.members.find(
      m => m.user.toString() === req.user._id.toString() && m.role === 'admin'
    );

    if (req.user.role === 'member' && !isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this project'
      });
    }

    const updatedProject = await Project.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('owner', 'name email avatar')
      .populate('members.user', 'name email avatar');

    // Invalidate project cache
    try {
      const client = getRedisClient && getRedisClient();
      if (client) await client.del(`project:${req.params.id}`);
    } catch (err) {
      console.error('Redis DEL error for project update', req.params.id, err);
    }

    res.json({
      success: true,
      data: updatedProject
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete project
// @route   DELETE /api/projects/:id
// @access  Private
const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Only owner can delete
    if (project.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this project'
      });
    }

    await project.deleteOne();

    // Invalidate project cache
    try {
      const client = getRedisClient && getRedisClient();
      if (client) await client.del(`project:${req.params.id}`);
    } catch (err) {
      console.error('Redis DEL error for project delete', req.params.id, err);
    }

    res.json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Add member to project
// @route   POST /api/projects/:id/members
// @access  Private
const addMember = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Check access
    const isOwner = project.owner.toString() === req.user._id.toString();
    const isAdmin = project.members.find(
      m => m.user.toString() === req.user._id.toString() && m.role === 'admin'
    );

    if (req.user.role === 'member' && !isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add members'
      });
    }

    const { userId, role = 'member' } = req.body;

    // Check if already a member
    const existingMember = project.members.find(
      m => m.user.toString() === userId
    );

    if (existingMember) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of this project'
      });
    }

    project.members.push({ user: userId, role });
    await project.save();

    await project.populate('members.user', 'name email avatar');

    res.json({
      success: true,
      data: project
    });

    // Invalidate project cache (members changed)
    try {
      const client = getRedisClient && getRedisClient();
      if (client) await client.del(`project:${req.params.id}`);
    } catch (err) {
      console.error('Redis DEL error for project addMember', req.params.id, err);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getProjects,
  getProject,
  // createProject removed
  updateProject,
  deleteProject,
  addMember
};

