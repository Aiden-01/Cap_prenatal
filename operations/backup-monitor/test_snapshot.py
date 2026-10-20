"""Phase 7 isolated fixtures only. No systemd calls, real credentials or mail."""
import contextlib
import copy
import datetime as dt
import errno
import http.client
import io
import json
import os
from pathlib import Path
import sqlite3
import stat
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import MagicMock, patch

import evidence_snapshot as evidence
import publisher
import test_monitor as baseline
from monitor import Store, iso, observation_unavailable, observe_snapshot, server

SLOT = baseline.SLOT


def raw_records(messages, run='a'*32, began=SLOT, extra=None):
    records = [{'__REALTIME_TIMESTAMP': str(int((began+i)*1e6)),
                '_SYSTEMD_INVOCATION_ID': run, 'MESSAGE': m, **(extra or {})} for i, m in enumerate(messages)]
    return b'\n'.join(json.dumps(r).encode() for r in records)


def snapshot(fixture='success', run='a'*32, began=SLOT, now=SLOT+60, active=False):
    messages = baseline.FIXTURES[fixture]
    unit = {'run_id': run, 'started_at': iso(began),
            'finished_at': None if active else iso(began+len(messages)),
            'active_state': 'active' if active else 'inactive',
            'result': 'success' if fixture == 'success' else 'failed',
            'exit_status': 0 if fixture == 'success' else 1}
    return publisher.build_snapshot(raw_records(messages, run, began), unit, now, now)


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = Path(self.tmp.name)
        self.file = self.folder/'snapshot.json'
        self.store = Store(str(self.folder/'monitor.sqlite'), baseline.BASE)
        self.addCleanup(self.store.close)

    def write(self, value):
        evidence.publish_atomic(value, self.folder, enforce_owner=False)

    def read(self, now):
        return evidence.read_snapshot(now, self.file, enforce_owner=False)

    def tick(self, now, value=None):
        try:
            observe_snapshot(self.store, now, reader=(lambda _now:value) if value is not None else self.read)
            return True
        except Exception:
            observation_unavailable(self.store, now)
            return False

    def count(self):
        return self.store.db.execute('SELECT count(*) FROM outbox').fetchone()[0]

    def test_valid_snapshot_atomic_roundtrip_and_backup_date_distinct(self):
        value = snapshot()
        self.write(value)
        self.assertEqual(self.read(SLOT+60),value)
        self.assertNotEqual(value['generated_at'],value['executions'][0]['event']['started_at'])
        self.assertTrue(self.tick(SLOT+60))
        self.assertEqual(self.count(),0)
        self.assertNotEqual(self.store.get('last_verified_at'),value['generated_at'])

    def test_publisher_success_does_not_imply_verified_backup(self):
        value = snapshot('transfer_failed')
        self.write(value)
        self.assertTrue(self.tick(SLOT+60))
        self.assertEqual(self.count(),1)
        self.assertIsNone(self.store.get('last_verified_at'))

    def test_missing_stale_and_corrupt_never_infer_missed(self):
        self.assertFalse(self.tick(SLOT+360))
        self.write(snapshot(now=SLOT+60))
        self.assertFalse(self.tick(SLOT+600))
        self.file.write_bytes(b'{invalid')
        self.assertFalse(self.tick(SLOT+600))
        self.assertEqual(self.count(),0)
        self.assertEqual(self.store.get('observer_status'),'OBSERVATION_UNAVAILABLE')
        self.assertEqual(self.store.db.execute("SELECT count(*) FROM runs WHERE event_type='MISSED_BACKUP'").fetchone()[0],0)

    def test_open_incident_preserved_when_publisher_dies(self):
        self.write(snapshot('transfer_failed'))
        self.assertTrue(self.tick(SLOT+60))
        before=[tuple(r) for r in self.store.db.execute('SELECT * FROM incidents')]
        outbox=[tuple(r) for r in self.store.db.execute('SELECT * FROM outbox')]
        self.assertFalse(self.tick(SLOT+600))
        self.assertEqual(before,[tuple(r) for r in self.store.db.execute('SELECT * FROM incidents')])
        self.assertEqual(outbox,[tuple(r) for r in self.store.db.execute('SELECT * FROM outbox')])
        self.assertIsNotNone(self.store.claim(SLOT+601,'alerts@example.invalid')['alert'])

    def test_api_and_exact_workflow_code_continue_with_publisher_down(self):
        self.write(snapshot('transfer_failed'))
        self.assertTrue(self.tick(SLOT+60))
        self.assertFalse(self.tick(SLOT+600))
        token='synthetic-test-only-not-a-real-secret-123456'
        api=server(str(self.folder/'monitor.sqlite'),token,port=0)
        thread=threading.Thread(target=api.serve_forever,daemon=True);thread.start()
        connection=http.client.HTTPConnection(*api.server_address,timeout=3)
        def call(route,body):
            connection.request('POST','/v1/'+route,json.dumps(body),{'Content-Type':'application/json','Authorization':'Bearer '+token})
            response=connection.getresponse();data=json.loads(response.read())
            self.assertEqual(response.status,200)
            return data
        try:
            with patch.dict(os.environ,{'CAP_BACKUP_ALERT_RECIPIENT':'alerts@example.invalid'}),patch('monitor.time.time',return_value=SLOT+601):
                claim=call('claim',{})
                script="const fs=require('fs'),vm=require('vm'); const w=JSON.parse(fs.readFileSync('n8n/workflows/monitoreo-respaldos-externos-v1.json')); const item=JSON.parse(fs.readFileSync(0,'utf8')); const code=w.nodes.find(n=>n.id==='render').parameters.jsCode; console.log(JSON.stringify(vm.runInNewContext('(function(){'+code+'\\n})()',{$input:{first:()=>({json:item})},Intl,Date})[0].json));"
                root=Path(__file__).resolve().parents[2]
                result=subprocess.run(['node','-e',script],input=json.dumps(claim),capture_output=True,text=True,check=True,cwd=root)
                mail=json.loads(result.stdout)
                self.assertEqual(mail['recipient'],'alerts@example.invalid')
                # Only a synthetic acceptance, never a provider request.
                call('ack',{'event_id':mail['event_id'],'claim_id':mail['claim_id'],'provider_id':'synthetic-provider-accepted'})
                self.assertIsNone(call('claim',{})['alert'])
                self.assertEqual(self.store.get('observer_status'),'OBSERVATION_UNAVAILABLE')
        finally:
            connection.close();api.shutdown();api.server_close();thread.join()

    def test_permission_denied_is_unavailable_not_missing_backup(self):
        self.write(snapshot())
        with patch('evidence_snapshot.os.open',side_effect=PermissionError('synthetic permission failure')):
            self.assertFalse(self.tick(SLOT+60))
        self.assertEqual(self.count(),0)

    def test_closed_schema_types_dates_and_proofs(self):
        for mutate in [lambda s:s.update(schema_version=True),lambda s:s.update(schema_version=2),
            lambda s:s.update(private='synthetic'),lambda s:s.update(generated_at=iso(SLOT+999)),
            lambda s:s['window'].update(history_status='complete'),lambda s:s['window'].update(end_at=iso(SLOT+10)),
            lambda s:s['executions'][0]['proof'].update(start=1),lambda s:s['executions'][0]['proof'].update(end=False),
            lambda s:s['executions'][0]['event'].update(recipient='other@example.invalid'),
            lambda s:s['executions'][0]['event'].update(run_id='arbitrary'),
            lambda s:s['executions'][0]['event'].update(finished_at=iso(SLOT-1)),
            lambda s:s['unit'].update(run_id='invalid'),lambda s:s['unit'].update(exit_status=False),
            lambda s:s['unit'].update(started_at=iso(SLOT+10)),
            lambda s:s['unit'].update(run_id='b'*32),
            lambda s:s['unit'].update(active_state='reloading'),lambda s:s.update(executions='not a list')]:
            value=snapshot();mutate(value)
            with self.subTest(mutation=mutate),self.assertRaises(ValueError):evidence.validate_snapshot(value,SLOT+60)

    def test_duplicate_json_keys_constants_and_large_payload_rejected(self):
        for data in [b'{"schema_version":1,"schema_version":1}',b'{"x":NaN}',b'\xff',b' '* (evidence.MAX_BYTES+1)]:
            with self.assertRaises(ValueError):evidence.decode(data,SLOT+60)
        self.file.write_bytes(b' '* (evidence.MAX_BYTES+1))
        self.assertFalse(self.tick(SLOT+60))

    def test_duplicate_run_ids_and_unbounded_events_rejected(self):
        value=snapshot();value['executions']*=2
        with self.assertRaises(ValueError):evidence.validate_snapshot(value,SLOT+60)
        value['executions']*=evidence.MAX_EVENTS
        with self.assertRaises(ValueError):evidence.validate_snapshot(value,SLOT+60)

    def test_rotated_latest_journal_is_unknown_not_success_or_missed(self):
        value=snapshot()
        unit=value['unit']
        rotated=publisher.build_snapshot(b'',unit,SLOT+360,SLOT+360)
        self.assertEqual(rotated['executions'][0]['event']['event_type'],'UNKNOWN')
        self.assertTrue(self.tick(SLOT+360,rotated))
        self.assertIsNone(self.store.get('last_verified_at'))
        self.assertEqual(self.store.db.execute("SELECT count(*) FROM runs WHERE event_type='MISSED_BACKUP'").fetchone()[0],0)

    def test_unproven_retention_no_old_missing_replay(self):
        self.store.put('publisher_generated_at',SLOT-9*86400)
        value=snapshot(now=SLOT+360,began=SLOT-86400)
        self.assertTrue(self.tick(SLOT+360,value))
        rows=self.store.db.execute("SELECT slot FROM runs WHERE event_type='MISSED_BACKUP'").fetchall()
        self.assertEqual([r[0] for r in rows],[iso(SLOT)])
        self.assertEqual(self.store.get('evidence_history_gap'),'REVIEW_REQUIRED')

    def test_fresh_metadata_proves_current_no_start_only_after_grace(self):
        self.assertTrue(self.tick(SLOT+299,snapshot(began=SLOT-86400,now=SLOT+299)))
        self.assertEqual(self.count(),0)
        self.assertTrue(self.tick(SLOT+300,snapshot(began=SLOT-86400,now=SLOT+300)))
        self.assertEqual(self.count(),1)

    def test_no_latest_metadata_cannot_claim_absence(self):
        unit={'run_id':None,'started_at':None,'finished_at':None,'active_state':'inactive','result':'success','exit_status':0}
        value=publisher.build_snapshot(b'',unit,SLOT+360,SLOT+360)
        self.assertTrue(self.tick(SLOT+360,value))
        self.assertEqual(self.count(),0)

    def test_active_incomplete_requires_positive_start_and_finish_grace(self):
        # Real positive start marker, no completion markers.
        unit={'run_id':'a'*32,'started_at':iso(SLOT),'finished_at':None,'active_state':'active','result':'success','exit_status':0}
        raw=raw_records(['Inicio backup CAP','Generando dump'])
        value=publisher.build_snapshot(raw,unit,SLOT+35*60,SLOT+35*60)
        self.assertTrue(self.tick(SLOT+35*60,value))
        self.assertEqual(self.store.db.execute("SELECT count(*) FROM runs WHERE event_type='MISSED_BACKUP'").fetchone()[0],1)

    def test_restart_deduplication_and_recovery_with_simulated_provider(self):
        self.assertTrue(self.tick(SLOT+60,snapshot('transfer_failed')))
        first=self.store.claim(SLOT+61,'alerts@example.invalid')
        self.store.ack(first['alert']['event_id'],first['claim_id'],'synthetic-provider-accepted',SLOT+62)
        with contextlib.closing(Store(str(self.folder/'monitor.sqlite'))) as reopened:
            observe_snapshot(reopened,SLOT+70,reader=lambda _now:snapshot('transfer_failed',now=SLOT+70))
            self.assertIsNone(reopened.claim(SLOT+71,'alerts@example.invalid')['alert'])
            observe_snapshot(reopened,SLOT+200,reader=lambda _now:snapshot(run='b'*32,began=SLOT+100,now=SLOT+200))
            recovery=reopened.claim(SLOT+201,'alerts@example.invalid')
            self.assertEqual(recovery['alert']['kind'],'RECUPERADO')
            reopened.ack(recovery['alert']['event_id'],recovery['claim_id'],'synthetic-recovery',SLOT+202)
        self.assertEqual(self.count(),2)

    def test_replayed_older_snapshot_does_not_undo_state(self):
        self.assertTrue(self.tick(SLOT+120,snapshot(now=SLOT+120)))
        self.assertFalse(self.tick(SLOT+125,snapshot(now=SLOT+60)))
        self.assertEqual(float(self.store.get('publisher_generated_at')),SLOT+120)

    def test_sqlite_lock_preserves_prior_state(self):
        self.store.db.execute('PRAGMA busy_timeout=20')
        with contextlib.closing(Store(str(self.folder/'monitor.sqlite'))) as blocker:
            blocker.db.execute('BEGIN IMMEDIATE')
            try:
                with self.assertRaises(sqlite3.OperationalError):observe_snapshot(self.store,SLOT+60,reader=lambda _now:snapshot())
            finally:blocker.db.execute('ROLLBACK')
        self.assertEqual(self.count(),0)
        self.assertIsNone(self.store.get('publisher_generated_at'))

    def test_corrupt_sqlite_cli_fails_sanitized(self):
        directory=self.folder/'corrupt';directory.mkdir();file=directory/'monitor.sqlite';file.write_bytes(b'not sqlite')
        root=Path(__file__).resolve().parents[2]
        result=subprocess.run([sys.executable,'-B',str(Path(__file__).with_name('monitor.py')),'observe','--db',str(file),'--snapshot','--once'],capture_output=True,text=True,cwd=root)
        self.assertEqual(result.returncode,1)
        self.assertEqual(result.stdout.strip(),'MONITOR_STATE_UNAVAILABLE')
        self.assertEqual(result.stderr,'')

    def test_simulated_full_disk_keeps_last_atomic_snapshot(self):
        self.write(snapshot())
        old=self.file.read_bytes()
        with patch('evidence_snapshot.os.fsync',side_effect=OSError(errno.ENOSPC,'synthetic full disk')):
            with self.assertRaises(OSError):self.write(snapshot(now=SLOT+100))
        self.assertEqual(self.file.read_bytes(),old)
        self.assertEqual(list(self.folder.glob('.snapshot-*')),[])

    def test_sqlite_full_transaction_does_not_confirm_or_lose_alert(self):
        self.assertTrue(self.tick(SLOT+60,snapshot('transfer_failed')))
        before=[tuple(r) for r in self.store.db.execute('SELECT * FROM outbox')]
        with self.assertRaises(sqlite3.OperationalError):
            with self.store.tx():
                self.store.put('synthetic-full','not committed')
                raise sqlite3.OperationalError('synthetic disk full')
        self.assertEqual(before,[tuple(r) for r in self.store.db.execute('SELECT * FROM outbox')])
        self.assertIsNone(self.store.get('synthetic-full'))

    def test_symlink_and_hardlink_targets_are_rejected(self):
        regular=os.stat(self.folder)
        symbolic=os.stat_result((stat.S_IFLNK|0o777,*regular[1:]))
        with patch('evidence_snapshot._regular',side_effect=evidence.EvidenceUnavailable('OBSERVATION_UNAVAILABLE')):
            self.file.write_bytes(b'synthetic target')
            with self.assertRaises(ValueError):self.write(snapshot())
        with self.assertRaises(ValueError):evidence._regular(symbolic,False)
        linked=list(os.stat(self.file));linked[3]=2
        with self.assertRaises(ValueError):evidence._regular(os.stat_result(linked),False)

    @unittest.skipUnless(os.name=='posix','Requires isolated Linux permissions and dir_fd')
    def test_posix_actual_symlink_rejected(self):
        target=self.folder/'other';target.write_text('do not overwrite')
        self.file.symlink_to(target)
        with self.assertRaises(ValueError):self.write(snapshot())
        self.assertEqual(target.read_text(),'do not overwrite')

    @unittest.skipUnless(os.name=='posix' and hasattr(os,'geteuid') and os.geteuid()==0,
                         'Requires authorized isolated Linux root')
    def test_posix_rejects_untrusted_tmp_ancestor(self):
        # TemporaryDirectory under /tmp is intentionally rejected: a writable ancestor.
        with self.assertRaises(ValueError):evidence.publish_atomic(snapshot(),self.folder)


