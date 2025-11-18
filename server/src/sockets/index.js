const { protectSocket } = require('../middleware/socket');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const { deleteFileFromS3 } = require('../utils/s3Upload');
const { addSignedUrlsToAttachments, formatMessageForClient } = require('../utils/messageFormatter');

// Helper function to safely extract user ID from various formats
const extractUserId = (user) => {
  if (!user) return null;
  if (typeof user === 'string') return user;
  if (user._id) {
    return typeof user._id === 'string' ? user._id : user._id.toString();
  }
  return user.toString();
};

// Simple attachment sanitizer - just ensure it's an array of objects
const sanitizeAttachments = (attachments = []) => {
  // If not an array, return empty
  if (!Array.isArray(attachments)) {
    console.warn('Attachments is not an array:', typeof attachments);
    return [];
  }

  // Filter and map to ensure proper structure
  return attachments
    .filter((att) => att && typeof att === 'object' && att.url)
    .map((att) => ({
      url: att.url,
      name: att.name || 'Attachment',
      type: att.type || 'file',
      size: att.size || 0,
      uploadedAt: att.uploadedAt || new Date()
    }));
};

const socketHandler = (io) => {
  // Authentication middleware for sockets
  io.use(protectSocket);

  io.on('connection', (socket) => {
    // Ensure userId is a string for consistent room naming
    const userIdStr = socket.userId?.toString() || socket.userId;
    console.log(`✅ User connected: ${userIdStr}`);

    // Join user's personal room (ensure userId is string)
    socket.join(`user:${userIdStr}`);

    // Join project rooms
    socket.on('join:project', (projectId) => {
      socket.join(`project:${projectId}`);
      console.log(`User ${socket.userId} joined project ${projectId}`);
    });

    // Leave project room
    socket.on('leave:project', (projectId) => {
      socket.leave(`project:${projectId}`);
      console.log(`User ${socket.userId} left project ${projectId}`);
    });

    // Join chat room
    socket.on('join:chat', async (chatId) => {
      try {
        const chat = await Chat.findById(chatId);
        if (chat && chat.participants.some(p => p.toString() === socket.userId)) {
          socket.join(`chat:${chatId}`);
          console.log(`User ${socket.userId} joined chat ${chatId}`);
        }
      } catch (error) {
        console.error('Error joining chat:', error);
      }
    });

    // Leave chat room
    socket.on('leave:chat', (chatId) => {
      socket.leave(`chat:${chatId}`);
      console.log(`User ${socket.userId} left chat ${chatId}`);
    });

    // Send message (direct or group)
    socket.on('message:send', async (data) => {
      try {
        console.log('📨 Received message:send event:', data);
        const { chatId, text, replyTo, attachments } = data;
        console.log('📎 Raw attachments received:', {
          type: typeof attachments,
          isArray: Array.isArray(attachments),
          value: attachments
        });
        const sanitizedAttachments = sanitizeAttachments(attachments);
        console.log('📎 Sanitized attachments:', sanitizedAttachments);
        const hasText = text && text.trim().length > 0;
        const attachmentsLabel = sanitizedAttachments.length === 1
          ? '1 attachment'
          : `${sanitizedAttachments.length} attachments`;
        const messagePreview = hasText ? text.trim() : attachmentsLabel;

        // Validate input
        if (!chatId) {
          console.error('❌ Missing chatId');
          socket.emit('message:error', { message: 'Chat ID is required' });
          return;
        }

        if (!hasText && sanitizedAttachments.length === 0) {
          console.error('❌ Missing message content');
          socket.emit('message:error', { message: 'Message must have text or attachments' });
          return;
        }

        // Verify user is participant
        const chat = await Chat.findById(chatId);
        if (!chat) {
          console.error('❌ Chat not found:', chatId);
          socket.emit('message:error', { message: 'Chat not found' });
          return;
        }

        const isParticipant = chat.participants.some(
          p => p.toString() === socket.userId
        );

        if (!isParticipant) {
          console.error('❌ User not a participant:', { userId: socket.userId, chatId });
          socket.emit('message:error', { message: 'Not authorized' });
          return;
        }

        console.log('✅ Creating message:', { chatId, sender: socket.userId, text: messagePreview.substring(0, 50) });

        // Extract mentions from data
        const mentionedUsers = data.mentionedUsers || [];
        const mentionAll = data.mentionAll || false;

        // Create message
        const message = await Message.create({
          chat: chatId,
          sender: socket.userId,
          text: hasText ? text.trim() : '',
          replyTo,
          attachments: sanitizedAttachments,
          mentionedUsers: mentionedUsers,
          mentionAll: mentionAll
        });

        console.log('✅ Message created:', message._id);

        await message.populate('sender', 'name email avatar');
        await message.populate('chat', 'type name participants');
        await message.populate('reactions.user', 'name email avatar');
        await message.populate('mentionedUsers', 'name email avatar');
        if (replyTo) {
          await message.populate({
            path: 'replyTo',
            populate: { path: 'sender', select: 'name email avatar' }
          });
        }

        // Update chat last message
        chat.lastMessage = message._id;
        chat.lastMessageAt = new Date();
        
        // Check if any recipient has deleted the chat and restore it for them
        const otherParticipants = chat.participants.filter(
          p => p.toString() !== socket.userId
        );
        
        const restoredParticipants = [];
        for (const participantId of otherParticipants) {
          const participantIdStr = participantId.toString();
          const hasDeleted = chat.deletedBy.some(
            db => db.toString() === participantIdStr
          );
          
          if (hasDeleted) {
            // Restore chat for this participant
            chat.deletedBy = chat.deletedBy.filter(
              db => db.toString() !== participantIdStr
            );
            // Set messagesVisibleFrom to current time - only show new message and future messages
            if (!chat.messagesVisibleFrom) {
              chat.messagesVisibleFrom = {};
            }
            // Mongoose Map: use set method or direct assignment
            if (chat.messagesVisibleFrom instanceof Map) {
              chat.messagesVisibleFrom.set(participantIdStr, new Date());
            } else {
              // If it's not a Map yet, convert it
              const map = new Map(Object.entries(chat.messagesVisibleFrom || {}));
              map.set(participantIdStr, new Date());
              chat.messagesVisibleFrom = map;
            }
            restoredParticipants.push(participantIdStr);
          }
        }
        
        await chat.save();

        // Mark as read by sender
        message.readBy.push({
          user: socket.userId,
          readAt: new Date()
        });
        await message.save();

        // Convert to plain object for socket emission (adds signed URLs to attachments)
        const messageObj = formatMessageForClient(message);
        
        // Ensure sender is in the chat room before emitting
        socket.join(`chat:${chatId}`);
        
        // Emit to all participants in the chat (including sender)
        // No need to emit directly to sender since they're already in the room
        io.to(`chat:${chatId}`).emit('message:new', messageObj);
        
        // If chat was restored for any participants, notify them
        if (restoredParticipants.length > 0) {
          // Populate chat for restored participants
          await chat.populate('participants', 'name email avatar');
          await chat.populate('createdBy', 'name email avatar');
          await chat.populate('lastMessage');
          
          const chatObj = chat.toObject();
          
          restoredParticipants.forEach(participantId => {
            // Emit chat:restored event with the chat object and new message
            io.to(`user:${participantId}`).emit('chat:restored', {
              chat: chatObj,
              newMessage: messageObj
            });
          });
        }
        
        console.log(`📤 Emitted message:new to chat:${chatId}`, {
          messageId: message._id,
          chatId: chatId,
          sender: message.sender.name,
          senderId: socket.userId,
          restoredFor: restoredParticipants
        });

        // Send notifications to other participants
        // For direct messages: always notify the other participant
        // For group messages: notify all participants (they can mute later if needed)
        // Special handling for mentions: use mention/mention_all type if user is mentioned
        const usersToNotify = otherParticipants;

        for (const participantId of usersToNotify) {
          const participantIdStr = extractUserId(participantId);
          const notificationType = mentionAll 
            ? 'mention_all' 
            : (mentionedUsers.includes(participantIdStr) ? 'mention' : (chat.type === 'direct' ? 'message' : 'group_message'));
          
          const notification = await Notification.create({
            user: participantIdStr,
            type: notificationType,
            title: mentionAll 
              ? 'You were mentioned (@all)' 
              : (mentionedUsers.includes(participantIdStr) ? 'You were mentioned' : (chat.type === 'direct' ? 'New Message' : 'New Group Message')),
            message: `${message.sender.name}: ${messagePreview.substring(0, 100)}`,
            relatedTask: null,
            relatedProject: null
          });

          // Emit notification to user if online
          io.to(`user:${participantIdStr}`).emit('notification:new', {
            _id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            relatedTask: notification.relatedTask,
            relatedProject: notification.relatedProject,
            isRead: notification.isRead,
            createdAt: notification.createdAt
          });
        }
      } catch (error) {
        console.error('❌ Error sending message:', error);
        console.error('❌ Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name,
          data: data
        });
        socket.emit('message:error', { 
          message: error.message || 'Failed to send message',
          details: error.message
        });
      }
    });

    // Typing indicator
    socket.on('typing:start', (data) => {
      const { chatId } = data;
      socket.to(`chat:${chatId}`).emit('user:typing', {
        userId: socket.userId,
        chatId
      });
    });

    socket.on('typing:stop', (data) => {
      const { chatId } = data;
      socket.to(`chat:${chatId}`).emit('user:stopped-typing', {
        userId: socket.userId,
        chatId
      });
    });

    // Mark messages as read
    socket.on('messages:read', async (data) => {
      try {
        const { chatId } = data;

        // Verify user is participant
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.participants.some(p => p.toString() === socket.userId)) {
          return;
        }

        // Mark all unread messages as read
        await Message.updateMany(
          {
            chat: chatId,
            sender: { $ne: socket.userId },
            'readBy.user': { $ne: socket.userId }
          },
          {
            $push: {
              readBy: {
                user: socket.userId,
                readAt: new Date()
              }
            }
          }
        );

        // Notify sender that messages were read
        socket.to(`chat:${chatId}`).emit('messages:read', {
          chatId,
          userId: socket.userId
        });
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    });

    // Edit message
    socket.on('message:edit', async (data) => {
      try {
        const { messageId, text } = data;

        const message = await Message.findById(messageId);
        if (!message || message.sender.toString() !== socket.userId) {
          socket.emit('message:error', { message: 'Not authorized' });
          return;
        }

        message.text = text;
        message.isEdited = true;
        message.editedAt = new Date();
        await message.save();

        await message.populate('sender', 'name email avatar');
        if (message.replyTo) {
          await message.populate({
            path: 'replyTo',
            populate: { path: 'sender', select: 'name email avatar' }
          });
        }
        await message.populate('reactions.user', 'name email avatar');
        await message.populate('mentionedUsers', 'name email avatar');

        io.to(`chat:${message.chat}`).emit('message:edited', message);
      } catch (error) {
        console.error('Error editing message:', error);
        socket.emit('message:error', { message: 'Failed to edit message' });
      }
    });

    // Add/remove reaction to message
    socket.on('message:react', async (data) => {
      try {
        const { messageId, emoji } = data;

        const message = await Message.findById(messageId);
        if (!message) {
          socket.emit('message:error', { message: 'Message not found' });
          return;
        }

        // Verify user is participant in chat
        const chat = await Chat.findById(message.chat);
        if (!chat || !chat.participants.some(p => p.toString() === socket.userId)) {
          socket.emit('message:error', { message: 'Not authorized' });
          return;
        }

        // Check if user already reacted with this emoji
        const existingReactionIndex = message.reactions.findIndex(
          r => r.user.toString() === socket.userId && r.emoji === emoji
        );

        if (existingReactionIndex >= 0) {
          // Remove reaction
          message.reactions.splice(existingReactionIndex, 1);
        } else {
          // Remove any existing reaction from this user (only one reaction per user)
          message.reactions = message.reactions.filter(
            r => r.user.toString() !== socket.userId
          );
          // Add new reaction
          message.reactions.push({
            emoji,
            user: socket.userId
          });
        }

        await message.save();

        // Populate reactions
        await message.populate('reactions.user', 'name email avatar');
        await message.populate('sender', 'name email avatar');
        if (message.replyTo) {
          await message.populate({
            path: 'replyTo',
            populate: { path: 'sender', select: 'name email avatar' }
          });
        }

        // Emit updated message to all participants
        io.to(`chat:${message.chat}`).emit('message:reacted', message.toObject());
      } catch (error) {
        console.error('Error reacting to message:', error);
        socket.emit('message:error', { message: 'Failed to react to message' });
      }
    });

    // Delete message
    socket.on('message:delete', async (data) => {
      try {
        const { messageId } = data;

        const message = await Message.findById(messageId);
        if (!message || message.sender.toString() !== socket.userId) {
          socket.emit('message:error', { message: 'Not authorized' });
          return;
        }

        if (message.attachments && message.attachments.length > 0) {
          for (const attachment of message.attachments) {
            if (attachment.url) {
              try {
                await deleteFileFromS3(attachment.url);
              } catch (error) {
                console.error(`Error deleting attachment during message delete (${attachment.url}):`, error);
              }
            }
          }
          message.attachments = [];
        }

        message.isDeleted = true;
        message.deletedAt = new Date();
        await message.save();

        // Populate sender for the deleted message
        await message.populate('sender', 'name email avatar');
        if (message.replyTo) {
          await message.populate({
            path: 'replyTo',
            populate: { path: 'sender', select: 'name email avatar' }
          });
        }

        // Emit the full updated message object
        io.to(`chat:${message.chat}`).emit('message:deleted', {
          messageId: message._id,
          chatId: message.chat,
          message: message.toObject()
        });
      } catch (error) {
        console.error('Error deleting message:', error);
        socket.emit('message:error', { message: 'Failed to delete message' });
      }
    });

    // Task updates
    socket.on('task:update', (data) => {
      socket.to(`project:${data.projectId}`).emit('task:updated', data);
    });

    // Task creation
    socket.on('task:create', (data) => {
      socket.to(`project:${data.projectId}`).emit('task:created', data);
    });

    // Task deletion
    socket.on('task:delete', (data) => {
      socket.to(`project:${data.projectId}`).emit('task:deleted', data);
    });

    // Comments
    socket.on('comment:add', (data) => {
      socket.to(`project:${data.projectId}`).emit('comment:added', data);
    });

    // Video call signaling (WebRTC)
    socket.on('call:offer', (data) => {
      socket.to(`user:${data.targetUserId}`).emit('call:offer', {
        ...data,
        fromUserId: socket.userId
      });
    });

    socket.on('call:answer', (data) => {
      socket.to(`user:${data.targetUserId}`).emit('call:answer', {
        ...data,
        fromUserId: socket.userId
      });
    });

    socket.on('call:ice-candidate', (data) => {
      socket.to(`user:${data.targetUserId}`).emit('call:ice-candidate', {
        ...data,
        fromUserId: socket.userId
      });
    });

    socket.on('call:end', (data) => {
      socket.to(`user:${data.targetUserId}`).emit('call:ended', {
        fromUserId: socket.userId
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.userId}`);
    });
  });
};

module.exports = socketHandler;
