require('dotenv/config');
const crypto = require('crypto');
const { Pool } = require('pg');

const API_URL = process.env.WEBHOOK_BASE_URL || 'http://localhost:4000';

async function getProjectSecret() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    'SELECT id, name, github_repo_id, webhook_secret, webhook_secret_iv, webhook_secret_tag FROM projects WHERE webhook_secret IS NOT NULL LIMIT 1',
  );
  await pool.end();

  if (rows.length === 0) {
    console.error('No projects with webhook secrets found.');
    process.exit(1);
  }

  const row = rows[0];
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(row.webhook_secret_iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(row.webhook_secret_tag, 'hex'));
  const secret = decipher.update(row.webhook_secret, 'hex', 'utf8') + decipher.final('utf8');

  return { secret, repoId: row.github_repo_id, projectName: row.name };
}

function sign(secret, payload) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function sendWebhook(event, signature, payload) {
  const res = await fetch(`${API_URL}/webhooks/github`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': signature,
      'X-GitHub-Event': event,
    },
    body: payload,
  });
  const body = await res.text();
  return { status: res.status, body };
}

async function main() {
  const { secret, repoId, projectName } = await getProjectSecret();
  console.log(`Using project: ${projectName} (repo ID: ${repoId})\n`);

  // Test 1: Valid push event
  console.log('=== Test 1: Valid signature + push event ===');
  const pushPayload = JSON.stringify({ ref: 'refs/heads/main', repository: { id: repoId, full_name: 'test/repo' } });
  const pushSig = sign(secret, pushPayload);
  const t1 = await sendWebhook('push', pushSig, pushPayload);
  console.log(`Status: ${t1.status} (expected: 200)`);
  console.log(`Body: ${t1.body}\n`);

  // Test 2: Invalid signature
  console.log('=== Test 2: Invalid signature ===');
  const badSig = 'sha256=' + '0'.repeat(64);
  const t2 = await sendWebhook('push', badSig, pushPayload);
  console.log(`Status: ${t2.status} (expected: 401)`);
  console.log(`Body: ${t2.body}\n`);

  // Test 3: Unknown repo ID
  console.log('=== Test 3: Unknown repo ID ===');
  const unknownPayload = JSON.stringify({ ref: 'refs/heads/main', repository: { id: 0, full_name: 'unknown/repo' } });
  const unknownSig = sign(secret, unknownPayload);
  const t3 = await sendWebhook('push', unknownSig, unknownPayload);
  console.log(`Status: ${t3.status} (expected: 401)`);
  console.log(`Body: ${t3.body}\n`);

  // Test 4: Valid ping event
  console.log('=== Test 4: Valid signature + ping event ===');
  const pingPayload = JSON.stringify({ zen: 'Keep it logically awesome.', hook_id: 12345, repository: { id: repoId, full_name: 'test/repo' } });
  const pingSig = sign(secret, pingPayload);
  const t4 = await sendWebhook('ping', pingSig, pingPayload);
  console.log(`Status: ${t4.status} (expected: 200)`);
  console.log(`Body: ${t4.body}\n`);

  // Summary
  const results = [
    { name: 'Valid push', pass: t1.status === 200 },
    { name: 'Invalid signature', pass: t2.status === 401 },
    { name: 'Unknown repo', pass: t3.status === 401 },
    { name: 'Valid ping', pass: t4.status === 200 },
  ];
  console.log('=== Summary ===');
  results.forEach(r => console.log(`${r.pass ? 'PASS' : 'FAIL'} - ${r.name}`));
}

main().catch(console.error);
