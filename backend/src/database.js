/**
 * Placeholder for database connection and query logic.
 * This module will handle connections to Cloud SQL (PostgreSQL)
 * or an alternative like Firestore/Weaviate if chosen later.
 */

// Example: Initialize PostgreSQL client (actual implementation will vary)
// const { Pool } = require('pg');

// const pool = new Pool({
//   user: process.env.DB_USER,
//   host: process.env.DB_HOST, // Or Cloud SQL instance connection name for Cloud Run
//   database: process.env.DB_NAME,
//   password: process.env.DB_PASSWORD,
//   port: process.env.DB_PORT || 5432,
  // For Cloud SQL, you might need specific configurations for IAM auth or socket paths
// });

// SQL Setup for PostgreSQL (run these in your PSQL console or a migration tool):\n/*\n-- 1. Create the table\nCREATE TABLE knowledge_base_articles (\n    id SERIAL PRIMARY KEY,\n    title TEXT NOT NULL,\n    content TEXT NOT NULL,\n    source VARCHAR(255),\n    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n    fts_document_vector TSVECTOR\n);\n\n-- 2. Create an index on the TSVECTOR column for search performance\nCREATE INDEX idx_fts_doc_vector ON knowledge_base_articles USING GIN(fts_document_vector);\n\n-- 3. Create a function to update the fts_document_vector column\nCREATE OR REPLACE FUNCTION update_fts_document_vector() RETURNS TRIGGER AS $$\nBEGIN\n    NEW.fts_document_vector := \n        setweight(to_tsvector(\'pg_catalog.english\', COALESCE(NEW.title,\'\')), \'A\') || \n        setweight(to_tsvector(\'pg_catalog.english\', COALESCE(NEW.content,\'\')), \'B\');\n    RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n\n-- 4. Create a trigger to automatically update fts_document_vector on insert or update\nCREATE TRIGGER tsvectorupdate BEFORE INSERT OR UPDATE\nON knowledge_base_articles FOR EACH ROW EXECUTE FUNCTION update_fts_document_vector();\n\n-- Example Insert (the fts_document_vector will be auto-populated by the trigger):\n-- INSERT INTO knowledge_base_articles (title, content, source) VALUES (\'How to reset password\', \'To reset your password, go to the login page and click \"Forgot Password\".\', \'FAQ\');\n*/\n

const { Pool } = require('pg');

// Configure the connection pool using environment variables
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST, // For Cloud SQL, this might be an IP or instance connection name
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
  // Add SSL configuration if required for Cloud SQL, e.g.:
  // ssl: {
  //   rejectUnauthorized: false, // Or configure with CA certs
  // }
});

async function connectToDB() {
  try {
    const client = await pool.connect();
    console.log('[DB] Successfully connected to PostgreSQL database.');
    await client.query('SELECT NOW()'); // Test query
    client.release();
    return true;
  } catch (err) {
    console.error('[DB] Connection error to PostgreSQL database', err.stack);
    return false;
  }
}

async function getKnowledgeBaseArticle(query) {
  console.log(`[DB] Fetching KB articles from PostgreSQL for query: ${query}`);
  
  // Prepare the search query for full-text search
  const searchQuery = query.trim().split(/\s+/).join(' & ');

  const sql = `
    SELECT title, content, source, ts_rank_cd(fts_document_vector, plainto_tsquery('pg_catalog.english', $1)) as relevance
    FROM knowledge_base_articles
    WHERE fts_document_vector @@ plainto_tsquery('pg_catalog.english', $1)
    ORDER BY relevance DESC
    LIMIT 3;
  `;

  try {
    const client = await pool.connect();
    const { rows } = await client.query(sql, [searchQuery]);
    client.release();

    if (rows.length > 0) {
      console.log(`[DB] Found ${rows.length} articles for query "${query}"`);
      return rows.map(row => ({
        title: row.title,
        content: row.content,
        source: row.source,
        relevance: row.relevance
      }));
    } else {
      console.log(`[DB] No article found for query "${query}"`);
      return null; // Or return a default object like { title: 'Not Found', content: '', source: '' }
    }
  } catch (err) {
    console.error('[DB] Error fetching articles from PostgreSQL:', err.stack);
    // In case of an error, return null or a specific error object
    // This prevents the agent from crashing if the DB query fails.
    return [{
        title: "Error Fetching Articles",
        content: "Could not retrieve information from the knowledge base due to an error.",
        source: "database_error",
        relevance: 0
    }];
  }
}

module.exports = {
  connectToDB,
  getKnowledgeBaseArticle,
  pool, // Export pool if direct access is needed elsewhere (e.g., for migrations, other queries)
}; 