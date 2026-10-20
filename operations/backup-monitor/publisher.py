"""Restricted publisher: one systemd unit, sanitized evidence, fixed output, no mail."""
import datetime as dt
import json
import os
import re
import select
import subprocess
import sys
import time

from evidence_snapshot import (CLOCK_SKEW, MAX_EVENTS, PROOF_FIELDS, WINDOW_SECONDS,
                               no_duplicates, publish_atomic, validate_snapshot)
from monitor import UNIT, iso, normalize

MAX_JOURNAL_BYTES = 2 * 1024 * 1024
MAX_RECORDS = 4096
MAX_LINE = 16384
PROPERTIES = ('InvocationID,Result,ExecMainStatus,ActiveState,'
              'ExecMainStartTimestamp,ExecMainExitTimestamp')
SYSTEMCTL = ['/usr/bin/systemctl', '--no-pager', 'show', UNIT, '--property=' + PROPERTIES]


def bounded_command(args, deadline, limit):
    """POSIX-only bounded pipe read. Never shell, disk spooling or raw stderr."""
    if os.name != 'posix':
        raise ValueError('PUBLISHER_REQUIRES_AUTHORIZED_LINUX')
    env = {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC',
           'SYSTEMD_PAGER': '', 'SYSTEMD_COLORS': '0'}
    output = bytearray()
    with subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL, env=env, shell=False) as child:
        try:
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError('COLLECTOR_LIMIT')
                ready, _, _ = select.select([child.stdout], [], [], remaining)
                if not ready:
                    raise TimeoutError('COLLECTOR_LIMIT')
                chunk = os.read(child.stdout.fileno(), 32768)
                if not chunk:
                    break
                output.extend(chunk)
                if len(output) > limit:
                    raise ValueError('COLLECTOR_LIMIT')
            if child.wait(timeout=max(0.01, deadline - time.monotonic())):
                raise ValueError('COLLECTOR_UNAVAILABLE')
        except BaseException:
            child.kill()
            child.wait()
            raise
    return bytes(output)


def systemd_date(value):
    if value in ('', 'n/a'):
        return None
    if not re.fullmatch(r'[A-Za-z]{3} \d{4}-\d\d-\d\d \d\d:\d\d:\d\d UTC', value):
        raise ValueError('UNIT_METADATA_INVALID')
    return iso(dt.datetime.strptime(value, '%a %Y-%m-%d %H:%M:%S UTC').replace(tzinfo=dt.timezone.utc).timestamp())


def parse_unit(raw):
    lines = raw.decode('utf-8').splitlines()
    if len(lines) != 6 or any('=' not in line for line in lines):
        raise ValueError('UNIT_METADATA_INVALID')
    values = dict(line.split('=', 1) for line in lines)
    active_states = {'active', 'activating', 'deactivating', 'reloading'}
    if set(values) != set(PROPERTIES.split(',')) or values['ActiveState'] not in active_states | {'inactive', 'failed'}:
        raise ValueError('UNIT_METADATA_INVALID')
    status = values['ExecMainStatus']
    if not re.fullmatch(r'\d{1,3}', status) or not 0 <= int(status) <= 255:
        raise ValueError('UNIT_METADATA_INVALID')
    ident = values['InvocationID'] or None
    if ident is not None and not re.fullmatch('[a-f0-9]{32}', ident):
        raise ValueError('UNIT_METADATA_INVALID')
    started = systemd_date(values['ExecMainStartTimestamp'])
    if bool(ident) != bool(started):
        raise ValueError('UNIT_METADATA_INVALID')
    active = values['ActiveState'] in active_states
    return {'run_id': ident, 'started_at': started,
            'finished_at': None if active else systemd_date(values['ExecMainExitTimestamp']),
            'active_state': 'active' if active else values['ActiveState'], 'result': 'success' if values['Result'] == 'success' else 'failed',
            'exit_status': int(status)}


