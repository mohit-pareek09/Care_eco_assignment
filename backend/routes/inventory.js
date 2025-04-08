const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('./auth');

// Apply authentication middleware to all inventory routes
router.use(authenticate);

// Get all inventory items with optional filtering
router.get('/', async (req, res) => {
  try {
    const { category, search, expiring, expired } = req.query;
    
    let query = `
      SELECT i.*, c.name as category_name 
      FROM inventory i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramIndex = 1;
    
    // Filter by category
    if (category) {
      query += ` AND i.category_id = $${paramIndex}`;
      queryParams.push(category);
      paramIndex++;
    }
    
    // Search by name, sku, or specifics
    if (search) {
      query += ` AND (
        i.name ILIKE $${paramIndex} OR 
        i.sku ILIKE $${paramIndex} OR 
        i.specifics ILIKE $${paramIndex} OR
        i.supplier ILIKE $${paramIndex}
      )`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }
    
    // Filter by expiring soon (within 30 days and not expired)
    if (expiring === 'true') {
      query += ` AND i.expiry_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')`;
    }
    
    // Filter by already expired
    if (expired === 'true') {
      query += ` AND i.expiry_date < CURRENT_DATE`;
    }
    
    query += ` ORDER BY i.created_at DESC`;
    
    const result = await db.query(query, queryParams);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get inventory statistics
router.get('/stats', async (req, res) => {
  try {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Total inventory count
      const totalResult = await client.query('SELECT COUNT(*) as total FROM inventory');
      
      // Total inventory value
      const valueResult = await client.query('SELECT SUM(quantity * purchase_price) as total_value FROM inventory');
      
      // Total inventory retail value
      const retailValueResult = await client.query('SELECT SUM(quantity * mrp) as total_retail_value FROM inventory');
      
      // Items expiring soon (within 30 days)
      const expiringResult = await client.query(`
        SELECT COUNT(*) as expiring_soon 
        FROM inventory 
        WHERE expiry_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
      `);
      
      // Items already expired
      const expiredResult = await client.query(`
        SELECT COUNT(*) as expired 
        FROM inventory 
        WHERE expiry_date < CURRENT_DATE
      `);
      
      // Items by category
      const categoryResult = await client.query(`
        SELECT c.name, COUNT(i.id) as count
        FROM inventory i
        JOIN categories c ON i.category_id = c.id
        GROUP BY c.name
        ORDER BY count DESC
      `);
      
      // Low stock items (less than 10 units)
      const lowStockResult = await client.query(`
        SELECT COUNT(*) as low_stock
        FROM inventory
        WHERE quantity < 10
      `);
      
      await client.query('COMMIT');
      
      res.json({
        total_items: parseInt(totalResult.rows[0].total),
        total_value: parseFloat(valueResult.rows[0].total_value) || 0,
        total_retail_value: parseFloat(retailValueResult.rows[0].total_retail_value) || 0,
        potential_profit: parseFloat(retailValueResult.rows[0].total_retail_value - valueResult.rows[0].total_value) || 0,
        expiring_soon: parseInt(expiringResult.rows[0].expiring_soon),
        expired: parseInt(expiredResult.rows[0].expired),
        categories: categoryResult.rows,
        low_stock: parseInt(lowStockResult.rows[0].low_stock)
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a single inventory item by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      SELECT i.*, c.name as category_name 
      FROM inventory i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new inventory item
router.post('/', async (req, res) => {
  try {
    const {
      name,
      specifics,
      sku,
      category_id,
      quantity,
      purchase_date,
      purchase_price,
      mrp,
      discount,
      expiry_date,
      supplier
    } = req.body;
    
    // Basic validation
    if (!name || !category_id || !quantity || !purchase_price || !mrp) {
      return res.status(400).json({ 
        error: 'Required fields missing',
        required: ['name', 'category_id', 'quantity', 'purchase_price', 'mrp'] 
      });
    }
    
    // Check if category exists
    const categoryCheck = await db.query('SELECT * FROM categories WHERE id = $1', [category_id]);
    if (categoryCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    
    // Check for duplicate SKU if provided
    if (sku) {
      const skuCheck = await db.query('SELECT * FROM inventory WHERE sku = $1', [sku]);
      if (skuCheck.rows.length > 0) {
        return res.status(400).json({ error: 'SKU already exists' });
      }
    }
    
    const result = await db.query(`
      INSERT INTO inventory(
        name, specifics, sku, category_id, quantity, 
        purchase_date, purchase_price, mrp, discount, expiry_date, supplier
      ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      name,
      specifics || null,
      sku || null,
      category_id,
      quantity,
      purchase_date || new Date(),
      purchase_price,
      mrp,
      discount || ((mrp - purchase_price) / mrp * 100).toFixed(2),
      expiry_date || null,
      supplier || null
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update an inventory item
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      specifics,
      sku,
      category_id,
      quantity,
      purchase_date,
      purchase_price,
      mrp,
      discount,
      expiry_date,
      supplier
    } = req.body;
    
    // Check if item exists
    const itemCheck = await db.query('SELECT * FROM inventory WHERE id = $1', [id]);
    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    // Basic validation
    if (!name || !category_id || !quantity || !purchase_price || !mrp) {
      return res.status(400).json({ 
        error: 'Required fields missing',
        required: ['name', 'category_id', 'quantity', 'purchase_price', 'mrp'] 
      });
    }
    
    // Check if category exists
    const categoryCheck = await db.query('SELECT * FROM categories WHERE id = $1', [category_id]);
    if (categoryCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    
    // Check for duplicate SKU if it was changed
    if (sku && sku !== itemCheck.rows[0].sku) {
      const skuCheck = await db.query('SELECT * FROM inventory WHERE sku = $1 AND id != $2', [sku, id]);
      if (skuCheck.rows.length > 0) {
        return res.status(400).json({ error: 'SKU already exists' });
      }
    }
    
    const result = await db.query(`
      UPDATE inventory SET
        name = $1,
        specifics = $2,
        sku = $3,
        category_id = $4,
        quantity = $5,
        purchase_date = $6,
        purchase_price = $7,
        mrp = $8,
        discount = $9,
        expiry_date = $10,
        supplier = $11,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
      RETURNING *
    `, [
      name,
      specifics || null,
      sku || null,
      category_id,
      quantity,
      purchase_date || itemCheck.rows[0].purchase_date,
      purchase_price,
      mrp,
      discount || ((mrp - purchase_price) / mrp * 100).toFixed(2),
      expiry_date || itemCheck.rows[0].expiry_date,
      supplier || null,
      id
    ]);
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete an inventory item
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if item exists
    const itemCheck = await db.query('SELECT * FROM inventory WHERE id = $1', [id]);
    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    // Check if the item has been used in any invoices
    const invoiceCheck = await db.query(
      'SELECT COUNT(*) FROM invoice_items WHERE inventory_id = $1',
      [id]
    );
    
    if (parseInt(invoiceCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Cannot delete item that has been used in invoices',
        count: parseInt(invoiceCheck.rows[0].count)
      });
    }
    
    // Check if the item has any returns
    const returnCheck = await db.query(
      'SELECT COUNT(*) FROM returns WHERE inventory_id = $1',
      [id]
    );
    
    if (parseInt(returnCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Cannot delete item that has returns associated with it',
        count: parseInt(returnCheck.rows[0].count)
      });
    }
    
    await db.query('DELETE FROM inventory WHERE id = $1', [id]);
    
    res.json({ message: 'Inventory item deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update inventory quantity
router.patch('/:id/quantity', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, operation } = req.body;
    
    if (!quantity || isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Valid quantity is required' });
    }
    
    const itemCheck = await db.query('SELECT * FROM inventory WHERE id = $1', [id]);
    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    let newQuantity;
    
    if (operation === 'add') {
      newQuantity = itemCheck.rows[0].quantity + parseInt(quantity);
    } else if (operation === 'remove') {
      newQuantity = itemCheck.rows[0].quantity - parseInt(quantity);
      if (newQuantity < 0) {
        return res.status(400).json({ error: 'Insufficient quantity available' });
      }
    } else {
      // Just set the quantity directly
      newQuantity = parseInt(quantity);
    }
    
    const result = await db.query(
      'UPDATE inventory SET quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [newQuantity, id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 