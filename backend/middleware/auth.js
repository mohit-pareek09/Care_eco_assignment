const jwt = require('jsonwebtoken');

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware to authenticate requests
const authenticateToken = (req, res, next) => {
  try {
    // Check for token in the Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      // For development environment, allow requests without authentication
      if (process.env.NODE_ENV === 'development') {
        console.log('Warning: No auth token provided, but proceeding in development mode');
        req.user = { id: 1, role: 'admin' }; // Default user for development
        return next();
      }
      return res.status(401).json({ error: 'Authorization token required' });
    }
    
    // Extract the token from the header
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Token not provided' });
    }
    
    // Verify the token
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        console.error('JWT verification error:', err);
        return res.status(401).json({ error: 'Invalid token' });
      }
      
      // Add the user data to the request
      req.user = decoded;
      next();
    });
  } catch (err) {
    console.error('Authentication error:', err);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = { authenticateToken }; 