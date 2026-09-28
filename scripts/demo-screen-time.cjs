'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const fullTime={dailyLimitMinutes:1440,weekdaySchedule:[{start:'00:00',end:'23:59'}],weekendSchedule:[{start:'00:00',end:'23:59'}],bedtimeStart:'00:00',bedtimeEnd:'00:00',schoolTimeBlock:false,exceptions:[{type:'FAMILY',start:'00:00',end:'23:59'}]};
async function applyFullTime(client,accounts,emails) {
  const changed=[];
  for(const email of emails) {
    const account=accounts.find(a=>a.email===email && a.role==='CHILD');
    if(!account)throw new Error('Full-time demo account must match an existing child');
    const policies=(await client.query("SELECT id FROM parent_policies WHERE child_id=$1 AND status='ACTIVE' FOR UPDATE",[account.id])).rows;
    if(policies.length!==1)throw new Error('Expected exactly one active child policy');
    await client.query('INSERT INTO screentime_policies (id,policy_id,daily_limit_minutes,weekday_schedule,weekend_schedule,bedtime_start,bedtime_end,school_time_block,exceptions,created_at,updated_at) VALUES ($1,$2,1440,$3,$3,$4,$4,false,$5,now(),now()) ON CONFLICT (policy_id) DO UPDATE SET daily_limit_minutes=1440,weekday_schedule=EXCLUDED.weekday_schedule,weekend_schedule=EXCLUDED.weekend_schedule,bedtime_start=EXCLUDED.bedtime_start,bedtime_end=EXCLUDED.bedtime_end,school_time_block=false,exceptions=EXCLUDED.exceptions,updated_at=now()',[crypto.randomUUID(),policies[0].id,JSON.stringify(fullTime.weekdaySchedule),'00:00',JSON.stringify(fullTime.exceptions)]);
    await client.query('UPDATE parent_policies SET version=version+1,updated_at=now() WHERE id=$1',[policies[0].id]);
    changed.push(account.id);
  }
  return changed;
}
async function main() {
  const root=path.resolve(__dirname,'..');
  const settings=require('yaml').parse(fs.readFileSync(path.join(root,'automation_tests/automation-settings.yml'),'utf8'));
  const config=require('./demo-reset-config.cjs').resolveConfig(settings,{},root);
  const dev=require(path.join(config.appRoot,'scripts/dev-settings.cjs'));
  const {Client}=require(path.join(config.appRoot,'auth/node_modules/pg'));
  const clients=[];
  try {
    for(const workspace of ['auth','parental-controls']) {
      const url=dev.databaseUrl(workspace);
      require('./reset-development-demo.cjs').validateTarget(url,dev.databases[workspace],config);
      const client=new Client({connectionString:url});await client.connect();clients.push(client);
    }
    const [auth,policy]=clients;
    const accounts=(await auth.query('SELECT id,email,role FROM accounts')).rows;
    const emails=settings.demo_reset.full_time_accounts || [];
    const ids=accounts.filter(a=>emails.includes(a.email)).map(a=>a.id);
    const before=(await policy.query('SELECT p.*, row_to_json(s) AS screentime FROM parent_policies p LEFT JOIN screentime_policies s ON s.policy_id=p.id WHERE p.child_id=ANY($1)',[ids])).rows;
    if(!process.argv.includes('--apply')) {console.log(JSON.stringify({mode:'dry-run',matchingAccounts:ids.length,policyCount:before.length}));return;}
    const directory=path.join(root,'automation_tests/output/policy-backups');fs.mkdirSync(directory,{recursive:true});
    const backup=path.join(directory,Date.now()+'-'+crypto.randomUUID()+'.json');fs.writeFileSync(backup,JSON.stringify(before,null,2),{flag:'wx',mode:0o600});
    await policy.query('BEGIN');
    try {const changed=await applyFullTime(policy,accounts,emails);await policy.query('COMMIT');console.log(JSON.stringify({changed,backup}));}
    catch(error){await policy.query('ROLLBACK');throw error;}
  } finally {await Promise.all(clients.map(c=>c.end()));}
}
if(require.main===module)main().catch(e=>{console.error(e.code || e.message);process.exitCode=1;});
module.exports={applyFullTime,fullTime};
