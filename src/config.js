// src/config.js

// 1. Check if we have a specific URL defined in an .env file
// 2. If not, check if we are in Production (Azure). If yes, use relative paths (assuming Node serves React)
// 3. If neither, default to Localhost (Development)

const hostname = window.location.hostname;

export const API_BASE_URL = 
  import.meta.env.VITE_API_URL || // Manual override via .env file
  (hostname === 'localhost' ? 'http://localhost:3001' : ''); // Dynamic switching