const { GoogleGenerativeAI } = require('@google/generative-ai');
const Task = require('../models/Task');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const { addSignedUrlToUserAvatar } = require('../utils/s3Upload');

const SUPPORTED_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const MAX_TASKS_PER_CALL = 3;
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const DEFAULT_SUMMARY_LIMIT = 60;
const MAX_SUMMARY_MESSAGES = 150;
const MAX_TRANSCRIPT_CHARS = 15000;

let ioInstance = null;

const setIOInstance = (io) => {
  ioInstance = io;
};

const getGeminiModel = (generationOverrides = {}) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({
    model: DEFAULT_MODEL,
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 2048,
      ...generationOverrides,
    },
  });
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

const ensureFutureDate = (date) => {
  if (!date) return null;
  const today = getTodayUTC();
  if (date <= today) {
    return null;
  }
  return date;
};

const getDefaultDueDate = () => {
  const base = getTodayUTC();
  base.setUTCDate(base.getUTCDate() + 7);
  return base;
};

const sanitizeModelJson = (text = '') => {
  return text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
};

const parseModelResponse = (rawText) => {
  if (!rawText) {
    throw new Error('Model returned an empty response.');
  }
  const cleaned = sanitizeModelJson(rawText);
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('Failed to parse Gemini response as JSON:', cleaned);
    throw new Error('Unable to parse Gemini response. Please try again.');
  }
};

const buildChecklistItems = (items = [], title = 'Task') => {
  if (!Array.isArray(items) || items.length === 0) {
    return [
      { text: `Plan ${title}`, completed: false },
      { text: `Execute ${title}`, completed: false },
      { text: `Review ${title}`, completed: false },
    ];
  }

  return items
    .map((item, index) => {
      if (typeof item === 'string') {
        const text = item.trim();
        return text ? { text, completed: false } : null;
      }
      if (item && typeof item === 'object') {
        const text = String(item.text || `Step ${index + 1}`).trim();
        return text ? { text, completed: false } : null;
      }
      return null;
    })
    .filter(Boolean);
};

const formatTaskForClient = (task) => {
  if (!task) return task;
  const taskObj = task.toObject ? task.toObject() : task;

  if (taskObj.assignedTo) {
    taskObj.assignedTo = addSignedUrlToUserAvatar(taskObj.assignedTo);
  }

  if (taskObj.createdBy) {
    taskObj.createdBy = addSignedUrlToUserAvatar(taskObj.createdBy);
  }

  return taskObj;
};

const notifyAssignees = async (task, creator) => {
  const assignedUsers = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo];
  const creatorId = creator?._id?.toString();

  for (const assignedUser of assignedUsers) {
    if (!assignedUser) continue;
    const assignedUserId = assignedUser._id ? assignedUser._id.toString() : assignedUser.toString();

    if (creatorId && assignedUserId === creatorId) {
      continue;
    }

    const notification = await Notification.create({
      user: assignedUserId,
      type: 'task_assigned',
      title: 'AI Task Bot assigned you a task',
      message: `${creator?.name || 'A manager'} created a new task via TaskBot: ${task.title}`,
      relatedTask: task._id,
      relatedProject: task.project,
    });

    if (ioInstance) {
      ioInstance.to(`user:${assignedUserId}`).emit('notification:new', {
        _id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        relatedTask: notification.relatedTask,
        relatedProject: notification.relatedProject,
        isRead: false,
        createdAt: notification.createdAt,
      });

      ioInstance.to(`user:${assignedUserId}`).emit('task:created', formatTaskForClient(task));
    }
  }
};

const buildInstructionPrompt = ({
  prompt,
  priorityPreference,
  dueDatePreference,
  teamSummary,
}) => {
  return `You are TaskBot, an expert project assistant that converts natural language requests into well-scoped tasks for a software team.

Respond ONLY with valid JSON matching this schema:
{
  "summary": "short natural language summary of what you created",
  "tasks": [
    {
      "title": "short title",
      "description": "2-3 sentence description",
      "priority": "low | medium | high | urgent",
      "dueDate": "YYYY-MM-DD",
      "checklist": ["string checklist item", "..."]
    }
  ],
  "followUpQuestions": [
    "optional follow-up question for the user"
  ]
}

Rules:
- Return at most ${MAX_TASKS_PER_CALL} tasks.
- Prefer the priority "${priorityPreference}" unless the user stresses urgency.
- Prefer the due date ${dueDatePreference}.
- Make checklist items actionable.
- Do NOT include Markdown, code fences, or prose outside the JSON structure.

Team members available: ${teamSummary || 'Not specified'}

User request:
"""${prompt.trim()}"""`;
};

