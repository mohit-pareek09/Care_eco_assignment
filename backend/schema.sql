-- Database Schema for CorpSuite Application

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory Table
CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  sku VARCHAR(50) UNIQUE,
  category_id INTEGER REFERENCES categories(id),
  price DECIMAL(10, 2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  threshold INTEGER DEFAULT 10,
  purchase_price DECIMAL(10, 2),
  expiry_date DATE,
  specifics TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  customer_email VARCHAR(100),
  customer_phone VARCHAR(20),
  date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  due_date TIMESTAMP,
  subtotal DECIMAL(10, 2) NOT NULL,
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  tax_amount DECIMAL(10, 2) DEFAULT 0,
  discount_percentage DECIMAL(5, 2) DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50),
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoice Items Table
CREATE TABLE IF NOT EXISTS invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES inventory(id),
  product_name VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Returns Table
CREATE TABLE IF NOT EXISTS returns (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES inventory(id),
  quantity INTEGER NOT NULL,
  expected_refund DECIMAL(10, 2),
  actual_refund DECIMAL(10, 2),
  notes TEXT,
  date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create default admin user
INSERT INTO users (name, email, password_hash, role)
VALUES ('Admin User', 'admin@corpsuite.com', '$2b$10$1JB3LJTy.VCevMiTm.3KO.L8y1K2miRQzlBqLkZtxIg0IKj/aQZeq', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Create sample categories
INSERT INTO categories (name, description)
VALUES 
  ('Electronics', 'Electronic devices and accessories'),
  ('Office Supplies', 'Office stationery and supplies'),
  ('Furniture', 'Office furniture and fixtures'),
  ('Food & Beverages', 'Consumable items')
ON CONFLICT DO NOTHING; 