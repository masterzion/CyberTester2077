// Explicit, non-destructive DEV-only account provisioning. Never called by startup.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID, randomBytes } = require('node:crypto');
const YAML = require('yaml');

async function main(args = process.argv.slice(2)) {
  const options = new Map();
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (!['--app-root', '--auth-root', '--credentials', '--apply'].includes(key) || options.has(key)) throw new Error('Invalid provisioning argument');
    if (key === '--apply') options.set(key, true);
    else { const value = args[++index]; if (!value || value.startsWith('--')) throw new Error('Missing provisioning argument'); options.set(key, path.resolve(value)); }
  }
  if (!options.has('--app-root') || !options.has('--auth-root')) throw new Error('Specify --app-root and --auth-root');
  const appRoot = options.get('--app-root'), authRoot = options.get('--auth-root');
  const credentialFile = options.get('--credentials') || path.resolve(__dirname, '../automation_tests/credentials.yml');
  if (process.env.NODE_ENV === 'production') throw new Error('DEV provisioning only');
  if (!fs.existsSync(credentialFile)) throw new Error('Existing credentials file required');
  const initialYaml = fs.readFileSync(credentialFile, 'utf8');
  const doc = YAML.parseDocument(initialYaml);
  if (doc.errors.length || !YAML.isSeq(doc.get('accounts'))) throw new Error('Invalid credentials schema');
  const entries = doc.toJS().accounts;
  const email = 'adm.report.reviewer@example.test', loginName = 'adm.report.reviewer';
  const matches = entries.filter(entry => entry.email === email);
  if (matches.length > 1) throw new Error('Duplicate credential identity');
  const entry = matches[0];
  if (entry && (entry.role !== 'review' || typeof entry.password !== 'string' || entry.password_env)) throw new Error('Existing reviewer credentials need manual reconciliation');
  const dev = require(path.join(appRoot, 'scripts/dev-settings.cjs'));
  const runtime = require(path.join(appRoot, 'packages/runtime-config'));
  const { Pool } = require(path.join(appRoot, 'packages/runtime-config/node_modules/pg'));
  const pools = [], clients = [];
  let accounts, partners;
  try {
    dev.activate();
    const records = {};
    for (const service of ['accounts', 'partner-content', 'standalone-auth']) records[service] = (await runtime.readConfiguration(`service-${service}`)).value;
    if (records['standalone-auth'].env.AUTH_ENV !== 'dev') throw new Error('Auth must target DEV');
    const urls = [records.accounts.env.DATABASE_URL, records['partner-content'].env.DATABASE_URL, records['standalone-auth'].env.AUTH_DATABASE_URL];
    const identities = new Set();
    for (const value of urls) {
      const url = new URL(value);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.searchParams.has('schema')) throw new Error('Isolated loopback database required');
      const identity = `${url.port}${url.pathname}`;
      if (identities.has(identity)) throw new Error('Separate physical databases required');
      identities.add(identity);
      const pool = new Pool({ connectionString: value, connectionTimeoutMillis: 5000 }); pools.push(pool);
      const client = await pool.connect(); clients.push(client);
      await client.query('SELECT pg_advisory_lock(8030009)');
      // Inspect existing schema, including migration history, without changing it.
      const tables = await client.query('SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema()');
      const names = tables.rows.map(row => row.table_name);
      if (!names.includes('_prisma_migrations') && !names.includes('auth_migrations')) throw new Error('Migration history unavailable');
    }
    const { PrismaClient: AccountClient } = require(path.join(appRoot, 'services/accounts/node_modules/.prisma/client-accounts'));
    const { PrismaClient: PartnerClient } = require(path.join(appRoot, 'services/partner-content/node_modules/.prisma/client-partner'));
    accounts = new AccountClient({ datasources: { db: { url: urls[0] } } });
    partners = new PartnerClient({ datasources: { db: { url: urls[1] } } });
    const product = await accounts.account.findFirst({ where: { OR: [{ email }, { loginName }] } });
    const auth = (await clients[2].query('SELECT id,email,login_name,status,login_type FROM auth_users WHERE email=$1 OR login_name=$2', [email, loginName])).rows;
    if (auth.length > 1 || (product && (product.email !== email || product.loginName !== loginName || product.role !== 'MODERATOR' || product.status !== 'ACTIVE'))
      || (auth[0] && (auth[0].email !== email || auth[0].login_name !== loginName || auth[0].login_type !== 'moderator' || auth[0].status !== 'ACTIVE'))
      || (product && auth[0] && product.id !== auth[0].id)) throw new Error('Identity conflict; existing data preserved');
    if ((product || auth[0]) && !entry) throw new Error('Existing identity has no recoverable saved credential; no password reset performed');
    const id = product?.id || auth[0]?.id || entry?.account_id || randomUUID();
    if (entry?.account_id && entry.account_id !== id) throw new Error('Saved identity conflict');
    const operator = await partners.portalOperator.findUnique({ where: { accountId: id } });
    if (operator && (!operator.active || operator.permission !== 'review')) throw new Error('Existing operator grant differs; no privilege overwrite');
    const { default: argon2 } = await import(pathToFileURL(path.join(authRoot, 'node_modules/argon2/argon2.cjs')).href);
    const password = entry?.password || `Adm!${randomBytes(36).toString('base64url')}Aa1`;
    if (auth[0]) {
      const credential = (await clients[2].query('SELECT password_hash FROM auth_credentials WHERE user_id=$1', [id])).rows[0];
      if (!credential?.password_hash || !(await argon2.verify(credential.password_hash, password))) throw new Error('Saved password does not verify; no reset performed');
    }
    console.log(JSON.stringify({ mode: options.has('--apply') ? 'apply' : 'dry-run', email, role: 'MODERATOR', permission: 'review', authPresent: !!auth[0], productPresent: !!product, operatorPresent: !!operator }));
    if (!options.has('--apply')) return;
    // Save the recoverable credential before any database write; preserve YAML comments.
    const record = { name: 'Viafactor Admin Report Reviewer', email, password, account_id: id, role: 'review',
      description: 'Dedicated DEV review account for the standalone admin report panel. No root, guardian or mobile administration privileges.',
      login_timeout_seconds: 60, runtest_web: false, runtest_mobile: false, runtest_admin: true,
      provisioning_status: 'pending' };
    const nodes = doc.get('accounts');
    if (entry) nodes.items[entries.indexOf(entry)] = doc.createNode(record); else nodes.add(doc.createNode(record));
    const original = fs.readFileSync(credentialFile, 'utf8');
    if (original !== initialYaml) throw new Error('Credentials changed during provisioning; retry without overwriting');
    const backup = path.resolve(__dirname, '../automation_tests/output/admin-account-backups', randomUUID());
    fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
    fs.copyFileSync(credentialFile, path.join(backup, 'credentials.yml'), fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(credentialFile, String(doc), { mode: 0o600 });
    if (!auth[0]) {
      const { validateExport, importUsers } = await import(pathToFileURL(path.join(authRoot, 'src/import-users.mjs')).href);
      const data = validateExport({ version: 1, environment: 'dev', users: [{ id, email, loginName, status: 'ACTIVE', loginType: 'moderator',
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }), failedLogins: 0, lockedUntil: null, requireVerification: false, registrationKind: 'managed' }] }, 'dev');
      await importUsers(clients[2], data, true);
    }
    if (!product) await accounts.account.create({ data: { id, email, loginName, role: 'MODERATOR', status: 'ACTIVE',
      details: { create: { displayName: record.name } } } });
    if (!operator) await partners.portalOperator.create({ data: { accountId: id, permission: 'review', active: true } });
    // Validate every stored fact and the real hash, not just ORM success.
    const verified = (await clients[2].query('SELECT password_hash FROM auth_credentials WHERE user_id=$1', [id])).rows[0];
    const grant = await partners.portalOperator.findUnique({ where: { accountId: id } });
    if (!(await argon2.verify(verified.password_hash, password)) || !grant?.active || grant.permission !== 'review') throw new Error('Post-provisioning verification failed');
    nodes.items[entry ? entries.indexOf(entry) : nodes.items.length - 1].set('provisioning_status', 'verified');
    fs.writeFileSync(credentialFile, String(doc), { mode: 0o600 });
    console.log(JSON.stringify({ provisioned: true, email, permission: 'review', credentialsSaved: true, passwordVerified: true }));
  } finally {
    await accounts?.$disconnect(); await partners?.$disconnect();
    for (const client of clients) { try { await client.query('SELECT pg_advisory_unlock(8030009)'); } finally { client.release(); } }
    for (const pool of pools) await pool.end(); await runtime.close();
  }
}
if (require.main === module) main().catch(error => { console.error(`Reviewer provisioning failed (${error.code || error.name}); preserve pending credentials and inspect the provisioning state.`); process.exitCode = 1; });
module.exports = { main };
