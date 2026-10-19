"""Private routing regressions; loopback API and synthetic SQLite only."""
import contextlib
import http.client
import json
import os
import threading
import unittest
from unittest.mock import patch
import test_monitor as baseline
from monitor import server, validate_recipient


SLOT=baseline.SLOT


class RecipientTests(unittest.TestCase):
    setUp=baseline.MonitorTests.setUp
    event=baseline.MonitorTests.event
    incident=baseline.MonitorTests.incident
    def test_private_recipient_validation(self):
        self.assertEqual(validate_recipient('alerts@example.invalid'), 'alerts@example.invalid')
        for value in [None, '', [], ['alerts@example.invalid'], 'a@example.invalid,b@example.invalid',
                      'Name <a@example.invalid>', ' a@example.invalid', 'a@example.invalid\n',
                      'a@example.invalid\r\nBcc:b@example.invalid', 'a..b@example.invalid',
                      'a@-example.invalid', 'a@example', 'á@example.invalid', 'a'*65+'@example.invalid']:
            with self.subTest(kind=type(value).__name__), self.assertRaises(ValueError):
                validate_recipient(value)

    @contextlib.contextmanager
    def api(self):
        token='synthetic-test-only-not-a-real-secret-123456'
        api=server(self.path, token, port=0)
        thread=threading.Thread(target=api.serve_forever, daemon=True);thread.start()
        conn=http.client.HTTPConnection(*api.server_address, timeout=3)
        def call(body=None):
            conn.request('POST', '/v1/claim', json.dumps({} if body is None else body),
                         {'Content-Type':'application/json','Authorization':'Bearer '+token})
            response=conn.getresponse()
            return response.status,json.loads(response.read())
        try:
            with patch('monitor.time.time',return_value=SLOT+50):
                yield call
        finally:
            conn.close();api.shutdown();api.server_close();thread.join()

    def test_missing_or_invalid_config_preserves_pending(self):
        self.incident()
        with self.api() as call:
            for config in [None, '', 'a@example.invalid,b@example.invalid', 'a@example.invalid\n']:
                with patch.dict(os.environ, {}, clear=True):
                    if config is not None:os.environ['CAP_BACKUP_ALERT_RECIPIENT']=config
                    self.assertEqual(call(), (503,{'error':'RECIPIENT_CONFIGURATION_UNAVAILABLE'}))
                row=self.store.db.execute('SELECT state,attempts,claim_id FROM outbox').fetchone()
                self.assertEqual(tuple(row), ('pending',0,None))
            status,item=call()
            self.assertEqual(status,200)
            self.assertEqual(item['recipient'],'alerts@example.invalid')

    def test_event_and_request_cannot_override_recipient(self):
        self.incident()
        event=dict(self.event(),recipient='other@example.invalid')
        with self.assertRaises(ValueError):self.store.apply(event,SLOT+50)
        with self.api() as call:
            self.assertEqual(call({'recipient':'other@example.invalid'}), (400,{'error':'INVALID_REQUEST'}))
            self.assertEqual(call()[1]['recipient'],'alerts@example.invalid')

    def test_recipient_change_during_retry_requires_review(self):
        self.incident()
        first=self.store.claim(SLOT+50,'alerts@example.invalid')
        with self.assertRaises(ValueError):self.store.claim(SLOT+231,'other@example.invalid')
        row=self.store.db.execute('SELECT attempts,state FROM outbox').fetchone()
        self.assertEqual(tuple(row),(1,'claimed'))
        again=self.store.claim(SLOT+231,'alerts@example.invalid')
        self.assertEqual(first['alert'],again['alert'])
        self.assertEqual(first['idempotency_key'],again['idempotency_key'])
        self.assertEqual(first['recipient'],again['recipient'])


if __name__=='__main__':unittest.main(verbosity=2)
