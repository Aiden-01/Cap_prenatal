"""Closed, bounded evidence contract and protected local snapshot files. No network."""
import datetime as dt
import json
import os
from pathlib import Path
import re
import stat
import uuid

DIRECTORY = Path('/run/cap-prenatal-backup-evidence')
SNAPSHOT = DIRECTORY / 'snapshot.json'
MAX_BYTES = 262144
MAX_EVENTS = 128
WINDOW_SECONDS = 7 * 86400
MAX_AGE = 180
CLOCK_SKEW = 5
PROOF_FIELDS = {'start', 'local_validation', 'hash_match', 'finalize', 'existence', 'success', 'end'}
UNIT_FIELDS = {'run_id', 'started_at', 'finished_at', 'active_state', 'result', 'exit_status'}


class EvidenceUnavailable(ValueError):
    """Intentionally carries no raw path, event, journal message or credentials."""


def reject():
    raise EvidenceUnavailable('OBSERVATION_UNAVAILABLE')


def timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?\+00:00', value):
        reject()
    try:
        return dt.datetime.fromisoformat(value).timestamp()
    except (ValueError, OverflowError):
        reject()


def exact(value, keys):
    if not isinstance(value, dict) or set(value) != keys:
        reject()


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            reject()
        result[key] = value
    return result


def decode(data, now):
    if not isinstance(data, bytes) or not 0 < len(data) <= MAX_BYTES:
        reject()
    try:
        value = json.loads(data.decode('utf-8'), object_pairs_hook=no_duplicates,
                           parse_constant=lambda _x: reject())
        return validate_snapshot(value, now)
    except (UnicodeError, ValueError, TypeError, KeyError, OverflowError, RecursionError):
        reject()


def validate_snapshot(value, now):
    from monitor import validate
    exact(value, {'schema_version', 'generated_at', 'window', 'unit', 'executions'})
    if type(value['schema_version']) is not int or value['schema_version'] != 1:
        reject()
    generated = timestamp(value['generated_at'])
    if not now - MAX_AGE <= generated <= now + CLOCK_SKEW:
        reject()
    window = value['window']
    exact(window, {'start_at', 'end_at', 'history_status'})
    start, end = timestamp(window['start_at']), timestamp(window['end_at'])
    # Retention continuity is not proven by a successful journal query or empty output.
    if window['history_status'] != 'retention_unproven' or not 0 <= generated - end <= 30 or end - start != WINDOW_SECONDS:
        reject()
    unit = value['unit']
    exact(unit, UNIT_FIELDS)
    if unit['active_state'] not in {'active', 'inactive', 'failed'} or unit['result'] not in {'success', 'failed'}:
        reject()
    if type(unit['exit_status']) is not int or not 0 <= unit['exit_status'] <= 255:
        reject()
    if unit['run_id'] is None:
        if unit['started_at'] is not None or unit['finished_at'] is not None:
            reject()
    elif not isinstance(unit['run_id'], str) or not re.fullmatch('[a-f0-9]{32}', unit['run_id']):
        reject()
    else:
        began = timestamp(unit['started_at'])
        if began > end + CLOCK_SKEW:
            reject()
        if unit['finished_at'] is not None and not began <= timestamp(unit['finished_at']) <= end + CLOCK_SKEW:
            reject()
        if unit['active_state'] == 'active' and unit['finished_at'] is not None:
            reject()
    executions = value['executions']
    if not isinstance(executions, list) or len(executions) > MAX_EVENTS:
        reject()
    seen, previous = set(), None
    for execution in executions:
        exact(execution, {'event', 'proof'})
        event, proof = execution['event'], execution['proof']
        try:
            validate(event)
        except (ValueError, TypeError, KeyError):
            reject()
        exact(proof, PROOF_FIELDS)
        if any(type(v) is not bool for v in proof.values()):
            reject()
        run_id = event['run_id']
        if not re.fullmatch('[a-f0-9]{32}', run_id) or run_id in seen:
            reject()
        seen.add(run_id)
        began = timestamp(event['started_at'])
        finished = timestamp(event['finished_at']) if event['finished_at'] is not None else None
        if not start <= began <= end or (finished is not None and not began <= finished <= end):
            reject()
        ordering = (began, run_id)
        if previous is not None and ordering <= previous:
            reject()
        previous = ordering
        # The publisher timestamp never substitutes for backup execution timestamps.
        complete = all(proof.values()) and event['hash_match'] and finished is not None
        if event['external_verified'] != bool(complete):
            reject()
        method = 'sha256_readback_temp_then_move_and_lsf' if complete else 'unproven'
        if event['verification_method'] != method:
            reject()
        if event['destination_type'] != 'gdrive' or event['event_type'] == 'MISSED_BACKUP':
            reject()
        if unit['run_id'] and began > timestamp(unit['started_at']) + 2:
            reject()
        if run_id == unit['run_id']:
            if abs(began - timestamp(unit['started_at'])) > 2:
                reject()
            if finished is not None and unit['finished_at'] is not None and finished > timestamp(unit['finished_at']) + 2:
                reject()
        if event['event_type'] == 'OK' and not complete:
            reject()
    if unit['run_id'] is not None and start <= timestamp(unit['started_at']) <= end:
        if unit['run_id'] not in seen:
            reject()  # Missing latest journal is represented explicitly as UNKNOWN/INCOMPLETE.
    return value