class PublisherTests(unittest.TestCase):
    def test_fixed_unit_and_no_cli_arguments(self):
        self.assertEqual(publisher.SYSTEMCTL[3],'cap-prenatal-backup.service')
        with patch('publisher.sys.argv',['publisher.py','--unit=other']),patch('publisher.collect') as collect,contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(publisher.main(),1)
            collect.assert_not_called()

    def test_raw_fields_and_limits_do_not_reach_snapshot(self):
        unit=snapshot()['unit']
        for raw in [b'x'*(publisher.MAX_JOURNAL_BYTES+1),b'{}\n'*(publisher.MAX_RECORDS+1),b'x'*(publisher.MAX_LINE+1),
                    raw_records(['synthetic'],extra={'recipient':'alerts@example.invalid'}),
                    raw_records(['synthetic'],run='not-systemd-id')]:
            with self.assertRaises(ValueError):publisher.build_snapshot(raw,unit,SLOT+60,SLOT+60)
        raw=raw_records(baseline.FIXTURES['success']+['private synthetic text Authorization: SYNTHETIC_ONLY'])
        result=publisher.build_snapshot(raw,unit,SLOT+60,SLOT+60)
        text=json.dumps(result)
        self.assertNotIn('Authorization',text)
        self.assertNotIn('MESSAGE',text)
        self.assertNotIn('a'*64,text)

    def test_mandatory_journal_metadata_whitelisted_and_dropped(self):
        unit=snapshot()['unit']
        raw=raw_records(baseline.FIXTURES['success'],extra={'__CURSOR':'synthetic','_BOOT_ID':'b'*32,'__MONOTONIC_TIMESTAMP':'123'})
        result=publisher.build_snapshot(raw,unit,SLOT+60,SLOT+60)
        self.assertTrue(result['executions'][0]['event']['external_verified'])
        self.assertNotIn('__CURSOR',json.dumps(result))

    def test_manager_messages_without_invocation_cannot_verify_backup(self):
        unit=snapshot()['unit']
        manager=json.dumps({'__REALTIME_TIMESTAMP':str(int((SLOT+20)*1e6)),
                            'MESSAGE':'Finished unit announcement'}).encode()
        value=publisher.build_snapshot(manager,unit,SLOT+60,SLOT+60)
        self.assertEqual(value['executions'][0]['event']['event_type'],'UNKNOWN')
        self.assertFalse(value['executions'][0]['event']['external_verified'])

    def test_success_proof_missing_or_out_of_order_is_never_verified(self):
        unit=snapshot()['unit']
        messages=baseline.FIXTURES['success']
        for changed in [messages[1:], messages[:-1], list(reversed(messages)), [m for m in messages if 'Verificando existencia' not in m]]:
            value=publisher.build_snapshot(raw_records(changed),unit,SLOT+60,SLOT+60)
            self.assertFalse(value['executions'][0]['event']['external_verified'])

    def test_collector_changed_state_failure_and_fixed_commands(self):
        good=(b'InvocationID='+b'a'*32+b'\nResult=success\nExecMainStatus=0\nActiveState=inactive\nExecMainStartTimestamp=Tue 2026-10-20 08:00:00 UTC\nExecMainExitTimestamp=Tue 2026-10-20 08:00:14 UTC\n')
        with patch('publisher.time.time',return_value=SLOT+60),patch('publisher.bounded_command',side_effect=[good,raw_records(baseline.FIXTURES['success']),good]) as command:
            self.assertTrue(publisher.collect()['executions'][0]['event']['external_verified'])
            self.assertEqual([c.args[0][0] for c in command.call_args_list],['/usr/bin/systemctl','/usr/bin/journalctl','/usr/bin/systemctl'])
            self.assertTrue(all('cap-prenatal-backup.service' in ' '.join(c.args[0]) for c in command.call_args_list))
        with patch('publisher.time.time',return_value=SLOT+60),patch('publisher.bounded_command',side_effect=[good,b'',good.replace(b'Result=success',b'Result=timeout')]):
            with self.assertRaises(ValueError):publisher.collect()

    def test_oneshot_activating_is_running_not_completed(self):
        raw=(b'InvocationID='+b'a'*32+b'\nResult=success\nExecMainStatus=0\nActiveState=activating\nExecMainStartTimestamp=Tue 2026-10-20 08:00:00 UTC\nExecMainExitTimestamp=Mon 2026-10-19 08:01:00 UTC\n')
        unit=publisher.parse_unit(raw)
        self.assertEqual(unit['active_state'],'active')
        self.assertIsNone(unit['finished_at'])

    def test_directory_and_target_path_manipulation_rejected_portably(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)
            # A file cannot masquerade as the output directory.
            target=folder/'not-directory';target.write_text('synthetic untouched')
            with self.assertRaises(ValueError):evidence.publish_atomic(snapshot(),target,enforce_owner=False)
            self.assertEqual(target.read_text(),'synthetic untouched')
            # Nor may an existing directory masquerade as snapshot.json.
            (folder/'snapshot.json').mkdir()
            with self.assertRaises(ValueError):evidence.publish_atomic(snapshot(),folder,enforce_owner=False)

    def test_bounded_pipe_timeout_and_overflow_kill_child(self):
        child=MagicMock();child.__enter__.return_value=child;child.stdout.fileno.return_value=123
        for ready,chunk,error in [([],b'',TimeoutError),([child.stdout],b'x'*17,ValueError)]:
            with patch('publisher.os.name','posix'),patch('publisher.subprocess.Popen',return_value=child) as popen,patch('publisher.select.select',return_value=(ready,[],[])),patch('publisher.os.read',return_value=chunk):
                with self.assertRaises(error):publisher.bounded_command(publisher.SYSTEMCTL,__import__('time').monotonic()+1,16)
                self.assertFalse(popen.call_args.kwargs['shell'])
                self.assertEqual(popen.call_args.kwargs['stderr'],subprocess.DEVNULL)
                child.kill.assert_called()


if __name__=='__main__':unittest.main(verbosity=2)