const buildChatSummaryPrompt = ({
  chatName,
  chatType,
  participants,
  timeframe,
  conversationText,
  messageCount,
}) => {
  const participantList = participants && participants.length > 0
    ? participants.join(', ')
    : 'Not specified';
  const timeframeLabel = timeframe?.start && timeframe?.end
    ? `${new Date(timeframe.start).toISOString()} to ${new Date(timeframe.end).toISOString()}`
    : 'Timeframe unknown';

  return `You are an expert communication analyst helping a product team understand their conversations.
Summarize the following ${chatType} chat named "${chatName || 'Untitled Chat'}".

Respond ONLY with valid JSON that matches this schema:
{
  "summary": "Concise paragraph describing the conversation",
  "highlights": ["Key point 1", "Key point 2"],
  "actionItems": ["Action item 1", "Action item 2"],
  "sentiment": "positive | neutral | negative",
  "topics": ["Topic or theme"],
  "followUpQuestions": ["Optional questions the team should ask next"]
}

Rules:
- Use bullet-worthy highlights (no more than 6).
- If there are no action items, return an empty array for "actionItems".
- sentiment must be one of positive, neutral, or negative.
- Keep each string under 250 characters.
- Do NOT wrap your response in markdown or additional text.

Metadata:
- Chat type: ${chatType}
- Participants: ${participantList}
- Timeframe: ${timeframeLabel}
- Messages analyzed: ${messageCount}

Conversation transcript:
"""
${conversationText}
"""`;
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'size unknown';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
};

const buildTaskSummaryPrompt = ({
  title,
  description,
  status,
  priority,
  dueDate,
  creator,
  assignees,
  checklistItems,
  attachmentDescriptions,
  commentDigest,
}) => {
  const assigneeList = assignees.length > 0 ? assignees.join(', ') : 'Unassigned';
  const checklistText = checklistItems.length > 0 ? checklistItems.join('\n') : 'No checklist items.';
  const attachmentText = attachmentDescriptions.length > 0
    ? attachmentDescriptions.map((desc) => `- ${desc}`).join('\n')
    : '- No attachments were provided.';
  const commentsText = commentDigest.length > 0
    ? commentDigest.join('\n')
    : 'No recent comments.';

  return `You are Task Analyst Bot. Summarize the following task, including progress, blockers, and noteworthy attachments.

Respond ONLY with JSON matching this schema:
{
  "summary": "Paragraph describing current state",
  "progress": ["Recent progress bullet"],
  "blockers": ["Current risks or blockers"],
  "actionItems": ["Suggested next actions"],
  "attachmentsSummary": ["How attachments relate to the work"],
  "riskLevel": "low | medium | high",
  "followUpQuestions": ["Optional clarifying questions"]
}

Rules:
- When attachments are listed below, you must include each one in "attachmentsSummary" so the assignees know what to review (mention file name, type, size, and any hints from metadata even if content is unknown).
- If a section has no content, return an empty array.
- Keep strings under 200 characters.
- riskLevel must be one of low, medium, high.
- Do NOT include markdown or text outside the JSON object.

Task metadata:
- Title: ${title}
- Description: ${description || 'No description provided.'}
- Status: ${status}
- Priority: ${priority}
- Due date: ${dueDate || 'Not set'}
- Creator: ${creator || 'Unknown'}
- Assignees: ${assigneeList}

Checklist:
${checklistText}

Attachments:
${attachmentText}

Recent Comments:
${commentsText}`;
};

