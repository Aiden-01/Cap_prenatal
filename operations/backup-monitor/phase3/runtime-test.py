"""Real native n8n CLI with synthetic profile and intercepted transport only."""
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from monitor import Store,normalize,slot_for

here=Path(__file__).resolve().parent
root=here.parents[2]
def save(p,value):p.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    for port in (18866,18867,18869):
        with socket.socket() as probe:probe.bind(('127.0.0.1',port))
    (here/'runtime').mkdir(exist_ok=True)
    lab=Path(tempfile.mkdtemp(prefix='run-',dir=here/'runtime'));(lab/'tmp').mkdir()
    print('Disposable lab: '+lab.name,flush=True)
    source=root/'.n8n-local/.n8n/nodes/node_modules/n8n-nodes-resend'
    assert json.loads((source/'package.json').read_text(encoding='utf-8'))['version']=='2.8.0'
    target=lab/'profile/.n8n/nodes/node_modules/n8n-nodes-resend';target.mkdir(parents=True)
    shutil.copy2(source/'package.json',target/'package.json');shutil.copytree(source/'dist',target/'dist')
    save(lab/'profile/.n8n/nodes/package.json',{'private':True,'dependencies':{'n8n-nodes-resend':'2.8.0'}})
    canonical=root/'n8n/workflows/monitoreo-respaldos-externos-v1.json'
    original=json.loads(canonical.read_text(encoding='utf-8'));before=sha(canonical)
    wf=json.loads(json.dumps(original));wf.update(id='cpren91LabV1',name='CPREN-91 laboratorio sintético inactivo')
    schedule=wf['nodes'][0];schedule['type']='n8n-nodes-base.manualTrigger';schedule['typeVersion']=1;schedule['parameters']={}
    for n in wf['nodes']:
        if n['type']=='n8n-nodes-base.httpRequest':
            n['parameters']['url']=n['parameters']['url'].replace(':8766',':18866');n['credentials']={'httpHeaderAuth':{'id':'cpren91ApiFixture','name':'Synthetic API only'}}
        elif n['type']=='n8n-nodes-resend.resend':n['credentials']={'resendApi':{'id':'cpren91ResendFixture','name':'Synthetic Resend only'}}
    assert wf['connections']==original['connections']
    assert next(n for n in wf['nodes'] if n['id']=='render')['parameters']==next(n for n in original['nodes'] if n['id']=='render')['parameters']
    bad=json.loads(json.dumps(wf));bad['id']='cpren91LabBadApi';bad['name']='CPREN-91 prueba negativa de autenticación'
    next(n for n in bad['nodes'] if n['id']=='claim')['credentials']['httpHeaderAuth']={'id':'cpren91BadApi','name':'Synthetic wrong API only'}
    save(lab/'workflow.json',[wf,bad])
    save(lab/'credentials.json',[{'id':'cpren91ApiFixture','name':'Synthetic API only','type':'httpHeaderAuth','data':{'name':'Authorization','value':'Bearer synthetic-api-not-a-real-secret-123456'}},{'id':'cpren91ResendFixture','name':'Synthetic Resend only','type':'resendApi','data':{'apiKey':'synthetic-resend-never-valid'}},{'id':'cpren91BadApi','name':'Synthetic wrong API only','type':'httpHeaderAuth','data':{'name':'Authorization','value':'Bearer intentionally-wrong-fixture'}}])
    results=[]
    def cli(step,args,allow_error=False):
        r=subprocess.run(['node',str(here/'run-cli.cjs'),str(lab),step,*args],capture_output=True,text=True,timeout=110,cwd=root)
        assert r.returncode==0 or allow_error,(step,r.stdout[-1000:],r.stderr[-1000:])
        assert json.loads(r.stdout)['error'] is None,(step,'CLI timeout or launch error')
        guard=json.loads((lab/(step+'.guard.json')).read_text(encoding='utf-8'))
        assert not any(e.get('blocked') and e['kind']!='python-probe-denied' for e in guard['events']), (step,'blocked unexpected operation')
        print(step+' complete',flush=True)
        return (lab/(step+'.stdout')).read_text(encoding='utf-8')
    cli('bootstrap',['user-management:reset'])
    cli('credentials',['import:credentials','--input='+str(lab/'credentials.json')])
    cli('import',['import:workflow','--input='+str(lab/'workflow.json'),'--activeState=false'])
    fixtures=json.loads((here.parent/'fixtures/journal.json').read_text(encoding='utf-8'))
    with contextlib.closing(Store(str(lab/'monitor.sqlite'),time.time()-3600)) as store:
        service=None
        def start_services(db_path=None):
            (lab/'services-ready').unlink(missing_ok=True)
            p=subprocess.Popen([sys.executable,'-B',str(here/'lab-services.py'),str(lab),str(db_path or lab/'monitor.sqlite')],cwd=lab,stdout=(lab/'services.stdout').open('ab'),stderr=(lab/'services.stderr').open('ab'))
            for _ in range(100):
                if (lab/'services-ready').exists():return p
                if p.poll() is not None:raise RuntimeError('Fixture services failed')
                time.sleep(.1)
            raise RuntimeError('Fixture services unavailable')
        def run_case(step,ident='cpren91LabV1'):
            text=cli(step,['execute','--id='+ident,'--rawOutput'],allow_error=True)
            data=None
            for offset,c in enumerate(text):
                if c!='{':continue
                try:value,_=json.JSONDecoder().raw_decode(text[offset:])
                except ValueError:continue
                if isinstance(value,dict) and 'data' in value and 'resultData' in value['data']:data=value;break
            assert data is not None,(step,'No CLI execution output')
            rd=data['data']['resultData'];item={'case':step,'success':not bool(rd.get('error')),'nodes':list(rd.get('runData',{}))}
            if rd.get('error'):item['errorNode']=rd['error'].get('node',{}).get('name')
            results.append(item);save(lab/'progress.json',results)
            return item
        def emit(fixture,ident):
            now=time.time();event=normalize(ident,now-.5,fixtures[fixture],now,0 if fixture=='success' else 1)
            file=lab/(ident+'.fixture.json');save(file,[event])
            r=subprocess.run([sys.executable,'-B',str(here.parent/'monitor.py'),'observe','--db',str(lab/'monitor.sqlite'),'--fixture',str(file),'--once'],cwd=lab,capture_output=True,text=True,timeout=10)
            assert r.returncode==0,'Fixture observer failed'
            return event
        def provider_count():
            if not (lab/'provider.sqlite').exists():return 0
            with contextlib.closing(sqlite3.connect(lab/'provider.sqlite')) as db:return db.execute('SELECT count(*) FROM sent').fetchone()[0]
        def snapshot(label,db_path=None):
            with contextlib.closing(sqlite3.connect(db_path or lab/'monitor.sqlite')) as db:
                db.row_factory=sqlite3.Row
                save(lab/(label+'.state.json'),{t:[dict(r) for r in db.execute('SELECT * FROM '+t)] for t in ['meta','runs','incidents','outbox']})
        try:
            service=start_services()
            empty=run_case('empty-queue');assert empty['success'];assert 'Enviar alerta por Resend' not in empty['nodes']
            if '--smoke' in sys.argv:
                save(lab/'smoke.json',{'passed':True,'results':results,'canonicalUnchanged':sha(canonical)==before});return
            first=emit('transfer_failed','first-failure')
            alert=run_case('transfer-alert');assert alert['success'];assert provider_count()==1
            store.apply(first,time.time());repeat=run_case('duplicate-failure');assert repeat['success'];assert provider_count()==1
            assert 'Enviar alerta por Resend' not in repeat['nodes']
            emit('success','new-verified-copy');recovery=run_case('recovery');assert recovery['success'];assert provider_count()==2
            auth=run_case('api-auth-denied','cpren91LabBadApi');assert not auth['success'];assert auth['errorNode']=='Reclamar alerta';assert provider_count()==2
            emit('transfer_failed','second-failure')
            (lab/'provider-error').write_text('fixture')
            failure=run_case('provider-error');assert failure['success'];assert 'Registrar resultado incierto' in failure['nodes'];assert provider_count()==2
            (lab/'provider-error').unlink()
            with store.tx():store.db.execute("UPDATE outbox SET due_at=0 WHERE state='uncertain'")
            (lab/'lose-ack').write_text('fixture')
            lost=run_case('accepted-ack-lost');assert not lost['success'];assert lost['errorNode']=='Confirmar aceptación';assert provider_count()==3
            snapshot('before-expiry')
            with store.tx():store.db.execute("UPDATE outbox SET lease_until=0 WHERE state='claimed'")
            (lab/'lose-ack').unlink()
            retry=run_case('expired-lease-retry');assert retry['success'];assert provider_count()==3
            emit('success','second-verified-copy');assert run_case('second-recovery')['success'];assert provider_count()==4
            emit('transfer_failed','third-failure');snapshot('before-restart')
            service.terminate();service.wait(timeout=10);service=start_services()
            with contextlib.closing(Store(str(lab/'monitor.sqlite'))) as reopened:
                assert reopened.db.execute("SELECT count(*) FROM outbox WHERE state='pending'").fetchone()[0]==1
            # CLI restarts n8n for each case; the same isolated SQLite and IDs persist.
            restarted=run_case('all-components-restarted');assert restarted['success'];assert provider_count()==5
            emit('success','third-verified-copy');assert run_case('third-recovery')['success'];assert provider_count()==6
            emit('transfer_failed','fourth-failure')
            claim=store.claim(time.time());store.uncertain(claim['alert']['event_id'],claim['claim_id'],time.time())
            with store.tx():store.db.execute("UPDATE outbox SET first_attempt=?,due_at=0 WHERE state='uncertain'",(time.time()-86401,))
            limit=run_case('uncertain-after-safety-limit');assert limit['success'];assert provider_count()==6
            assert store.db.execute('SELECT count(*) FROM outbox WHERE manual_review=1').fetchone()[0]==1
            snapshot('main-final')
            service.terminate();service.wait(timeout=10);service=None
            for label,incomplete in [('missing-scheduled-run',False),('incomplete-scheduled-run',True)]:
                directory=lab/label;directory.mkdir();db_path=directory/'monitor.sqlite';slot=slot_for(time.time())
                with contextlib.closing(Store(str(db_path),slot-3600)) as scenario:
                    if incomplete:scenario.apply(normalize('unfinished',slot,fixtures['incomplete']),slot+1)
                    scenario.check_schedule(slot+(35 if incomplete else 5)*60)
                service=start_services(db_path)
                outcome=run_case(label);assert outcome['success'];assert 'Enviar alerta por Resend' in outcome['nodes']
                snapshot(label,db_path);service.terminate();service.wait(timeout=10);service=None
            assert provider_count()==8
            with contextlib.closing(sqlite3.connect(lab/'profile/.n8n/database.sqlite')) as db:
                state=db.execute('SELECT id,active,activeVersionId FROM workflow_entity ORDER BY id').fetchall()
                assert len(state)==2 and all(not r[1] and r[2] is None for r in state)
            guards=[]
            for file in lab.glob('*.guard.json'):
                value=json.loads(file.read_text(encoding='utf-8'));assert not any(e.get('blocked') and e['kind']!='python-probe-denied' for e in value['events']);guards.append({'file':file.name,'events':value['events']})
            assert any('runner.guard' in g['file'] for g in guards),'No child runner guard evidence'
            summary={'verdict':'PASS','n8nVersion':'2.34.4','cases':results,'simulatedUniqueMessages':provider_count(),'realEmails':0,'allWorkflowsInactiveUnpublished':True,'canonicalUnchanged':sha(canonical)==before,'guards':guards,'labFolder':lab.name}
            save(lab/'result.json',summary);print('ALL NATIVE N8N CASES PASSED',flush=True)
        finally:
            if service:service.terminate();service.wait(timeout=10)
            assert sha(canonical)==before

if __name__=='__main__':main()
