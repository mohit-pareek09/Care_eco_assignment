const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db');
const { authenticateToken } = require('./auth');

// Apply authentication middleware to all user routes
router.use(authenticateToken);

// Get all users (admin only)
router.get('/', async (req, res) => {
  try {
    // Check if requesting user is admin
    const adminCheck = await db.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    if (!adminCheck.rows[0] || !adminCheck.rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const result = await db.query(
      'SELECT id, name, email, is_admin, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user by ID (admin or own profile)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is accessing own profile or is admin
    if (req.user.userId !== parseInt(id)) {
      const adminCheck = await db.query(
        'SELECT is_admin FROM users WHERE id = $1',
        [req.user.userId]
      );
      
      if (!adminCheck.rows[0] || !adminCheck.rows[0].is_admin) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    const result = await db.query(
      'SELECT id, name, email, is_admin, created_at, updated_at FROM users WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new user (admin only)
router.post('/', async (req, res) => {
  try {
    // Check if requesting user is admin
    const adminCheck = await db.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    if (!adminCheck.rows[0] || !adminCheck.rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { name, email, password, is_admin } = req.body;
    
    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    
    // Check if user already exists
    const userCheck = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Create user
    const result = await db.query(
      'INSERT INTO users (name, email, password_hash, is_admin) VALUES ($1, $2, $3, $4) RETURNING id, name, email, is_admin, created_at',
      [name, email, hashedPassword, is_admin || false]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user (admin or own profile)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, is_admin } = req.body;
    
    // Check if user is updating own profile or is admin
    const isSelfUpdate = req.user.userId === parseInt(id);
    
    if (!isSelfUpdate) {
      const adminCheck = await db.query(
        'SELECT is_admin FROM users WHERE id = $1',
        [req.user.userId]
      );
      
      if (!adminCheck.rows[0] || !adminCheck.rows[0].is_admin) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    // Check if user exists
    const userCheck = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Build update query
    let query = 'UPDATE users SET ';
    const queryParams = [];
    let paramIndex = 1;
    
    if (name) {
      query += `name = $${paramIndex}, `;
      queryParams.push(name);
      paramIndex++;
    }
    
    if (email) {
      // Check if email is already taken by another user
      if (email !== userCheck.rows[0].email) {
        const emailCheck = await db.query('SELECT * FROM users WHERE email = $1 AND id != $2', [email, id]);
        if (emailCheck.rows.length > 0) {
          return res.status(400).json({ error: 'Email is already taken' });
        }
      }
      
      query += `email = $${paramIndex}, `;
      queryParams.push(email);
      paramIndex++;
    }
    
    if (password) {
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      query += `password_hash = $${paramIndex}, `;
      queryParams.push(hashedPassword);
      paramIndex++;
    }
    
    // Only admin can update admin status, and an admin cannot remove their own admin status
    if (is_admin !== undefined) {
      // Check if requesting user is admin
      const adminCheck = await db.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
      
      if (!adminCheck.rows[0] || !adminCheck.rows[0].is_admin) {
        return res.status(403).json({ error: 'Only admins can change admin status' });
      }
      
      // Prevent removing admin status from yourself
      if (isSelfUpdate && !is_admin && adminCheck.rows[0].is_admin) {
        return res.status(400).json({ error: 'Cannot remove your own admin status' });
      }
      
      query += `is_admin = $${paramIndex}, `;
      queryParams.push(is_admin);
      paramIndex++;
    }
    
    // Add updated_at timestamp
    query += `updated_at = CURRENT_TIMESTAMP `;
    
    // Finalize query
    query += `WHERE id = $${paramIndex} RETURNING id, name, email, is_admin, created_at, updated_at`;
    queryParams.push(id);
    
    // Execute update if there are fields to update
    if (paramIndex > 1) {
      const result = await db.query(query, queryParams);
      res.json(result.rows[0]);
    } else {
      // No fields to update
      const result = await db.query(
        'SELECT id, name, email, is_admin, created_at, updated_at FROM users WHERE id = $1',
        [id]
      );
      res.json(result.rows[0]);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if requesting user is admin
    const adminCheck = await db.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.user.userId]
    );
    
    if (!adminCheck.rows[0] || !adminCheck.rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Prevent deleting yourself
    if (req.user.userId === parseInt(id)) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    // Check if user exists
    const userCheck = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Delete user
    await db.query('DELETE FROM users WHERE id = $1', [id]);
    
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change password (own account only)
router.post('/change-password', async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    // Get user data
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Verify current password
    const passwordMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(new_password, saltRounds);
    
    // Update password
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, req.user.userId]
    );
    
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 