const createTasksWithGemini = async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'GEMINI_API_KEY is not configured on the server.',
      });
    }

    if (req.user.role === 'member') {
      return res.status(403).json({
        success: false,
        message: 'Only managers or admins can use TaskBot to create tasks.',
      });
    }

    const {
      prompt,
      assignedTo = [],
      fallbackPriority = 'medium',
      fallbackDueDate,
    } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide instructions for the chatbot.',
      });
    }

    if (!Array.isArray(assignedTo) || assignedTo.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Select at least one employee to assign the generated tasks.',
      });
    }

    const assignedUsers = await User.find({ _id: { $in: assignedTo } });
    if (assignedUsers.length !== assignedTo.length) {
      return res.status(404).json({
        success: false,
        message: 'One or more selected users could not be found.',
      });
    }

    const invalidRoles = assignedUsers.filter((user) => user.role !== 'member');
    if (invalidRoles.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Tasks created by TaskBot must be assigned to employees (members) only.',
      });
    }

    const normalizedPriority = SUPPORTED_PRIORITIES.includes(
      String(fallbackPriority || '').toLowerCase()
    )
      ? String(fallbackPriority).toLowerCase()
      : 'medium';

    const parsedFallbackDueDate = ensureFutureDate(parseDateOnlyInput(fallbackDueDate));
    const dueDatePreference = parsedFallbackDueDate || getDefaultDueDate();

    const teamSummary = assignedUsers
      .map((user) => `${user.name || user.email} (${user.email})`)
      .join(', ');

    const promptText = buildInstructionPrompt({
      prompt,
      priorityPreference: normalizedPriority,
      dueDatePreference: dueDatePreference.toISOString().slice(0, 10),
      teamSummary,
    });

    const model = getGeminiModel({
      temperature: 0.35,
      maxOutputTokens: 2048,
    });

    const result = await model.generateContent(promptText);
    const modelResponse = result.response?.text();
    const parsed = parseModelResponse(modelResponse);
    const aiTasks = Array.isArray(parsed.tasks) ? parsed.tasks.slice(0, MAX_TASKS_PER_CALL) : [];

    if (aiTasks.length === 0) {
      return res.status(502).json({
        success: false,
        message: 'Gemini did not return any tasks. Please refine your instructions and try again.',
      });
    }

    const createdTasks = [];

    for (const [index, aiTask] of aiTasks.entries()) {
      const title = (aiTask.title || `AI Generated Task ${index + 1}`).trim().slice(0, 200);
      const description = (aiTask.description || prompt).trim().slice(0, 2000);
      const priorityCandidate = String(aiTask.priority || '').toLowerCase();
      const taskPriority = SUPPORTED_PRIORITIES.includes(priorityCandidate)
        ? priorityCandidate
        : normalizedPriority;

      const aiDueDate = ensureFutureDate(parseDateOnlyInput(aiTask.dueDate));
      const finalDueDate = aiDueDate || dueDatePreference;

      if (!finalDueDate) {
        return res.status(400).json({
          success: false,
          message: 'Unable to determine a valid due date for the generated tasks.',
        });
      }

      const checklist = buildChecklistItems(aiTask.checklist, title);
      const normalizedTags = Array.isArray(aiTask.tags)
        ? aiTask.tags.map((tag) => String(tag))
        : [];

      const taskDoc = await Task.create({
        title,
        description,
        status: 'todo',
        priority: taskPriority,
        dueDate: finalDueDate,
        assignedTo,
        createdBy: req.user._id,
        checklist,
        tags: normalizedTags,
      });

      await taskDoc.populate('assignedTo', 'name email avatar');
      await taskDoc.populate('createdBy', 'name email avatar');
      await taskDoc.populate('project', 'name color');

      const formattedTask = formatTaskForClient(taskDoc);
      createdTasks.push(formattedTask);
      await notifyAssignees(taskDoc, req.user);
    }

    res.status(201).json({
      success: true,
      data: {
        createdTasks,
        summary: parsed.summary || 'Tasks created successfully.',
        followUpQuestions: parsed.followUpQuestions || [],
        rawModelResponse: modelResponse,
      },
    });
  } catch (error) {
    console.error('TaskBot error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Unable to generate tasks right now.',
    });
  }
};

