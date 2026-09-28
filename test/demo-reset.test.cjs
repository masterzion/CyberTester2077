const test=require('node:test');
const assert=require('node:assert/strict');
const {validateTarget,resetTables}=require('../scripts/reset-development-demo.cjs');
test('demo reset rejects production, other ports and other databases',()=>{
  assert.doesNotThrow(()=>validateTarget('postgresql://localhost-user@127.0.0.1:15432/viafactor','viafactor'));
  for(const url of ['postgresql://host:15432/viafactor','postgresql://127.0.0.1:5432/viafactor','postgresql://127.0.0.1:15432/production']) assert.throws(()=>validateTarget(url,'viafactor'));
});
test('reset plan preserves account identities and configuration',()=>{
  for(const table of ['accounts','credentials','families','guardians','children','runtime_configuration'])assert.ok(!resetTables.auth.includes(table));
  assert.ok(resetTables['services/social'].includes('posts'));
  assert.ok(resetTables.auth.includes('refresh_tokens'));
});

const {parseArgs,resolveConfig}=require('../scripts/demo-reset-config.cjs');
const path=require('node:path');
test('strict CLI parsing defaults to dry run and rejects malformed arguments',()=>{
  assert.deepEqual(parseArgs([]),{});
  assert.deepEqual(parseArgs(['--settings','custom.yml']),{'--settings':'custom.yml'});
  for(const args of [['--apply'],['--app-root'],['--credentials','--apply'],['--unknown'],['--apply','--apply']])assert.throws(()=>parseArgs(args));
});
test('configuration supports a moved application and container without source changes',()=>{
  const settings={demo_reset:{app_root:'../another-app',postgres_container:'demo-postgres',container_engine:'docker',port:25432}};
  const config=resolveConfig(settings,{},__dirname);
  assert.equal(config.appRoot,path.resolve(__dirname,'../another-app'));
  assert.equal(config.container,'demo-postgres');
  assert.equal(config.engine,'docker');
  assert.doesNotThrow(()=>validateTarget('postgresql://local@127.0.0.1:25432/renamed_auth','renamed_auth',config));
  assert.throws(()=>validateTarget('postgresql://local@127.0.0.1:15432/renamed_auth','renamed_auth',config));
  assert.equal(resolveConfig(settings,{'--app-root':'override','--credentials':'accounts.yml'},__dirname).credentialsFile,path.resolve(__dirname,'accounts.yml'));
});
test('missing or unsafe configuration fails closed',()=>{
  const base={app_root:'app',postgres_container:'db'};
  for(const demo_reset of [{},{...base,host:'production.example.com'},{...base,port:0},{...base,container_engine:'shell'},{...base,postgres_container:'--all'}])assert.throws(()=>resolveConfig({demo_reset},{},__dirname));
});
