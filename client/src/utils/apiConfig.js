/**
 * Utility to get the API URL based on the current environment
 * Automatically detects if running on production or development
 */
export const getApiUrl = () => {
  // If environment variable is set, use it
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // Check if we're on production frontend
  if (window.location.hostname === 'task-manager-client-eight-kappa.vercel.app' || 
      window.location.hostname.includes('vercel.app')) {
    return 'https://task-manager-server-pearl.vercel.app/api';
  }
  
  // Default to localhost for development
  return 'http://localhost:5000/api';
};

/**
 * Get the base URL (without /api) for Socket.IO connections
 */
export const getSocketUrl = () => {
  const apiUrl = getApiUrl();
  return apiUrl.replace('/api', '');
};