const summarizeChatWithGemini = async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'GEMINI_API_KEY is not configured on the server.',
      });
    }

    const { chatId, limit } = req.body;

    const chat = await Chat.findById(chatId)
      .populate('participants', 'name email')
      .populate('formerParticipants', 'name email')
      .populate('createdBy', 'name email');

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found.',
      });
    }

    const userIdStr = req.user._id.toString();
    const isParticipant = chat.participants.some(
      (participant) => participant._id?.toString?.() === userIdStr || participant.toString?.() === userIdStr
    );
    const isFormerParticipant = (chat.formerParticipants || []).some(
      (participant) => participant._id?.toString?.() === userIdStr || participant.toString?.() === userIdStr
    );

    if (!isParticipant && !isFormerParticipant) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to summarize this chat.',
      });
    }

    const hasDeleted = (chat.deletedBy || []).some(
      (deletedId) => deletedId?.toString?.() === userIdStr
    );
    if (hasDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found.',
      });
    }

    const parsedLimit = Math.min(
      Math.max(parseInt(limit, 10) || DEFAULT_SUMMARY_LIMIT, 20),
      MAX_SUMMARY_MESSAGES
    );

    const messageQuery = { chat: chatId, isDeleted: { $ne: true } };

    if (chat.messagesVisibleFrom) {
      const userKey = userIdStr;
      let visibleFrom = null;
      if (chat.messagesVisibleFrom instanceof Map) {
        visibleFrom = chat.messagesVisibleFrom.get(userKey);
      } else if (chat.messagesVisibleFrom[userKey]) {
        visibleFrom = chat.messagesVisibleFrom[userKey];
      }
      if (visibleFrom) {
        messageQuery.createdAt = { $gte: visibleFrom };
      }
    }

    const messages = await Message.find(messageQuery)
      .populate('sender', 'name email')
      .sort({ createdAt: -1 })
      .limit(parsedLimit);

    if (!messages || messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Not enough conversation history to summarize yet.',
      });
    }

    const chronologicalMessages = [...messages].reverse();
    const transcriptLines = chronologicalMessages.map((message) => {
      const timestamp = message.createdAt ? new Date(message.createdAt).toISOString() : 'unknown time';
      const senderName = message.isSystem
        ? 'System'
        : (message.sender?.name || message.sender?.email || 'Unknown user');

      if (message.isDeleted) {
        return `[${timestamp}] ${senderName}: [message deleted]`;
      }

      let content = message.text?.trim() || '';
      if (!content && Array.isArray(message.attachments) && message.attachments.length > 0) {
        const attachmentLabels = message.attachments
          .map((attachment, index) => attachment?.name || attachment?.type || `Attachment ${index + 1}`)
          .slice(0, 3)
          .join(', ');
        content = `[${message.attachments.length} attachment(s): ${attachmentLabels}]`;
      }

      if (!content) {
        content = '[no text provided]';
      }

      return `[${timestamp}] ${senderName}: ${content}`;
    });

    let transcript = transcriptLines.join('\n');
    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      transcript = transcript.slice(transcript.length - MAX_TRANSCRIPT_CHARS);
    }

    const timeframe = {
      start: chronologicalMessages[0]?.createdAt || null,
      end: chronologicalMessages[chronologicalMessages.length - 1]?.createdAt || null,
    };

    const prompt = buildChatSummaryPrompt({
      chatName: chat.type === 'group' ? chat.name || 'Group Chat' : 'Direct Chat',
      chatType: chat.type,
      participants: chat.participants.map((participant) => participant.name || participant.email || participant._id?.toString()),
      timeframe,
      conversationText: transcript,
      messageCount: chronologicalMessages.length,
    });

    const model = getGeminiModel({
      temperature: 0.2,
      maxOutputTokens: 1024,
    });

    const result = await model.generateContent(prompt);
    const modelResponse = result.response?.text();
    const parsed = parseModelResponse(modelResponse);

    const summaryPayload = {
      summary: parsed.summary || 'Unable to summarize this conversation.',
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      sentiment: parsed.sentiment || 'neutral',
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      followUpQuestions: Array.isArray(parsed.followUpQuestions) ? parsed.followUpQuestions : [],
      totalMessages: chronologicalMessages.length,
      messageLimit: parsedLimit,
      timeframe,
      participants: chat.participants.map((participant) => ({
        _id: participant._id,
        name: participant.name,
        email: participant.email,
      })),
      chat: {
        _id: chat._id,
        name: chat.name,
        type: chat.type,
      },
      generatedAt: new Date().toISOString(),
      model: DEFAULT_MODEL,
      rawModelResponse: modelResponse,
    };

    res.json({
      success: true,
      data: summaryPayload,
    });
  } catch (error) {
    console.error('Chat summary error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Unable to summarize chat right now.',
    });
  }
};

