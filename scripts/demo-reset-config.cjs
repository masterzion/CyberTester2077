'use strict';
const path=require('node:path');
function parseArgs(args) {
  const result={};
  const values=new Set(['--settings','--app-root','--credentials']);
  for(let i=0;i<args.length;i++) {
    const key=args[i];
    if(Object.hasOwn(result,key))throw new Error('Duplicate option: '+key);
    if(values.has(key)) {
      if(!args[i+1] || args[i+1].startsWith('--'))throw new Error('Missing value for '+key);
      result[key]=args[++i];
    } else if(['--apply','--confirm-development-reset','--help'].includes(key))result[key]=true;
    else throw new Error('Unknown option: '+key);
  }
  if(result['--apply']&&!result['--confirm-development-reset'])throw new Error('Apply requires --confirm-development-reset');
  return result;
}
function resolveConfig(settings,options,root) {
  const config=settings.demo_reset || {};
  const app=options['--app-root'] || config.app_root;
  if(typeof app!=='string'||!app.trim())throw new Error('Set demo_reset.app_root or --app-root');
  const host=config.host ?? '127.0.0.1';
  if(host!=='127.0.0.1')throw new Error('Only local development host 127.0.0.1 is allowed');
  const port=config.port ?? 15432;
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid development port');
  const engine=config.container_engine || 'podman';
  if(!['podman','docker'].includes(engine))throw new Error('Container engine must be podman or docker');
  if(typeof config.postgres_container!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(config.postgres_container))throw new Error('Set demo_reset.postgres_container');
  const credential=options['--credentials'] || config.credentials || 'automation_tests/credentials.yml';
  if(typeof credential!=='string'||!credential.trim())throw new Error('Invalid credentials path');
  const fullTimeAccounts=config.full_time_accounts ?? [];
  if(!Array.isArray(fullTimeAccounts)||fullTimeAccounts.some(x=>typeof x!=='string'||!x.includes('@')))throw new Error('Invalid full_time_accounts');
  return {appRoot:path.resolve(root,app),credentialsFile:path.resolve(root,credential),host,port,engine,container:config.postgres_container,fullTimeAccounts};
}
module.exports={parseArgs,resolveConfig};
