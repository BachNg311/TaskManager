const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: [true, 'Comment text is required'],
    trim: true,
    maxlength: [1000, 'Comment cannot be more than 1000 characters']
  },
  attachments: [{
    url: String,
    name: String,
    size: Number
  }]
}, {
  timestamps: true
});

// Indexes
commentSchema.index({ task: 1, createdAt: -1 });
commentSchema.index({ user: 1 });

module.exports = mongoose.model('Comment', commentSchema);

