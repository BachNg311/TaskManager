const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { getFileType, generateSignedUrl, addSignedUrlToUserAvatar } = require('../utils/s3Upload');
const { formatMessageForClient, addSignedUrlsToAttachments } = require('../utils/messageFormatter');

// Store io instance to emit events from controllers
let ioInstance = null;

const setIOInstance = (io) => {
  ioInstance = io;
};

const getIOInstance = () => {
  return ioInstance;
};

// Helper function to safely extract user ID from various formats
const extractUserId = (user) => {
  if (!user) return null;
  if (typeof user === 'string') return user;
  if (user._id) {
    return typeof user._id === 'string' ? user._id : user._id.toString();
  }
  return user.toString();
};

// Helper to add signed URLs to user avatars in chats
const processChatForResponse = (chat) => {
  if (!chat) return chat;
  
  const chatObj = chat.toObject ? chat.toObject() : chat;
  
  // Process participants (array of users)
  if (chatObj.participants && Array.isArray(chatObj.participants)) {
    chatObj.participants = addSignedUrlToUserAvatar(chatObj.participants);
  }
  
  // Process createdBy (single user)
  if (chatObj.createdBy) {
    chatObj.createdBy = addSignedUrlToUserAvatar(chatObj.createdBy);
  }

  // Process formerParticipants (array of users)
  if (chatObj.formerParticipants && Array.isArray(chatObj.formerParticipants)) {
    chatObj.formerParticipants = addSignedUrlToUserAvatar(chatObj.formerParticipants);
  }

  // Convert nicknames Map to plain object for JSON serialization
  if (chatObj.nicknames && chatObj.nicknames instanceof Map) {
    chatObj.nicknames = Object.fromEntries(chatObj.nicknames);
  }
  
  return chatObj;
};

