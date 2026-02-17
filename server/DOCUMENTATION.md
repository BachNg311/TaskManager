# API Endpoints

This document lists all backend API endpoints discovered in the repository (mounted in `server/src/app.js` and defined under `server/src/routes`). Most endpoints under `/api/*` are protected by authentication unless noted.

**Health**
- GET /health — Health check

**Auth** (`/api/auth`)
- POST /api/auth/register — Register user
- POST /api/auth/login — Login
- POST /api/auth/google — Login or register with Google (ID token)
- GET /api/auth/me — Get current authenticated user
- POST /api/auth/upload-avatar — Upload avatar (multipart)
- POST /api/auth/forgot-password — Request password reset (send OTP)
- POST /api/auth/reset-password — Reset password with OTP

**Tasks** (`/api/tasks`) — protected
- GET /api/tasks/stats — Tasks statistics
- GET /api/tasks/reports/users — Users task report (admin/manager)
- GET /api/tasks/reports/detailed — Detailed task report (admin/manager)
- POST /api/tasks/upload — Upload attachment for tasks (multipart)
- GET /api/tasks/attachments/download — Get attachment download URL
- GET /api/tasks/ — List tasks
- GET /api/tasks/:id — Get single task
- POST /api/tasks/ — Create task (authorize: manager, admin)
- PUT /api/tasks/:id — Update task
- PATCH /api/tasks/:id/status — Update task status
- PATCH /api/tasks/:id/checklist — Update checklist
- DELETE /api/tasks/:id — Delete task
- POST /api/tasks/:id/comments — Add comment to task

**Projects** (`/api/projects`) — protected
- GET /api/projects/ — List projects
- GET /api/projects/:id — Get project
- PUT /api/projects/:id — Update project
- DELETE /api/projects/:id — Delete project
- POST /api/projects/:id/members — Add member to project

**Chats** (`/api/chats`) — protected
- GET /api/chats/ — List chats
- GET /api/chats/direct/:userId — Get or create direct chat with user
- POST /api/chats/group — Create group chat
- POST /api/chats/forward — Forward a message to one or more chats
- GET /api/chats/:id — Get chat details
- GET /api/chats/:id/messages — Get messages for chat
- PUT /api/chats/:id — Update chat
- POST /api/chats/:id/leave — Leave chat
- POST /api/chats/:chatId/attachments — Upload chat attachment (multipart)
- POST /api/chats/:id/participants — Add participant to chat
- DELETE /api/chats/:id/participants/:userId — Remove participant
- DELETE /api/chats/:id — Delete chat

**Notifications** (`/api/notifications`) — protected
- GET /api/notifications/ — List notifications
- GET /api/notifications/unread-count — Get unread count
- PUT /api/notifications/:id/read — Mark notification as read
- PUT /api/notifications/read-all — Mark all as read
- DELETE /api/notifications/:id — Delete notification

**Users** (`/api/users`) — protected
- GET /api/users/ — List users
- GET /api/users/:id — Get user
- PUT /api/users/:id — Update user

**AI** (`/api/ai`) — protected
- POST /api/ai/task-bot — Create tasks via AI (authorize: manager, admin)
- POST /api/ai/chat-summary — Summarize chat via AI
- POST /api/ai/task-summary — Summarize task via AI

---
Sources:
- Route mounts: `server/src/app.js`
- Route files: `server/src/routes/*.js`