const summarizeTaskWithGemini = async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'GEMINI_API_KEY is not configured on the server.',
      });
    }

    const { taskId } = req.body;

    const task = await Task.findById(taskId)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .populate('comments.user', 'name email');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found.',
      });
    }

    const userIdStr = req.user._id.toString();
    const isCreator = task.createdBy?._id?.toString() === userIdStr;
    const isAssignee = Array.isArray(task.assignedTo)
      ? task.assignedTo.some((assignee) => assignee?._id?.toString() === userIdStr)
      : false;
    const isElevated = ['manager', 'admin'].includes(req.user.role);

    if (!isCreator && !isAssignee && !isElevated) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to summarize this task.',
      });
    }

    const attachments = Array.isArray(task.attachments) ? task.attachments : [];
    const attachmentDescriptions = attachments.map((attachment, index) => {
      const name = attachment?.name || `Attachment ${index + 1}`;
      const type = attachment?.type || 'file';
      const size = formatBytes(attachment?.size);
      const uploadedAt = attachment?.uploadedAt ? new Date(attachment.uploadedAt).toISOString() : 'unknown upload date';
      const url = attachment?.url ? attachment.url : 'URL not provided';
      return `${name} | Type: ${type} | Size: ${size} | Uploaded: ${uploadedAt} | URL: ${url}`;
    });

    const checklistItems = Array.isArray(task.checklist)
      ? task.checklist.map((item, index) => {
        const statusLabel = item.completed ? '✅ Done' : '⬜ Pending';
        return `${statusLabel} - ${item.text}`;
      })
      : [];

    const sortedComments = Array.isArray(task.comments)
      ? [...task.comments].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
      : [];

    const recentComments = sortedComments.slice(-10).map((comment) => {
      const author = comment.user?.name || comment.user?.email || 'Unknown';
      const timestamp = comment.createdAt ? new Date(comment.createdAt).toISOString() : 'unknown time';
      return `[${timestamp}] ${author}: ${comment.text}`;
    });

    const assigneeNames = Array.isArray(task.assignedTo)
      ? task.assignedTo.map((assignee) => assignee.name || assignee.email || assignee._id?.toString())
      : [];

    const dueDateLabel = task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : 'Not set';

    const prompt = buildTaskSummaryPrompt({
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: dueDateLabel,
      creator: task.createdBy?.name || task.createdBy?.email || 'Unknown',
      assignees: assigneeNames,
      checklistItems,
      attachmentDescriptions,
      commentDigest: recentComments,
    });

    const model = getGeminiModel({
      temperature: 0.25,
      maxOutputTokens: 1024,
    });

    const result = await model.generateContent(prompt);
    const modelResponse = result.response?.text();
    const parsed = parseModelResponse(modelResponse);

    const summaryPayload = {
      summary: parsed.summary || 'Unable to summarize this task.',
      progress: Array.isArray(parsed.progress) ? parsed.progress : [],
      blockers: Array.isArray(parsed.blockers) ? parsed.blockers : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      attachmentsSummary: Array.isArray(parsed.attachmentsSummary) ? parsed.attachmentsSummary : [],
      riskLevel: parsed.riskLevel || 'low',
      followUpQuestions: Array.isArray(parsed.followUpQuestions) ? parsed.followUpQuestions : [],
      task: {
        _id: task._id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
      },
      generatedAt: new Date().toISOString(),
      model: DEFAULT_MODEL,
      rawModelResponse: modelResponse,
    };

    if (attachments.length > 0 && summaryPayload.attachmentsSummary.length === 0) {
      summaryPayload.attachmentsSummary = attachmentDescriptions.map(
        (desc) => `Review attachment: ${desc}`
      );
    }

    res.json({
      success: true,
      data: summaryPayload,
    });
  } catch (error) {
    console.error('Task summary error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Unable to summarize task right now.',
    });
  }
};

module.exports = {
  setIOInstance,
  createTasksWithGemini,
  summarizeChatWithGemini,
  summarizeTaskWithGemini,
};