def build_snapshot(raw, unit, cutoff, generated):
    if not isinstance(raw, bytes) or len(raw) > MAX_JOURNAL_BYTES:
        raise ValueError('COLLECTOR_LIMIT')
    if len(raw.splitlines()) > MAX_RECORDS:
        raise ValueError('COLLECTOR_LIMIT')
    start = cutoff - WINDOW_SECONDS
    groups = {}
    fields = {'__REALTIME_TIMESTAMP', 'MESSAGE'}
    # journalctl JSON may always emit these metadata fields even with --output-fields.
    allowed = fields | {'_SYSTEMD_INVOCATION_ID', '__CURSOR', '__MONOTONIC_TIMESTAMP', '_BOOT_ID'}
    for line in raw.splitlines():
        if len(line) > MAX_LINE:
            raise ValueError('COLLECTOR_LIMIT')
        record = json.loads(line.decode('utf-8'), object_pairs_hook=no_duplicates)
        if not isinstance(record, dict) or not fields <= set(record) <= allowed:
            raise ValueError('JOURNAL_SHAPE_INVALID')
        if any(not isinstance(v, str) or len(v) > 512 for k, v in record.items() if k not in fields):
            raise ValueError('JOURNAL_SHAPE_INVALID')
        ident, message, stamp = record.get('_SYSTEMD_INVOCATION_ID'), record['MESSAGE'], record['__REALTIME_TIMESTAMP']
        if not isinstance(message, str) or not isinstance(stamp, str) or not re.fullmatch(r'\d{1,20}', stamp):
            raise ValueError('JOURNAL_SHAPE_INVALID')
        instant = int(stamp) / 1e6
        if not start <= instant <= cutoff:
            raise ValueError('JOURNAL_TIME_INVALID')
        # PID1 unit announcements may lack an invocation ID. Never attribute them
        # to a backup or treat their generic "Finished" text as verification.
        if ident is None:
            continue
        if not isinstance(ident, str) or not re.fullmatch('[a-f0-9]{32}', ident):
            raise ValueError('JOURNAL_IDENTITY_INVALID')
        group = groups.setdefault(ident, [])
        group.append((instant, message))
        if len(groups) > MAX_EVENTS:
            raise ValueError('COLLECTOR_LIMIT')
    executions = []
    for ident, records in groups.items():
        records.sort(key=lambda pair: pair[0])
        began, last = records[0][0], records[-1][0]
        messages = [m for _, m in records]
        # Trusted publisher derives proof from ordered markers, not arbitrary JSON claims.
        markers = {'start': 'Inicio backup CAP', 'local_validation': 'Validando estructura',
                   'hash_match': 'Los hashes local y remoto coinciden', 'finalize': 'Confirmando archivo definitivo',
                   'existence': 'Verificando existencia', 'success': 'Backup cifrado y verificable almacenado',
                   'end': 'Fin backup CAP'}
        positions = {key: next((i for i, m in enumerate(messages) if marker in m), None) for key, marker in markers.items()}
        proof = {key: position is not None for key, position in positions.items()}
        ordered = all(proof.values()) and list(positions.values()) == sorted(positions.values())
        current_done = ident == unit['run_id'] and unit['active_state'] in {'inactive', 'failed'}
        terminal = proof['end'] or current_done or any('[ERROR]' in m for m in messages)
        event = normalize(ident, began, messages, last if terminal else None,
                          unit['exit_status'] if current_done else None)
        complete = bool(ordered and event['hash_match'] and terminal)
        if not complete:
            event.update(external_verified=False, verification_method='unproven')
            if event['event_type'] == 'OK':
                event.update(event_type='UNKNOWN', reason_code='EVIDENCE_MISSING')
            # A run whose start was rotated away cannot prove an overrun.
            if not proof['start'] and event['event_type'] == 'INCOMPLETE':
                event.update(event_type='UNKNOWN', reason_code='EVIDENCE_MISSING')
        # Encode order failure explicitly: it cannot pass the reader's complete-proof rule.
        if all(proof.values()) and not ordered:
            proof['start'] = False
        event['external_verified'] = complete
        executions.append({'event': event, 'proof': proof})
    if unit['run_id'] and unit['run_id'] not in groups:
        began = dt.datetime.fromisoformat(unit['started_at']).timestamp()
        if start <= began <= cutoff:
            finished = dt.datetime.fromisoformat(unit['finished_at']).timestamp() if unit['finished_at'] else None
            event = normalize(unit['run_id'], began, [], finished=finished, exit_code=unit['exit_status'])
            event.update(event_type='UNKNOWN', reason_code='EVIDENCE_MISSING')
            executions.append({'event': event, 'proof': {key: False for key in PROOF_FIELDS}})
    executions.sort(key=lambda e: (e['event']['started_at'], e['event']['run_id']))
    snapshot = {'schema_version': 1, 'generated_at': iso(generated),
                'window': {'start_at': iso(start), 'end_at': iso(cutoff), 'history_status': 'retention_unproven'},
                'unit': unit, 'executions': executions}
    return validate_snapshot(snapshot, generated)


def collect():
    deadline = time.monotonic() + 25
    cutoff = time.time()
    before = bounded_command(SYSTEMCTL, deadline, 8192)
    args = ['/usr/bin/journalctl', '--unit=' + UNIT, '--since=' + iso(cutoff - WINDOW_SECONDS),
            '--until=' + iso(cutoff), '--no-pager', '--output=json',
            '--output-fields=__REALTIME_TIMESTAMP,_SYSTEMD_INVOCATION_ID,MESSAGE', '--lines=' + str(MAX_RECORDS + 1)]
    journal = bounded_command(args, deadline, MAX_JOURNAL_BYTES)
    after = bounded_command(SYSTEMCTL, deadline, 8192)
    if before != after:
        raise ValueError('UNIT_CHANGED_DURING_READ')
    return build_snapshot(journal, parse_unit(after), cutoff, time.time())


def main():
    # Not a generic privileged command: no CLI options, env paths, fixture mode or unit arguments.
    if len(sys.argv) != 1 or os.name != 'posix' or os.geteuid() != 0:
        print('PUBLICATION_UNAVAILABLE', flush=True)
        return 1
    os.umask(0o077)
    try:
        publish_atomic(collect())
    except Exception:
        print('PUBLICATION_UNAVAILABLE', flush=True)
        return 1
    print('EVIDENCE_PUBLISHED', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
