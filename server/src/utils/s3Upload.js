const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
  signatureVersion: 'v4'
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

const allowedMimes = [
  // Images
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/plain',
  'text/csv'
];

const fileFilter = (req, file, cb) => {
  console.log('📎 File upload attempt:', {
    fieldname: file.fieldname,
    originalname: file.originalname,
    mimetype: file.mimetype,
    encoding: file.encoding
  });
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    console.error('❌ File rejected - mimetype:', file.mimetype);
    cb(new Error(`Invalid file type: ${file.mimetype}. Only images and documents are allowed.`));
  }
};

// More permissive filter for avatar images only
const avatarFileFilter = (req, file, cb) => {
  console.log('🖼️ Avatar upload attempt:', {
    fieldname: file.fieldname,
    originalname: file.originalname,
    mimetype: file.mimetype,
    encoding: file.encoding
  });
  
  // Check if it's an image by mimetype OR file extension
  const isImageMime = file.mimetype && file.mimetype.startsWith('image/');
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const hasImageExtension = imageExtensions.some(ext => 
    file.originalname.toLowerCase().endsWith(ext)
  );
  
  if (isImageMime || hasImageExtension) {
    cb(null, true);
  } else {
    console.error('❌ Avatar rejected - mimetype:', file.mimetype, 'filename:', file.originalname);
    cb(new Error(`Invalid avatar file type: ${file.mimetype}. Only images are allowed.`));
  }
};

const createUploader = ({ baseFolder = 'uploads', useChatId = false, fileFilterFn = fileFilter } = {}) => {
  return multer({
    storage: multerS3({
      s3: s3,
      bucket: BUCKET_NAME,
      key: function (req, file, cb) {
        const userId = req.user?._id || 'anonymous';
        const timestamp = Date.now();
        const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const ext = path.extname(originalName);
        const nameWithoutExt = path.basename(originalName, ext);
        const chatId = req.params?.chatId || req.body?.chatId;
        const folder = useChatId && chatId
          ? `${baseFolder}/${chatId}`
          : `${baseFolder}/${userId}`;
        const fileName = `${folder}/${timestamp}-${nameWithoutExt}${ext}`;
        cb(null, fileName);
      },
      contentType: multerS3.AUTO_CONTENT_TYPE,
      metadata: function (req, file, cb) {
        cb(null, {
          fieldName: file.fieldname,
          uploadedBy: req.user?._id?.toString() || 'anonymous'
        });
      }
    }),
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: fileFilterFn
  });
};

// Default upload (tasks)
const upload = createUploader({ baseFolder: 'tasks' });
const chatUpload = createUploader({ baseFolder: 'chats', useChatId: true });
const avatarUpload = createUploader({ baseFolder: 'avatars', fileFilterFn: avatarFileFilter });

const extractS3KeyFromUrl = (fileUrl) => {
  if (!fileUrl || !BUCKET_NAME) return null;
  try {
    const parsedUrl = new URL(fileUrl);
    const hostParts = parsedUrl.hostname.split('.');

    if (parsedUrl.hostname === `${BUCKET_NAME}.s3.amazonaws.com` || hostParts[0] === BUCKET_NAME) {
      return decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
    }

    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    const bucketIndex = segments.indexOf(BUCKET_NAME);
    if (bucketIndex !== -1) {
      return decodeURIComponent(segments.slice(bucketIndex + 1).join('/'));
    }

    return decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
  } catch (error) {
    try {
      const urlParts = fileUrl.split(`${BUCKET_NAME}/`);
      if (urlParts.length > 1) {
        return urlParts[1];
      }
    } catch (_) {
      return null;
    }
    return null;
  }
};

const generateSignedUrl = (fileUrl, expiresInSeconds = 60 * 60 * 24) => {
  const key = extractS3KeyFromUrl(fileUrl);
  if (!key) return null;
  try {
    return s3.getSignedUrl('getObject', {
      Bucket: BUCKET_NAME,
      Key: key,
      Expires: expiresInSeconds
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return null;
  }
};

// Helper function to determine file type
const getFileType = (mimetype) => {
  if (mimetype.startsWith('image/')) {
    return 'image';
  } else if (mimetype.includes('pdf') || mimetype.includes('word') || mimetype.includes('excel') || mimetype.includes('text')) {
    return 'document';
  }
  return 'file';
};

// Helper function to delete file from S3
const deleteFileFromS3 = async (fileUrl) => {
  try {
    if (!fileUrl || !fileUrl.includes(BUCKET_NAME)) {
      return; // Not an S3 URL, skip deletion
    }

    // Extract key from URL
    const urlParts = fileUrl.split('/');
    const key = urlParts.slice(urlParts.indexOf(BUCKET_NAME) + 1).join('/');

    await s3.deleteObject({
      Bucket: BUCKET_NAME,
      Key: key
    }).promise();
  } catch (error) {
    console.error('Error deleting file from S3:', error);
    // Don't throw error, just log it
  }
};

// Helper function to add signed URLs to user avatar
// Handles single user, array of users, or nested user objects
const addSignedUrlToUserAvatar = (user) => {
  if (!user) return user;
  
  // Handle array of users
  if (Array.isArray(user)) {
    return user.map(u => addSignedUrlToUserAvatar(u));
  }
  
  // Handle Mongoose document
  const userObj = user.toObject ? user.toObject() : user;
  
  // If user has avatar and it's an S3 URL, generate signed URL
  if (userObj.avatar && typeof userObj.avatar === 'string' && userObj.avatar.includes('s3.amazonaws.com')) {
    const signedUrl = generateSignedUrl(userObj.avatar, 60 * 60 * 24 * 7); // 7 days
    if (signedUrl) {
      userObj.avatar = signedUrl;
    }
  }
  
  return userObj;
};

module.exports = {
  upload,
  chatUpload,
  avatarUpload,
  createUploader,
  extractS3KeyFromUrl,
  generateSignedUrl,
  getFileType,
  deleteFileFromS3,
  addSignedUrlToUserAvatar,
  s3
};

