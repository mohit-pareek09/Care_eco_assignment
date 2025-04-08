const { Pool } = require('pg');
require('dotenv').config();

// Create a new pool with the .env file values
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'fullstack_app',
  password: process.env.DB_PASSWORD || 'Mm@12345',
  port: process.env.DB_PORT || 5432,
});

async function updateSchema() {
  let client;
  try {
    client = await pool.connect();
    console.log('Connected to database. Starting schema update...');
    
    // Begin transaction
    await client.query('BEGIN');
    
    // Check if role column exists in users table
    const roleColumnQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'role';
    `;
    
    const roleColumnResult = await client.query(roleColumnQuery);
    
    if (roleColumnResult.rows.length === 0) {
      console.log('Adding role column to users table...');
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN role VARCHAR(20) DEFAULT 'user';
      `);
      console.log('Role column added successfully.');
    } else {
      console.log('Role column already exists in users table.');
    }
    
    // Check if admin user exists
    const adminQuery = `
      SELECT id FROM users 
      WHERE email = 'admin@corpsuite.com' OR email = 'admin@example.com';
    `;
    
    const adminResult = await client.query(adminQuery);
    
    if (adminResult.rows.length === 0) {
      console.log('Creating admin user...');
      // Create admin user with password "admin123"
      await client.query(`
        INSERT INTO users (name, email, password_hash, role) 
        VALUES ('Admin User', 'admin@corpsuite.com', 
                '$2b$10$1JB3LJTy.VCevMiTm.3KO.L8y1K2miRQzlBqLkZtxIg0IKj/aQZeq', 'admin');
      `);
      console.log('Admin user created successfully.');
    } else {
      console.log('Admin user already exists.');
    }
    
    // Check if categories exist
    const categoriesQuery = `SELECT COUNT(*) AS count FROM categories;`;
    const categoriesResult = await client.query(categoriesQuery);
    
    if (parseInt(categoriesResult.rows[0].count) === 0) {
      console.log('Adding sample categories...');
      await client.query(`
        INSERT INTO categories (name, description)
        VALUES 
          ('Electronics', 'Electronic devices and accessories'),
          ('Office Supplies', 'Office stationery and supplies'),
          ('Furniture', 'Office furniture and fixtures'),
          ('Food & Beverages', 'Consumable items');
      `);
      console.log('Sample categories added successfully.');
    } else {
      console.log('Categories already exist.');
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('\nSchema update completed successfully!');
    console.log('\nA default admin user has been created (if not already present):');
    console.log('Email: admin@corpsuite.com');
    console.log('Password: admin123');
    
  } catch (err) {
    // Rollback transaction on error
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Error updating schema:', err);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

updateSchema(); 