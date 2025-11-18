const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a project name'],
    trim: true,
    maxlength: [100, 'Project name cannot be more than 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  color: {
    type: String,
    default: '#1976d2'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
projectSchema.index({ owner: 1 });
projectSchema.index({ 'members.user': 1 });

module.exports = mongoose.model('Project', projectSchema);

