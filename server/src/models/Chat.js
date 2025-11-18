const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['direct', 'group'],
    required: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  name: {
    type: String,
    trim: true,
    maxlength: [100, 'Chat name cannot be more than 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastMessageAt: {
    type: Date
  },
  deletedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  formerParticipants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  messagesVisibleFrom: {
    type: Map,
    of: Date,
    default: {}
  },
  // User-specific nicknames for direct chats (userId -> nickname)
  nicknames: {
    type: Map,
    of: String,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes
chatSchema.index({ participants: 1 });
chatSchema.index({ type: 1, participants: 1 });
chatSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model('Chat', chatSchema);

