const express = require('express');
const router = express.Router();

// Get dashboard summary statistics
router.get('/summary', async (req, res) => {
  try {
    // Return mock data for testing
    res.json({
      totalProducts: 150,
      totalValue: 75000,
      expiringSoon: 5,
      expired: 2,
      lowStockCount: 8,
      totalCategories: 10,
      totalSales: 25000,
      totalReturns: 3,
      returnsValue: 1500
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

// Get expiring products for dashboard
router.get('/expiring-products', async (req, res) => {
  try {
    // Return mock data for testing
    res.json([
      {
        id: 1,
        name: 'Product A',
        sku: 'SKU001',
        category_name: 'Category 1',
        expiry_date: '2024-05-01',
        days_until_expiry: 15
      },
      {
        id: 2,
        name: 'Product B',
        sku: 'SKU002',
        category_name: 'Category 2',
        expiry_date: '2024-05-15',
        days_until_expiry: 30
      }
    ]);
  } catch (err) {
    console.error('Expiring products error:', err);
    res.status(500).json({ error: 'Failed to fetch expiring products' });
  }
});

// Get low stock products for dashboard
router.get('/low-stock', async (req, res) => {
  try {
    // Return mock data for testing
    res.json([
      {
        id: 1,
        name: 'Product X',
        sku: 'SKU003',
        quantity: 5,
        category_name: 'Category 1'
      },
      {
        id: 2,
        name: 'Product Y',
        sku: 'SKU004',
        quantity: 3,
        category_name: 'Category 2'
      }
    ]);
  } catch (err) {
    console.error('Low stock error:', err);
    res.status(500).json({ error: 'Failed to fetch low stock products' });
  }
});

module.exports = router; 