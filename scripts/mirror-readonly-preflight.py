#!/usr/bin/env python3
"""読取専用診断案。mirror/restore/匿名化は呼ばない。秘密値/生stderr/DBデータを出さない。"""
import json, os, re, shutil, socket, subprocess, sys

def classify(text):
    for code, pattern in [('version_mismatch','server version mismatch|aborting because of server version'),('auth_failed','password authentication failed'),('network_unreachable','Network is unreachable|No route to host'),('dns_failed','could not translate host name|Name or service not known'),('timeout','timeout|timed out'),('permission','permission denied'),('ssl','SSL error|certificate verify failed')]:
        if re.search(pattern,text,re.I): return code
    return 'unclassified_error'

def run(args,env=None):
    try:
        p=subprocess.run(args,env=env,capture_output=True,text=True,timeout=25)
    except subprocess.TimeoutExpired:
        return {'exit':124,'class':'timeout'}
    if p.returncode: return {'exit':p.returncode,'class':classify(p.stderr)}
    return {'exit':0,'class':'ok','stdout':p.stdout}

out={'readonly':True,'database_data_output':False,'clients':{}};failed=False
for tool in ['psql','pg_dump']:
    path=shutil.which(tool)
    if not path: out['clients'][tool]={'class':'client_missing'};failed=True;continue
    result=run([path,'--version'])
    version=re.search(r'PostgreSQL\) ([0-9.]+)',result.get('stdout',''))
    out['clients'][tool]={'path':path,'version':version.group(1) if version else 'unknown'}
for mode,ref,var in [('prod','cznpcewciwywcqcxktba','PROD_DB_PASSWORD'),('staging','lavutzztfqbdndjiwluc','STAGING_DB_PASSWORD')]:
    host='db.'+ref+'.supabase.co';info={};out[mode]=info
    for family,label in [(socket.AF_INET,'ipv4'),(socket.AF_INET6,'ipv6')]:
        try: info[label+'_addresses']=len({row[4][0] for row in socket.getaddrinfo(host,5432,family,socket.SOCK_STREAM)})
        except socket.gaierror:info[label+'_addresses']=0
    if not os.getenv(var):info['class']='credential_unavailable';failed=True;continue
    env=os.environ.copy();env.update(PGPASSWORD=os.environ[var],PGCONNECT_TIMEOUT='10',PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=10000')
    common=['-h',host,'-p','5432','-U','postgres','-d','postgres','--no-password']
    if shutil.which('psql'):
        result=run(['psql','-X','-At',*common,'-c',"SELECT current_setting('server_version'), current_setting('transaction_read_only'), 1;"],env)
        value=result.pop('stdout','').strip();match=re.fullmatch(r'([0-9.]+)\|on\|1',value)
        if match:result['server_version']=match.group(1)
        elif result['exit']==0:result['class']='unexpected_readonly_result';failed=True
        info['connection']=result;failed=failed or result['exit']!=0
    if shutil.which('pg_dump'):
        result=run(['pg_dump',*common,'--schema-only','--exclude-schema=*','--no-owner','--no-privileges','--file=/dev/null'],env)
        result.pop('stdout',None);info['zero_object_version_probe']=result;failed=failed or result['exit']!=0
print(json.dumps(out,ensure_ascii=False,indent=2))
sys.exit(1 if failed else 0)