// @desc    Get all chats for current user
// @route   GET /api/chats
// @access  Private
const getChats = async (req, res) => {
  try {
    // Find chats where user is either a current participant OR a former participant
    const chats = await Chat.find({
      $or: [
        { participants: req.user._id },
        { formerParticipants: req.user._id }
      ],
      deletedBy: { $ne: req.user._id } // Exclude chats deleted by current user
    })
      .populate('participants', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .populate('formerParticipants', 'name email avatar')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1, createdAt: -1 });

    // Add signed URLs to user avatars
    const chatsWithSignedAvatars = chats.map(chat => processChatForResponse(chat));

    res.json({
      success: true,
      data: chatsWithSignedAvatars
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get or create direct chat
// @route   GET /api/chats/direct/:userId
// @access  Private
const getOrCreateDirectChat = async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot create chat with yourself'
      });
    }

    // Check if direct chat already exists (even if deleted by one user)
    let chat = await Chat.findOne({
      type: 'direct',
      participants: { $all: [req.user._id, userId], $size: 2 }
    })
      .populate('participants', 'name email avatar');

    if (!chat) {
      // Create new direct chat (no messagesVisibleFrom needed - show all messages)
      chat = await Chat.create({
        type: 'direct',
        participants: [req.user._id, userId],
        createdBy: req.user._id
      });
      await chat.populate('participants', 'name email avatar');
    } else {
      // If chat exists but was deleted by current user, restore it (remove from deletedBy)
      const isDeleted = chat.deletedBy.some(
        db => db.toString() === req.user._id.toString()
      );
      if (isDeleted) {
        chat.deletedBy = chat.deletedBy.filter(
          db => db.toString() !== req.user._id.toString()
        );
        // Set messagesVisibleFrom to current time - only show messages from now on
        // This ensures old messages don't appear when chat is restored
        const userIdStr = req.user._id.toString();
        if (!chat.messagesVisibleFrom) {
          chat.messagesVisibleFrom = new Map();
        }
        // Ensure it's a Map instance
        if (!(chat.messagesVisibleFrom instanceof Map)) {
          chat.messagesVisibleFrom = new Map(Object.entries(chat.messagesVisibleFrom || {}));
        }
        chat.messagesVisibleFrom.set(userIdStr, new Date());
        await chat.save();
      }
    }

    // Add signed URLs to user avatars
    const chatWithSignedAvatars = processChatForResponse(chat);

    res.json({
      success: true,
      data: chatWithSignedAvatars
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create group chat
// @route   POST /api/chats/group
// @access  Private
const createGroupChat = async (req, res) => {
  try {
    const { name, description, participantIds } = req.body;

    if (!name || !participantIds || !Array.isArray(participantIds) || participantIds.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Group chat must have a name and at least 2 participants'
      });
    }

    const participantSet = new Set([req.user._id.toString(), ...participantIds]);
    const participants = Array.from(participantSet);

    let chat = await Chat.create({
      type: 'group',
      name,
      description,
      participants,
      createdBy: req.user._id,
      admins: [req.user._id]
    });

    await chat.populate('participants', 'name email avatar');
    await chat.populate('createdBy', 'name email avatar');

    const participantNames = chat.participants
      .filter((p) => p._id.toString() !== req.user._id.toString())
      .map((p) => p.name)
      .filter(Boolean);

    const systemMessages = [];

    const creationMessage = await Message.create({
      chat: chat._id,
      sender: req.user._id,
      text: `${req.user.name} created the chat.`,
      isSystem: true
    });
    await creationMessage.populate('sender', 'name email avatar');
    systemMessages.push(creationMessage);

    if (participantNames.length > 0) {
      const joinedMessage = await Message.create({
        chat: chat._id,
        sender: req.user._id,
        text: `${participantNames.join(', ')} joined the chat.`,
        isSystem: true
      });
      await joinedMessage.populate('sender', 'name email avatar');
      systemMessages.push(joinedMessage);
    }

    if (systemMessages.length > 0) {
      const lastSystemMessage = systemMessages[systemMessages.length - 1];
      chat.lastMessage = lastSystemMessage._id;
      chat.lastMessageAt = lastSystemMessage.createdAt;
      await chat.save();
    }

    const formattedSystemMessages = systemMessages.map(formatMessageForClient);
    const chatPayload = await Chat.findById(chat._id)
      .populate('participants', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .lean();

    const io = getIOInstance();
    if (io) {
      // Emit to all participants EXCEPT the creator (who gets it from API response)
      participants.forEach((participantId) => {
        const participantIdStr = participantId?.toString() || participantId;
        const creatorIdStr = req.user._id.toString();
        
        // Skip the creator to avoid duplicate chat in their list
        if (participantIdStr !== creatorIdStr) {
          io.to(`user:${participantIdStr}`).emit('chat:created', {
            chat: chatPayload,
            messages: formattedSystemMessages
          });
        }
      });
    }

    // Add signed URLs to user avatars
    const chatWithSignedAvatars = processChatForResponse(chat);

    res.status(201).json({
      success: true,
      data: chatWithSignedAvatars
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single chat
// @route   GET /api/chats/:id
// @access  Private
const getChat = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id)
      .populate('participants', 'name email avatar')
      .populate('createdBy', 'name email avatar');

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Check if user is a participant
    const isParticipant = chat.participants.some(
      p => p._id.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this chat'
      });
    }

    // Check if user has deleted this chat
    const isDeleted = chat.deletedBy.some(
      db => db.toString() === req.user._id.toString()
    );

    if (isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Add signed URLs to user avatars
    const chatWithSignedAvatars = processChatForResponse(chat);

    res.json({
      success: true,
      data: chatWithSignedAvatars
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get messages for a chat
// @route   GET /api/chats/:id/messages
// @access  Private
const getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Verify user is participant
    const chat = await Chat.findById(id);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    const isParticipant = chat.participants.some(
      p => p.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this chat'
      });
    }

    // Check if user has deleted this chat
    const isDeleted = chat.deletedBy.some(
      db => db.toString() === req.user._id.toString()
    );

    if (isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build message query - only show messages visible to this user
    const messageQuery = { chat: id };
    
    // If user has a messagesVisibleFrom timestamp, only show messages after that
    if (chat.messagesVisibleFrom) {
      const userIdStr = req.user._id.toString();
      let visibleFrom = null;
      
      if (chat.messagesVisibleFrom instanceof Map) {
        visibleFrom = chat.messagesVisibleFrom.get(userIdStr);
      } else if (chat.messagesVisibleFrom[userIdStr]) {
        visibleFrom = chat.messagesVisibleFrom[userIdStr];
      }
      
      if (visibleFrom) {
        messageQuery.createdAt = { $gte: visibleFrom };
      }
    }

    // Fetch messages (only those visible to the user)
    const messages = await Message.find(messageQuery)
      .populate('sender', 'name email avatar')
      .populate({
        path: 'replyTo',
        populate: { path: 'sender', select: 'name email avatar' }
      })
      .populate('reactions.user', 'name email avatar')
      .populate('mentionedUsers', 'name email avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Message.countDocuments(messageQuery);

    // Mark messages as read
    await Message.updateMany(
      {
        chat: id,
        sender: { $ne: req.user._id },
        'readBy.user': { $ne: req.user._id }
      },
      {
        $push: {
          readBy: {
            user: req.user._id,
            readAt: new Date()
          }
        }
      }
    );

    const orderedMessages = messages.reverse().map(formatMessageForClient);

    res.json({
      success: true,
      data: orderedMessages, // Already reversed to show oldest first
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Add participant to group chat
// @route   POST /api/chats/:id/participants
// @access  Private
const addParticipant = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const chat = await Chat.findById(id);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({
        success: false,
        message: 'Can only add participants to group chats'
      });
    }

    // Check if user is participant
    const isParticipant = chat.participants.some(
      p => p.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add participants'
      });
    }

    // Check if user is already a participant
    if (chat.participants.some(p => p.toString() === userId)) {
      return res.status(400).json({
        success: false,
        message: 'User is already a participant'
      });
    }

    // Get the user being added
    const newUser = await User.findById(userId).select('name email');
    if (!newUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    chat.participants.push(userId);
    await chat.save();

    // Create system message for member added
    const systemMessage = await Message.create({
      chat: chat._id,
      sender: req.user._id,
      text: `${req.user.name} added ${newUser.name} to the group`,
      isSystem: true
    });

    await systemMessage.populate('sender', 'name email avatar');

    await chat.populate('participants', 'name email avatar');
    await chat.populate('createdBy', 'name email avatar');

    // Add signed URLs to user avatars
    const chatWithSignedAvatars = processChatForResponse(chat);

    // Create notification for the added user
    const userIdStr = extractUserId(userId);
    const notification = await Notification.create({
      user: userIdStr,
      type: 'chat_added',
      title: 'Added to Group Chat',
      message: `${req.user.name} added you to "${chat.name || 'a group chat'}"`
    });

    // Emit WebSocket events
    const io = getIOInstance();
    if (io) {
      // Notify all existing participants about the updated chat
      chat.participants.forEach((participantId) => {
        const pid = participantId._id?.toString() || participantId.toString();
        io.to(`user:${pid}`).emit('chat:updated', chatWithSignedAvatars);
      });

      // Send the system message to the chat room
      const messageObj = formatMessageForClient(systemMessage);
      io.to(`chat:${chat._id}`).emit('message:new', messageObj);

      // Send notification to the added user
      io.to(`user:${userId}`).emit('notification:new', {
        _id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        isRead: false,
        createdAt: notification.createdAt
      });
    }

    res.json({
      success: true,
      data: chatWithSignedAvatars,
      message: `${newUser.name} added to the group`
    });
  } catch (error) {
    console.error('Error adding participant:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Remove participant from group chat
// @route   DELETE /api/chats/:id/participants/:userId
// @access  Private (Only creator can remove members)
const removeParticipant = async (req, res) => {
  try {
    const { id, userId } = req.params;

    const chat = await Chat.findById(id)
      .populate('participants', 'name email avatar')
      .populate('createdBy', 'name email avatar');

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({
        success: false,
        message: 'Can only remove participants from group chats'
      });
    }

    // Check if the user being removed exists in the chat
    const userToRemove = chat.participants.find(
      p => p._id.toString() === userId
    );

    if (!userToRemove) {
      return res.status(404).json({
        success: false,
        message: 'User is not a participant in this chat'
      });
    }

    // Only the creator can remove other members
    const isCreator = chat.createdBy._id.toString() === req.user._id.toString();

    if (!isCreator) {
      return res.status(403).json({
        success: false,
        message: 'Only the group creator can remove members'
      });
    }

    // Cannot remove the creator
    if (userId === chat.createdBy._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove the group creator'
      });
    }

    // Remove from participants
    chat.participants = chat.participants.filter(
      p => p._id.toString() !== userId
    );

    // Remove from admins if present
    if (chat.admins && chat.admins.length > 0) {
      chat.admins = chat.admins.filter(
        adminId => adminId.toString() !== userId
      );
    }

    // Add to formerParticipants so they can still see the chat (read-only)
    if (!chat.formerParticipants) {
      chat.formerParticipants = [];
    }
    if (!chat.formerParticipants.includes(userId)) {
      chat.formerParticipants.push(userId);
    }

    await chat.save();

    // Create system message for member removed
    const systemMessage = await Message.create({
      chat: chat._id,
      sender: req.user._id,
      text: `${req.user.name} removed ${userToRemove.name} from the group`,
      isSystem: true
    });

    await systemMessage.populate('sender', 'name email avatar');

    // Add signed URLs to user avatars
    const chatWithSignedAvatars = processChatForResponse(chat);

    // Create notification for the removed user
    const userIdStr = extractUserId(userId);
    const notification = await Notification.create({
      user: userIdStr,
      type: 'chat_removed',
      title: 'Removed from Group Chat',
      message: `${req.user.name} removed you from "${chat.name || 'a group chat'}"`
    });

    // Emit WebSocket events
    const io = getIOInstance();
    if (io) {
      // Notify remaining participants about the updated chat
      chat.participants.forEach((participantId) => {
        const pid = participantId._id?.toString() || participantId.toString();
        io.to(`user:${pid}`).emit('chat:updated', chatWithSignedAvatars);
      });

      // Send the system message to the chat room
      const messageObj = formatMessageForClient(systemMessage);
      io.to(`chat:${chat._id}`).emit('message:new', messageObj);

      // Notify the removed user that they were removed
      io.to(`user:${userIdStr}`).emit('chat:removed', { 
        chatId: id, 
        message: `You were removed from ${chat.name || 'the group'}` 
      });

      // Send notification to the removed user
      io.to(`user:${userIdStr}`).emit('notification:new', {
        _id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        isRead: false,
        createdAt: notification.createdAt
      });
    }

    res.json({
      success: true,
      message: 'Participant removed successfully',
      data: chatWithSignedAvatars
    });
  } catch (error) {
    console.error('Error removing participant:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Leave group chat
// @route   POST /api/chats/:id/leave
// @access  Private
const leaveChat = async (req, res) => {
  try {
    const { id } = req.params;

    let chat = await Chat.findById(id).populate('participants', 'name email avatar');

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    if (chat.type !== 'group') {
      return res.status(400).json({
        success: false,
        message: 'Only group chats can be left. Delete direct chats instead.'
      });
    }

    const userIdStr = req.user._id.toString();
    const isParticipant = chat.participants.some(
      participant => participant._id.toString() === userIdStr
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'You are not part of this chat'
      });
    }

    const remainingParticipants = chat.participants
      .filter(participant => participant._id.toString() !== userIdStr);
    const remainingIds = remainingParticipants.map(participant => participant._id);

    chat.participants = remainingIds;
    chat.deletedBy = chat.deletedBy.filter(db => db.toString() !== userIdStr);

    if (chat.admins && chat.admins.length > 0) {
      chat.admins = chat.admins.filter(adminId => adminId.toString() !== userIdStr);
    }

    if (!chat.admins || chat.admins.length === 0) {
      if (remainingIds.length > 0) {
        chat.admins = [remainingIds[0]];
      } else {
        chat.admins = [];
      }
    }

    const io = getIOInstance();

    if (remainingIds.length === 0) {
      await Message.deleteMany({ chat: id });
      await Chat.findByIdAndDelete(id);

      if (io) {
        io.to(`user:${userIdStr}`).emit('chat:left', { chatId: id });
        io.to(`chat:${id}`).emit('chat:deleted', { chatId: id, deletedBy: userIdStr });
      }

      return res.json({
        success: true,
        message: 'Chat deleted because no participants remain'
      });
    }

    await chat.save();

    const leaveMessage = await Message.create({
      chat: id,
      sender: req.user._id,
      text: `${req.user.name} left the chat.`,
      isSystem: true
    });
    await leaveMessage.populate('sender', 'name email avatar');

    const formattedLeaveMessage = formatMessageForClient(leaveMessage);

    const updatedChat = await Chat.findById(id)
      .populate('participants', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .lean();

    if (io) {
      remainingIds.forEach((participantId) => {
        io.to(`user:${participantId.toString()}`).emit('chat:updated', updatedChat);
      });
      io.to(`chat:${id}`).emit('message:new', formattedLeaveMessage);
      io.to(`user:${userIdStr}`).emit('chat:left', { chatId: id });
    }

    res.json({
      success: true,
      message: 'Left chat successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete chat (hide for user)
// @route   DELETE /api/chats/:id
// @access  Private
const deleteChat = async (req, res) => {
  try {
    const { id } = req.params;

    const chat = await Chat.findById(id);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    // Check if user is a participant
    const isParticipant = chat.participants.some(
      p => p.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this chat'
      });
    }

    // Check if user already deleted this chat
    const alreadyDeleted = chat.deletedBy.some(
      db => db.toString() === req.user._id.toString()
    );

    if (alreadyDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Chat already deleted'
      });
    }

    // For direct chats: just hide it for the user (add to deletedBy)
    // For group chats: only creator can fully delete, others just hide it
    if (chat.type === 'group') {
      const isCreator = chat.createdBy.toString() === req.user._id.toString();
      
      if (isCreator) {
        // Creator can fully delete group chat - delete all messages and chat
        await Message.deleteMany({ chat: id });
        await Chat.findByIdAndDelete(id);
        
        // Emit socket event to notify all participants
        const io = getIOInstance();
        if (io) {
          const participantIds = chat.participants.map(p => p.toString());
          participantIds.forEach(participantId => {
            io.to(`user:${participantId}`).emit('chat:deleted', {
              chatId: id,
              deletedBy: req.user._id.toString()
            });
          });
        }
      } else {
        // Non-creator just hides it for themselves
        chat.deletedBy.push(req.user._id);
        await chat.save();
        
        // Only notify the user who deleted it
        const io = getIOInstance();
        if (io) {
          io.to(`user:${req.user._id}`).emit('chat:deleted', {
            chatId: id,
            deletedBy: req.user._id.toString()
          });
        }
      }
    } else {
      // Direct chat: just hide it for the user (don't delete messages or chat)
      chat.deletedBy.push(req.user._id);
      
      // Set messagesVisibleFrom to current time when deleted
      // This ensures when they restore, old messages won't show
      const userIdStr = req.user._id.toString();
      if (!chat.messagesVisibleFrom) {
        chat.messagesVisibleFrom = {};
      }
      // Mongoose Map: use set method or direct assignment
      if (chat.messagesVisibleFrom instanceof Map) {
        chat.messagesVisibleFrom.set(userIdStr, new Date());
      } else {
        // If it's not a Map yet, convert it
        const map = new Map(Object.entries(chat.messagesVisibleFrom || {}));
        map.set(userIdStr, new Date());
        chat.messagesVisibleFrom = map;
      }
      
      await chat.save();
      
      // Only notify the user who deleted it (other participant doesn't need to know)
      const io = getIOInstance();
      if (io) {
        io.to(`user:${req.user._id}`).emit('chat:deleted', {
          chatId: id,
          deletedBy: req.user._id.toString()
        });
      }
    }

    res.json({
      success: true,
      message: 'Chat deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Upload attachment for chat
// @route   POST /api/chats/:chatId/attachments
// @access  Private
const uploadChatAttachment = async (req, res) => {
  try {
    const { chatId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    const isParticipant = chat.participants.some(
      p => p.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to upload attachments to this chat'
      });
    }

    const fileData = {
      url: req.file.location,
      name: req.file.originalname,
      type: getFileType(req.file.mimetype),
      size: req.file.size,
      uploadedAt: new Date()
    };

    res.status(201).json({
      success: true,
      data: fileData
    });
  } catch (error) {
    console.error('Error uploading chat attachment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload attachment'
    });
  }
};

// @desc    Update chat (nickname for direct chat, name/description for group chat)
// @route   PUT /api/chats/:id
// @access  Private
const updateChat = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, nickname } = req.body;

    const chat = await Chat.findOne({
      _id: id,
      $or: [
        { participants: req.user._id },
        { formerParticipants: req.user._id }
      ]
    });

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found or you are not a participant'
      });
    }

    // Handle nickname update for direct chats
    if (chat.type === 'direct' && nickname !== undefined) {
      // Store user-specific nickname
      if (!chat.nicknames) {
        chat.nicknames = new Map();
      }
      
      const trimmedNickname = nickname.trim();
      let systemMessageText = '';
      let otherParticipantId = null;
      let finalNickname = '';
      
      if (trimmedNickname === '') {
        // Remove nickname
        chat.nicknames.delete(req.user._id.toString());
        // Don't create system message for nickname removal
      } else {
        // Set nickname (max 100 chars)
        finalNickname = trimmedNickname.substring(0, 100);
        chat.nicknames.set(req.user._id.toString(), finalNickname);
        
        // Find the other participant to show in system message
        const otherParticipant = chat.participants.find(
          p => p.toString() !== req.user._id.toString()
        );
        
        if (otherParticipant) {
          otherParticipantId = extractUserId(otherParticipant);
          // Get the other participant's name
          const otherUser = await User.findById(otherParticipantId).select('name');
          systemMessageText = `${req.user.name} set ${otherUser?.name || 'your'} nickname to "${finalNickname}"`;
        }
      }
      
      await chat.save();
      
      // Create system message if nickname was set (not removed)
      if (systemMessageText) {
        const systemMessage = await Message.create({
          chat: chat._id,
          sender: req.user._id,
          text: systemMessageText,
          isSystem: true
        });
        await systemMessage.populate('sender', 'name email avatar');
        
        // Update lastMessage so chat moves to top
        chat.lastMessage = systemMessage._id;
        chat.lastMessageAt = systemMessage.createdAt;
        await chat.save();
        
        // Emit system message to chat room
        const io = getIOInstance();
        if (io) {
          const messageObj = formatMessageForClient(systemMessage);
          io.to(`chat:${chat._id}`).emit('message:new', messageObj);
        }

        // Create notification for the other user (whose nickname was set)
        if (otherParticipantId) {
          const notification = await Notification.create({
            user: otherParticipantId,
            type: 'nickname_set',
            title: 'Nickname Set',
            message: `${req.user.name} set your nickname to "${finalNickname}"`
          });

          // Emit notification to the other user
          if (io) {
            io.to(`user:${otherParticipantId.toString()}`).emit('notification:new', {
              _id: notification._id,
              type: notification.type,
              title: notification.title,
              message: notification.message,
              isRead: false,
              createdAt: notification.createdAt
            });
          }
        }
      }
      
      await chat.populate('participants', 'name email avatar');
      await chat.populate('createdBy', 'name email avatar');
      await chat.populate('formerParticipants', 'name email avatar');
      await chat.populate('lastMessage');

      // Add signed URLs to user avatars
      const chatWithSignedAvatars = processChatForResponse(chat);

      // Emit chat:updated to BOTH users (so both see the updated chat data)
      const io = getIOInstance();
      if (io) {
        chat.participants.forEach((participantId) => {
          const pid = participantId._id?.toString() || participantId.toString();
          io.to(`user:${pid}`).emit('chat:updated', chatWithSignedAvatars);
        });
      }

      return res.json({
        success: true,
        data: chatWithSignedAvatars,
        message: 'Nickname updated successfully'
      });
    }

    // Handle name/description update for group chats
    if (chat.type === 'group') {
      // Check if user is still an active participant
      const isParticipant = chat.participants.some(
        p => p.toString() === req.user._id.toString()
      );

      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          message: 'You must be a participant to update group details'
        });
      }

      let updated = false;
      let systemMessageText = '';

      // Update name
      if (name !== undefined && name.trim() !== '') {
        const oldName = chat.name;
        const newName = name.trim().substring(0, 100);
        chat.name = newName;
        updated = true;
        systemMessageText = `${req.user.name} changed the group name from "${oldName}" to "${newName}"`;
      }

      // Update description
      if (description !== undefined) {
        const trimmedDescription = description.trim().substring(0, 500);
        chat.description = trimmedDescription || null;
        updated = true;
        if (!systemMessageText) {
          systemMessageText = `${req.user.name} updated the group description`;
        }
      }

      if (!updated) {
        return res.status(400).json({
          success: false,
          message: 'No valid updates provided'
        });
      }

      await chat.save();

      // Create system message
      if (systemMessageText) {
        const systemMessage = await Message.create({
          chat: chat._id,
          sender: req.user._id,
          text: systemMessageText,
          isSystem: true
        });
        await systemMessage.populate('sender', 'name email avatar');

        // Update lastMessage
        chat.lastMessage = systemMessage._id;
        chat.lastMessageAt = systemMessage.createdAt;
        await chat.save();

        // Emit system message to chat room
        const io = getIOInstance();
        if (io) {
          const messageObj = formatMessageForClient(systemMessage);
          io.to(`chat:${chat._id}`).emit('message:new', messageObj);
        }
      }

      await chat.populate('participants', 'name email avatar');
      await chat.populate('createdBy', 'name email avatar');
      await chat.populate('formerParticipants', 'name email avatar');
      await chat.populate('lastMessage');

      // Add signed URLs to user avatars
      const chatWithSignedAvatars = processChatForResponse(chat);

      // Emit update to all participants
      const io = getIOInstance();
      if (io) {
        chat.participants.forEach((participant) => {
          const pid = participant._id?.toString() || participant.toString();
          io.to(`user:${pid}`).emit('chat:updated', chatWithSignedAvatars);
        });
      }

      return res.json({
        success: true,
        data: chatWithSignedAvatars,
        message: 'Group chat updated successfully'
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid update request'
    });
  } catch (error) {
    console.error('Error updating chat:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Forward message to one or more chats
// @route   POST /api/chats/forward
// @access  Private
const forwardMessage = async (req, res) => {
  try {
    const { messageId, targetChatIds } = req.body;

    if (!messageId || !targetChatIds || !Array.isArray(targetChatIds) || targetChatIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message ID and target chat IDs are required'
      });
    }

    // Find the original message
    const originalMessage = await Message.findById(messageId)
      .populate('sender', 'name email avatar')
      .populate('forwardedFrom', 'name email avatar');

    if (!originalMessage) {
      return res.status(404).json({
        success: false,
        message: 'Original message not found'
      });
    }

    // Verify user has access to the original message's chat
    const originalChat = await Chat.findOne({
      _id: originalMessage.chat,
      $or: [
        { participants: req.user._id },
        { formerParticipants: req.user._id }
      ]
    });

    if (!originalChat) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this message'
      });
    }

    const forwardedMessages = [];
    const io = getIOInstance();

    // Forward to each target chat
    for (const targetChatId of targetChatIds) {
      // Verify user is a participant in target chat
      const targetChat = await Chat.findOne({
        _id: targetChatId,
        participants: req.user._id
      });

      if (!targetChat) {
        console.log(`User ${req.user._id} is not a participant in chat ${targetChatId}, skipping`);
        continue;
      }

      // Create forwarded message
      const forwardedMessage = await Message.create({
        chat: targetChatId,
        sender: req.user._id,
        text: originalMessage.text || '',
        attachments: originalMessage.attachments || [],
        forwardedFrom: originalMessage.forwardedFrom || originalMessage.sender._id,
        isSystem: false
      });

      await forwardedMessage.populate('sender', 'name email avatar');
      await forwardedMessage.populate('forwardedFrom', 'name email avatar');

      // Update target chat's lastMessage
      targetChat.lastMessage = forwardedMessage._id;
      targetChat.lastMessageAt = forwardedMessage.createdAt;
      await targetChat.save();

      forwardedMessages.push(forwardedMessage);

      // Emit message to target chat room
      if (io) {
        const messageObj = formatMessageForClient(forwardedMessage);
        io.to(`chat:${targetChatId}`).emit('message:new', messageObj);
      }

      // Create notifications for participants (excluding sender)
      const participantsToNotify = targetChat.participants.filter(
        p => p.toString() !== req.user._id.toString()
      );

      for (const participantId of participantsToNotify) {
        const participantIdStr = extractUserId(participantId);
        const notificationType = targetChat.type === 'group' ? 'group_message' : 'forward_message';
        const notificationTitle = targetChat.type === 'group' 
          ? `New message in ${targetChat.name || 'group'}` 
          : 'Forwarded Message';
        
        let notificationMessage = '';
        if (originalMessage.text) {
          notificationMessage = `${req.user.name} forwarded: ${originalMessage.text.substring(0, 50)}${originalMessage.text.length > 50 ? '...' : ''}`;
        } else if (originalMessage.attachments && originalMessage.attachments.length > 0) {
          const attachmentCount = originalMessage.attachments.length;
          notificationMessage = `${req.user.name} forwarded ${attachmentCount} ${attachmentCount === 1 ? 'attachment' : 'attachments'}`;
        } else {
          notificationMessage = `${req.user.name} forwarded a message`;
        }

        const notification = await Notification.create({
          user: participantIdStr,
          type: notificationType,
          title: notificationTitle,
          message: notificationMessage
        });

        // Emit notification
        if (io) {
          io.to(`user:${participantIdStr}`).emit('notification:new', {
            _id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            isRead: false,
            createdAt: notification.createdAt
          });
        }
      }

      // Update chat for all participants
      await targetChat.populate('participants', 'name email avatar');
      await targetChat.populate('createdBy', 'name email avatar');
      await targetChat.populate('formerParticipants', 'name email avatar');
      await targetChat.populate('lastMessage');

      const chatWithSignedAvatars = processChatForResponse(targetChat);

      if (io) {
        targetChat.participants.forEach((participantId) => {
          const pid = participantId._id?.toString() || participantId.toString();
          io.to(`user:${pid}`).emit('chat:updated', chatWithSignedAvatars);
        });
      }
    }

    res.json({
      success: true,
      data: forwardedMessages,
      message: `Message forwarded to ${forwardedMessages.length} chat(s)`
    });
  } catch (error) {
    console.error('Error forwarding message:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  setIOInstance,
  getIOInstance,
  getChats,
  getOrCreateDirectChat,
  createGroupChat,
  getChat,
  getMessages,
  addParticipant,
  removeParticipant,
  leaveChat,
  deleteChat,
  updateChat,
  uploadChatAttachment,
  forwardMessage
};

