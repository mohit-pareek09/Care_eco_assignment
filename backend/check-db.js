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

async function checkDatabase() {
  let client;
  try {
    client = await pool.connect();
    
    // Check for tables
    const tableQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    
    console.log('Connected to database. Checking existing tables...');
    const tableResult = await client.query(tableQuery);
    
    if (tableResult.rows.length === 0) {
      console.log('No tables found in the database.');
    } else {
      console.log('Existing tables:');
      tableResult.rows.forEach(row => {
        console.log(`- ${row.table_name}`);
      });
      
      // Check users table structure
      if (tableResult.rows.some(row => row.table_name === 'users')) {
        const userColumnsQuery = `
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'users'
          ORDER BY ordinal_position;
        `;
        
        console.log('\nChecking users table structure:');
        const userColumnsResult = await client.query(userColumnsQuery);
        userColumnsResult.rows.forEach(col => {
          console.log(`- ${col.column_name} (${col.data_type})`);
        });
      }
    }
    
    // Check if a fix is needed
    console.log('\nChecking if the database structure matches requirements...');
    const requiredTables = ['users', 'categories', 'inventory', 'invoices', 'invoice_items', 'returns'];
    const missingTables = requiredTables.filter(table => !tableResult.rows.some(row => row.table_name === table));
    
    if (missingTables.length > 0) {
      console.log('Missing required tables:', missingTables.join(', '));
      console.log('Run the setup-db.js script to create these tables.');
    } else {
      console.log('All required tables exist.');
    }

    // Check for users
    if (tableResult.rows.some(row => row.table_name === 'users')) {
      const userCountQuery = 'SELECT COUNT(*) as count FROM users;';
      const userCountResult = await client.query(userCountQuery);
      console.log(`\nUsers in database: ${userCountResult.rows[0].count}`);
    }
    
  } catch (err) {
    console.error('Error checking database:', err);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

checkDatabase(); 