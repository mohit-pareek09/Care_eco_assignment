const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('./auth');

// Apply authentication middleware to all category routes
router.use(authenticate);

// Get all categories
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM categories ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single category by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM categories WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new category
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }
    
    // Check if category already exists
    const existingCheck = await db.query('SELECT * FROM categories WHERE name = $1', [name]);
    if (existingCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Category with this name already exists' });
    }
    
    const result = await db.query(
      'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update category
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }
    
    // Check if category exists
    const checkResult = await db.query('SELECT * FROM categories WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Check if name already exists for a different category
    const existingCheck = await db.query('SELECT * FROM categories WHERE name = $1 AND id != $2', [name, id]);
    if (existingCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Category with this name already exists' });
    }
    
    const result = await db.query(
      'UPDATE categories SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [name, description || null, id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete category
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if category exists
    const checkResult = await db.query('SELECT * FROM categories WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Check if category is in use by inventory items
    const inventoryCheck = await db.query('SELECT COUNT(*) FROM inventory WHERE category_id = $1', [id]);
    if (parseInt(inventoryCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete category that is in use by inventory items',
        count: parseInt(inventoryCheck.rows[0].count)
      });
    }
    
    await db.query('DELETE FROM categories WHERE id = $1', [id]);
    
    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 