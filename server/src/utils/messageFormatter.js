const { generateSignedUrl, addSignedUrlToUserAvatar } = require('./s3Upload');

const addSignedUrlsToAttachments = (attachments = []) => {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((attachment) => ({
    ...attachment,
    signedUrl: generateSignedUrl(attachment.url) || attachment.url
  }));
};

const formatMessageForClient = (message) => {
  if (!message) return null;
  const msg = message.toObject ? message.toObject() : { ...message };
  if (msg.attachments && msg.attachments.length > 0) {
    msg.attachments = addSignedUrlsToAttachments(msg.attachments);
  }
  // Add signed URL to sender avatar if present
  if (msg.sender) {
    msg.sender = addSignedUrlToUserAvatar(msg.sender);
  }
  return msg;
};

module.exports = {
  addSignedUrlsToAttachments,
  formatMessageForClient
};

