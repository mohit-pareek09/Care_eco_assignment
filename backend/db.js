const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'corpsuite',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
});

// Test database connection
pool.connect()
  .then(() => console.log('Connected to PostgreSQL database'))
  .catch(err => console.error('Database connection error:', err.stack));

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: async () => {
    const client = await pool.connect();
    const query = client.query;
    const release = client.release;
    
    // Set a timeout of 5 seconds, after which we will log this client's last query
    const timeout = setTimeout(() => {
      console.error('A client has been checked out for more than 5 seconds!');
      console.error(`The last executed query on this client was: ${client.lastQuery}`);
    }, 5000);
    
    // Monkey patch the query method to keep track of the last query executed
    client.query = (...args) => {
      client.lastQuery = args;
      return query.apply(client, args);
    };
    
    client.release = () => {
      // Clear the timeout
      clearTimeout(timeout);
      
      // Set the methods back to their old implementation
      client.query = query;
      client.release = release;
      return release.apply(client);
    };
    
    return client;
  }
}; 