// Read-only diagnostic: no client details, credentials or writes.
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const db = new Client({
  host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'crm_inmobiliario', connectionTimeoutMillis: 10000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
(async () => {
  try {
    await db.connect();
    const result = await db.query(`SELECT s.id,s.quote_id,s.sale_date::text,
      s.first_installment_date::text,q.created_at,
      i.installment_no,i.due_date::text
      FROM sales s JOIN quotes q ON q.id=s.quote_id
      LEFT JOIN sale_installments i ON i.sale_id=s.id AND i.installment_no IN (1,2)
      WHERE q.created_at >= '2025-08-24' AND q.created_at < '2025-08-28'
      ORDER BY s.id,i.installment_no`);
    console.log(JSON.stringify(result.rows, null, 2));
  } catch (error) {
    console.error('Database diagnostic failed:', error.code || error.name);
    process.exitCode = 1;
  } finally { await db.end(); }
})();
