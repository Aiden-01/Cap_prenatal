import contextlib
import datetime as dt
import http.client
import json
import os
from pathlib import Path
import tempfile
import threading
import subprocess
import unittest
from unittest.mock import patch
from monitor import validate_recipient, Store, normalize, validate, slot_for, server, read_systemd, iso

FIXTURES = json.loads(Path(__file__).with_name('fixtures').joinpath('journal.json').read_text())
BASE = dt.datetime(2026, 10, 20, 7, 0, tzinfo=dt.timezone.utc).timestamp()
SLOT = BASE + 3600


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'CAP_BACKUP_ALERT_RECIPIENT':'alerts@example.invalid'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.tmp.name) / 'monitor.sqlite')
        self.store = Store(self.path, BASE)
        self.addCleanup(self.tmp.cleanup)
        self.addCleanup(self.store.close)

    def event(self, fixture='transfer_failed', run='run1', started=SLOT, finish=True):
        return normalize(run, started, FIXTURES[fixture], started + 40 if finish else None,
                         0 if fixture == 'success' else 1 if finish else None)

    def count(self):
        return self.store.db.execute('SELECT count(*) FROM outbox').fetchone()[0]

    def incident(self):
        self.store.apply(self.event(), SLOT + 40)

    def test_success_is_silent_and_updates_last_verified(self):
        self.store.apply(self.event('success'), SLOT + 40)
        self.assertEqual(self.count(), 0)
        self.assertEqual(self.store.get('last_verified_at'), iso(SLOT + 40))

    def test_classification(self):
        for fixture, kind, cause in [('dump_failed','DUMP_FAILED','COMMAND_FAILED'),
                ('transfer_failed','TRANSFER_FAILED','COMMAND_FAILED'),
                ('authentication_failed','DESTINATION_UNAVAILABLE','AUTH_FAILED'),
                ('network_failed','DESTINATION_UNAVAILABLE','NETWORK'),
                ('hash_failed','VERIFY_FAILED','HASH_MISMATCH')]:
            with self.subTest(fixture=fixture):
                e = self.event(fixture)
                self.assertEqual((e['event_type'],e['reason_code']), (kind,cause))
                self.assertFalse(e['external_verified'])

    def test_exit_zero_without_evidence_is_unknown(self):
        self.assertEqual(normalize('zero', SLOT, [], SLOT+1, 0)['event_type'], 'UNKNOWN')

    def test_hash_alone_is_not_final_verification(self):
        e = normalize('hash', SLOT, FIXTURES['success'][:10], SLOT+1, 0)
        self.assertFalse(e['external_verified'])

    def test_cleanup_failure_does_not_erase_verified_copy(self):
        e = normalize('cleanup', SLOT, FIXTURES['success'][:-2]+['[ERROR] Cleanup'], SLOT+60, 1)
        self.assertTrue(e['external_verified'])
        self.assertEqual(e['reason_code'], 'CLEANUP_FAILED')

    def test_initial_history_does_not_generate_retroactive_alerts(self):
        self.store.apply(self.event('authentication_failed', started=BASE-86400), BASE)
        self.store.check_schedule(BASE)
        self.assertEqual(self.count(), 0)

    def test_missed_start_at_0205_not_before(self):
        self.store.check_schedule(SLOT+299)
        self.assertEqual(self.count(), 0)
        self.store.check_schedule(SLOT+300)
        self.assertEqual(self.count(), 1)
        self.assertEqual(json.loads(self.store.db.execute('SELECT event_json FROM runs').fetchone()[0])['reason_code'], 'NO_START')

    def test_incomplete_until_0235(self):
        self.store.apply(self.event('incomplete', finish=False), SLOT+60)
        self.store.check_schedule(SLOT+34*60)
        self.assertEqual(self.count(), 0)
        self.store.check_schedule(SLOT+35*60)
        self.assertEqual(self.count(), 1)

    def test_configurable_thresholds(self):
        self.store.check_schedule(SLOT+600, start_grace=11, finish_grace=40)
        self.assertEqual(self.count(), 0)

    def test_guatemala_calendar_month_year_midnight(self):
        for instant, expected in [('2027-01-01T07:00:00+00:00','2026-12-31T08:00:00+00:00'),
                                  ('2027-01-01T08:00:00+00:00','2027-01-01T08:00:00+00:00')]:
            self.assertEqual(iso(slot_for(dt.datetime.fromisoformat(instant).timestamp())), expected)

    def test_duplicate_failure_and_other_runs_share_incident(self):
        self.incident()
        self.incident()
        self.store.apply(self.event(run='run2', started=SLOT+100), SLOT+140)
        self.assertEqual(self.count(), 1)

    def test_restart_preserves_baseline_queue_and_incident(self):
        self.incident()
        with contextlib.closing(Store(self.path, SLOT+1000)) as other:
            self.assertEqual(float(other.get('baseline')), BASE)
            self.assertIsNotNone(other.claim(SLOT+1000)['alert'])

    def test_reconcile_missing_days_after_observer_stopped(self):
        self.store.check_schedule(SLOT+2*86400+300)
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM runs').fetchone()[0], 3)
        self.assertEqual(self.count(), 1)

    def test_historical_gap_does_not_open_alert_after_new_verified_copy(self):
        self.store.apply(self.event('success', started=SLOT+86400), SLOT+86440)
        self.store.check_schedule(SLOT+86400+300)
        self.assertEqual(self.count(), 0)

    def test_recovery_requires_new_external_verification(self):
        self.incident()
        self.store.apply(normalize('zero', SLOT+100, [], SLOT+110, 0), SLOT+110)
        self.assertEqual(self.count(), 1)
        self.store.apply(self.event('success', run='new', started=SLOT+200), SLOT+240)
        self.assertEqual(self.count(), 2)
        self.store.apply(self.event('success', run='another', started=SLOT+300), SLOT+340)
        self.assertEqual(self.count(), 2)

    def test_old_success_cannot_close_new_incident(self):
        self.incident()
        self.store.apply(self.event('success', run='old', started=BASE-100), SLOT+100)
        self.assertEqual(self.count(), 1)
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM incidents WHERE closed_at IS NULL').fetchone()[0], 1)

    def test_verified_run_cannot_be_downgraded_by_truncated_logs(self):
        self.store.apply(self.event('success'), SLOT+40)
        self.store.apply(self.event('dump_failed'), SLOT+50)
        self.assertEqual(self.count(), 0)

    def test_claim_is_exclusive_across_connections(self):
        self.incident()
        with contextlib.closing(Store(self.path)) as other:
            self.assertIsNotNone(self.store.claim(SLOT+50)['alert'])
            self.assertIsNone(other.claim(SLOT+50)['alert'])

    def test_n8n_crash_lease_expires_same_payload_and_key(self):
        self.incident()
        first = self.store.claim(SLOT+50)
        second = self.store.claim(SLOT+231)
        self.assertEqual(first['alert'], second['alert'])
        self.assertEqual(first['idempotency_key'], second['idempotency_key'])
        self.assertNotEqual(first['claim_id'], second['claim_id'])

    def test_uncertain_resend_backoff_and_24h_safety_margin(self):
        self.incident()
        first = self.store.claim(SLOT+50)
        self.store.uncertain(first['alert']['event_id'], first['claim_id'], SLOT+51)
        self.assertIsNone(self.store.claim(SLOT+60)['alert'])
        self.assertIsNone(self.store.claim(SLOT+50+86400-120)['alert'])
        row = self.store.db.execute('SELECT * FROM outbox').fetchone()
        self.assertEqual((row['state'],row['manual_review']), ('uncertain',1))

    def test_provider_acceptance_ack_and_idempotent_ack(self):
        self.incident()
        item = self.store.claim(SLOT+50)
        args = (item['alert']['event_id'],item['claim_id'],'synthetic-provider-id',SLOT+51)
        self.store.ack(*args)
        self.store.ack(*args)
        self.assertIsNone(self.store.claim(SLOT+1000)['alert'])

    def test_stale_ack_rejected(self):
        self.incident()
        item = self.store.claim(SLOT+50)
        with self.assertRaises(ValueError):
            self.store.ack(item['alert']['event_id'],item['claim_id'],'synthetic',SLOT+500)

    def test_recovery_waits_for_alert_acceptance(self):
        self.incident()
        self.store.apply(self.event('success', run='recovered', started=SLOT+200), SLOT+240)
        first = self.store.claim(SLOT+250)
        self.assertEqual(first['alert']['kind'], 'ALERTA')
        self.assertIsNone(self.store.claim(SLOT+251)['alert'])
        self.store.ack(first['alert']['event_id'],first['claim_id'],'synthetic',SLOT+252)
        self.assertEqual(self.store.claim(SLOT+253)['alert']['kind'], 'RECUPERADO')

    def test_transaction_rollback(self):
        with self.assertRaises(RuntimeError):
            with self.store.tx():
                self.store.put('must_not_exist','value')
                raise RuntimeError('fixture')
        self.assertIsNone(self.store.get('must_not_exist'))

    def test_no_secrets_raw_logs_or_extra_fields_persist(self):
        e = normalize('private', SLOT, FIXTURES['transfer_failed']+['Authorization: Bearer SYNTHETIC_SECRET_NOT_REAL'], SLOT+40, 1)
        self.store.apply(e, SLOT+40)
        rows = json.dumps([dict(r) for r in self.store.db.execute('SELECT * FROM runs')])
        self.assertNotIn('SYNTHETIC_SECRET_NOT_REAL', rows)
        bad = dict(e, token='SYNTHETIC')
        with self.assertRaises(ValueError):
            self.store.apply(bad, SLOT+40)

    def test_unknown_enum_and_fabricated_verification_rejected(self):
        for changes in ({'reason_code':'raw clinical text'}, {'external_verified':True}, {'started_at':'2026-10-20T08:00:00'}, {'schema_version':True}, {'finished_at':iso(BASE)}, {'schedule_slot':iso(BASE)}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate(dict(self.event(), **changes))

    def test_hdd_contract_reserved_not_implemented(self):
        e = dict(self.event(), destination_type='external_hdd')
        validate(e)
        self.assertNotIn('mount', Path(__file__).with_name('monitor.py').read_text().split('def main')[0])

    def test_systemd_reader_has_only_fixed_read_commands(self):
        # Phase 7 intentionally retires direct journal access by this compatibility reader.
        with patch('evidence_snapshot.read_snapshot',return_value={'synthetic':'snapshot'}) as reader:
            self.assertEqual(read_systemd(SLOT+60), {'synthetic':'snapshot'})
            reader.assert_called_once_with(SLOT+60)
        self.assertNotIn('subprocess.run', Path(__file__).with_name('monitor.py').read_text())

    def test_local_api_auth_shape_and_no_arbitrary_routes(self):
        token='synthetic-test-only-not-a-real-secret-123456'
        api=server(self.path,token,port=0)
        self.assertEqual(api.server_address[0], '127.0.0.1')
        thread=threading.Thread(target=api.serve_forever,daemon=True);thread.start()
        try:
            conn=http.client.HTTPConnection(*api.server_address,timeout=3)
            def call(route, data, authorized=True):
                headers={'Content-Type':'application/json'}
                if authorized: headers['Authorization']='Bearer '+token
                conn.request('POST',route,json.dumps(data),headers)
                response=conn.getresponse();value=json.loads(response.read());return response.status,value
            self.assertEqual(call('/v1/claim',{},False)[0],401)
            self.assertEqual(call('/v1/claim',{'command':'rclone'})[0],400)
            self.assertEqual(call('/v1/execute',{})[0],404)
            self.assertEqual(call('/v1/claim',{}), (200,{'alert':None}))
            conn.close()
        finally:
            api.shutdown();api.server_close();thread.join()

    def test_end_to_end_queue_workflow_code_fake_resend_and_ack(self):
        self.incident()
        token='synthetic-test-only-not-a-real-secret-123456'
        api=server(self.path,token,port=0)
        thread=threading.Thread(target=api.serve_forever,daemon=True);thread.start()
        provider={}
        root=Path(__file__).resolve().parents[2]
        js="const fs=require('fs'),vm=require('vm');const w=JSON.parse(fs.readFileSync('n8n/workflows/monitoreo-respaldos-externos-v1.json'));const item=JSON.parse(fs.readFileSync(0,'utf8'));const code=w.nodes.find(n=>n.id==='render').parameters.jsCode;console.log(JSON.stringify(vm.runInNewContext('(function(){'+code+'\\n})()',{$input:{first:()=>({json:item})},Intl,Date})[0].json));"
        def render(item):
            result=subprocess.run(['node','-e',js],input=json.dumps(item),capture_output=True,text=True,check=True,cwd=root)
            return json.loads(result.stdout)
        try:
            conn=http.client.HTTPConnection(*api.server_address,timeout=3)
            def call(route, body):
                conn.request('POST','/v1/'+route,json.dumps(body),{'Content-Type':'application/json','Authorization':'Bearer '+token})
                response=conn.getresponse();data=json.loads(response.read());self.assertEqual(response.status,200);return data
            with patch('monitor.time.time',return_value=SLOT+50) as clock:
                first=call('claim',{});mail=render(first)
                provider[mail['idempotency_key']]=('synthetic-accepted',mail['html'])
                # Simulated accepted send with lost response: never contact Resend.
                call('uncertain',{'event_id':mail['event_id'],'claim_id':mail['claim_id']})
                clock.return_value=SLOT+250
                second=call('claim',{});retried=render(second)
                self.assertEqual(provider[retried['idempotency_key']][1],retried['html'])
                call('ack',{'event_id':retried['event_id'],'claim_id':retried['claim_id'],'provider_id':'synthetic-accepted'})
                self.assertIsNone(call('claim',{})['alert'])
                self.assertEqual(len(provider),1)
                self.store.apply(self.event('success',run='recovered',started=SLOT+300),SLOT+340)
                clock.return_value=SLOT+350
                recovery=call('claim',{});recovered=render(recovery)
                self.assertIn('[RECUPERADO]',recovered['subject'])
                call('ack',{'event_id':recovered['event_id'],'claim_id':recovered['claim_id'],'provider_id':'synthetic-recovery'})
                self.assertIsNone(call('claim',{})['alert'])
            conn.close()
        finally:
            api.shutdown();api.server_close();thread.join()

    def test_attempts_are_finite_even_inside_provider_window(self):
        self.incident()
        for attempt in range(6):
            claimed=self.store.claim(SLOT+50+attempt*181)
            self.assertIsNotNone(claimed['alert'])
        self.assertIsNone(self.store.claim(SLOT+50+6*181)['alert'])
        self.assertEqual(self.store.db.execute('SELECT manual_review FROM outbox').fetchone()[0],1)


if __name__=='__main__':
    unittest.main(verbosity=2)
