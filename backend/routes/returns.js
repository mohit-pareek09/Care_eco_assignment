const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('./auth');

// Apply authentication middleware to all returns routes
router.use(authenticate);

// Get all returns with optional filtering
router.get('/', async (req, res) => {
  try {
    const { from_date, to_date, inventory_id } = req.query;
    
    let query = `
      SELECT r.*, 
        i.name as product_name, 
        i.sku, 
        i.supplier,
        i.purchase_price,
        i.mrp,
        i.discount
      FROM returns r
      JOIN inventory i ON r.inventory_id = i.id
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramIndex = 1;
    
    // Filter by date range
    if (from_date) {
      query += ` AND r.return_date >= $${paramIndex}`;
      queryParams.push(from_date);
      paramIndex++;
    }
    
    if (to_date) {
      query += ` AND r.return_date <= $${paramIndex}`;
      queryParams.push(to_date);
      paramIndex++;
    }
    
    // Filter by inventory item
    if (inventory_id) {
      query += ` AND r.inventory_id = $${paramIndex}`;
      queryParams.push(inventory_id);
      paramIndex++;
    }
    
    query += ` ORDER BY r.return_date DESC`;
    
    const result = await db.query(query, queryParams);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get returns statistics
router.get('/stats', async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    
    let dateFilter = '';
    const queryParams = [];
    let paramIndex = 1;
    
    if (from_date) {
      dateFilter += ` AND return_date >= $${paramIndex}`;
      queryParams.push(from_date);
      paramIndex++;
    }
    
    if (to_date) {
      dateFilter += ` AND return_date <= $${paramIndex}`;
      queryParams.push(to_date);
      paramIndex++;
    }
    
    // Total returns count
    const countQuery = `SELECT COUNT(*) FROM returns WHERE 1=1 ${dateFilter}`;
    const countResult = await db.query(countQuery, queryParams);
    
    // Total returns value (expected)
    const valueQuery = `SELECT SUM(expected_refund) FROM returns WHERE 1=1 ${dateFilter}`;
    const valueResult = await db.query(valueQuery, queryParams);
    
    // Total returns value (actual)
    const actualValueQuery = `SELECT SUM(actual_refund) FROM returns WHERE 1=1 ${dateFilter}`;
    const actualValueResult = await db.query(actualValueQuery, queryParams);
    
    // Returns by month (for charts)
    const monthlyQuery = `
      SELECT 
        DATE_TRUNC('month', return_date) as month,
        COUNT(*) as count,
        SUM(expected_refund) as expected_value,
        SUM(actual_refund) as actual_value
      FROM returns
      WHERE 1=1 ${dateFilter}
      GROUP BY DATE_TRUNC('month', return_date)
      ORDER BY month
    `;
    const monthlyResult = await db.query(monthlyQuery, queryParams);
    
    // Top 5 returned products
    const topProductsQuery = `
      SELECT 
        i.name as product_name,
        i.sku,
        COUNT(r.id) as return_count,
        SUM(r.quantity) as total_quantity
      FROM returns r
      JOIN inventory i ON r.inventory_id = i.id
      WHERE 1=1 ${dateFilter}
      GROUP BY i.name, i.sku
      ORDER BY return_count DESC
      LIMIT 5
    `;
    const topProductsResult = await db.query(topProductsQuery, queryParams);
    
    res.json({
      total_returns: parseInt(countResult.rows[0].count),
      total_expected_value: parseFloat(valueResult.rows[0].sum) || 0,
      total_actual_value: parseFloat(actualValueResult.rows[0].sum) || 0,
      difference: parseFloat(valueResult.rows[0].sum - actualValueResult.rows[0].sum) || 0,
      monthly_data: monthlyResult.rows,
      top_returned_products: topProductsResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a single return by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      SELECT r.*, 
        i.name as product_name, 
        i.sku, 
        i.supplier,
        i.purchase_price,
        i.mrp,
        i.discount
      FROM returns r
      JOIN inventory i ON r.inventory_id = i.id
      WHERE r.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Return not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Process a new return
router.post('/', async (req, res) => {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    const {
      inventory_id,
      quantity,
      return_date,
      expected_refund,
      actual_refund,
      notes
    } = req.body;
    
    // Basic validation
    if (!inventory_id || !quantity || quantity <= 0 || !expected_refund || !actual_refund) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Required fields missing or invalid',
        required: ['inventory_id', 'quantity', 'expected_refund', 'actual_refund'] 
      });
    }
    
    // Check if inventory item exists
    const itemCheck = await client.query('SELECT * FROM inventory WHERE id = $1', [inventory_id]);
    if (itemCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    // Create return record
    const returnResult = await client.query(`
      INSERT INTO returns(
        inventory_id, quantity, return_date, expected_refund, actual_refund, notes
      ) VALUES($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      inventory_id,
      quantity,
      return_date || new Date(),
      expected_refund,
      actual_refund,
      notes || null
    ]);
    
    // Update inventory quantity
    await client.query(
      'UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [quantity, inventory_id]
    );
    
    await client.query('COMMIT');
    
    // Get full return data with product info
    const result = await db.query(`
      SELECT r.*, 
        i.name as product_name, 
        i.sku, 
        i.supplier,
        i.purchase_price,
        i.mrp,
        i.discount
      FROM returns r
      JOIN inventory i ON r.inventory_id = i.id
      WHERE r.id = $1
    `, [returnResult.rows[0].id]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Update a return
router.put('/:id', async (req, res) => {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const {
      inventory_id,
      quantity,
      return_date,
      expected_refund,
      actual_refund,
      notes
    } = req.body;
    
    // Check if return exists
    const returnCheck = await client.query('SELECT * FROM returns WHERE id = $1', [id]);
    if (returnCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Return not found' });
    }
    
    const originalReturn = returnCheck.rows[0];
    
    // Basic validation
    if (!inventory_id || !quantity || quantity <= 0 || !expected_refund || !actual_refund) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Required fields missing or invalid',
        required: ['inventory_id', 'quantity', 'expected_refund', 'actual_refund'] 
      });
    }
    
    // Check if inventory item exists
    const itemCheck = await client.query('SELECT * FROM inventory WHERE id = $1', [inventory_id]);
    if (itemCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    // If inventory_id changed or quantity changed, update both old and new inventory items
    if (inventory_id !== originalReturn.inventory_id || quantity !== originalReturn.quantity) {
      // Add back the original quantity to the original inventory item
      await client.query(
        'UPDATE inventory SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [originalReturn.quantity, originalReturn.inventory_id]
      );
      
      // Remove the new quantity from the new inventory item
      await client.query(
        'UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [quantity, inventory_id]
      );
    }
    
    // Update return record
    const result = await client.query(`
      UPDATE returns SET
        inventory_id = $1,
        quantity = $2,
        return_date = $3,
        expected_refund = $4,
        actual_refund = $5,
        notes = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `, [
      inventory_id,
      quantity,
      return_date || originalReturn.return_date,
      expected_refund,
      actual_refund,
      notes || null,
      id
    ]);
    
    await client.query('COMMIT');
    
    // Get full return data with product info
    const updatedResult = await db.query(`
      SELECT r.*, 
        i.name as product_name, 
        i.sku, 
        i.supplier,
        i.purchase_price,
        i.mrp,
        i.discount
      FROM returns r
      JOIN inventory i ON r.inventory_id = i.id
      WHERE r.id = $1
    `, [id]);
    
    res.json(updatedResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Delete a return
router.delete('/:id', async (req, res) => {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // Check if return exists
    const returnCheck = await client.query('SELECT * FROM returns WHERE id = $1', [id]);
    if (returnCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Return not found' });
    }
    
    const returnToDelete = returnCheck.rows[0];
    
    // Add the returned quantity back to inventory
    await client.query(
      'UPDATE inventory SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [returnToDelete.quantity, returnToDelete.inventory_id]
    );
    
    // Delete the return
    await client.query('DELETE FROM returns WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
    res.json({ 
      message: 'Return deleted successfully',
      inventory_id: returnToDelete.inventory_id,
      quantity_restored: returnToDelete.quantity
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router; 