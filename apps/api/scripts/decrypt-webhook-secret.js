require('dotenv/config');
const crypto = require('crypto');
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows } = await pool.query(
    'SELECT id, name, github_repo_id, webhook_secret, webhook_secret_iv, webhook_secret_tag FROM projects WHERE webhook_secret IS NOT NULL LIMIT 10',
  );

  if (rows.length === 0) {
    console.log('No projects with webhook secrets found.');
    await pool.end();
    return;
  }

  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

  for (const row of rows) {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(row.webhook_secret_iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(row.webhook_secret_tag, 'hex'));
    const secret =
      decipher.update(row.webhook_secret, 'hex', 'utf8') +
      decipher.final('utf8');

    console.log(`Project: ${row.name} (id: ${row.id})`);
    console.log(`  github_repo_id: ${row.github_repo_id}`);
    console.log(`  webhook_secret: ${secret}`);
    console.log('');
    console.log(`Test with:`);
    console.log(`  ./scripts/test-webhook.sh "${secret}" ${row.github_repo_id}`);
    console.log('---');
  }

  await pool.end();
}

main().catch(console.error);
