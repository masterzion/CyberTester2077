/* Development-only reset. Never use against a production database. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const YAML=require('yaml');
const root=path.resolve(__dirname,'..');
const resetTables={
  'auth':['sessions','refresh_tokens','password_reset_tokens','career_entries'],
  'parental-controls':['advisor_recommendations','approval_requests','screentime_heartbeats','screentime_usage'],
  'services/social':['Reaction','achievement_feed','blocked_posts','comments','feed_seen','posts','project_collaborators','project_tasks','projects'],
  'services/media':['media','media_ai_feedback','media_approvals','media_classifications','media_viewer_approvals'],
  'services/messaging':['conversations','group_participants','group_removal_logs','key_rotation_logs','message_keys','message_receipts','messages','messaging_audit_logs','quarantined_message_keys','quarantined_messages'],
  'services/education':['achievements','activities','activity_completions','daily_recommendations','development_profiles','family_activities','gift_card_purchases','goal_progress','goals','habit_metrics','reward_catalog_items','reward_fulfillments','reward_grants','reward_provider_logs','rewards','subjects','training_progress'],
  'services/school':['assignments','grades','reports','submissions','teacher_feedback'],
  'services/notification':['notifications'],
  'content-filter':[],
  'services/moderation':['SafetyEvent'],
  'services/partner-content':['content_impressions','content_safety_reviews','partner_content','portal_advertisement_decisions','portal_advertisements','portal_city_activities','portal_city_plans','portal_demo_gift_grants']
};
const quote=x=>'"'+x.replace(/"/g,'""')+'"';
function validateTarget(url,expected,target={host:'127.0.0.1',port:15432}) {
  const u=new URL(url);
  if(u.hostname!==target.host||u.port!==String(target.port)||u.pathname!=='/'+expected)throw new Error('Refusing non-isolated DEV target');
}
function containerCommand(config,args,input) {
  const r=spawnSync(config.engine,args,{input,maxBuffer:256*1024*1024,windowsHide:true});
  if(r.error||r.status!==0)throw new Error('Backup/container command failed; database writes not authorized to continue');
  return r.stdout;
}
async function seed(clients,accounts) {
  const {social,education:edu}=clients;
  const messages={GUARDIAN:'What are your favourite ways to make reading part of a relaxed family evening?',CHILD:'I would like to learn how to build a paper bridge. Which shapes make it stronger?',TEACHER:'This week, try keeping a nature journal. Draw one leaf, describe its shape, and share what you notice.'};
  let posts=0;
  for(const a of accounts.filter(a=>messages[a.role])) {
    await social.query('INSERT INTO posts (id,author_id,type,subject_categories,media_refs,visibility,content,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now())',[crypto.randomUUID(),a.id,'TEXT',['EDUCATION'],[],'CONTACTS',messages[a.role]]);
    posts++;
  }
  const lessons=[['Science','SCIENCE','Build a paper bridge','Fold paper into different shapes. Compare how many coins each bridge can hold.'],['Reading','LANGUAGE','Start a nature journal','Read a short nature story, then describe a leaf or bird you can see outside.'],['Mathematics','MATH','Plan a picnic','Choose snacks for four people and calculate quantities and a simple budget.'],['Digital citizenship','TECHNOLOGY','Kind conversations','Practise a friendly greeting, a thoughtful question, and a respectful reply.']];
  for(const [name,category,title,description] of lessons) {
    const id=crypto.randomUUID();
    await edu.query('INSERT INTO subjects (id,name,category,description,created_at) VALUES ($1,$2,$3,$4,now())',[id,name,category,description]);
    await edu.query('INSERT INTO activities (id,subject_id,title,description,type,difficulty,estimated_minutes,is_sponsored,created_at) VALUES ($1,$2,$3,$4,$5,$6,15,false,now())',[crypto.randomUUID(),id,title,description,'INTERACTIVE','AGE_9_11']);
  }
  for(const a of accounts.filter(a=>a.role==='CHILD')) await edu.query('INSERT INTO goals (id,child_id,title,description,metric,target,status,progress,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,60,$6,0,now(),now())',[crypto.randomUUID(),a.id,'Read a little each day','Enjoy three twenty-minute reading sessions this week.','reading_minutes','ACTIVE']);
  return {posts,activities:lessons.length,goals:accounts.filter(a=>a.role==='CHILD').length};
}
async function main(args=process.argv.slice(2)) {
  const {parseArgs,resolveConfig}=require('./demo-reset-config.cjs');
  const options=parseArgs(args);
  if(options['--help']) {
    console.log('Usage: node scripts/reset-development-demo.cjs [--settings FILE] [--app-root DIR] [--credentials FILE] [--apply --confirm-development-reset]\nDefault: read-only dry-run. Configure demo_reset in automation-settings.yml. Stop application services before apply.');
    return;
  }
  const apply=!!options['--apply'];
  const settingsFile=path.resolve(options['--settings'] || process.env.AUTOMATION_SETTINGS || path.join(root,'automation_tests/automation-settings.yml'));
  const config=resolveConfig(YAML.parse(fs.readFileSync(settingsFile,'utf8')) || {},options,root);
  const {appRoot,credentialsFile}=config;
  const {Client}=require(path.join(appRoot,'auth/node_modules/pg'));
  const argon2=require(path.join(appRoot,'auth/node_modules/argon2'));
  const dev=require(path.join(appRoot,'scripts/dev-settings.cjs'));
  // Read/validate the existing bootstrap. Never create or overwrite it.
  const dotenv=require(path.join(appRoot,'auth/node_modules/dotenv'));
  const bootstrap=dotenv.parse(fs.readFileSync(path.join(appRoot,'.cache/dev-environment/bootstrap.env')));
  const authDatabase=dev.databases.auth;
  if(!authDatabase)throw new Error('DEV settings have no auth database');
  validateTarget(bootstrap.CONFIG_DATABASE_URL,authDatabase,config);
  if(bootstrap.CONFIG_DATABASE_URL!==dev.databaseUrl('auth'))throw new Error('Bootstrap and DEV settings differ');
  const entries=YAML.parse(fs.readFileSync(credentialsFile,'utf8')).accounts;
  if(!Array.isArray(entries)||!entries.length)throw new Error('No credential accounts');
  const clients={},plans=[],started=[];
  const databaseNames=Object.values(dev.databases);
  if(new Set(databaseNames).size!==databaseNames.length)throw new Error('Services must use separate databases');
  if(Object.keys(resetTables).some(workspace=>!dev.databases[workspace]))throw new Error('Required DEV service is missing');
  for(const name of databaseNames)if(!/^[a-zA-Z0-9_]+$/.test(name))throw new Error('Unsafe database name');
  let backupDirectory,committed=false;
  try {
    for(const [workspace,dbName] of Object.entries(dev.databases)) {
      if(!(workspace in resetTables))throw new Error('Unexpected DEV database');
      const url=dev.databaseUrl(workspace);validateTarget(url,dbName,config);
      const client=clients[dbName]=new Client({connectionString:url,application_name:'cybertester-demo-reset'});await client.connect();
      const names=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename")).rows.map(r=>r.tablename);
      if(resetTables[workspace].some(t=>!names.includes(t)))throw new Error('Schema mismatch in '+dbName);
      const qa=[];
      for(const name of names) {
        const count=Number((await client.query('SELECT count(*) FROM '+quote(name)+" t WHERE to_jsonb(t)::text ILIKE '%QA TEST%'")).rows[0].count);
        if(count)qa.push({table:name,count});
      }
      plans.push({database:dbName,reset:resetTables[workspace],preserve:names.filter(n=>!resetTables[workspace].includes(n)),qa});
    }
    const before=(await clients[authDatabase].query('SELECT id,email,role FROM accounts ORDER BY id')).rows;
    const passwords=[];
    for(const entry of entries) {
      const account=before.find(a=>a.email===entry.email);
      const password=entry.password_env?process.env[entry.password_env]:entry.password;
      if(!account||typeof password!=='string'||!password)throw new Error('A credential account is missing or has no resolved password');
      if(passwords.some(p=>p.id===account.id))throw new Error('Duplicate credential account');
      if(typeof entry.name!=='string'||!entry.name.trim())throw new Error('Credential account has no display name');
      passwords.push({id:account.id,password,name:entry.name});
    }
    console.log(JSON.stringify({mode:apply?'APPLY':'DRY RUN',accountsPreserved:before.length,passwordsToReset:passwords.length,plans},null,2));
    if(!apply)return;
    const lock=(await clients[authDatabase].query('SELECT pg_try_advisory_lock(178941, 73) AS acquired')).rows[0];
    if(!lock.acquired)throw new Error('Another demo reset is running');
    const pids=Object.values(clients).map(client=>client.processID);
    const other=(await clients[authDatabase].query("SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND datname=ANY($1) AND NOT (pid=ANY($2::int[]))",[Object.keys(clients),pids])).rows[0];
    if(Number(other.count))throw new Error('Stop DEV application/database writers before applying');
    const containers=JSON.parse(containerCommand(config,['inspect',config.container]).toString());
    const ports=containers[0]?.NetworkSettings?.Ports?.['5432/tcp'] || [];
    if(!ports.some(p=>p.HostPort===String(config.port)))throw new Error('Unexpected backup container port');
    const backupUser=decodeURIComponent(new URL(dev.databaseUrl('auth')).username);
    const databaseCluster=String((await clients[authDatabase].query('SELECT system_identifier FROM pg_control_system()')).rows[0].system_identifier);
    const backupCluster=containerCommand(config,['exec',config.container,'psql','-U',backupUser,'-d',authDatabase,'-Atc','SELECT system_identifier FROM pg_control_system()']).toString().trim();
    if(databaseCluster!==backupCluster)throw new Error('Backup container is not the connected database cluster');
    backupDirectory=path.join(root,'automation_tests/output/demo-backups',new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8));
    fs.mkdirSync(backupDirectory,{recursive:true});
    for(const name of Object.keys(clients)) {
      const workspace=Object.keys(dev.databases).find(w=>dev.databases[w]===name);
      const user=decodeURIComponent(new URL(dev.databaseUrl(workspace)).username);
      const dump=containerCommand(config,['exec',config.container,'pg_dump','-U',user,'-d',name,'-Fc']);
      if(!dump.subarray(0,5).equals(Buffer.from('PGDMP')))throw new Error('Invalid backup');
      fs.writeFileSync(path.join(backupDirectory,name+'.dump'),dump,{flag:'wx',mode:0o600});
      containerCommand(config,['exec','-i',config.container,'pg_restore','--list'],dump);
    }
    fs.writeFileSync(path.join(backupDirectory,'plan.json'),JSON.stringify(plans,null,2));
    console.log('Backups validated: '+backupDirectory);
    // All mutations are staged in one transaction per service before any commit.
    for(const client of Object.values(clients)){await client.query('BEGIN');started.push(client);await client.query("SET LOCAL lock_timeout='5s'");}
    for(const plan of plans) if(plan.reset.length)await clients[plan.database].query('TRUNCATE '+plan.reset.map(quote).join(',')+' RESTART IDENTITY'); // No CASCADE: unexpected dependencies must abort.
    for(const p of passwords) {
      const hash=await argon2.hash(p.password);
      await clients[authDatabase].query('INSERT INTO credentials (id,account_id,password_hash,failed_logins,locked_until,created_at,updated_at) VALUES ($1,$2,$3,0,NULL,now(),now()) ON CONFLICT (account_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,failed_logins=0,locked_until=NULL,updated_at=now()',[crypto.randomUUID(),p.id,hash]);
      await clients[authDatabase].query("UPDATE children SET display_name=$2,updated_at=now() WHERE account_id=$1 AND display_name ILIKE '%QA TEST%'",[p.id,p.name]);
      await clients[dev.databases['services/social']].query("UPDATE profiles SET display_name=$2,updated_at=now() WHERE account_id=$1 AND display_name ILIKE '%QA TEST%'",[p.id,p.name]);
    }
    await clients[dev.databases['services/social']].query("UPDATE profiles SET description='', updated_at=now() WHERE description ILIKE '%QA TEST%'");
    const seeded=await seed({social:clients[dev.databases['services/social']],education:clients[dev.databases['services/education']]},before.filter(a=>passwords.some(p=>p.id===a.id)));
    await require('./demo-screen-time.cjs').applyFullTime(clients[dev.databases['parental-controls']],before,config.fullTimeAccounts);
    const after=(await clients[authDatabase].query('SELECT id,email,role FROM accounts ORDER BY id')).rows;
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Account identity changed');
    for(const p of passwords) {
      const row=(await clients[authDatabase].query('SELECT password_hash FROM credentials WHERE account_id=$1',[p.id])).rows[0];
      if(!await argon2.verify(row.password_hash,p.password))throw new Error('Password verification failed');
    }
    for(const plan of plans) for(const table of [...plan.reset,...plan.preserve]) {
      if(['audit_logs','runtime_configuration_audit'].includes(table))continue; // Retain historical security evidence.
      const count=Number((await clients[plan.database].query('SELECT count(*) FROM '+quote(table)+" t WHERE to_jsonb(t)::text ILIKE '%QA TEST%'")).rows[0].count);
      if(count)throw new Error('QA TEST remains in preserved table '+plan.database+'.'+table+'; rollback required');
    }
    for(const client of started)await client.query('COMMIT');
    committed=true;
    fs.writeFileSync(path.join(backupDirectory,'result.json'),JSON.stringify({accountsPreserved:before.length,passwordsReset:passwords.length,seeded,finishedAt:new Date().toISOString()},null,2));
    console.log(JSON.stringify({complete:true,backupDirectory,accountsPreserved:before.length,passwordsReset:passwords.length,seeded}));
  } finally {
    if(!committed)for(const client of started)await client.query('ROLLBACK').catch(()=>{});
    await Promise.all(Object.values(clients).map(c=>c.end()));
  }
}
if(require.main===module)main().catch(error=>{console.error('Demo reset stopped: '+(error.code || error.message));process.exitCode=1;});
module.exports={validateTarget,resetTables,main};
