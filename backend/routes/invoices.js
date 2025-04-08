const express = require('express');
const router = express.Router();
const db = require('../db');
// const { authenticateToken } = require('../middleware/auth');

// Completely disable authentication for testing
// router.use(authenticateToken);

// Get all invoices with pagination and optional filtering
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      sort_by = 'date', 
      sort_order = 'DESC',
      from_date,
      to_date,
      customer
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    // Build query with filters
    let query = `
      SELECT i.*, COUNT(*) OVER() as total_count
      FROM invoices i
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramIndex = 1;
    
    // Add date range filter
    if (from_date) {
      query += ` AND i.date >= $${paramIndex}`;
      queryParams.push(from_date);
      paramIndex++;
    }
    
    if (to_date) {
      query += ` AND i.date <= $${paramIndex}`;
      queryParams.push(to_date);
      paramIndex++;
    }
    
    // Add customer filter
    if (customer) {
      query += ` AND i.customer_name ILIKE $${paramIndex}`;
      queryParams.push(`%${customer}%`);
      paramIndex++;
    }
    
    // Add sorting and pagination
    query += ` ORDER BY i.${sort_by} ${sort_order}`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);
    
    const result = await db.query(query, queryParams);
    
    // Get total count for pagination
    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
    
    res.json({
      invoices: result.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (err) {
    console.error('Error fetching invoices:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a single invoice with its items
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get invoice details
    const invoiceResult = await db.query(`
      SELECT * FROM invoices WHERE id = $1
    `, [id]);
    
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Get invoice items
    const itemsResult = await db.query(`
      SELECT 
        ii.*,
        inv.name as product_name,
        inv.sku,
        inv.specifics
      FROM invoice_items ii
      JOIN inventory inv ON ii.inventory_id = inv.id
      WHERE ii.invoice_id = $1
      ORDER BY ii.id
    `, [id]);
    
    // Return combined data
    res.json({
      ...invoiceResult.rows[0],
      items: itemsResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new invoice with items
router.post('/', async (req, res) => {
  const client = await db.getClient();
  
  try {
    console.log('Invoice creation request received:', JSON.stringify(req.body, null, 2));
    await client.query('BEGIN');
    
    const {
      invoice_number,
      customer_name,
      customer_email,
      customer_phone,
      invoice_date,
      due_date,
      items,
      subtotal,
      tax_rate,
      tax_amount,
      discount_amount,
      total_amount,
      payment_method,
      payment_status
    } = req.body;
    
    console.log('Parsed request body:', { 
      invoice_number, customer_name, items: items?.length, 
      total_amount, payment_method, payment_status 
    });
    
    // Basic validation
    if (!invoice_number || !customer_name || !items || !items.length || !total_amount) {
      const missingFields = [];
      if (!invoice_number) missingFields.push('invoice_number');
      if (!customer_name) missingFields.push('customer_name');
      if (!items || !items.length) missingFields.push('items');
      if (!total_amount) missingFields.push('total_amount');
      
      console.log('Validation failed, missing fields:', missingFields);
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Required fields missing',
        required: ['invoice_number', 'customer_name', 'items', 'total_amount'],
        missing: missingFields,
        received: { invoice_number, customer_name, items: items?.length, total_amount } 
      });
    }
    
    console.log('Checking if invoice number exists:', invoice_number);
    // Check if invoice number already exists
    const invoiceCheck = await client.query('SELECT * FROM invoices WHERE invoice_number = $1', [invoice_number]);
    if (invoiceCheck.rows.length > 0) {
      console.log('Invoice number already exists:', invoice_number);
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invoice number already exists' });
    }
    
    console.log('Creating invoice record with payment_method:', payment_method);
    // Create invoice
    const invoiceQuery = `
      INSERT INTO invoices(
        invoice_number, customer, customer_name, customer_email, customer_phone, 
        date, due_date, subtotal, tax_rate, tax_amount, 
        discount_amount, total, payment_method, payment_status, amount
      ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;
    
    const invoiceParams = [
      invoice_number,
      customer_name, // Use customer_name for the customer field as well
      customer_name,
      customer_email || null,
      customer_phone || null,
      invoice_date || new Date(),
      due_date || null,
      subtotal || total_amount,
      tax_rate || 0,
      tax_amount || 0,
      discount_amount || 0,
      total_amount,
      payment_method || 'cash',
      payment_status || 'pending',
      total_amount // Set amount equal to total_amount
    ];
    
    console.log('Invoice parameters:', invoiceParams);
    
    // Create invoice
    try {
      const invoiceResult = await client.query(invoiceQuery, invoiceParams);
      const invoiceId = invoiceResult.rows[0].id;
      console.log('Created invoice with ID:', invoiceId);
      
      // Create invoice items and update inventory
      for (const item of items) {
        // Validate item
        if (!item.inventory_id || !item.quantity || !item.unit_price || !item.total_price) {
          console.error('Invalid item data:', item);
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            error: 'Invalid item data',
            required_item_fields: ['inventory_id', 'quantity', 'unit_price', 'total_price'],
            received_item: item
          });
        }
        
        console.log('Processing item:', item.inventory_id);
        
        // Check if inventory item exists and has enough quantity
        const inventoryCheck = await client.query('SELECT * FROM inventory WHERE id = $1', [item.inventory_id]);
        
        if (inventoryCheck.rows.length === 0) {
          console.error('Inventory item not found:', item.inventory_id);
          await client.query('ROLLBACK');
          return res.status(404).json({ 
            error: 'Inventory item not found',
            inventory_id: item.inventory_id
          });
        }
        
        if (inventoryCheck.rows[0].quantity < item.quantity) {
          console.error('Insufficient inventory quantity for item:', item.inventory_id);
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            error: 'Insufficient inventory quantity',
            product: inventoryCheck.rows[0].name,
            available: inventoryCheck.rows[0].quantity,
            requested: item.quantity
          });
        }
        
        console.log('Creating invoice item for inventory_id:', item.inventory_id);
        // Create invoice item
        try {
          await client.query(`
            INSERT INTO invoice_items(
              invoice_id, inventory_id, quantity, unit_price, total_price
            ) VALUES($1, $2, $3, $4, $5)
          `, [
            invoiceId,
            item.inventory_id,
            item.quantity,
            item.unit_price,
            item.total_price
          ]);
        } catch (err) {
          console.error('Error creating invoice item:', err);
          await client.query('ROLLBACK');
          return res.status(500).json({ 
            error: 'Failed to create invoice item',
            message: err.message,
            item
          });
        }
        
        console.log('Updating inventory quantity for item:', item.inventory_id);
        // Update inventory quantity
        try {
          await client.query(
            'UPDATE inventory SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [item.quantity, item.inventory_id]
          );
        } catch (err) {
          console.error('Error updating inventory:', err);
          await client.query('ROLLBACK');
          return res.status(500).json({ 
            error: 'Failed to update inventory',
            message: err.message,
            item
          });
        }
      }
      
      await client.query('COMMIT');
      console.log('Invoice transaction committed successfully');
      
      // Get complete invoice data
      const result = await db.query(`
        SELECT * FROM invoices WHERE id = $1
      `, [invoiceId]);
      
      // Get invoice items
      const itemsResult = await db.query(`
        SELECT 
          ii.*,
          inv.name as product_name,
          inv.sku,
          inv.specifics
        FROM invoice_items ii
        JOIN inventory inv ON ii.inventory_id = inv.id
        WHERE ii.invoice_id = $1
        ORDER BY ii.id
      `, [invoiceId]);
      
      // Return complete invoice data
      res.status(201).json({
        ...result.rows[0],
        items: itemsResult.rows
      });
    } catch (err) {
      console.error('Failed to create invoice:', err);
      console.error('Error details:', err.stack);
      console.error('Query that caused the error:', err.query);
      console.error('Parameters:', err.parameters);
      await client.query('ROLLBACK');
      res.status(500).json({ 
        error: 'Server error', 
        message: err.message,
        hint: err.hint,
        detail: err.detail,
        code: err.code
      });
    } finally {
      client.release();
    }
  } catch (outerErr) {
    console.error('Fatal error in invoice creation:', outerErr);
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    res.status(500).json({ 
      error: 'Server error', 
      message: outerErr.message 
    });
  }
});

