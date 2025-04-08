const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('./auth');

// Apply authentication middleware to all customer routes
router.use(authenticate);

// Get all customers
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM customers ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a single customer
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM customers WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching customer:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new customer
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    
    // Basic validation
    if (!name) {
      return res.status(400).json({ error: 'Customer name is required' });
    }
    
    const result = await db.query(
      'INSERT INTO customers(name, email, phone, address) VALUES($1, $2, $3, $4) RETURNING *',
      [name, email || null, phone || null, address || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating customer:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a customer
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address } = req.body;
    
    // Check if customer exists
    const customerCheck = await db.query('SELECT * FROM customers WHERE id = $1', [id]);
    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Basic validation
    if (!name) {
      return res.status(400).json({ error: 'Customer name is required' });
    }
    
    const result = await db.query(
      'UPDATE customers SET name = $1, email = $2, phone = $3, address = $4, updated_at = NOW() WHERE id = $5 RETURNING *',
      [name, email || null, phone || null, address || null, id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating customer:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a customer
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if customer exists
    const customerCheck = await db.query('SELECT * FROM customers WHERE id = $1', [id]);
    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Check if customer has invoices
    const invoiceCheck = await db.query('SELECT * FROM invoices WHERE customer_id = $1 LIMIT 1', [id]);
    if (invoiceCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot delete customer with linked invoices' });
    }
    
    await db.query('DELETE FROM customers WHERE id = $1', [id]);
    res.json({ message: 'Customer deleted successfully' });
  } catch (err) {
    console.error('Error deleting customer:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 