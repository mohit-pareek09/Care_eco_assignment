require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

// Set NODE_ENV to development if not set
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
console.log(`Running in ${process.env.NODE_ENV} mode`);

const app = express();
const port = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Add cors headers to all responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Test DB connection
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({ now: result.rows[0].now });
  } catch (err) {
    console.error('Database connection error:', err);
    res.status(500).json({ error: 'Database connection error' });
  }
});

// Import route files
const invoicesRouter = require('./routes/invoices');
const inventoryRouter = require('./routes/inventory');
const categoriesRouter = require('./routes/categories');
const customersRouter = require('./routes/customers');
const returnsRouter = require('./routes/returns');
const dashboardRouter = require('./routes/dashboard');

// Routes
app.use('/api/invoices', invoicesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/customers', customersRouter);
app.use('/api/returns', returnsRouter);
app.use('/api/dashboard', dashboardRouter);

// Root route
app.get('/api', (req, res) => {
  res.json({ message: 'Welcome to the Smart ERP API' });
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});

// Connect to database and test connection
db.query('SELECT NOW()')
  .then(result => {
    console.log('Connected to database:', result.rows[0]);
  })
  .catch(err => {
    console.error('Database connection error:', err);
  }); 