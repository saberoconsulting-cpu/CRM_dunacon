require('dotenv').config({ quiet: true });
require('ts-node/register/transpile-only');
const { Client } = require('pg');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { installmentDueDate } = require('../src/shared/domain/installment-dates');
const db = new Client({
  host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'crm_inmobiliario', connectionTimeoutMillis: 10000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
(async () => {
  try {
    await db.connect();
    await db.query('BEGIN');
    const { rows: sales } = await db.query(`SELECT s.id,s.first_installment_date,q.created_at
      FROM sales s JOIN quotes q ON q.id=s.quote_id
      WHERE s.id=14 AND s.quote_id=26 FOR UPDATE OF s,q`);
    if (sales.length !== 1 || sales[0].first_installment_date) throw new Error('Unexpected sale or custom first date');
    const anchor = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(sales[0].created_at);
    if (anchor !== '2025-08-25') throw new Error('Unexpected quote date');
    const { rows } = await db.query('SELECT *,due_date::text AS original_due_date FROM sale_installments WHERE sale_id=14 ORDER BY installment_no FOR UPDATE');
    const changes = rows.filter(row => row.original_due_date !== installmentDueDate(anchor, row.installment_no));
    if (changes.length) writeFileSync(join(__dirname, `sale-14-dates-backup-${Date.now()}.json`), JSON.stringify(rows, null, 2), { flag: 'wx' });
    for (const row of changes) await db.query('UPDATE sale_installments SET due_date=$1 WHERE id=$2 AND sale_id=14', [installmentDueDate(anchor, row.installment_no),row.id]);
    const { rows: after } = await db.query('SELECT *,due_date::text AS original_due_date FROM sale_installments WHERE sale_id=14 ORDER BY installment_no');
    for (let index=0; index<rows.length; index++) {
      const before = { ...rows[index] }; const current = { ...after[index] };
      if (current.original_due_date !== installmentDueDate(anchor, current.installment_no)) throw new Error('Incorrect repaired date');
      delete before.due_date; delete before.original_due_date; delete current.due_date; delete current.original_due_date;
      if (JSON.stringify(before) !== JSON.stringify(current)) throw new Error('Unexpected non-date change');
    }
    await db.query('COMMIT');
    console.log(JSON.stringify({ saleId:14, updated:changes.length, firstDueDate:after[0]?.original_due_date, amountsAndPaymentLinksUnchanged:true }));
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('Repair failed:', error.code || error.message); process.exitCode=1;
  } finally { await db.end(); }
})();
