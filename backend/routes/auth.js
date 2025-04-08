const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Register a new user
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Basic validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Check if email already exists
    const userCheck = await db.query(
      'SELECT * FROM users WHERE email = $1', 
      [email]
    );
    
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user
    const result = await db.query(
      `INSERT INTO users(email, password, role) 
       VALUES($1, $2, $3) RETURNING id, email, role`,
      [email, hashedPassword, 'user']
    );
    
    // Generate token
    const token = jwt.sign(
      { userId: result.rows[0].id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.status(201).json({
      token,
      user: {
        id: result.rows[0].id,
        email: result.rows[0].email,
        role: result.rows[0].role
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user by email
    const result = await db.query(
      'SELECT * FROM users WHERE email = $1', 
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate token
    const token = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    // Send response
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Authentication middleware
const authenticate = (req, res, next) => {
  // Skip authentication in development mode
  if (process.env.NODE_ENV === 'development') {
    console.log('Skipping authentication in development mode');
    req.userId = 1; // Default user ID for development
    return next();
  }

  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = { router, authenticate }; 