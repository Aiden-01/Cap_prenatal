"""CAP Prenatal backup observer. No backup, rclone, clinical or mail operations."""
import argparse
import contextlib
import datetime as dt
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Guatemala currently uses UTC-06 without DST; independent of Windows tzdata.
GT = dt.timezone(dt.timedelta(hours=-6), "America/Guatemala")
UNIT = "cap-prenatal-backup.service"
TYPES = {"OK", "DUMP_FAILED", "TRANSFER_FAILED", "DESTINATION_UNAVAILABLE",
         "VERIFY_FAILED", "MISSED_BACKUP", "INCOMPLETE", "UNKNOWN"}
REASONS = {"NONE", "COMMAND_FAILED", "AUTH_FAILED", "NETWORK", "HASH_MISMATCH",
           "NO_START", "TIMEOUT", "EVIDENCE_MISSING", "CLEANUP_FAILED"}
STAGES = {"start", "dump", "local_validation", "mkdir", "transfer", "remote_hash",
          "hash_match", "finalize", "existence", "success", "cleanup", "end"}
MARKERS = {
    "start": "Inicio backup CAP", "dump": "Generando dump",
    "local_validation": "Validando estructura", "mkdir": "Preparando directorio",
    "transfer": "Subiendo copia", "remote_hash": "Calculando SHA-256 remoto",
    "hash_match": "Los hashes local y remoto coinciden", "finalize": "Confirmando archivo definitivo",
    "existence": "Verificando existencia", "success": "Backup cifrado y verificable almacenado",
    "cleanup": "Copia temporal local eliminada", "end": "Fin backup CAP",
}


def iso(epoch):
    return dt.datetime.fromtimestamp(epoch, dt.timezone.utc).isoformat()


