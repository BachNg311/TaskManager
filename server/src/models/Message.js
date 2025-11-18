const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    trim: true,
    maxlength: [5000, 'Message cannot be more than 5000 characters']
  },
  // Store attachments as flexible objects to avoid casting issues
  attachments: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  reactions: [{
    emoji: {
      type: String,
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  mentionedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  mentionAll: {
    type: Boolean,
    default: false
  },
  isSystem: {
    type: Boolean,
    default: false
  },
  forwardedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);

