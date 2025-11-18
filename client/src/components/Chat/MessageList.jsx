import React, { useState } from 'react';
import { Box, Paper, Typography, Avatar, Chip, IconButton, Tooltip, Popover, TextField, Button, Link } from '@mui/material';
import { Reply as ReplyIcon, Delete as DeleteIcon, Edit as EditIcon, EmojiEmotions as EmojiIcon, InsertDriveFile as FileIcon, Forward as ForwardIcon } from '@mui/icons-material';
import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns';

const MessageList = ({ messages, currentUserId, messagesEndRef, onReply, onUnsend, onEdit, onReact, onForward }) => {
  const [hoveredMessage, setHoveredMessage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  const [emojiAnchor, setEmojiAnchor] = useState(null);
  const [emojiMessage, setEmojiMessage] = useState(null);
  const [emojiPosition, setEmojiPosition] = useState(null);

  const formatFileSize = (size) => {
    if (size === undefined || size === null) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getAttachmentUrl = (attachment) => {
    return attachment?.signedUrl || attachment?.previewUrl || attachment?.url;
  };

  const isImageAttachment = (attachment) => {
    const type = attachment?.type || '';
    return type.startsWith('image');
  };

  const getReplyPreviewText = (replyTo) => {
    if (!replyTo) return 'Message deleted';
    
    // If message has text, show it
    if (replyTo.text || replyTo.content) {
      return replyTo.text || replyTo.content;
    }
    
    // If message has attachments
    if (replyTo.attachments && replyTo.attachments.length > 0) {
      // Check if all attachments are images
      const allImages = replyTo.attachments.every(att => isImageAttachment(att));
      if (allImages) {
        return replyTo.attachments.length === 1 ? 'Image attached' : `${replyTo.attachments.length} images attached`;
      }
      // Check if any attachment is an image
      const hasImages = replyTo.attachments.some(att => isImageAttachment(att));
      if (hasImages) {
        return 'File attached';
      }
      // All are non-image files
      return replyTo.attachments.length === 1 ? 'File attached' : `${replyTo.attachments.length} files attached`;
    }
    
    // No text and no attachments
    return 'Message deleted';
  };

  const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏'];

  const handleReply = (message) => {
    if (message && onReply) {
      onReply(message);
    }
  };

  const handleUnsend = (message) => {
    if (message && onUnsend) {
      onUnsend(message);
    }
  };

  const handleEdit = (message) => {
    setEditingMessage(message);
    setEditText(message.text || message.content || '');
  };

  const handleSaveEdit = () => {
    if (editingMessage && onEdit && editText.trim()) {
      onEdit(editingMessage, editText.trim());
      setEditingMessage(null);
      setEditText('');
    }
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setEditText('');
  };

  const handleEmojiClick = (event, message) => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    // Position popover above the button (estimate popover height ~80px, button height 28px)
    // Position the bottom of popover at the top of button with 4px gap
    setEmojiPosition({
      top: rect.top - 4, // 4px gap above button
      left: rect.left + rect.width / 2, // Center horizontally
    });
    setEmojiAnchor(button);
    setEmojiMessage(message);
  };

  const handleEmojiSelect = (emoji) => {
    if (emojiMessage && onReact) {
      onReact(emojiMessage, emoji);
    }
    setEmojiAnchor(null);
    setEmojiMessage(null);
    setEmojiPosition(null);
  };

  const getReactionCount = (message, emoji) => {
    if (!message.reactions || !Array.isArray(message.reactions)) return 0;
    return message.reactions.filter(r => r.emoji === emoji).length;
  };

  const hasUserReacted = (message, emoji) => {
    if (!message.reactions || !Array.isArray(message.reactions)) return false;
    const currentUserIdStr = currentUserId?.toString() || currentUserId;
    return message.reactions.some(
      r => r.emoji === emoji && (r.user?._id?.toString() || r.user?._id || r.user?.toString() || r.user) === currentUserIdStr
    );
  };

  const formatMessageTime = (date) => {
    const messageDate = new Date(date);
    if (isToday(messageDate)) {
      return format(messageDate, 'HH:mm');
    } else if (isYesterday(messageDate)) {
      return `Yesterday ${format(messageDate, 'HH:mm')}`;
    } else {
      return format(messageDate, 'MMM dd, HH:mm');
    }
  };

  // Function to detect URLs and mentions, and render them appropriately
  const renderMessageWithLinksAndMentions = (text, isOwn, mentionedUsers = [], mentionAll = false) => {
    if (!text) return null;

    const parts = [];
    let lastIndex = 0;

    // Combined regex for mentions (@username or @all) and URLs
    // Mentions: @username or @all (followed by space, punctuation, or end of string)
    // URLs: http://, https://, or www.
    const combinedRegex = /(@\w+|@all|https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    let match;

    while ((match = combinedRegex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: text.substring(lastIndex, match.index)
        });
      }

      const matchedText = match[0];
      
      // Check if it's a mention
      if (matchedText.startsWith('@')) {
        if (matchedText === '@all') {
          parts.push({
            type: 'mention',
            content: '@all',
            isAll: true
          });
        } else {
          // Check if this mention matches a mentioned user
          const username = matchedText.substring(1);
          const mentionedUser = mentionedUsers.find(u => 
            u.name?.toLowerCase() === username.toLowerCase() ||
            u.name?.toLowerCase().includes(username.toLowerCase())
          );
          
          if (mentionedUser || mentionedUsers.length > 0) {
            parts.push({
              type: 'mention',
              content: matchedText,
              user: mentionedUser
            });
          } else {
            // Not a valid mention, treat as text
            parts.push({
              type: 'text',
              content: matchedText
            });
          }
        }
      } else {
        // It's a URL
        let url = matchedText;
        if (url.startsWith('www.')) {
          url = 'https://' + url;
        }
        parts.push({
          type: 'link',
          content: matchedText,
          url: url
        });
      }

      lastIndex = match.index + matchedText.length;
    }

    // Add remaining text after the last match
    if (lastIndex < text.length) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex)
      });
    }

    // If no special parts found, return the text as is
    if (parts.length === 0) {
      return <>{text}</>;
    }

    // Render parts with links and mentions
    return (
      <>
        {parts.map((part, index) => {
          if (part.type === 'link') {
            return (
              <Link
                key={index}
                href={part.url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: isOwn ? '#ffffff' : '#0084ff',
                  textDecoration: 'underline',
                  textDecorationColor: isOwn ? 'rgba(255, 255, 255, 0.7)' : '#0084ff',
                  '&:hover': {
                    textDecorationColor: isOwn ? '#ffffff' : '#0066cc',
                  },
                  wordBreak: 'break-all',
                }}
              >
                {part.content}
              </Link>
            );
          } else if (part.type === 'mention') {
            return (
              <Box
                key={index}
                component="span"
                sx={{
                  color: isOwn ? '#ffffff' : '#0084ff',
                  fontWeight: 600,
                  bgcolor: isOwn ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 132, 255, 0.1)',
                  px: 0.5,
                  py: 0.25,
                  borderRadius: '4px',
                  display: 'inline-block',
                }}
              >
                {part.content}
              </Box>
            );
          }
          return <span key={index}>{part.content}</span>;
        })}
      </>
    );
  };

  const groupMessagesByDate = (messages) => {
    // Ensure messages are sorted by createdAt (oldest first)
    const sortedMessages = [...messages].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0);
      const dateB = new Date(b.createdAt || 0);
      return dateA - dateB; // Ascending order (oldest first)
    });

    const grouped = [];
    let currentGroup = null;

    sortedMessages.forEach((message) => {
      const messageDate = new Date(message.createdAt);
      const dateKey = format(messageDate, 'yyyy-MM-dd');

      if (!currentGroup || currentGroup.date !== dateKey) {
        if (currentGroup) {
          grouped.push(currentGroup);
        }
        currentGroup = {
          date: dateKey,
          dateLabel: isToday(messageDate)
            ? 'Today'
            : isYesterday(messageDate)
            ? 'Yesterday'
            : format(messageDate, 'MMMM dd, yyyy'),
          messages: []
        };
      }

      currentGroup.messages.push(message);
    });

    if (currentGroup) {
      grouped.push(currentGroup);
    }

    return grouped;
  };

  const groupedMessages = groupMessagesByDate(messages);

  if (messages.length === 0) {
    return (
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Typography variant="body2" color="textSecondary">
          No messages yet. Start the conversation!
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', py: 1 }}>
      {groupedMessages.map((group) => (
        <Box key={group.date}>
          {/* Date Separator */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              my: 2
            }}
          >
            <Chip
              label={group.dateLabel}
              size="small"
              sx={{ 
                bgcolor: '#e4e6eb',
                color: '#8a8d91',
                fontWeight: 600,
                fontSize: '0.75rem',
                height: 24,
                border: 'none',
                '& .MuiChip-label': {
                  px: 1.5,
                },
              }}
            />
          </Box>

          {/* Messages */}
          {group.messages.map((message, index) => {
            const senderId = message.sender?._id?.toString() || message.sender?._id || message.sender?.toString() || message.sender;
            const currentUserIdStr = currentUserId?.toString() || currentUserId;
            const isOwn = senderId === currentUserIdStr;
            const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
            const hasText = Boolean(message.text || message.content);
            const prevMessage = index > 0 ? group.messages[index - 1] : null;
            const nextMessage = index < group.messages.length - 1 ? group.messages[index + 1] : null;
            const prevSenderId = prevMessage ? (prevMessage.sender?._id?.toString() || prevMessage.sender?._id || prevMessage.sender?.toString() || prevMessage.sender) : null;
            const nextSenderId = nextMessage ? (nextMessage.sender?._id?.toString() || nextMessage.sender?._id || nextMessage.sender?.toString() || nextMessage.sender) : null;
            
            // Show avatar only for first message from a sender
            const showAvatar = !isOwn && (index === 0 || prevSenderId !== senderId);
            // Group messages from same sender together (less spacing)
            const isGrouped = prevSenderId === senderId;
            // Show timestamp only for last message in a group or every 5 messages
            const showTimestamp = nextSenderId !== senderId || index % 5 === 0 || index === group.messages.length - 1;

            if (message.isSystem) {
              return (
                <Box
                  key={message._id || `${group.date}-${index}`}
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    my: 1,
                    px: 2,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      bgcolor: '#e4e6eb',
                      color: '#65676b',
                      px: 1.5,
                      py: 0.5,
                      borderRadius: '12px',
                      fontStyle: 'italic',
                      fontSize: '0.75rem',
                    }}
                  >
                    {message.text}
                  </Typography>
                </Box>
              );
            }

            return (
              <Box
                key={message._id}
                data-message-id={message._id}
                onMouseEnter={() => setHoveredMessage(message._id)}
                onMouseLeave={() => setHoveredMessage(null)}
                sx={{
                  display: 'flex',
                  justifyContent: isOwn ? 'flex-end' : 'flex-start',
                  mb: isGrouped ? 0.125 : 0.75,
                  px: 2,
                  py: 0,
                  alignItems: 'flex-end',
                  position: 'relative',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: isOwn ? 'row-reverse' : 'row',
                    alignItems: isOwn ? 'flex-end' : 'flex-start',
                    gap: isOwn ? 0 : (showAvatar ? 0.5 : 0),
                    maxWidth: '65%',
                    minWidth: 0,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {/* Avatar (only for others, and only when needed) */}
                  {!isOwn && (
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'center',
                        pt: 0,
                      }}
                    >
                      <Avatar
                        src={message.sender?.avatar || message.sender?.avatarUrl || undefined}
                        sx={{
                          width: showAvatar ? 32 : 0,
                          height: showAvatar ? 32 : 0,
                          bgcolor: '#e4e6eb',
                          color: '#1c1e21',
                          display: showAvatar ? 'flex' : 'none',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          opacity: showAvatar ? 1 : 0,
                          transition: 'opacity 0.2s',
                        }}
                      >
                        {(message.sender?.name || message.sender?.name)?.charAt(0).toUpperCase() || 'U'}
                      </Avatar>
                    </Box>
                  )}

                  {/* Message Bubble */}
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isOwn ? 'flex-end' : 'flex-start',
                      minWidth: 0,
                      flex: 1,
                      maxWidth: isOwn ? '100%' : 'calc(100% - 40px)',
                      position: 'relative',
                    }}
                  >
                    <Box
                      sx={{
                        position: 'relative',
                      bgcolor: hasAttachments && !hasText ? 'transparent' : (isOwn ? '#0084ff' : '#e4e6eb'),
                      color: hasAttachments && !hasText ? (isOwn ? '#ffffff' : '#1c1e21') : (isOwn ? '#ffffff' : '#1c1e21'),
                      borderRadius: hasAttachments && !hasText ? 0 : '18px',
                      // Messenger-style rounded corners - more rounded when not grouped
                      borderTopLeftRadius: hasAttachments && !hasText ? 0 : (isOwn ? '18px' : (isGrouped ? '4px' : '18px')),
                      borderTopRightRadius: hasAttachments && !hasText ? 0 : (isOwn ? (isGrouped ? '4px' : '18px') : '18px'),
                      borderBottomLeftRadius: hasAttachments && !hasText ? 0 : '18px',
                      borderBottomRightRadius: hasAttachments && !hasText ? 0 : '18px',
                      px: hasAttachments && !hasText ? 0 : 1.25,
                      py: hasAttachments && !hasText ? 0 : 0.625,
                        maxWidth: '100%',
                        wordBreak: 'break-word',
                        opacity: message.isOptimistic ? 0.7 : 1,
                        transition: 'opacity 0.2s',
                        boxShadow: 'none',
                        alignSelf: isOwn ? 'flex-end' : 'flex-start',
                      }}
                    >
                      {/* Message Actions Buttons (Messenger-style) - positioned relative to actual bubble */}
                      {!message.isDeleted && hoveredMessage === message._id && (
                        <Box
                          sx={{
                            position: 'absolute',
                            // For own messages: buttons on the LEFT side of bubble
                            // For received messages: buttons on the RIGHT side of bubble
                            [isOwn ? 'right' : 'left']: isOwn ? 'calc(100% + 0px)' : 'calc(100% + 0px)',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            display: 'flex',
                            gap: 0.25,
                            alignItems: 'center',
                            zIndex: 10,
                            bgcolor: 'background.paper',
                            borderRadius: '20px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                            p: 0.25,
                            // Small gap like Messenger - just a tiny bit of space
                            [isOwn ? 'marginRight' : 'marginLeft']: '-1px',
                          }}
                        >
                          {/* Reply Button (for all messages) */}
                          <Tooltip title="Reply" placement="top">
                            <IconButton
                              size="small"
                              onClick={() => handleReply(message)}
                              sx={{
                                width: 28,
                                height: 28,
                                color: '#65676b',
                                '&:hover': {
                                  bgcolor: '#e4e6eb',
                                  color: '#0084ff',
                                },
                                transition: 'all 0.2s',
                              }}
                            >
                              <ReplyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {/* Forward Button (for all non-system messages) */}
                          {!message.isSystem && onForward && (
                            <Tooltip title="Forward" placement="top">
                              <IconButton
                                size="small"
                                onClick={() => onForward(message)}
                                sx={{
                                  width: 28,
                                  height: 28,
                                  color: '#65676b',
                                  '&:hover': {
                                    bgcolor: '#e4e6eb',
                                    color: '#10b981',
                                  },
                                  transition: 'all 0.2s',
                                }}
                              >
                                <ForwardIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {/* Emoji/Reaction Button (for all messages) */}
                          <Tooltip title="Add reaction" placement="top">
                            <IconButton
                              size="small"
                              onClick={(e) => handleEmojiClick(e, message)}
                              sx={{
                                width: 28,
                                height: 28,
                                color: '#65676b',
                                '&:hover': {
                                  bgcolor: '#e4e6eb',
                                  color: '#0084ff',
                                },
                                transition: 'all 0.2s',
                              }}
                            >
                              <EmojiIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {/* Edit Button (only for own text-only messages, not for image/file attachments – Messenger-style) */}
                          {isOwn && !hasAttachments && (
                            <Tooltip title="Edit" placement="top">
                              <IconButton
                                size="small"
                                onClick={() => handleEdit(message)}
                                sx={{
                                  width: 28,
                                  height: 28,
                                  color: '#65676b',
                                  '&:hover': {
                                    bgcolor: '#e4e6eb',
                                    color: '#0084ff',
                                  },
                                  transition: 'all 0.2s',
                                }}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {/* Unsend Button (only for own messages) */}
                          {isOwn && (
                            <Tooltip title="Unsend" placement="top">
                              <IconButton
                                size="small"
                                onClick={() => handleUnsend(message)}
                                sx={{
                                  width: 28,
                                  height: 28,
                                  color: '#65676b',
                                  '&:hover': {
                                    bgcolor: '#e4e6eb',
                                    color: '#ef4444',
                                  },
                                  transition: 'all 0.2s',
                                }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      )}
                      {message.isDeleted ? (
                        <Typography
                          variant="body2"
                          sx={{ 
                            fontStyle: 'italic', 
                            opacity: 0.7, 
                            color: isOwn ? 'rgba(255, 255, 255, 0.8)' : '#8a8d91',
                            fontSize: '0.9375rem',
                            lineHeight: 1.33,
                          }}
                        >
                          This message was deleted
                        </Typography>
                      ) : (
                        <>
                          {/* Reply Preview */}
                          {message.replyTo && (
                            <Box
                              sx={{
                                borderLeft: `3px solid ${isOwn ? 'rgba(255, 255, 255, 0.5)' : '#0084ff'}`,
                                pl: 1,
                                mb: 0.75,
                                py: 0.5,
                                bgcolor: isOwn ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.05)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                '&:hover': {
                                  bgcolor: isOwn ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.08)',
                                },
                              }}
                              onClick={() => {
                                // Scroll to replied message
                                const repliedMessage = messages.find(m => m._id === message.replyTo?._id || m._id === message.replyTo);
                                if (repliedMessage) {
                                  const element = document.querySelector(`[data-message-id="${repliedMessage._id}"]`);
                                  element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                              }}
                            >
                              <Typography
                                variant="caption"
                                sx={{
                                  fontWeight: 600,
                                  color: isOwn ? 'rgba(255, 255, 255, 0.9)' : '#0084ff',
                                  fontSize: '0.75rem',
                                  display: 'block',
                                  mb: 0.25,
                                }}
                              >
                                {message.replyTo?.sender?.name || 'Unknown'}
                              </Typography>
                              <Typography
                                variant="caption"
                                component="div"
                                sx={{
                                  color: isOwn ? 'rgba(255, 255, 255, 0.7)' : '#65676b',
                                  fontSize: '0.75rem',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 1,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {renderMessageWithLinksAndMentions(
                                  getReplyPreviewText(message.replyTo),
                                  isOwn,
                                  message.replyTo?.mentionedUsers || [],
                                  message.replyTo?.mentionAll || false
                                )}
                              </Typography>
                            </Box>
                          )}
                          {/* Forwarded Indicator */}
                          {message.forwardedFrom && (
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                mb: 0.5,
                              }}
                            >
                              <ForwardIcon 
                                sx={{ 
                                  fontSize: '0.875rem', 
                                  color: isOwn ? 'rgba(255, 255, 255, 0.7)' : '#65676b' 
                                }} 
                              />
                              <Typography
                                variant="caption"
                                sx={{
                                  fontStyle: 'italic',
                                  color: isOwn ? 'rgba(255, 255, 255, 0.7)' : '#65676b',
                                  fontSize: '0.75rem',
                                }}
                              >
                                Forwarded from {message.forwardedFrom.name}
                              </Typography>
                            </Box>
                          )}
                          {/* Attachments */}
                          {message.attachments && message.attachments.length > 0 && (
                            <Box
                              sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 0.75,
                                mt: message.text ? 0.75 : 0,
                              }}
                            >
                              {message.attachments.map((attachment, index) => {
                                const url = getAttachmentUrl(attachment);
                                const imageAttachment = isImageAttachment(attachment);
                                if (imageAttachment && url) {
                                  return (
                                    <Box
                                      key={index}
                                      component="img"
                                      src={url}
                                      alt={attachment.name || 'Image attachment'}
                                      onClick={() => window.open(url, '_blank', 'noopener')}
                                      sx={{
                                        maxWidth: 260,
                                        borderRadius: 2,
                                        cursor: 'pointer',
                                        border: isOwn ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.1)',
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                                        display: 'block'
                                      }}
                                    />
                                  );
                                }
                                return (
                                  <Paper
                                    key={index}
                                    elevation={isOwn ? 3 : 1}
                                    sx={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 1.25,
                                      px: 1.75,
                                      py: 1.1,
                                      borderRadius: 999,
                                      minWidth: 230,
                                      maxWidth: 340,
                                      bgcolor: isOwn ? 'rgba(0,132,255,0.06)' : '#ffffff',
                                      color: '#050505',
                                      border: isOwn ? '1px solid rgba(0,132,255,0.35)' : '1px solid #d0d3d8',
                                      boxShadow: isOwn
                                        ? '0 4px 10px rgba(0,132,255,0.18)'
                                        : '0 2px 6px rgba(0,0,0,0.06)',
                                    }}
                                  >
                                    <Box
                                      sx={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 1,
                                        bgcolor: isOwn ? 'rgba(255,255,255,0.18)' : '#ffffff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                      }}
                                    >
                                      <FileIcon
                                        sx={{
                                          fontSize: 18,
                                          color: isOwn ? '#ffffff' : '#0084ff',
                                        }}
                                      />
                                    </Box>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                      <Typography
                                        variant="body2"
                                        sx={{
                                          fontSize: '0.9rem',
                                          fontWeight: 600,
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                        }}
                                      >
                                        {attachment.name || 'Attachment'}
                                      </Typography>
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          color: '#0084ff',
                                          fontSize: '0.75rem',
                                        }}
                                      >
                                        {formatFileSize(attachment.size)}
                                      </Typography>
                                    </Box>
                                    {url && (
                                      <Button
                                        size="small"
                                        onClick={() => window.open(url, '_blank', 'noopener')}
                                        sx={{
                                          textTransform: 'none',
                                          fontSize: '0.75rem',
                                          fontWeight: 600,
                                          color: '#0084ff',
                                          minWidth: 0,
                                          px: 1.25,
                                          '&:hover': {
                                            bgcolor: 'rgba(0,132,255,0.08)',
                                          },
                                        }}
                                      >
                                        Open
                                      </Button>
                                    )}
                                  </Paper>
                                );
                              })}
                            </Box>
                          )}
                          {/* Edit Mode */}
                          {editingMessage && editingMessage._id === message._id ? (
                            <Box sx={{ mt: 0.5 }}>
                              <TextField
                                fullWidth
                                multiline
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                variant="outlined"
                                size="small"
                                autoFocus
                                sx={{
                                  '& .MuiOutlinedInput-root': {
                                    bgcolor: isOwn ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.05)',
                                    color: isOwn ? '#ffffff' : '#1c1e21',
                                    '& fieldset': {
                                      borderColor: isOwn ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
                                    },
                                  },
                                }}
                              />
                              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                                <Button
                                  size="small"
                                  variant="contained"
                                  onClick={handleSaveEdit}
                                  sx={{
                                    bgcolor: '#0084ff',
                                    '&:hover': { bgcolor: '#0066cc' },
                                    textTransform: 'none',
                                  }}
                                >
                                  Save
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={handleCancelEdit}
                                  sx={{
                                    borderColor: isOwn ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
                                    color: isOwn ? '#ffffff' : '#1c1e21',
                                    textTransform: 'none',
                                  }}
                                >
                                  Cancel
                                </Button>
                              </Box>
                            </Box>
                          ) : (
                            <>
                              {(message.text || message.content) && (
                                <>
                                  <Typography 
                                    variant="body1" 
                                    component="div"
                                    sx={{ 
                                      wordBreak: 'break-word',
                                      color: isOwn ? '#ffffff' : '#1c1e21',
                                      fontSize: '0.9375rem',
                                      lineHeight: 1.33,
                                      fontWeight: 400,
                                      whiteSpace: 'pre-wrap',
                                    }}
                                  >
                                    {renderMessageWithLinksAndMentions(
                                      message.text || message.content || '', 
                                      isOwn,
                                      message.mentionedUsers || [],
                                      message.mentionAll || false
                                    )}
                                  </Typography>
                                  {message.isEdited && (
                                    <Typography
                                      variant="caption"
                                      sx={{ 
                                        opacity: 0.7, 
                                        fontStyle: 'italic', 
                                        display: 'block', 
                                        mt: 0.25,
                                        color: isOwn ? 'rgba(255, 255, 255, 0.7)' : '#8a8d91',
                                        fontSize: '0.75rem',
                                      }}
                                    >
                                      (edited)
                                    </Typography>
                                  )}
                                </>
                              )}
                              {message.attachments && message.attachments.length > 0 && message.isEdited && !(message.text || message.content) && (
                                <Typography
                                  variant="caption"
                                  sx={{ 
                                    opacity: 0.7, 
                                    fontStyle: 'italic', 
                                    display: 'block', 
                                    mt: 0.25,
                                    color: isOwn ? 'rgba(255, 255, 255, 0.7)' : '#8a8d91',
                                    fontSize: '0.75rem',
                                  }}
                                >
                                  (edited)
                                </Typography>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </Box>
                    {/* Reactions Display */}
                    {!message.isDeleted && message.reactions && message.reactions.length > 0 && (
                      <Box
                        sx={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 0.5,
                          mt: 0.5,
                          alignSelf: isOwn ? 'flex-end' : 'flex-start',
                        }}
                      >
                        {Array.from(new Set(message.reactions.map(r => r.emoji))).map((emoji) => {
                          const count = getReactionCount(message, emoji);
                          const userReacted = hasUserReacted(message, emoji);
                          return (
                            <Chip
                              key={emoji}
                              label={`${emoji} ${count}`}
                              size="small"
                              onClick={() => handleEmojiSelect(emoji)}
                              sx={{
                                height: 20,
                                fontSize: '0.75rem',
                                bgcolor: userReacted ? '#e3f2fd' : '#f0f2f5',
                                border: userReacted ? '1px solid #0084ff' : 'none',
                                cursor: 'pointer',
                                '&:hover': {
                                  bgcolor: userReacted ? '#bbdefb' : '#e4e6eb',
                                },
                                '& .MuiChip-label': {
                                  px: 0.75,
                                  py: 0,
                                },
                              }}
                            />
                          );
                        })}
                      </Box>
                    )}
                    {showTimestamp && (
                      <Typography
                        variant="caption"
                        sx={{ 
                          mt: 0.25,
                          px: 0.75,
                          fontSize: '0.6875rem',
                          color: '#8a8d91',
                          fontWeight: 400,
                          alignSelf: isOwn ? 'flex-end' : 'flex-start',
                        }}
                      >
                        {formatMessageTime(message.createdAt)}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      ))}
      <div ref={messagesEndRef} />
      
      {/* Emoji Picker Popover */}
      {emojiAnchor && emojiPosition && (
        <Popover
          open={Boolean(emojiAnchor)}
          anchorReference="anchorPosition"
          anchorPosition={{
            top: emojiPosition.top,
            left: emojiPosition.left,
          }}
          onClose={() => {
            setEmojiAnchor(null);
            setEmojiMessage(null);
            setEmojiPosition(null);
          }}
          transformOrigin={{
            vertical: 'bottom',
            horizontal: 'center',
          }}
          PaperProps={{
            sx: {
              p: 1,
              borderRadius: 2,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            },
          }}
        >
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', minWidth: 200 }}>
            {commonEmojis.map((emoji) => (
              <IconButton
                key={emoji}
                onClick={() => handleEmojiSelect(emoji)}
                sx={{
                  fontSize: '1.5rem',
                  width: 36,
                  height: 36,
                  '&:hover': {
                    bgcolor: '#e4e6eb',
                    transform: 'scale(1.2)',
                  },
                  transition: 'all 0.2s',
                }}
              >
                {emoji}
              </IconButton>
            ))}
          </Box>
        </Popover>
      )}
    </Box>
  );
};

export default MessageList;

