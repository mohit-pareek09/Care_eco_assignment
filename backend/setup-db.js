const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

// Read the schema SQL file
const schemaSql = fs.readFileSync('./schema.sql', 'utf8');

// Create a new pool with the .env file values
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'fullstack_app',
  password: process.env.DB_PASSWORD || 'Mm@12345',
  port: process.env.DB_PORT || 5432,
});

async function setupDatabase() {
  try {
    console.log('Setting up database tables...');
    
    // Execute the schema SQL
    await pool.query(schemaSql);
    
    console.log('Database setup completed successfully!');
    console.log('The following tables have been created:');
    console.log('- users');
    console.log('- categories');
    console.log('- inventory');
    console.log('- invoices');
    console.log('- invoice_items');
    console.log('- returns');
    
    console.log('\nA default admin user has been created:');
    console.log('Email: admin@corpsuite.com');
    console.log('Password: admin123');
    
    console.log('\nSample categories have been added.');
  } catch (err) {
    console.error('Error setting up database:', err);
  } finally {
    // Close the pool
    await pool.end();
  }
}

setupDatabase(); 