def _directory(path, enforce_owner):
    path = Path(path)
    if enforce_owner:
        if os.name != 'posix' or not path.is_absolute():
            reject()
        for p in [path, *path.parents]:
            s = p.lstat()
            if not stat.S_ISDIR(s.st_mode) or s.st_uid != 0 or s.st_mode & 0o022:
                reject()
    else:
        # Portable fixture mode only. Production entry points never disable owner checks.
        s = path.lstat()
        if not stat.S_ISDIR(s.st_mode) or path.is_symlink():
            reject()
    return path


def _regular(s, enforce_owner):
    if not stat.S_ISREG(s.st_mode) or s.st_nlink != 1:
        reject()
    if enforce_owner and (s.st_uid != 0 or stat.S_IMODE(s.st_mode) != 0o640):
        reject()


def read_snapshot(now, path=SNAPSHOT, enforce_owner=True):
    path = Path(path)
    directory_fd = None
    try:
        parent = _directory(path.parent, enforce_owner)
        if os.name == 'posix':
            directory_fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory_fd)
        else:
            _regular(path.lstat(), enforce_owner)
            fd = os.open(path, os.O_RDONLY | getattr(os, 'O_BINARY', 0))
        with os.fdopen(fd, 'rb') as source:
            s = os.fstat(source.fileno())
            _regular(s, enforce_owner)
            if not 0 < s.st_size <= MAX_BYTES:
                reject()
            data = source.read(MAX_BYTES + 1)
            if len(data) != s.st_size:
                reject()
        return decode(data, now)
    except (OSError, ValueError):
        reject()
    finally:
        if directory_fd is not None:
            os.close(directory_fd)


def publish_atomic(value, directory=DIRECTORY, enforce_owner=True):
    """Fixed production destination; test injection is available only as a Python API."""
    data = (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')
    decode(data, timestamp(value['generated_at']))
    parent = _directory(directory, enforce_owner)
    name, temporary = 'snapshot.json', '.snapshot-' + uuid.uuid4().hex
    directory_fd, fd, created = None, None, False
    try:
        if os.name == 'posix':
            import fcntl
            directory_fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            fcntl.flock(directory_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            try:
                _regular(os.stat(name, dir_fd=directory_fd, follow_symlinks=False), enforce_owner)
            except FileNotFoundError:
                pass
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o640, dir_fd=directory_fd)
            created = True
            os.fchmod(fd, 0o640)
        else:
            try:
                _regular((parent / name).lstat(), enforce_owner)
            except FileNotFoundError:
                pass
            fd = os.open(parent / temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_BINARY', 0), 0o640)
            created = True
        with os.fdopen(fd, 'wb') as target:
            fd = None
            target.write(data)
            target.flush()
            os.fsync(target.fileno())
        if directory_fd is not None:
            os.replace(temporary, name, src_dir_fd=directory_fd, dst_dir_fd=directory_fd)
            created = False
            os.fsync(directory_fd)
        else:
            os.replace(parent / temporary, parent / name)
            created = False
    finally:
        if fd is not None:
            os.close(fd)
        if created:
            if directory_fd is not None:
                os.unlink(temporary, dir_fd=directory_fd)
            else:
                (parent / temporary).unlink()
        if directory_fd is not None:
            os.close(directory_fd)