// Update invoice (basic info only, not items)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      customer_name,
      customer_email,
      customer_phone,
      due_date,
      payment_status
    } = req.body;
    
    // Check if invoice exists
    const invoiceCheck = await db.query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (invoiceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Basic validation
    if (!customer_name) {
      return res.status(400).json({ 
        error: 'Required fields missing',
        required: ['customer_name'] 
      });
    }
    
    // Update invoice
    const result = await db.query(`
      UPDATE invoices SET
        customer_name = $1,
        customer_email = $2,
        customer_phone = $3,
        due_date = $4,
        payment_status = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `, [
      customer_name,
      customer_email || null,
      customer_phone || null,
      due_date || null,
      payment_status || invoiceCheck.rows[0].payment_status,
      id
    ]);
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update invoice payment status
router.patch('/:id/payment-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_status } = req.body;
    
    if (!payment_status || !['pending', 'paid', 'partially_paid', 'overdue', 'cancelled'].includes(payment_status)) {
      return res.status(400).json({ 
        error: 'Valid payment status is required',
        valid_statuses: ['pending', 'paid', 'partially_paid', 'overdue', 'cancelled']
      });
    }
    
    // Check if invoice exists
    const invoiceCheck = await db.query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (invoiceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Update payment status
    const result = await db.query(`
      UPDATE invoices SET
        payment_status = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [payment_status, id]);
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete invoice (with transaction to restore inventory)
router.delete('/:id', async (req, res) => {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // Check if invoice exists
    const invoiceCheck = await client.query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (invoiceCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Get invoice items to restore inventory
    const itemsResult = await client.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [id]);
    
    // Restore inventory quantities
    for (const item of itemsResult.rows) {
      await client.query(
        'UPDATE inventory SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [item.quantity, item.inventory_id]
      );
    }
    
    // Delete invoice items
    await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
    
    // Delete invoice
    await client.query('DELETE FROM invoices WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
    res.json({ 
      message: 'Invoice deleted successfully',
      items_restored: itemsResult.rows.length
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Get invoice statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    
    let dateFilter = '';
    const queryParams = [];
    let paramIndex = 1;
    
    if (from_date) {
      dateFilter += ` AND date >= $${paramIndex}`;
      queryParams.push(from_date);
      paramIndex++;
    }
    
    if (to_date) {
      dateFilter += ` AND date <= $${paramIndex}`;
      queryParams.push(to_date);
      paramIndex++;
    }
    
    // Total invoices
    const countQuery = `SELECT COUNT(*) FROM invoices WHERE 1=1 ${dateFilter}`;
    const countResult = await db.query(countQuery, queryParams);
    
    // Total sales amount
    const salesQuery = `SELECT SUM(total) FROM invoices WHERE 1=1 ${dateFilter}`;
    const salesResult = await db.query(salesQuery, queryParams);
    
    // Paid invoices
    const paidQuery = `SELECT COUNT(*), SUM(total) FROM invoices WHERE payment_status = 'paid' ${dateFilter}`;
    const paidResult = await db.query(paidQuery, queryParams);
    
    // Pending invoices
    const pendingQuery = `SELECT COUNT(*), SUM(total) FROM invoices WHERE payment_status = 'pending' ${dateFilter}`;
    const pendingResult = await db.query(pendingQuery, queryParams);
    
    // Overdue invoices
    const overdueQuery = `SELECT COUNT(*), SUM(total) FROM invoices WHERE payment_status = 'overdue' ${dateFilter}`;
    const overdueResult = await db.query(overdueQuery, queryParams);
    
    res.json({
      total_invoices: parseInt(countResult.rows[0].count),
      total_sales: parseFloat(salesResult.rows[0].sum) || 0,
      paid: {
        count: parseInt(paidResult.rows[0].count),
        amount: parseFloat(paidResult.rows[0].sum) || 0
      },
      pending: {
        count: parseInt(pendingResult.rows[0].count),
        amount: parseFloat(pendingResult.rows[0].sum) || 0
      },
      overdue: {
        count: parseInt(overdueResult.rows[0].count),
        amount: parseFloat(overdueResult.rows[0].sum) || 0
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 