def validate_recipient(value):
    """One private operator-authorized mailbox; no lists, headers or display names."""
    if not isinstance(value, str) or len(value) > 254 or not re.fullmatch(
            r"[A-Za-z0-9](?:[A-Za-z0-9_+.-]{0,62}[A-Za-z0-9])?@"
            r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
            r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+", value):
        raise ValueError("RECIPIENT_CONFIGURATION_INVALID")
    if '..' in value.split('@')[0]:
        raise ValueError("RECIPIENT_CONFIGURATION_INVALID")
    return value


def slot_for(epoch):
    local = dt.datetime.fromtimestamp(epoch, GT)
    slot = local.replace(hour=2, minute=0, second=0, microsecond=0)
    if local < slot:
        slot -= dt.timedelta(days=1)
    return slot.timestamp()


def normalize(run_id, started, messages, finished=None, exit_code=None):
    """Raw logs never enter SQLite. Only whitelisted enums and evidence booleans."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", run_id):
        raise ValueError("Invalid run identity")
    stages, local_hash, remote_hash, auth, network, failed = [], None, None, False, False, False
    for message in messages:
        if not isinstance(message, str):
            raise ValueError("Invalid log record")
        for stage, marker in MARKERS.items():
            if marker in message and stage not in stages:
                stages.append(stage)
        for label in ("local", "remoto"):
            match = re.search(r"SHA-256 " + label + r":\s*([0-9a-f]{64})\b", message)
            if match:
                if label == "local":
                    local_hash = match[1]
                else:
                    remote_hash = match[1]
        low = message.lower()
        auth |= any(s in low for s in ("invalid_grant", "invalid_client", "unauthorized", "access_denied"))
        network |= any(s in low for s in ("timed out", "no such host", "network is unreachable", "connection refused"))
        failed |= "[ERROR]" in message
    hash_match = bool(local_hash and local_hash == remote_hash)
    # Current script confirms the final listing after hashing the temporary object.
    # Preserve this evidence level; never claim a new independent remote stat.
    verified = hash_match and all(s in stages for s in
                                 ("local_validation", "hash_match", "finalize", "existence", "success"))
    terminal = finished is not None or failed or "end" in stages
    stage = stages[-1] if stages else "start"
    reason, kind = "NONE", "OK"
    if verified:
        if failed or exit_code not in (None, 0):
            reason = "CLEANUP_FAILED"
    elif not terminal:
        kind, reason = "INCOMPLETE", "EVIDENCE_MISSING"
    elif auth or network:
        kind, reason = "DESTINATION_UNAVAILABLE", "AUTH_FAILED" if auth else "NETWORK"
    elif local_hash and remote_hash and not hash_match:
        kind, reason = "VERIFY_FAILED", "HASH_MISMATCH"
    elif failed or exit_code not in (None, 0):
        kind = ("DUMP_FAILED" if stage in ("start", "dump", "local_validation") else
                "TRANSFER_FAILED" if stage in ("mkdir", "transfer", "finalize") else "VERIFY_FAILED")
        reason = "COMMAND_FAILED"
    else:
        kind, reason = "UNKNOWN", "EVIDENCE_MISSING"
    return {"schema_version": 1, "run_id": run_id, "started_at": iso(started),
            "finished_at": iso(finished) if finished else None, "schedule_slot": iso(slot_for(started)),
            "destination_type": "gdrive", "event_type": kind, "stage": stage,
            "reason_code": reason, "external_verified": verified, "hash_match": hash_match,
            "verification_method": "sha256_readback_temp_then_move_and_lsf" if verified else "unproven"}


def validate(event):
    required = {"schema_version", "run_id", "started_at", "finished_at", "schedule_slot",
                "destination_type", "event_type", "stage", "reason_code", "external_verified",
                "hash_match", "verification_method"}
    if not isinstance(event, dict) or set(event) != required or type(event["schema_version"]) is not int or event["schema_version"] != 1:
        raise ValueError("Invalid event schema")
    if any(not isinstance(event[key], str) for key in ("run_id", "destination_type", "event_type", "stage", "reason_code", "verification_method")):
        raise ValueError("Invalid event value")
    if event["destination_type"] not in ("gdrive", "external_hdd") or event["event_type"] not in TYPES:
        raise ValueError("Invalid event type")
    if event["stage"] not in STAGES or event["reason_code"] not in REASONS:
        raise ValueError("Invalid classification")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,96}", event["run_id"]):
        raise ValueError("Invalid identity")
    for key in ("started_at", "finished_at", "schedule_slot"):
        if event[key] is not None:
            if not isinstance(event[key], str):
                raise ValueError("Timestamp required")
            date = dt.datetime.fromisoformat(event[key])
            if date.tzinfo is None:
                raise ValueError("Timezone required")
    started = dt.datetime.fromisoformat(event["started_at"]).timestamp()
    if event["finished_at"] and dt.datetime.fromisoformat(event["finished_at"]).timestamp() < started:
        raise ValueError("Invalid chronology")
    if dt.datetime.fromisoformat(event["schedule_slot"]).timestamp() != slot_for(started):
        raise ValueError("Invalid schedule slot")
    if type(event["external_verified"]) is not bool or type(event["hash_match"]) is not bool:
        raise ValueError("Boolean evidence required")
    if event["verification_method"] not in ("sha256_readback_temp_then_move_and_lsf", "unproven"):
        raise ValueError("Unsupported verification")
    if event["external_verified"] and (not event["hash_match"] or event["event_type"] != "OK" or
                                       event["verification_method"] == "unproven"):
        raise ValueError("Inconsistent verification")


class Store:
    def __init__(self, path, now=None):
        now = time.time() if now is None else now
        self.db = sqlite3.connect(path, timeout=5, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(Path(__file__).with_name("schema.sql").read_text())
        with self.tx():
            self.db.execute("INSERT OR IGNORE INTO meta VALUES ('baseline',?)", (str(now),))

    @contextlib.contextmanager
    def tx(self):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            yield
            self.db.execute("COMMIT")
        except Exception:
            self.db.execute("ROLLBACK")
            raise

    def close(self):
        self.db.close()

    def get(self, key, default=None):
        row = self.db.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return row[0] if row else default

    def put(self, key, value):
        self.db.execute("INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))

    def enqueue(self, incident, kind, event, now):
        event_id = hashlib.sha256((incident + kind).encode()).hexdigest()
        payload = {"event_id": event_id, "incident_id": incident, "kind": kind,
                   "event_type": event["event_type"], "reason_code": event["reason_code"],
                   "destination_type": event["destination_type"], "created_at": iso(now),
                   "incident_opened_at": iso(self.db.execute("SELECT opened_at FROM incidents WHERE incident_id=?", (incident,)).fetchone()[0]),
                   "last_verified_at": self.get("last_verified_at")}
        self.db.execute("INSERT OR IGNORE INTO outbox(event_id,incident_id,kind,payload,state,created_at,due_at) VALUES (?,?,?,?,'pending',?,?)",
                        (event_id, incident, kind, json.dumps(payload, sort_keys=True), now, now))

    def apply(self, event, now):
        validate(event)
        started = dt.datetime.fromisoformat(event["started_at"]).timestamp()
        finished = dt.datetime.fromisoformat(event["finished_at"]).timestamp() if event["finished_at"] else started
        if started > now + 60 or finished > now + 60:
            raise ValueError("Future observation")
        with self.tx():
            prior = self.db.execute("SELECT event_json FROM runs WHERE run_id=?", (event["run_id"],)).fetchone()
            if prior and json.loads(prior[0]) == event:
                return
            if prior and json.loads(prior[0])["external_verified"] and not event["external_verified"]:
                return
            self.db.execute("INSERT INTO runs VALUES (?,?,?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET observed_at=excluded.observed_at,event_type=excluded.event_type,verified=excluded.verified,event_json=excluded.event_json",
                            (event["run_id"], event["schedule_slot"], now, event["event_type"], int(event["external_verified"]), json.dumps(event, sort_keys=True)))
            if event["external_verified"]:
                previous = self.get("last_verified_at")
                if previous is None or finished > dt.datetime.fromisoformat(previous).timestamp():
                    self.put("last_verified_at", iso(finished))
            if started < float(self.get("baseline")):
                return  # History only: no startup replay of October incidents.
            opened = self.db.execute("SELECT * FROM incidents WHERE closed_at IS NULL").fetchone()
            if event["external_verified"]:
                if opened and started >= opened["opened_at"]:
                    self.db.execute("UPDATE incidents SET closed_at=?,recovery_run=? WHERE incident_id=?", (now, event["run_id"], opened["incident_id"]))
                    self.enqueue(opened["incident_id"], "RECUPERADO", event, now)
            elif event["event_type"] != "INCOMPLETE" and not opened:
                # Ignore stale failures older than the last externally verified copy.
                latest = self.get("last_verified_at")
                if latest and finished <= dt.datetime.fromisoformat(latest).timestamp():
                    return
                ident = uuid.uuid4().hex
                self.db.execute("INSERT INTO incidents VALUES (?,?,NULL,?,NULL)", (ident, now, event["event_type"]))
                self.enqueue(ident, "ALERTA", event, now)

    def check_schedule(self, now, start_grace=5, finish_grace=35):
        baseline = float(self.get("baseline"))
        first = slot_for(baseline)
        if first < baseline:
            first += 86400
        for slot in range(int(first), int(slot_for(now)) + 1, 86400):
            self._check_slot(now, slot, start_grace, finish_grace)

    def _check_slot(self, now, slot, start_grace, finish_grace):
        if slot < float(self.get("baseline")) or now < slot + start_grace * 60:
            return
        rows = self.db.execute("SELECT event_json FROM runs WHERE slot=?", (iso(slot),)).fetchall()
        events = [json.loads(r[0]) for r in rows]
        if events and now < slot + finish_grace * 60:
            return
        if events and any(e["event_type"] != "INCOMPLETE" for e in events):
            return
        event = normalize("missing_" + str(int(slot)), slot, [], finished=min(now, slot + finish_grace * 60))
        event.update(event_type="MISSED_BACKUP", reason_code="TIMEOUT" if events else "NO_START", schedule_slot=iso(slot))
        self.apply(event, now)

    def claim(self, now, recipient=None):
        # Internal queue tests may omit routing. Every HTTP claim requires it.
        if recipient is not None:
            validate_recipient(recipient)
        with self.tx():
            self.db.execute("UPDATE outbox SET state='uncertain',claim_id=NULL,lease_until=NULL,due_at=? WHERE state='claimed' AND lease_until<=?", (now, now))
            # Keep uncertain/expired messages visible for manual reconciliation; never resend after 24h.
            self.db.execute("UPDATE outbox SET state='uncertain',manual_review=1 WHERE state IN ('pending','uncertain') AND first_attempt IS NOT NULL AND (? >= first_attempt+86400-120 OR attempts>=6)", (now,))
            row = self.db.execute("""SELECT * FROM outbox o WHERE state IN ('pending','uncertain') AND manual_review=0 AND due_at<=?
              AND (kind='ALERTA' OR EXISTS(SELECT 1 FROM outbox a WHERE a.incident_id=o.incident_id AND a.kind='ALERTA' AND a.state='confirmed'))
              ORDER BY created_at,event_id LIMIT 1""", (now,)).fetchone()
            if not row:
                return {"alert": None}
            if recipient is not None:
                key = 'recipient:' + row['event_id']
                pinned = self.get(key)
                if pinned is not None and pinned != recipient:
                    raise ValueError("RECIPIENT_CONFIGURATION_CHANGED")
                self.put(key, recipient)
            claim_id = uuid.uuid4().hex
            self.db.execute("UPDATE outbox SET state='claimed',claim_id=?,lease_until=?,first_attempt=COALESCE(first_attempt,?),attempts=attempts+1 WHERE event_id=?", (claim_id, now + 180, now, row["event_id"]))
            result = {"alert": json.loads(row["payload"]), "claim_id": claim_id,
                      "idempotency_key": "cap-backup-" + row["event_id"]}
            if recipient is not None:
                result['recipient'] = recipient
            return result

    def ack(self, event_id, claim_id, provider_id, now):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", provider_id):
            raise ValueError("Invalid provider result")
        with self.tx():
            row = self.db.execute("SELECT * FROM outbox WHERE event_id=?", (event_id,)).fetchone()
            if row and row["state"] == "confirmed" and row["claim_id"] == claim_id and row["provider_id"] == provider_id:
                return  # Idempotent ACK after an HTTP response was lost.
            if not row or row["state"] != "claimed" or row["claim_id"] != claim_id or row["lease_until"] < now:
                raise ValueError("Stale claim")
            self.db.execute("UPDATE outbox SET state='confirmed',provider_id=?,lease_until=NULL WHERE event_id=?", (provider_id, event_id))

    def uncertain(self, event_id, claim_id, now):
        with self.tx():
            row = self.db.execute("SELECT * FROM outbox WHERE event_id=? AND state='claimed' AND claim_id=?", (event_id, claim_id)).fetchone()
            if not row:
                raise ValueError("Stale claim")
            self.db.execute("UPDATE outbox SET state='uncertain',claim_id=NULL,lease_until=NULL,due_at=? WHERE event_id=?", (now + min(3600, 60 * 2 ** row["attempts"]), event_id))


def read_systemd(now):
    """Fixed read-only commands. No shell, rclone, dumps, credentials or network."""
    if os.name != "posix":
        raise RuntimeError("systemd reader requires an authorized Linux host")
    since = iso(now - 7 * 86400)
    journal = subprocess.run(["journalctl", "--unit=" + UNIT, "--since=" + since,
                              "--no-pager", "--output=json"], capture_output=True, text=True, timeout=30, check=True)
    props = subprocess.run(["systemctl", "show", UNIT, "--property=InvocationID,Result,ExecMainStatus,ActiveState,SubState"],
                           capture_output=True, text=True, timeout=10, check=True)
    state = dict(line.split("=", 1) for line in props.stdout.splitlines() if "=" in line)
    grouped = {}
    for line in journal.stdout.splitlines():
        entry = json.loads(line)
        invocation = entry.get("_SYSTEMD_INVOCATION_ID")
        if not invocation:
            continue
        stamp = int(entry["__REALTIME_TIMESTAMP"]) / 1e6
        run = grouped.setdefault(invocation, {"start": stamp, "last": stamp, "messages": []})
        run["last"] = stamp
        run["messages"].append(entry.get("MESSAGE", ""))
    events = []
    for ident, run in sorted(grouped.items(), key=lambda pair: pair[1]["start"]):
        complete = any("Fin backup CAP" in m or "[ERROR]" in m for m in run["messages"])
        current_finished = ident == state.get("InvocationID") and state.get("ActiveState") in ("inactive", "failed")
        code = int(state["ExecMainStatus"]) if current_finished else None
        event = normalize(ident, run["start"], run["messages"], run["last"] if complete or current_finished else None, code)
        events.append(event)
    return events


def server(db_path, auth_token, port=8766):
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", auth_token):
        raise ValueError("Configure a private URL-safe token of 32 to 128 characters")

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # No headers, credentials, payload or raw exceptions in logs.

        def do_POST(self):
            if not hmac.compare_digest(self.headers.get("Authorization", "").encode(), ("Bearer " + auth_token).encode()):
                return self.respond(401, {"error": "UNAUTHORIZED"})
            if self.headers.get("Transfer-Encoding") or self.headers.get("Content-Type") != "application/json":
                return self.respond(400, {"error": "INVALID_REQUEST"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 2048:
                    raise ValueError("Invalid size")
                body = json.loads(self.rfile.read(length))
                routes = {"/v1/claim": set(), "/v1/ack": {"event_id", "claim_id", "provider_id"},
                          "/v1/uncertain": {"event_id", "claim_id"}}
                if self.path not in routes:
                    return self.respond(404, {"error": "NOT_FOUND"})
                if not isinstance(body, dict) or set(body) != routes[self.path] or any(not isinstance(v, str) or len(v) > 128 for v in body.values()):
                    raise ValueError("Invalid body")
                with contextlib.closing(Store(db_path)) as store:
                    now = time.time()
                    if self.path == "/v1/claim":
                        try:
                            recipient = validate_recipient(os.environ.get('CAP_BACKUP_ALERT_RECIPIENT'))
                            result = store.claim(now, recipient)
                        except ValueError:
                            return self.respond(503, {"error": "RECIPIENT_CONFIGURATION_UNAVAILABLE"})
                    elif self.path == "/v1/ack":
                        store.ack(body["event_id"], body["claim_id"], body["provider_id"], now)
                        result = {"accepted": True}
                    else:
                        store.uncertain(body["event_id"], body["claim_id"], now)
                        result = {"accepted": True}
                self.respond(200, result)
            except (ValueError, KeyError, json.JSONDecodeError):
                self.respond(400, {"error": "INVALID_REQUEST"})
            except Exception:
                self.respond(503, {"error": "MONITOR_UNAVAILABLE"})

        def setup(self):
            super().setup()
            self.connection.settimeout(5)

        def respond(self, code, value):
            data = json.dumps(value).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["observe", "serve"])
    parser.add_argument("--db", required=True)
    parser.add_argument("--systemd", action="store_true", help="Explicit opt-in for real read-only collector")
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--interval", type=int, default=300)
    parser.add_argument("--start-grace", type=int, default=5)
    parser.add_argument("--finish-grace", type=int, default=35)
    args = parser.parse_args()
    if args.interval < 1 or not 0 < args.start_grace < args.finish_grace:
        parser.error("Invalid timing")
    os.umask(0o077)
    # Require explicit operator selection of a new monitor-only directory.
    path = Path(args.db).resolve()
    if path.name != "monitor.sqlite" or not path.parent.is_dir():
        parser.error("Use monitor.sqlite inside a dedicated existing private directory")
    if args.mode == "serve":
        server(str(path), os.environ.get("CAP_BACKUP_MONITOR_TOKEN", "")).serve_forever()
        return
    if bool(args.fixture) == args.systemd:
        parser.error("Select exactly one input: --fixture or --systemd")
    with contextlib.closing(Store(str(path))) as store:
        while True:
            tick = time.monotonic()
            now = time.time()
            try:
                events = json.loads(args.fixture.read_text()) if args.fixture else read_systemd(now)
                for event in events:
                    store.apply(event, now)
                store.check_schedule(now, args.start_grace, args.finish_grace)
                with store.tx():
                    store.put("observer_last_ok", now)
            except Exception:
                # Fail visibly without leaking journal contents or secrets. A failed read is not a missing job.
                try:
                    unavailable = normalize("observer_" + str(int(slot_for(now))), now, [], finished=now)
                    store.apply(unavailable, now)
                except Exception:
                    pass
                print("OBSERVATION_UNAVAILABLE", flush=True)
                if args.once:
                    raise SystemExit(1)
            if args.once:
                return
            time.sleep(max(0, args.interval - (time.monotonic() - tick)))


if __name__ == "__main__":
    main()
