import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  IconButton,
  Avatar,
  Chip,
  Fab,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Alert,
  Tooltip,
} from '@mui/material';
import {
  Send as SendIcon,
  AttachFile as AttachFileIcon,
  Add as AddIcon,
  Close as CloseIcon,
  InsertDriveFile as FileIcon,
  Group as GroupIcon,
  Edit as EditIcon,
  Summarize as SummarizeIcon,
} from '@mui/icons-material';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../hooks/useAuth';
import { chatService } from '../../services/chatService';
import { userService } from '../../services/userService';
import ChatList from '../../components/Chat/ChatList';
import MessageList from '../../components/Chat/MessageList';
import NewChatDialog from '../../components/Chat/NewChatDialog';
import MentionPopup from '../../components/Chat/MentionPopup';
import ManageMembersDialog from '../../components/Chat/ManageMembersDialog';
import EditChatDialog from '../../components/Chat/EditChatDialog';
import ForwardMessageDialog from '../../components/Chat/ForwardMessageDialog';
import Loading from '../../components/Common/Loading';

const Chat = () => {
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [manageMembersOpen, setManageMembersOpen] = useState(false);
  const [editChatOpen, setEditChatOpen] = useState(false);
  const [forwardMessageOpen, setForwardMessageOpen] = useState(false);
  const [messageToForward, setMessageToForward] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [mentionPopup, setMentionPopup] = useState({ show: false, position: null, search: '' });
  const [mentionUsers, setMentionUsers] = useState([]);
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [chatSummary, setChatSummary] = useState(null);
  const [summaryError, setSummaryError] = useState('');
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const restoredChatsRef = useRef(new Set());
  const joinedChatsRef = useRef(new Set());
  const messageInputRef = useRef(null);
  const attachmentInputRef = useRef(null);
  // Track processed message IDs to prevent duplicates even in race conditions
  const processedMessageIdsRef = useRef(new Set());

  const { socket, connected } = useSocket();
  const { user } = useAuth();

  const getIdString = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      if (value._id) return value._id.toString();
      if (typeof value.toString === 'function') return value.toString();
    }
    return String(value);
  };

  const sortChatsByRecent = (list = []) => {
    return [...list].sort((a, b) => {
      const dateA = new Date(a?.lastMessageAt || a?.createdAt || 0);
      const dateB = new Date(b?.lastMessageAt || b?.createdAt || 0);
      return dateB - dateA;
    });
  };

  const updateChatPreviewFromMessage = (chatId, latestMessage) => {
    if (!chatId || !latestMessage) return;

    const latestCreatedAt = latestMessage.createdAt || new Date().toISOString();
    const latestTimestamp = new Date(latestCreatedAt).getTime();
    const latestMessageId = latestMessage._id?.toString() || latestMessage._id;

    setChats((prevChats) => {
      let didUpdate = false;
      const updatedChats = prevChats.map((chat) => {
        const chatIdStr = getIdString(chat._id);
        if (chatIdStr !== chatId) return chat;

        const currentLastAt = chat.lastMessageAt ? new Date(chat.lastMessageAt).getTime() : null;
        const currentLastId = chat.lastMessage?._id?.toString() || chat.lastMessage?._id;

        didUpdate = true;
        return {
          ...chat,
          lastMessage: latestMessage,
          lastMessageAt: latestCreatedAt
        };
      });

      return didUpdate ? sortChatsByRecent(updatedChats) : prevChats;
    });

    setSelectedChat((prevSelected) => {
      if (!prevSelected) return prevSelected;
      const prevId = getIdString(prevSelected._id);
      if (prevId !== chatId) return prevSelected;

      const currentLastAt = prevSelected.lastMessageAt ? new Date(prevSelected.lastMessageAt).getTime() : null;
      const currentLastId = prevSelected.lastMessage?._id?.toString() || prevSelected.lastMessage?._id;

      const isNewer = currentLastAt === null || latestTimestamp > currentLastAt;
      const isDifferentMessage = latestMessageId && latestMessageId !== currentLastId;

      if (!isNewer && !isDifferentMessage) {
        return prevSelected;
      }

      return {
        ...prevSelected,
        lastMessage: latestMessage,
        lastMessageAt: latestCreatedAt
      };
    });
  };

  const enhanceChat = (chat, overrides = {}) => {
    if (!chat) return chat;
    
    // Check if current user is a former participant (kicked/removed)
    const isFormerParticipant = chat.formerParticipants?.some(
      fp => getIdString(fp._id || fp) === getIdString(user._id)
    );
    
    // Check if current user is still an active participant
    const isActiveParticipant = chat.participants?.some(
      p => getIdString(p._id || p) === getIdString(user._id)
    );
    
    // User has left if they're a former participant OR explicitly marked as hasLeft
    const hasLeft = overrides.hasLeft ?? (isFormerParticipant || Boolean(chat.hasLeft));
    
    return {
      ...chat,
      hasLeft,
      isFormerParticipant
    };
  };

  const getSentimentColor = (sentiment = 'neutral') => {
    const value = (sentiment || '').toLowerCase();
    if (value === 'positive') return 'success';
    if (value === 'negative') return 'error';
    return 'default';
  };

  const markChatLeftState = (chatId, hasLeftValue) => {
    setChats((prev) =>
      prev.map((chat) =>
        getIdString(chat._id) === chatId ? { ...chat, hasLeft: hasLeftValue } : chat
      )
    );
    setSelectedChat((prev) => {
      if (!prev || getIdString(prev._id) !== chatId) return prev;
      if (hasLeftValue) {
        setPendingAttachments([]);
        setMessageText('');
      }
      return { ...prev, hasLeft: hasLeftValue };
    });
  };

  // Fetch chats on mount
  useEffect(() => {
    const fetchChats = async () => {
      try {
        const data = await chatService.getChats();
        const enhanced = Array.isArray(data) ? data.map((chat) => enhanceChat(chat)) : [];
        const sortedChats = sortChatsByRecent(enhanced);
        setChats(sortedChats);
        if (sortedChats.length > 0 && !selectedChat) {
          setSelectedChat(enhanceChat(sortedChats[0]));
        }
      } catch (error) {
        console.error('Error fetching chats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchChats();
  }, []);

  // Fetch messages when chat is selected
  useEffect(() => {
    if (selectedChat) {
      const chatId = selectedChat._id?.toString() || selectedChat._id;
      
      // Clear processed message IDs when switching chats to prevent stale data
      processedMessageIdsRef.current.clear();
      
      // Skip fetching if this chat was just restored (we already have the new message)
      if (restoredChatsRef.current.has(chatId)) {
        restoredChatsRef.current.delete(chatId);
        return;
      }
      
      const fetchMessages = async () => {
        try {
          console.log('📨 Fetching messages for chat:', chatId);
          const response = await chatService.getMessages(selectedChat._id);
          const fetchedMessages = response.data || response || [];
          console.log('📨 Fetched messages count:', fetchedMessages.length);
          
          // Backend returns messages in ascending order (oldest first), so we keep that order
          // Sort to ensure proper order (oldest first)
          const sortedMessages = [...fetchedMessages].sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateA - dateB; // Ascending order (oldest first)
          });
          
          // Mark all fetched messages as processed to prevent duplicates from WebSocket
          sortedMessages.forEach(msg => {
            const msgId = msg._id?.toString() || msg._id;
            if (msgId) {
              processedMessageIdsRef.current.add(msgId);
            }
          });
          
          const latestFetchedMessage = sortedMessages[sortedMessages.length - 1] || null;
          
          // Preserve optimistic messages when fetching
          setMessages((prev) => {
            const optimisticMessages = prev.filter(msg => {
              if (!msg.isOptimistic) return false;
              const msgChatId = getIdString(msg.chat);
              const selectedChatId = getIdString(selectedChat._id);
              return msgChatId === selectedChatId;
            });
            // Combine and sort again to maintain order
            const combined = [...sortedMessages, ...optimisticMessages];
            const finalMessages = combined.sort((a, b) => {
              const dateA = new Date(a.createdAt || 0);
              const dateB = new Date(b.createdAt || 0);
              return dateA - dateB;
            });
            
            console.log('📨 Setting messages:', {
              fetched: sortedMessages.length,
              optimistic: optimisticMessages.length,
              total: finalMessages.length,
              lastMessage: finalMessages[finalMessages.length - 1]?.text?.substring(0, 30)
            });
            
            return finalMessages;
          });

          if (latestFetchedMessage) {
            updateChatPreviewFromMessage(chatId, latestFetchedMessage);
          }
        } catch (error) {
          console.error('Error fetching messages:', error);
        }
      };

      fetchMessages();

      // Fetch participants for mentions (only for group chats)
      if (selectedChat.type === 'group' && selectedChat.participants) {
        setMentionUsers(selectedChat.participants.filter(p => p._id?.toString() !== user._id?.toString()));
      } else {
        setMentionUsers([]);
      }

      // Join chat room
      if (socket && connected) {
        socket.emit('join:chat', selectedChat._id);
      }

      return () => {
        if (socket && connected) {
          socket.emit('leave:chat', selectedChat._id);
        }
      };
    } else {
      // Clear messages when no chat is selected
      setMessages([]);
      setMentionUsers([]);
    }
  }, [selectedChat, socket, connected, user._id]);

  // Join all chats to receive message events even when not actively viewing them
  useEffect(() => {
    if (!socket || !connected) return;

    const currentChatIds = new Set(
      chats
        .map(chat => chat?._id?.toString() || chat?._id)
        .filter(Boolean)
    );

    // Join newly added chats
    currentChatIds.forEach((chatId) => {
      if (!joinedChatsRef.current.has(chatId)) {
        socket.emit('join:chat', chatId);
        joinedChatsRef.current.add(chatId);
        console.log(`🔗 Joined chat room via auto-join: ${chatId}`);
      }
    });

    // Leave chats that were removed from the list
    joinedChatsRef.current.forEach((chatId) => {
      if (!currentChatIds.has(chatId)) {
        socket.emit('leave:chat', chatId);
        joinedChatsRef.current.delete(chatId);
        console.log(`🚪 Left chat room (chat removed): ${chatId}`);
      }
    });
  }, [socket, connected, chats]);

  // Cleanup all joined chats on unmount / socket change
  useEffect(() => {
    return () => {
      if (!socket) return;
      joinedChatsRef.current.forEach((chatId) => {
        socket.emit('leave:chat', chatId);
      });
      joinedChatsRef.current.clear();
    };
  }, [socket]);

  // Socket event listeners
  useEffect(() => {
    if (!socket || !connected) {
      console.warn('⚠️ Socket not connected, cannot listen for messages');
      return;
    }

    const handleMessageError = (error) => {
      console.error('❌ Message error from server:', error);
      const errorMessage = error?.message || error?.details || 'Failed to send message';
      alert(errorMessage);
      // Remove optimistic messages on error
      setMessages((prev) => prev.filter(msg => !msg.isOptimistic));
      setSending(false);
    };

    const handleNewMessage = (message) => {
      console.log('📥 New message received:', message);
      const chatId = message.chat?._id?.toString() || message.chat?.toString() || message.chat;
      const selectedChatId = selectedChat?._id?.toString() || selectedChat?._id;
      const isCurrentChat = chatId === selectedChatId;
      
      console.log('🔍 Message chat check:', {
        messageChatId: chatId,
        selectedChatId: selectedChatId,
        isCurrentChat,
        messageId: message._id
      });
      
      if (isCurrentChat) {
        const newMsgId = message._id?.toString() || message._id;
        
        // CRITICAL: Check ref first to prevent race conditions
        if (newMsgId && processedMessageIdsRef.current.has(newMsgId)) {
          console.log('⚠️ Message already processed (ref check), skipping duplicate:', newMsgId);
          return; // Exit early, don't process this message at all
        }
        
        // Mark as processed immediately to prevent race conditions
        if (newMsgId) {
          processedMessageIdsRef.current.add(newMsgId);
        }
        
        // Remove optimistic message if it exists and add the real one
        setMessages((prev) => {
          const messageText = message.text || message.content || '';
          
          // Double-check in state (defensive check)
          const existsById = prev.some(msg => {
            const msgId = msg._id?.toString() || msg._id;
            return msgId === newMsgId && msgId && msgId !== 'undefined' && msgId !== 'null';
          });
          
          if (existsById) {
            console.log('⚠️ Message already exists in state, skipping duplicate:', newMsgId);
            // Still remove any optimistic messages that might match
            return prev.filter(msg => {
              if (msg.isOptimistic) {
                const msgChatId = msg.chat?._id?.toString() || msg.chat?.toString() || msg.chat;
                const msgText = msg.text || msg.content || '';
                if (msgChatId === chatId && msgText === messageText) {
                  const timeDiff = Math.abs(new Date(msg.createdAt || 0) - new Date(message.createdAt || 0));
                  if (timeDiff < 5000) {
                    console.log('🗑️ Removing matching optimistic message');
                    return false; // Remove matching optimistic message
                  }
                }
              }
              return true;
            });
          }
          
          // Check for optimistic messages that match this real message
          const matchingOptimistic = prev.find(msg => {
            if (!msg.isOptimistic) return false;
            const msgChatId = msg.chat?._id?.toString() || msg.chat?.toString() || msg.chat;
            const msgText = msg.text || msg.content || '';
            if (msgChatId === chatId && msgText === messageText) {
              const timeDiff = Math.abs(new Date(msg.createdAt || 0) - new Date(message.createdAt || 0));
              return timeDiff < 5000; // Within 5 seconds
            }
            return false;
          });
          
          if (matchingOptimistic) {
            console.log('✅ Replacing optimistic message with real message');
            // Replace optimistic message with real one
            return prev.map(msg => {
              if (msg._id === matchingOptimistic._id) {
                return message; // Replace optimistic with real
              }
              return msg;
            }).sort((a, b) => {
              const dateA = new Date(a.createdAt || 0);
              const dateB = new Date(b.createdAt || 0);
              return dateA - dateB;
            });
          }
          
          console.log('✅ Adding new message to list');
          // Remove any other optimistic messages for this chat (cleanup)
          const withoutOptimistic = prev.filter(msg => {
            if (msg.isOptimistic) {
              const msgChatId = msg.chat?._id?.toString() || msg.chat?.toString() || msg.chat;
              return msgChatId !== chatId; // Keep optimistic messages from other chats
            }
            return true;
          });
          
          // Add message and sort by createdAt (oldest first)
          const updated = [...withoutOptimistic, message];
          return updated.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateA - dateB; // Ascending order (oldest first)
          });
        });
        scrollToBottom();
      }

      // Update chat list preview (handles sorting and selectedChat update)
      updateChatPreviewFromMessage(chatId, message);

      // Handle case where chat is not in the list yet
      setChats((prev) => {
        const exists = prev.some(chat => getIdString(chat._id) === chatId);
        if (!exists) {
          console.log('📥 Chat not in list, fetching chat details:', chatId);
          chatService.getChat(chatId)
            .then(chatData => {
              const chat = chatData.data || chatData;
              const enhanced = enhanceChat(chat, { hasLeft: false });
              // Manually set the last message on the fetched chat so it appears correct immediately
              enhanced.lastMessage = message;
              enhanced.lastMessageAt = message.createdAt;
              
              setChats(prevChats => {
                const stillMissing = !prevChats.some(c => getIdString(c._id) === chatId);
                if (stillMissing) {
                  return sortChatsByRecent([enhanced, ...prevChats]);
                }
                return prevChats;
              });
            })
            .catch(err => console.error('❌ Failed to fetch chat:', err));
        }
        return prev;
      });
    };

    const handleMessageEdited = (message) => {
      const messageChatId = message.chat?._id?.toString() || message.chat?.toString() || message.chat;
      const selectedChatId = selectedChat?._id?.toString() || selectedChat?._id;
      
      if (messageChatId === selectedChatId) {
        setMessages((prev) => {
          const updated = prev.map((msg) => {
            const msgId = msg._id?.toString() || msg._id;
            const updatedId = message._id?.toString() || message._id;
            return msgId === updatedId ? message : msg;
          });
          // Maintain sort order (oldest first)
          return updated.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateA - dateB;
          });
        });
      }
    };

    const handleMessageDeleted = (data) => {
      if (data.chatId === selectedChat?._id) {
        // If we have the full message object, use it; otherwise update locally
        if (data.message) {
          setMessages((prev) => 
            prev.map((msg) => {
              const msgId = msg._id?.toString() || msg._id;
              const deletedId = data.message._id?.toString() || data.message._id;
              return msgId === deletedId ? data.message : msg;
            })
          );
        } else {
          // Fallback: update locally if full message not provided
          setMessages((prev) => 
            prev.map((msg) => 
              msg._id === data.messageId 
                ? { ...msg, isDeleted: true, text: '', content: '' }
                : msg
            )
          );
        }
        // Clear reply if the replied message was deleted
        if (replyingTo && (replyingTo._id === data.messageId || replyingTo._id?.toString() === data.messageId?.toString())) {
          setReplyingTo(null);
        }
      }
    };

    const handleTyping = (data) => {
      if (data.chatId === selectedChat?._id && data.userId !== user._id) {
        setTypingUsers((prev) => {
          if (!prev.includes(data.userId)) {
            return [...prev, data.userId];
          }
          return prev;
        });
      }
    };

    const handleStoppedTyping = (data) => {
      if (data.chatId === selectedChat?._id) {
        setTypingUsers((prev) => prev.filter((id) => id !== data.userId));
      }
    };

    const handleMessageReacted = (message) => {
      const messageChatId = message.chat?._id?.toString() || message.chat?.toString() || message.chat;
      const selectedChatId = selectedChat?._id?.toString() || selectedChat?._id;
      
      if (messageChatId === selectedChatId) {
        setMessages((prev) =>
          prev.map((msg) => {
            const msgId = msg._id?.toString() || msg._id;
            const updatedId = message._id?.toString() || message._id;
            return msgId === updatedId ? message : msg;
          })
        );
      }
    };

    const handleChatDeleted = (data) => {
      const deletedChatId = data.chatId?.toString() || data.chatId;
      console.log('🗑️ Chat deleted:', deletedChatId);
      
      // Remove chat from list
      setChats((prev) => prev.filter(chat => {
        const chatId = chat._id?.toString() || chat._id;
        return chatId !== deletedChatId;
      }));
      
      // If the deleted chat was selected, clear selection
      const selectedChatId = selectedChat?._id?.toString() || selectedChat?._id;
      if (selectedChatId === deletedChatId) {
        setSelectedChat(null);
        setMessages([]);
      }
    };

    const handleChatRestored = (data) => {
      const { chat, newMessage } = data;
      if (!chat || !chat._id) return;
      const chatId = getIdString(chat._id);
      const enhancedChat = enhanceChat(chat, { hasLeft: false });
      console.log('🔄 Chat restored:', chatId);
      
      // Check if chat already exists in the list
      setChats((prev) => {
        const existingChatIndex = prev.findIndex(c => getIdString(c._id) === chatId);
        
        if (existingChatIndex >= 0) {
          // Update existing chat
          const updated = [...prev];
          updated[existingChatIndex] = enhancedChat;
          // Move to top (most recent)
          updated.unshift(updated.splice(existingChatIndex, 1)[0]);
          return updated;
        } else {
          // Add new chat to the top
          return [enhancedChat, ...prev];
        }
      });
      
      // If this chat is currently selected, only add the new message
      // NOTE: The message will also come via message:new event, so we need to prevent duplicates
      const selectedChatId = getIdString(selectedChat?._id);
      if (selectedChatId === chatId && newMessage) {
        const newMsgId = newMessage._id?.toString() || newMessage._id;
        
        // CRITICAL: Check ref first to prevent race conditions
        if (newMsgId && processedMessageIdsRef.current.has(newMsgId)) {
          console.log('⚠️ Message from chat:restored already processed (ref check), skipping:', newMsgId);
          return; // Exit early, don't process this message at all
        }
        
        // Mark as processed immediately to prevent race conditions
        if (newMsgId) {
          processedMessageIdsRef.current.add(newMsgId);
        }
        
        // Only add the new message, don't fetch all messages
        setMessages((prev) => {
          // Double-check in state (defensive check)
          const existsById = prev.some(msg => (msg._id?.toString() || msg._id) === newMsgId);
          
          if (existsById) {
            console.log('⚠️ Message from chat:restored already exists in state, skipping:', newMsgId);
            return prev;
          }
          
          console.log('✅ Adding message from chat:restored');
          // Remove any optimistic messages that match
          const withoutOptimistic = prev.filter(msg => {
             if (msg.isOptimistic) {
               const msgChatId = getIdString(msg.chat);
               const newMsgText = newMessage.text || newMessage.content || '';
               const msgText = msg.text || msg.content || '';
               if (msgChatId === chatId && msgText === newMsgText) {
                const timeDiff = Math.abs(new Date(msg.createdAt || 0) - new Date(newMessage.createdAt || 0));
                if (timeDiff < 5000) {
                  console.log('🗑️ Removing matching optimistic message from chat:restored');
                  return false;
                }
              }
            }
            return true;
          });
          
          // Add new message and sort by createdAt (oldest first)
          const updated = [...withoutOptimistic, newMessage];
          return updated.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0);
            const dateB = new Date(b.createdAt || 0);
            return dateA - dateB; // Ascending order (oldest first)
          });
        });
      } else {
        // If chat is not selected, select it and show only the new message
        // Mark this chat as restored to prevent fetching all messages
        restoredChatsRef.current.add(chatId);
        setSelectedChat(enhancedChat);
        setMessages([newMessage]);
        
        // Join the chat room
        if (socket && connected) {
          socket.emit('join:chat', chatId);
        }
      }
    };

    const handleChatCreated = (payload = {}) => {
      const { chat, messages: initialMessages = [] } = payload;
      if (!chat || !chat._id) return;
      
      const enhanced = enhanceChat(chat, { hasLeft: false });
      const chatId = getIdString(chat._id);
      const creatorId = getIdString(chat.createdBy?._id || chat.createdBy);
      const currentUserId = getIdString(user._id);
      const selectedId = getIdString(selectedChat?._id);

      // If current user is the creator, they should already have the chat from API response
      // This is a safeguard in case the backend still emits to creator
      if (creatorId === currentUserId) {
        console.log('⚠️ Creator received chat:created event, skipping to prevent duplicate');
        return;
      }

      setChats((prev) => {
        const exists = prev.some(c => getIdString(c._id) === chatId);
        if (exists) {
          console.log('⚠️ Chat already exists from WebSocket, updating instead of duplicating');
          return prev.map(c => (getIdString(c._id) === chatId ? enhanced : c));
        }
        return [enhanced, ...prev];
      });

      // Auto-select for non-creator participants
      if (!selectedChat) {
        setSelectedChat(enhanced);
        setMessages(initialMessages.length > 0 ? initialMessages : []);
        return;
      }

      if (selectedId === chatId) {
        setSelectedChat(enhanced);
        if (initialMessages.length > 0) {
          setMessages(initialMessages);
        }
      }
    };

    const handleChatUpdated = (chatPayload) => {
      if (!chatPayload || !chatPayload._id) return;
      console.log('🔔 Received chat:updated event:', chatPayload);
      console.log('🏷️ Nicknames in chat:updated:', chatPayload.nicknames);
      
      const chatId = getIdString(chatPayload._id);
      const userIdStr = getIdString(user._id);
      const stillParticipant = chatPayload.participants?.some(
        participant => getIdString(participant._id || participant) === userIdStr
      );
      const enhancedPayload = enhanceChat(chatPayload, { hasLeft: !stillParticipant });
      
      console.log('🔄 Enhanced payload in handleChatUpdated:', enhancedPayload);

      setChats((prev) => {
        const exists = prev.some(chat => getIdString(chat._id) === chatId);
        let updatedChats;
        
        if (!exists) {
          updatedChats = stillParticipant ? [enhancedPayload, ...prev] : prev;
        } else {
          updatedChats = prev.map(chat =>
            getIdString(chat._id) === chatId ? enhancedPayload : chat
          );
        }
        
        // Sort by lastMessageAt (most recent first)
        return updatedChats.sort((a, b) => {
          const dateA = new Date(a.lastMessageAt || a.createdAt || 0);
          const dateB = new Date(b.lastMessageAt || b.createdAt || 0);
          return dateB - dateA; // Descending order (newest first)
        });
      });

      setSelectedChat((prev) => {
        if (!prev) return prev;
        const prevId = getIdString(prev._id);
        if (prevId !== chatId) return prev;
        if (!stillParticipant) {
          return { ...prev, hasLeft: true };
        }
        return enhanceChat(chatPayload, { hasLeft: false });
      });
    };

    const handleChatLeft = (data) => {
      const chatId = getIdString(data?.chatId);
      if (!chatId) return;
      markChatLeftState(chatId, true);
    };

    const handleChatRemoved = (data) => {
      const chatId = getIdString(data?.chatId);
      if (!chatId) return;
      
      // Mark the chat as "left" instead of removing it
      // User can still see the chat history but cannot send messages
      markChatLeftState(chatId, true);

      // Show alert to user
      if (data.message) {
        alert(data.message);
      }
    };

    const handleMessagesRead = (data) => {
      const { chatId, messageIds, readBy, readAt } = data;
      
      console.log('📖 Messages read event:', { chatId, messageIds, readBy, readAt });
      
      // Update messages in the current chat
      if (selectedChat && selectedChat._id === chatId) {
        setMessages(prevMessages => 
          prevMessages.map(msg => {
            if (messageIds.includes(msg._id.toString())) {
              // Add the new reader to readBy array if not already there
              const existingReadBy = msg.readBy || [];
              const alreadyRead = existingReadBy.some(r => r.user === readBy);
              
              if (!alreadyRead) {
                return {
                  ...msg,
                  readBy: [...existingReadBy, { user: readBy, readAt: new Date(readAt) }]
                };
              }
            }
            return msg;
          })
        );
      }

      // Update the last message in chat list if it was read
      setChats(prevChats =>
        prevChats.map(chat => {
          if (chat._id === chatId && chat.lastMessage && messageIds.includes(chat.lastMessage._id?.toString())) {
            return {
              ...chat,
              lastMessage: {
                ...chat.lastMessage,
                readBy: [
                  ...(chat.lastMessage.readBy || []),
                  { user: readBy, readAt: new Date(readAt) }
                ]
              }
            };
          }
          return chat;
        })
      );
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:edited', handleMessageEdited);
    socket.on('message:deleted', handleMessageDeleted);
    socket.on('message:reacted', handleMessageReacted);
    socket.on('messages:read', handleMessagesRead);
    socket.on('user:typing', handleTyping);
    socket.on('user:stopped-typing', handleStoppedTyping);
    socket.on('message:error', handleMessageError);
    socket.on('chat:deleted', handleChatDeleted);
    socket.on('chat:restored', handleChatRestored);
    socket.on('chat:created', handleChatCreated);
    socket.on('chat:updated', handleChatUpdated);
    socket.on('chat:left', handleChatLeft);
    socket.on('chat:removed', handleChatRemoved);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:edited', handleMessageEdited);
      socket.off('message:deleted', handleMessageDeleted);
      socket.off('message:reacted', handleMessageReacted);
      socket.off('messages:read', handleMessagesRead);
      socket.off('user:typing', handleTyping);
      socket.off('user:stopped-typing', handleStoppedTyping);
      socket.off('message:error', handleMessageError);
      socket.off('chat:deleted', handleChatDeleted);
      socket.off('chat:restored', handleChatRestored);
      socket.off('chat:created', handleChatCreated);
      socket.off('chat:updated', handleChatUpdated);
      socket.off('chat:left', handleChatLeft);
      socket.off('chat:removed', handleChatRemoved);
    };
  }, [socket, connected, selectedChat, user]);

  // Debug: Log when chats change
  useEffect(() => {
    console.log('🔄 Chats state updated:', {
      count: chats.length,
      topChatId: chats[0]?._id,
      topChatType: chats[0]?.type,
      lastMessage: chats[0]?.lastMessage?.text?.substring(0, 30),
      lastMessageAt: chats[0]?.lastMessageAt
    });
  }, [chats]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Parse mentions from message text
  const parseMentions = (text) => {
    const mentionedUserIds = [];
    let mentionAll = false;
    
    // Check for @all
    if (text.includes('@all')) {
      mentionAll = true;
    }
    
    // Find all @username patterns
    const mentionRegex = /@(\w+)/g;
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      const username = match[1];
      if (username.toLowerCase() !== 'all') {
        // Find user by exact name match or partial match
        const mentionedUser = mentionUsers.find(u => {
          const userName = u.name?.toLowerCase() || '';
          const searchName = username.toLowerCase();
          // Try exact match first, then partial match
          return userName === searchName || userName.startsWith(searchName) || userName.includes(searchName);
        });
        if (mentionedUser) {
          const userId = mentionedUser._id?.toString() || mentionedUser._id;
          if (!mentionedUserIds.includes(userId)) {
            mentionedUserIds.push(userId);
          }
        }
      }
    }
    
    return { mentionedUserIds, mentionAll };
  };

  const formatFileSize = (size) => {
    if (size === undefined || size === null) return '';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const uploadFiles = (files) => {
    if (!selectedChat || !files || files.length === 0) return;
    files.forEach((file) => {
      const id = `${file.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const previewUrl = file.type?.startsWith('image') ? URL.createObjectURL(file) : null;
      setPendingAttachments((prev) => [
        ...prev,
        {
          id,
          name: file.name,
          size: file.size,
          type: file.type,
          previewUrl,
          status: 'uploading',
          error: null,
          data: null
        }
      ]);

      chatService.uploadAttachment(selectedChat._id, file)
        .then((data) => {
          setPendingAttachments((prev) =>
            prev.map((att) =>
              att.id === id ? { ...att, status: 'ready', data, error: null } : att
            )
          );
        })
        .catch((error) => {
          setPendingAttachments((prev) =>
            prev.map((att) =>
              att.id === id ? { ...att, status: 'error', error: error.message || 'Upload failed' } : att
            )
          );
        });
    });
  };

  const clearPendingAttachments = () => {
    setPendingAttachments((prev) => {
      prev.forEach((att) => {
        if (att.previewUrl) {
          URL.revokeObjectURL(att.previewUrl);
        }
      });
      return [];
    });
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

  useEffect(() => {
    clearPendingAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat?._id]);

  const handleAttachmentButtonClick = () => {
    if (!selectedChat || selectedChat.hasLeft) return;
    attachmentInputRef.current?.click();
  };

  const handleAttachmentSelect = async (event) => {
    if (!selectedChat || selectedChat.hasLeft) return;
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    uploadFiles(files);
  };

  const handlePaste = (event) => {
    if (!selectedChat || selectedChat.hasLeft || !event.clipboardData) return;
    const items = Array.from(event.clipboardData.items || []);
    const imageItems = items.filter((item) => item.type?.startsWith('image/'));
    if (imageItems.length === 0) return;
    event.preventDefault();

    const files = imageItems
      .map((item) => item.getAsFile())
      .filter(Boolean)
      .map((file, index) => {
        if (!file) return null;
        if (file.name && file.name !== 'blob') return file;
        const extension = file.type?.split('/')[1] || 'png';
        const fileName = `pasted-image-${Date.now()}-${index}.${extension}`;
        return new File([file], fileName, { type: file.type || 'image/png' });
      })
      .filter(Boolean);

    if (files.length > 0) {
      uploadFiles(files);
    }
  };

  const handleRemoveAttachment = (attachmentId) => {
    setPendingAttachments((prev) => {
      const attachment = prev.find((att) => att.id === attachmentId);
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      return prev.filter((att) => att.id !== attachmentId);
    });
  };

  const handleSendMessage = async () => {
    if (!selectedChat || sending || !socket || !connected) return;
    if (selectedChat.hasLeft) {
      alert('You left this chat. Ask an admin to re-add you before sending new messages.');
      return;
    }

    const readyAttachments = pendingAttachments.filter((att) => att.status === 'ready' && att.data);
    const hasUploadingAttachments = pendingAttachments.some((att) => att.status === 'uploading');
    const messageContent = messageText.trim();

    if (!messageContent && readyAttachments.length === 0) return;
    if (hasUploadingAttachments) {
      alert('Please wait for attachments to finish uploading.');
      return;
    }

    setSending(true);
    
    // Parse mentions
    const { mentionedUserIds, mentionAll } = parseMentions(messageContent);
    const attachmentsPayload = readyAttachments.map((att) => ({ ...att.data }));
    
    // Create optimistic message for immediate UI update
    const optimisticMessage = {
      _id: `temp-${Date.now()}`,
      chat: getIdString(selectedChat._id),
      sender: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      },
      text: messageContent,
      replyTo: replyingTo,
      mentionedUsers: mentionedUserIds,
      mentionAll: mentionAll,
      createdAt: new Date().toISOString(),
      isOptimistic: true,
      attachments: attachmentsPayload
    };

    // Add optimistic message immediately
    setMessages((prev) => [...prev, optimisticMessage]);
    setMessageText('');
    setMentionPopup({ show: false, position: null, search: '' });
    setMentionIndex(-1);
    const replyToId = replyingTo?._id || replyingTo;
    setReplyingTo(null);
    
    // Stop typing indicator
    if (socket && connected) {
      socket.emit('typing:stop', { chatId: selectedChat._id });
    }

    try {
      // Ensure chatId is a string
      const chatId = selectedChat._id?.toString() || selectedChat._id;
      
      // Ensure we're in the chat room before sending
      if (socket && connected) {
        socket.emit('join:chat', chatId);
        console.log('🔌 Joining chat room:', chatId);
      }
      
      // Emit message with mentions and attachments
      console.log('📤 Sending attachments payload:', {
        type: typeof attachmentsPayload,
        isArray: Array.isArray(attachmentsPayload),
        value: attachmentsPayload
      });
      socket.emit('message:send', {
        chatId: chatId,
        text: messageContent,
        replyTo: replyToId,
        attachments: attachmentsPayload,
        mentionedUsers: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
        mentionAll: mentionAll || undefined
      });
      console.log('📤 Message sent via socket:', { 
        chatId: chatId, 
        text: messageContent,
        replyTo: replyToId,
        mentionedUsers: mentionedUserIds,
        mentionAll: mentionAll,
        attachments: attachmentsPayload.length,
        socketConnected: connected,
        socketId: socket?.id,
        userId: user._id
      });

      clearPendingAttachments();
    } catch (error) {
      console.error('❌ Error sending message:', error);
      // Remove optimistic message on error
      setMessages((prev) => prev.filter(msg => msg._id !== optimisticMessage._id));
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleReply = (message) => {
    setReplyingTo(message);
    // Focus on message input
    setTimeout(() => {
      const input = document.querySelector('textarea[placeholder="Type a message..."]');
      if (input) input.focus();
    }, 100);
  };

  // Handle mention popup
  const handleMessageInputChange = (e) => {
    if (selectedChat?.hasLeft) return;
    const value = e.target.value;
    setMessageText(value);
    handleTyping();

    // Only show mention popup in group chats
    if (selectedChat?.type !== 'group' || mentionUsers.length === 0) {
      setMentionPopup({ show: false, position: null, search: '' });
      return;
    }

    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    // Check if @ is being typed
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Check if there's a space or newline after @ (meaning mention is complete)
      if (textAfterAt.includes(' ') || textAfterAt.includes('\n')) {
        setMentionPopup({ show: false, position: null, search: '' });
        return;
      }

      // Get the search term after @
      const searchTerm = textAfterAt.toLowerCase();
      
      // Get input element position for popup
      const inputElement = e.target;
      const rect = inputElement.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      
      setMentionIndex(lastAtIndex);
      setMentionPopup({
        show: true,
        position: {
          top: rect.top + scrollTop - 200, // Position above input
          left: rect.left + 20
        },
        search: searchTerm
      });
    } else {
      setMentionPopup({ show: false, position: null, search: '' });
      setMentionIndex(-1);
    }
  };

  const handleSelectMention = (selectedUser) => {
    if (mentionIndex === -1) return;

    const textBefore = messageText.substring(0, mentionIndex);
    const textAfter = messageText.substring(mentionIndex);
    // Find where the @ mention ends (space, newline, or end of string)
    const mentionEnd = textAfter.search(/[\s\n]|$/);
    const newText = textBefore + `@${selectedUser.name} ` + textAfter.substring(mentionEnd);

    setMessageText(newText);
    setMentionPopup({ show: false, position: null, search: '' });
    setMentionIndex(-1);

    // Focus back on input
    setTimeout(() => {
      const input = document.querySelector('textarea[placeholder="Type a message..."]');
      if (input) {
        input.focus();
        const newCursorPos = mentionIndex + selectedUser.name.length + 2; // +2 for @ and space
        input.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleSelectMentionAll = () => {
    if (mentionIndex === -1) return;

    const textBefore = messageText.substring(0, mentionIndex);
    const textAfter = messageText.substring(mentionIndex);
    // Find where the @ mention ends
    const mentionEnd = textAfter.search(/[\s\n]|$/);
    const newText = textBefore + '@all ' + textAfter.substring(mentionEnd);

    setMessageText(newText);
    setMentionPopup({ show: false, position: null, search: '' });
    setMentionIndex(-1);

    // Focus back on input
    setTimeout(() => {
      const input = document.querySelector('textarea[placeholder="Type a message..."]');
      if (input) {
        input.focus();
        const newCursorPos = mentionIndex + 5; // +5 for "@all "
        input.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleUnsend = async (message) => {
    if (!socket || !connected || !message) return;
    
    const messageId = message._id?.toString() || message._id;
    if (!messageId) return;

    try {
      // Optimistically update the message
      setMessages((prev) =>
        prev.map((msg) =>
          (msg._id?.toString() || msg._id) === messageId
            ? { ...msg, isDeleted: true, text: '', content: '' }
            : msg
        )
      );

      // Emit delete event
      socket.emit('message:delete', { messageId });
      console.log('🗑️ Message delete sent:', messageId);
    } catch (error) {
      console.error('❌ Error unsending message:', error);
      alert('Failed to unsend message. Please try again.');
      // Revert optimistic update
      setMessages((prev) =>
        prev.map((msg) =>
          (msg._id?.toString() || msg._id) === messageId ? message : msg
        )
      );
    }
  };

  const handleEdit = async (message, newText) => {
    if (!socket || !connected || !message || !newText.trim()) return;
    
    const messageId = message._id?.toString() || message._id;
    if (!messageId) return;

    try {
      // Optimistically update the message
      setMessages((prev) =>
        prev.map((msg) =>
          (msg._id?.toString() || msg._id) === messageId
            ? { ...msg, text: newText, isEdited: true }
            : msg
        )
      );

      // Emit edit event
      socket.emit('message:edit', { messageId, text: newText });
      console.log('✏️ Message edit sent:', messageId);
    } catch (error) {
      console.error('❌ Error editing message:', error);
      alert('Failed to edit message. Please try again.');
      // Revert optimistic update
      setMessages((prev) =>
        prev.map((msg) =>
          (msg._id?.toString() || msg._id) === messageId ? message : msg
        )
      );
    }
  };

  const handleReact = async (message, emoji) => {
    if (!socket || !connected || !message || !emoji) return;
    
    const messageId = message._id?.toString() || message._id;
    if (!messageId) return;

    try {
      // Emit reaction event
      socket.emit('message:react', { messageId, emoji });
      console.log('😀 Message reaction sent:', { messageId, emoji });
    } catch (error) {
      console.error('❌ Error reacting to message:', error);
      alert('Failed to react to message. Please try again.');
    }
  };

  const handleTyping = () => {
    if (!socket || !connected || !selectedChat || selectedChat.hasLeft) return;

    // Emit typing start
    socket.emit('typing:start', { chatId: selectedChat._id });

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', { chatId: selectedChat._id });
    }, 3000);
  };

  const handleKeyPress = (e) => {
    if (selectedChat?.hasLeft) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const hasLeftChat = Boolean(selectedChat?.hasLeft);
  const readyAttachmentCount = pendingAttachments.filter((att) => att.status === 'ready' && att.data).length;
  const hasUploadingAttachments = pendingAttachments.some((att) => att.status === 'uploading');
  const canSendMessage = !hasLeftChat && (messageText.trim().length > 0 || readyAttachmentCount > 0);
  const sendDisabled = hasLeftChat || sending || hasUploadingAttachments || !canSendMessage;

  if (loading) {
    return <Loading />;
  }

  const getChatName = (chat) => {
    if (chat.type === 'group') {
      return chat.name;
    }
    // For direct chat, check for nickname first, then show other participant's name
    const currentUserId = user._id?.toString() || user._id;
    const nickname = chat.nicknames?.get?.(currentUserId) || chat.nicknames?.[currentUserId];
    
    console.log('🏷️ getChatName:', {
      chatId: chat._id,
      currentUserId,
      nicknames: chat.nicknames,
      nickname,
      type: typeof chat.nicknames
    });
    
    if (nickname && nickname.trim()) {
      return nickname;
    }
    
    const otherParticipant = chat.participants?.find(
      (p) => p._id !== user._id
    );
    return otherParticipant?.name || 'Unknown User';
  };

  const getChatAvatar = (chat) => {
    if (chat.type === 'group') {
      return {
        src: null,
        fallback: chat.name?.charAt(0).toUpperCase() || 'G'
      };
    }
    const otherParticipant = chat.participants?.find(
      (p) => {
        const pId = p._id?.toString() || p._id;
        const userId = user._id?.toString() || user._id;
        return pId !== userId;
      }
    );
    const avatarUrl = otherParticipant?.avatar || otherParticipant?.avatarUrl;
    return {
      src: avatarUrl && avatarUrl.trim() !== '' ? avatarUrl : null,
      fallback: otherParticipant?.name?.charAt(0).toUpperCase() || 'U'
    };
  };

  const handleNewChatCreated = (chat) => {
    const enhanced = enhanceChat(chat, { hasLeft: false });
    const chatId = getIdString(chat._id);
    
    setChats((prev) => {
      // Check if chat already exists (to prevent duplicates)
      const exists = prev.some(c => getIdString(c._id) === chatId);
      if (exists) {
        console.log('⚠️ Chat already exists, updating instead of duplicating');
        return prev.map(c => (getIdString(c._id) === chatId ? enhanced : c));
      }
      return [enhanced, ...prev];
    });
    
    setSelectedChat(enhanced);
  };

  const handleDeleteChat = async (chat) => {
    if (!chat || !chat._id) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to delete this chat? This action cannot be undone.`
    );
    
    if (!confirmed) return;

    try {
      await chatService.deleteChat(chat._id);
      
      // Optimistically remove from list
      setChats((prev) => prev.filter(c => {
        const chatId = c._id?.toString() || c._id;
        const deletedChatId = chat._id?.toString() || chat._id;
        return chatId !== deletedChatId;
      }));
      
      // If the deleted chat was selected, clear selection
      const selectedChatId = selectedChat?._id?.toString() || selectedChat?._id;
      const deletedChatId = chat._id?.toString() || chat._id;
      if (selectedChatId === deletedChatId) {
        setSelectedChat(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
      alert(error.response?.data?.message || 'Failed to delete chat. Please try again.');
    }
  };

  const handleLeaveChat = async (chat) => {
    if (!chat || chat.type !== 'group') return;

    const confirmed = window.confirm(
      `Leave "${getChatName(chat)}"? You will no longer receive messages from this chat.`
    );
    if (!confirmed) return;

    try {
      await chatService.leaveChat(chat._id);
      const chatId = getIdString(chat._id);
      markChatLeftState(chatId, true);
      if (socket && connected) {
        socket.emit('leave:chat', chat._id);
      }
      alert('You left this chat. You can still read previous messages, but sending is disabled until you are re-added.');
    } catch (error) {
      console.error('Error leaving chat:', error);
      alert(error.response?.data?.message || 'Failed to leave chat. Please try again.');
    }
  };

  const handleMemberAdded = (updatedChat) => {
    setChats((prev) =>
      prev.map((chat) =>
        getIdString(chat._id) === getIdString(updatedChat._id) ? enhanceChat(updatedChat) : chat
      )
    );
    if (selectedChat && getIdString(selectedChat._id) === getIdString(updatedChat._id)) {
      setSelectedChat(enhanceChat(updatedChat));
    }
  };

  const handleMemberRemoved = (updatedChat) => {
    setChats((prev) =>
      prev.map((chat) =>
        getIdString(chat._id) === getIdString(updatedChat._id) ? enhanceChat(updatedChat) : chat
      )
    );
    if (selectedChat && getIdString(selectedChat._id) === getIdString(updatedChat._id)) {
      setSelectedChat(enhanceChat(updatedChat));
    }
  };

  const handleUpdateChat = async (chatId, updateData) => {
    try {
      console.log('📝 Updating chat:', { chatId, updateData });
      const response = await chatService.updateChat(chatId, updateData);
      console.log('✅ Chat update response:', response);
      const updatedChat = response.data || response;
      console.log('📦 Updated chat data:', updatedChat);
      console.log('🏷️ Nicknames in updated chat:', updatedChat.nicknames);
      
      // Update chats list
      setChats((prev) => {
        const updatedChats = prev.map((chat) => {
          if (getIdString(chat._id) === chatId) {
            const enhanced = enhanceChat(updatedChat);
            console.log('🔄 Enhanced chat for list:', enhanced);
            return enhanced;
          }
          return chat;
        });
        
        // Sort by lastMessageAt (most recent first)
        return updatedChats.sort((a, b) => {
          const dateA = new Date(a.lastMessageAt || a.createdAt || 0);
          const dateB = new Date(b.lastMessageAt || b.createdAt || 0);
          return dateB - dateA; // Descending order (newest first)
        });
      });
      
      // Update selected chat if it's the one being updated
      if (selectedChat && getIdString(selectedChat._id) === chatId) {
        const enhanced = enhanceChat(updatedChat);
        console.log('🔄 Enhanced chat for selected:', enhanced);
        setSelectedChat(enhanced);
      }
    } catch (error) {
      console.error('❌ Error updating chat:', error);
      throw error;
    }
  };

  const handleForwardMessage = (message) => {
    setMessageToForward(message);
    setForwardMessageOpen(true);
  };

  const handleForward = async (messageId, targetChatIds) => {
    try {
      await chatService.forwardMessage(messageId, targetChatIds);
      // Messages will be received via WebSocket
      alert(`Message forwarded to ${targetChatIds.length} chat${targetChatIds.length === 1 ? '' : 's'}!`);
    } catch (error) {
      console.error('Error forwarding message:', error);
      throw error;
    }
  };

  const requestChatSummary = async ({ openDialog = false } = {}) => {
    if (!selectedChat?._id) {
      return;
    }
    if (openDialog) {
      setSummaryDialogOpen(true);
      setChatSummary(null);
    }
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const response = await chatService.summarizeChat(selectedChat._id);
      const payload = response?.data || response;
      const summaryData = payload?.data || payload;
      setChatSummary(summaryData);
    } catch (error) {
      const message =
        error.response?.data?.message ||
        error.message ||
        'Failed to summarize chat.';
      setSummaryError(message);
      setChatSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleOpenSummary = () => {
    requestChatSummary({ openDialog: true });
  };

  const handleRefreshSummary = () => {
    requestChatSummary({ openDialog: false });
  };

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden', borderRadius: 3 }}>
      {/* Chat List Sidebar */}
      <Box
        sx={{
          width: 350,
          borderRight: '1px solid rgba(0, 0, 0, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper',
          position: 'relative',
          boxShadow: '2px 0 12px rgba(0,0,0,0.04)',
        }}
      >
        <Box
          sx={{
            p: 2.5,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#ffffff',
            borderBottom: '1px solid #e4e6eb',
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#1c1e21', fontSize: '1.25rem' }}>Messages</Typography>
          <IconButton
            size="small"
            onClick={() => setNewChatOpen(true)}
            sx={{
              color: '#0084ff',
              '&:hover': {
                bgcolor: '#f2f3f5',
              },
              transition: 'background-color 0.15s',
            }}
          >
            <AddIcon />
          </IconButton>
        </Box>
        <ChatList
          chats={chats}
          selectedChat={selectedChat}
          onSelectChat={setSelectedChat}
          getChatName={getChatName}
          getChatAvatar={getChatAvatar}
          onDeleteChat={handleDeleteChat}
          onLeaveChat={handleLeaveChat}
        />
      </Box>

      {/* Chat Window */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                borderRadius: 0,
                borderBottom: '1px solid #e4e6eb',
                background: '#ffffff',
              }}
            >
              {(() => {
                const avatarData = getChatAvatar(selectedChat);
                return (
                  <Avatar 
                    src={avatarData?.src || undefined}
                    sx={{ 
                      bgcolor: '#e4e6eb',
                      color: '#1c1e21',
                      fontWeight: 600,
                      width: 40,
                      height: 40,
                    }}
                  >
                    {avatarData?.fallback || 'U'}
                  </Avatar>
                );
              })()}
              <Box sx={{ flex: 1 }}>
                <Typography 
                  variant="h6"
                  sx={{
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: '#1c1e21',
                  }}
                >
                  {getChatName(selectedChat)}
                </Typography>
                {selectedChat.type === 'group' && (
                  <Typography 
                    variant="caption" 
                    sx={{
                      color: '#65676b',
                      fontSize: '0.8125rem',
                    }}
                  >
                    {selectedChat.participants?.length || 0} participants
                  </Typography>
                )}
              </Box>
              <IconButton
                onClick={() => setEditChatOpen(true)}
                sx={{
                  color: '#65676b',
                  '&:hover': {
                    bgcolor: '#f2f3f5',
                  },
                }}
                title={selectedChat.type === 'group' ? 'Edit Group' : 'Edit Nickname'}
              >
                <EditIcon />
              </IconButton>
              <Tooltip title="Summarize conversation">
                <span>
                  <IconButton
                    onClick={handleOpenSummary}
                    disabled={summaryLoading}
                    sx={{
                      color: '#65676b',
                      '&:hover': {
                        bgcolor: '#f2f3f5',
                      },
                    }}
                  >
                    {summaryLoading && summaryDialogOpen ? (
                      <CircularProgress size={18} />
                    ) : (
                      <SummarizeIcon />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
              {selectedChat.type === 'group' && (
                <>
                  <IconButton
                    onClick={() => setManageMembersOpen(true)}
                    sx={{
                      color: '#65676b',
                      '&:hover': {
                        bgcolor: '#f2f3f5',
                      },
                    }}
                    title="Manage Members"
                  >
                    <GroupIcon />
                  </IconButton>
                  <Chip 
                    label="Group" 
                    size="small" 
                    sx={{
                      bgcolor: '#e4e6eb',
                      color: '#65676b',
                      fontSize: '0.75rem',
                      height: 20,
                    }}
                  />
                </>
              )}
            </Paper>

            {hasLeftChat && (
              <Box
                sx={{
                  bgcolor: selectedChat.isFormerParticipant ? '#fee2e2' : '#fff4e5',
                  borderBottom: selectedChat.isFormerParticipant ? '1px solid #fecaca' : '1px solid #f0e0c2',
                  px: 3,
                  py: 1.5
                }}
              >
                <Typography variant="body2" sx={{ color: selectedChat.isFormerParticipant ? '#991b1b' : '#92400e', fontWeight: 600 }}>
                  {selectedChat.isFormerParticipant 
                    ? 'You were removed from this group. You can still read previous messages but cannot send new ones.'
                    : 'You left this chat. You can still read previous messages but cannot send new ones until an admin re-adds you.'}
                </Typography>
                <Typography variant="caption" sx={{ color: selectedChat.isFormerParticipant ? '#dc2626' : '#b45309' }}>
                  To remove this conversation from your list, use Delete Chat.
                </Typography>
              </Box>
            )}

            {/* Messages */}
            <Box
              sx={{
                flex: 1,
                overflowY: 'auto',
                bgcolor: '#f0f2f5',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
              }}
            >
              <MessageList
                messages={messages}
                currentUserId={user._id}
                messagesEndRef={messagesEndRef}
                onReply={handleReply}
                onUnsend={handleUnsend}
                onEdit={handleEdit}
                onReact={handleReact}
                onForward={handleForwardMessage}
              />
              {typingUsers.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="textSecondary" sx={{ fontStyle: 'italic' }}>
                    {typingUsers.length === 1 ? 'Someone is typing...' : 'Multiple people are typing...'}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Message Input */}
            <Paper
              elevation={0}
              sx={{
                borderRadius: 0,
                borderTop: '1px solid #e4e6eb',
                background: '#ffffff',
              }}
            >
              {/* Reply Preview */}
              {replyingTo && (
                <Box
                  sx={{
                    px: 2,
                    py: 1,
                    borderBottom: '1px solid #e4e6eb',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    bgcolor: '#f0f2f5',
                  }}
                >
                  <Box
                    sx={{
                      flex: 1,
                      borderLeft: '3px solid #0084ff',
                      pl: 1.5,
                      py: 0.5,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        color: '#0084ff',
                        fontSize: '0.75rem',
                        display: 'block',
                        mb: 0.25,
                      }}
                    >
                      Replying to {replyingTo.sender?.name || 'Unknown'}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: '#65676b',
                        fontSize: '0.75rem',
                        display: '-webkit-box',
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {getReplyPreviewText(replyingTo)}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={() => setReplyingTo(null)}
                    sx={{
                      color: '#65676b',
                      '&:hover': { bgcolor: '#e4e6eb' },
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              )}
            {/* Attachment Previews */}
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              ref={attachmentInputRef}
              style={{ display: 'none' }}
              onChange={handleAttachmentSelect}
            />
            {pendingAttachments.length > 0 && (
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  borderTop: '1px solid #e4e6eb',
                  bgcolor: '#ffffff',
                  maxHeight: 200,
                  overflowY: 'auto',
                }}
              >
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                  {pendingAttachments.map((attachment) => {
                    const normalizedType = attachment.data?.type || attachment.type || '';
                    const isImage = normalizedType.startsWith('image');
                    const previewUrl = attachment.data?.signedUrl || attachment.previewUrl || attachment.data?.url;
                    return (
                      <Box
                        key={attachment.id}
                        sx={{
                          position: 'relative',
                          width: isImage ? 100 : 220,
                          minHeight: isImage ? 100 : 'auto',
                          borderRadius: '12px',
                          overflow: 'hidden',
                          bgcolor: isImage ? '#000' : '#f0f2f5',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                          transition: 'transform 0.2s',
                          '&:hover': {
                            transform: 'scale(1.02)',
                          },
                        }}
                      >
                        {isImage && previewUrl ? (
                          <Box
                            component="img"
                            src={previewUrl}
                            alt={attachment.name}
                            sx={{
                              width: '100%',
                              height: 100,
                              objectFit: 'cover',
                              display: 'block',
                            }}
                          />
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5 }}>
                            <Box
                              sx={{
                                width: 40,
                                height: 40,
                                borderRadius: '8px',
                                bgcolor: '#0084ff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <FileIcon sx={{ color: '#fff', fontSize: 20 }} />
                            </Box>
                            <Box sx={{ overflow: 'hidden', flex: 1 }}>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontSize: '0.875rem',
                                  fontWeight: 500,
                                  whiteSpace: 'nowrap',
                                  textOverflow: 'ellipsis',
                                  overflow: 'hidden',
                                  color: '#050505',
                                  mb: 0.5,
                                }}
                              >
                                {attachment.name}
                              </Typography>
                              <Typography 
                                variant="caption" 
                                sx={{ 
                                  color: '#65676b',
                                  fontSize: '0.75rem',
                                }}
                              >
                                {formatFileSize(attachment.size)}
                              </Typography>
                            </Box>
                          </Box>
                        )}
                        <IconButton
                          size="small"
                          onClick={() => handleRemoveAttachment(attachment.id)}
                          sx={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            width: 24,
                            height: 24,
                            bgcolor: 'rgba(0,0,0,0.6)',
                            color: '#fff',
                            '&:hover': { 
                              bgcolor: 'rgba(0,0,0,0.8)',
                            },
                          }}
                        >
                          <CloseIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                        {attachment.status === 'uploading' && (
                          <Box
                            sx={{
                              position: 'absolute',
                              inset: 0,
                              bgcolor: 'rgba(255,255,255,0.9)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 1,
                            }}
                          >
                            <CircularProgress size={24} sx={{ color: '#0084ff' }} />
                            <Typography variant="caption" sx={{ color: '#65676b', fontWeight: 500 }}>
                              Uploading...
                            </Typography>
                          </Box>
                        )}
                        {attachment.status === 'error' && (
                          <Box
                            sx={{
                              position: 'absolute',
                              inset: 0,
                              bgcolor: 'rgba(239, 68, 68, 0.95)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                            }}
                          >
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>
                              Upload failed
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            )}
              <Box
                sx={{
                  p: 1.5,
                  display: 'flex',
                  gap: 1,
                  alignItems: 'flex-end',
                }}
              >
                <IconButton 
                  sx={{ 
                    color: hasLeftChat ? '#c4c4c4' : '#65676b',
                    '&:hover': { bgcolor: hasLeftChat ? 'transparent' : '#e4e6eb' },
                  }}
                  onClick={handleAttachmentButtonClick}
                  disabled={hasLeftChat}
                >
                  <AttachFileIcon />
                </IconButton>
                <TextField
                  inputRef={messageInputRef}
                  fullWidth
                  multiline
                  maxRows={4}
                  placeholder={hasLeftChat ? 'You left this chat' : 'Type a message...'}
                  value={messageText}
                  onChange={handleMessageInputChange}
                  onKeyPress={handleKeyPress}
                  onPaste={handlePaste}
                   disabled={sending || hasLeftChat}
                  variant="outlined"
                  size="small"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '20px',
                      bgcolor: '#f0f2f5',
                      fontSize: '0.9375rem',
                      '& fieldset': {
                        border: 'none',
                      },
                      '&:hover fieldset': {
                        border: 'none',
                      },
                      '&.Mui-focused fieldset': {
                        border: 'none',
                      },
                      '&.Mui-focused': {
                        bgcolor: '#ffffff',
                      },
                    },
                  }}
                />
                {/* Mention Popup */}
                 {mentionPopup.show && selectedChat?.type === 'group' && !hasLeftChat && (
                  <MentionPopup
                    users={mentionUsers.filter(u => 
                      !mentionPopup.search || 
                      u.name?.toLowerCase().includes(mentionPopup.search) ||
                      u.email?.toLowerCase().includes(mentionPopup.search)
                    )}
                    position={mentionPopup.position}
                    onSelectUser={handleSelectMention}
                    onSelectAll={handleSelectMentionAll}
                    showAll={true}
                  />
                )}
                <IconButton
                  onClick={handleSendMessage}
                  disabled={sendDisabled}
                  sx={{
                    color: !sendDisabled ? '#0084ff' : '#c4c4c4',
                    bgcolor: !sendDisabled ? 'rgba(0, 132, 255, 0.1)' : 'transparent',
                    '&:hover': { 
                      bgcolor: !sendDisabled ? 'rgba(0, 132, 255, 0.2)' : 'transparent',
                    },
                    '&.Mui-disabled': {
                      color: '#c4c4c4',
                    },
                  }}
                >
                  <SendIcon />
                </IconButton>
              </Box>
            </Paper>
          </>
        ) : (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 2
            }}
          >
            <Typography variant="h5" color="textSecondary">
              Select a chat to start messaging
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {chats.length === 0 && 'No chats yet. Start a conversation!'}
            </Typography>
          </Box>
        )}
      </Box>

      {/* New Chat Dialog */}
      <NewChatDialog
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onChatCreated={handleNewChatCreated}
        existingChats={chats}
      />

      {/* Manage Members Dialog */}
      <ManageMembersDialog
        open={manageMembersOpen}
        onClose={() => setManageMembersOpen(false)}
        chat={selectedChat}
        onMemberAdded={handleMemberAdded}
        onMemberRemoved={handleMemberRemoved}
      />

      {/* Edit Chat Dialog */}
      <EditChatDialog
        open={editChatOpen}
        onClose={() => setEditChatOpen(false)}
        chat={selectedChat}
        onUpdate={handleUpdateChat}
        currentUserId={user._id}
      />

      {/* Forward Message Dialog */}
      <ForwardMessageDialog
        open={forwardMessageOpen}
        onClose={() => {
          setForwardMessageOpen(false);
          setMessageToForward(null);
        }}
        message={messageToForward}
        chats={chats}
        currentUserId={user._id}
        onForward={handleForward}
      />

      <Dialog
        open={summaryDialogOpen}
        onClose={() => {
          setSummaryDialogOpen(false);
          setSummaryError('');
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Chat Summary</DialogTitle>
        <DialogContent dividers>
          {summaryLoading && (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <CircularProgress />
              <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
                Summarizing the latest conversation...
              </Typography>
            </Box>
          )}

          {!summaryLoading && summaryError && (
            <Alert severity="error" sx={{ mb: chatSummary ? 2 : 0 }}>
              {summaryError}
            </Alert>
          )}

          {!summaryLoading && chatSummary && (
            <Stack spacing={2}>
              <Typography variant="body1">{chatSummary.summary}</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip
                  size="small"
                  color={getSentimentColor(chatSummary.sentiment)}
                  label={`Sentiment: ${chatSummary.sentiment || 'neutral'}`}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${chatSummary.totalMessages || 0} message${
                    (chatSummary.totalMessages || 0) === 1 ? '' : 's'
                  } analyzed`}
                />
                {chatSummary.timeframe?.start && chatSummary.timeframe?.end && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Range: ${new Date(chatSummary.timeframe.start).toLocaleString()} → ${new Date(
                      chatSummary.timeframe.end
                    ).toLocaleString()}`}
                  />
                )}
              </Stack>

              {Array.isArray(chatSummary.highlights) && chatSummary.highlights.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Highlights
                  </Typography>
                  <Box component="ul" sx={{ pl: 3, m: 0 }}>
                    {chatSummary.highlights.map((item, index) => (
                      <Typography key={`highlight-${index}`} component="li" variant="body2">
                        {item}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              )}

              {Array.isArray(chatSummary.actionItems) && chatSummary.actionItems.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Action Items
                  </Typography>
                  <Box component="ul" sx={{ pl: 3, m: 0 }}>
                    {chatSummary.actionItems.map((item, index) => (
                      <Typography key={`action-${index}`} component="li" variant="body2">
                        {item}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              )}

              {Array.isArray(chatSummary.followUpQuestions) && chatSummary.followUpQuestions.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Follow-up Questions
                  </Typography>
                  <Box component="ul" sx={{ pl: 3, m: 0 }}>
                    {chatSummary.followUpQuestions.map((item, index) => (
                      <Typography key={`question-${index}`} component="li" variant="body2">
                        {item}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleRefreshSummary}
            startIcon={<SummarizeIcon />}
            disabled={summaryLoading || !selectedChat}
          >
            Refresh
          </Button>
          <Button onClick={() => setSummaryDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Chat;

