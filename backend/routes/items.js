const express = require('express');
const router = express.Router();
const db = require('../db');

// This is a legacy route that forwards requests to the inventory routes
// It will be removed in a future version

router.get('/', (req, res) => {
  res.status(301).json({
    message: 'This endpoint is deprecated. Please use /api/inventory instead',
    redirect: '/api/inventory'
  });
});

router.get('/:id', (req, res) => {
  res.status(301).json({
    message: 'This endpoint is deprecated. Please use /api/inventory/:id instead',
    redirect: `/api/inventory/${req.params.id}`
  });
});

router.post('/', (req, res) => {
  res.status(301).json({
    message: 'This endpoint is deprecated. Please use /api/inventory instead',
    redirect: '/api/inventory'
  });
});

router.put('/:id', (req, res) => {
  res.status(301).json({
    message: 'This endpoint is deprecated. Please use /api/inventory/:id instead',
    redirect: `/api/inventory/${req.params.id}`
  });
});

router.delete('/:id', (req, res) => {
  res.status(301).json({
    message: 'This endpoint is deprecated. Please use /api/inventory/:id instead',
    redirect: `/api/inventory/${req.params.id}`
  });
});

// Get all items
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM items ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a single item
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM items WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create an item
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const result = await db.query(
      'INSERT INTO items (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update an item
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const result = await db.query(
      'UPDATE items SET name = $1, description = $2 WHERE id = $3 RETURNING *',
      [name, description, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete an item
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM items WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 