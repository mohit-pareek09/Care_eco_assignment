require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const createTablesQuery = `
-- Drop tables in reverse order of creation to respect dependencies
DROP TABLE IF EXISTS invoice_items;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS returns;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;

-- Create Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Categories Table
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Inventory Table
CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    specifics VARCHAR(255),
    sku VARCHAR(20) UNIQUE NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    purchase_date DATE NOT NULL,
    purchase_price DECIMAL(10, 2) NOT NULL,
    discount DECIMAL(5, 2) NOT NULL DEFAULT 0,
    mrp DECIMAL(10, 2) NOT NULL,
    expiry_date DATE NOT NULL,
    supplier VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Returns Table
CREATE TABLE returns (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES inventory(id),
    return_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    quantity INTEGER NOT NULL,
    expected_refund DECIMAL(10, 2) NOT NULL,
    actual_refund DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Invoices Table
CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(20) UNIQUE NOT NULL,
    customer VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'paid',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Invoice_Items Table
CREATE TABLE invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES inventory(id),
    quantity INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
`;

// Hash a password for demo user
const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

const seedData = async () => {
  // Insert demo user
  const hashedPassword = await hashPassword('password123');
  await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)',
    ['Demo User', 'demo@example.com', hashedPassword]
  );
  console.log('Demo user created');

  // Insert categories
  await pool.query(`
    INSERT INTO categories (name) VALUES 
    ('Food'), ('Beverages'), ('Dairy'), ('Groceries'), ('Toiletries')
  `);
  console.log('Categories created');

  // Insert sample inventory items
  await pool.query(`
    INSERT INTO inventory (
      name, specifics, sku, category_id, quantity, 
      purchase_date, purchase_price, discount, mrp, expiry_date, supplier
    ) VALUES 
    (
      'Milk Chocolate', 'Dark, 100g', 'F-001', 
      (SELECT id FROM categories WHERE name = 'Food'), 24, 
      '2023-05-01', 120.00, 5, 199.99, '2023-12-30', 'Sweet Delights Inc.'
    ),
    (
      'Fresh Juice', 'Orange, 1L', 'B-002', 
      (SELECT id FROM categories WHERE name = 'Beverages'), 15, 
      '2023-05-05', 30.00, 2, 49.99, '2023-07-15', 'Fresh Farms Ltd.'
    ),
    (
      'Yogurt', 'Plain, 500g', 'D-003', 
      (SELECT id FROM categories WHERE name = 'Dairy'), 8, 
      '2023-05-12', 65.00, 10, 89.99, '2023-06-10', 'Dairy Dreams Co.'
    ),
    (
      'Bread', 'Whole Wheat, 400g', 'F-004', 
      (SELECT id FROM categories WHERE name = 'Food'), 5, 
      '2023-05-15', 250.00, 0, 299.99, '2023-05-22', 'Bakery Bliss'
    )
  `);
  console.log('Sample inventory created');

  // Create sample invoice
  await pool.query(`
    INSERT INTO invoices (invoice_number, customer, date, amount, payment_method)
    VALUES ('INV-2023-001', 'Acme Corp', '2023-05-15', 2500.00, 'Credit Card')
  `);
  
  // Get the invoice id
  const invoiceResult = await pool.query('SELECT id FROM invoices WHERE invoice_number = $1', ['INV-2023-001']);
  const invoiceId = invoiceResult.rows[0].id;
  
  // Add invoice items
  await pool.query(`
    INSERT INTO invoice_items (invoice_id, product_id, quantity, price, total)
    VALUES 
    (
      $1, 
      (SELECT id FROM inventory WHERE sku = 'F-001'), 
      5, 199.99, 999.95
    ),
    (
      $1, 
      (SELECT id FROM inventory WHERE sku = 'B-002'), 
      10, 49.99, 499.90
    )
  `, [invoiceId]);
  console.log('Sample invoice created');
  
  // Add sample return
  await pool.query(`
    INSERT INTO returns (
      product_id, quantity, expected_refund, actual_refund, status
    )
    VALUES (
      (SELECT id FROM inventory WHERE sku = 'F-004'),
      2, 500.00, 450.00, 'completed'
    )
  `);
  console.log('Sample return created');
};

async function seedDatabase() {
  try {
    // Create tables
    await pool.query(createTablesQuery);
    console.log('Tables created successfully');

    // Seed data
    await seedData();
    console.log('Database seeded successfully');
    
    pool.end();
  } catch (err) {
    console.error('Error seeding database:', err);
    pool.end();
  }
}

seedDatabase(); 