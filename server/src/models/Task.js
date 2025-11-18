const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true },
  name: { type: String, default: 'Unknown', trim: true },
  type: { type: String, default: 'file', trim: true },
  size: { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const normalizeAttachment = (att = {}) => {
  if (typeof att === 'string') {
    // If it's just a URL string, convert it into an object
    return {
      url: att,
      name: 'Unknown',
      type: 'file',
      size: 0,
      uploadedAt: new Date()
    };
  }

  return {
    url: String(att.url || ''),
    name: String(att.name || 'Unknown'),
    type: String(att.type || 'file'),
    size: Number(att.size || 0),
    uploadedAt: att.uploadedAt ? new Date(att.uploadedAt) : new Date()
  };
};

const parseStringifiedAttachments = (raw) => {
  if (!raw) return [];

  // Attempt to parse as JSON first
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeAttachment);
    }
  } catch (err) {
    // Ignore and try regex extraction
  }

  try {
    // Remove concatenation artifacts like "\n' + '"
    const cleaned = raw.replace(/\n' \+ '/g, '').replace(/\\n' \+ '/g, '').replace(/\n"/g, '\n"');
    const objectMatches = cleaned.match(/\{[^}]+\}/g);
    if (objectMatches) {
      return objectMatches.map(match => {
        const getValue = (key, fallback = '') => {
          const regex = new RegExp(`${key}:\\s*['"]?([^'",\\n}]+)['"]?`);
          const found = match.match(regex);
          return found ? found[1] : fallback;
        };

        const url = getValue('url');
        const name = getValue('name', 'Unknown');
        const type = getValue('type', 'file');
        const size = Number(getValue('size', 0));
        const uploadedAtRaw = getValue('uploadedAt', new Date().toISOString());

        return normalizeAttachment({
          url,
          name,
          type,
          size,
          uploadedAt: uploadedAtRaw
        });
      });
    }
  } catch (err) {
    console.error('Attachment parsing failed:', err);
  }

  return [];
};

const normalizeAttachmentsInput = (value) => {
  if (!value) return [];

  let attachments = value;

  if (typeof value === 'string') {
    attachments = parseStringifiedAttachments(value);
  } else if (!Array.isArray(value)) {
    attachments = [value];
  }

  return attachments
    .filter(Boolean)
    .map(normalizeAttachment)
    .filter(att => att.url); // Ensure we only keep attachments with URLs
};

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide a task title'],
    trim: true,
    maxlength: [200, 'Title cannot be more than 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot be more than 2000 characters']
  },
  status: {
    type: String,
    enum: ['todo', 'in-progress', 'review', 'done'],
    default: 'todo'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  dueDate: {
    type: Date
  },
  assignedTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  tags: [{
    type: String,
    trim: true
  }],
  attachments: {
    type: [attachmentSchema],
    default: [],
    set: normalizeAttachmentsInput
  },
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  checklist: [{
    text: {
      type: String,
      required: true,
      trim: true
    },
    completed: {
      type: Boolean,
      default: false
    },
    completedAt: {
      type: Date
    }
  }],
  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for better query performance
taskSchema.index({ assignedTo: 1, status: 1 });
taskSchema.index({ project: 1, status: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ createdAt: -1 });
taskSchema.index({ title: 'text', description: 'text' }); // Text search

module.exports = mongoose.model('Task', taskSchema);

