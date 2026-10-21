#!/usr/bin/env python3
"""Wait for usable test services under one deadline, with failure diagnostics."""

import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request


def http_ready(url, accept="application/json"):
    with urllib.request.urlopen(
        urllib.request.Request(url, headers={"Accept": accept}), timeout=1
    ) as response:
        return response.status == 200


def smtp_ready(port):
    with socket.create_connection(("localhost", port), timeout=1) as connection:
        return connection.recv(1024).startswith(b"220")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "services", nargs="+", choices=["db", "keycloak", "smtp", "app"]
    )
    parser.add_argument("--profile", choices=["test", "dev"], default="test")
    parser.add_argument("--timeout", type=float, default=180)
    parser.add_argument("--app-pid", type=int)
    parser.add_argument("--app-log", type=Path)
    args = parser.parse_args()
    test = args.profile == "test"
    db = "anet-psql-test-server" if test else "anet-psql-server"
    smtp = "anet-fake-smtp-test-server" if test else "anet-fake-smtp-server"
    keycloak = os.environ.get("ANET_KEYCLOAK_URL", "http://localhost:9080")
    realm = os.environ.get("ANET_KEYCLOAK_REALM", "ANET")
    containers = {"db": db, "keycloak": "anet-keycloak-server", "smtp": smtp}
    checks = {
        "db": lambda: subprocess.run(
            [
                "docker",
                "exec",
                db,
                "pg_isready",
                "-U",
                "anetTestUser" if test else "anetDevUser",
                "-d",
                "testAnet" if test else "devAnet",
            ],
            capture_output=True,
            timeout=2,
            check=False,
        ).returncode
        == 0,
        "keycloak": lambda: http_ready(
            f"{keycloak}/realms/{realm}/.well-known/openid-configuration"
        ),
        "smtp": lambda: http_ready(
            f"http://localhost:{os.environ.get('ANET_SMTP_HTTP_PORT', '1180' if test else '1080')}/api/v1/info"
        )
        and smtp_ready(
            int(os.environ.get("ANET_SMTP_PORT", "1125" if test else "1025"))
        ),
        "app": lambda: http_ready(
            os.environ.get(
                "SERVER_URL",
                "http://localhost:8180" if test else "http://localhost:8080",
            )
            + "/",
            accept="text/html",
        )
        and (
            not args.app_log
            or "Started AnetApplication in " in args.app_log.read_text()
        ),
    }
    deadline = time.monotonic() + args.timeout
    pending = set(args.services)
    last_errors = {}
    try:
        while pending and time.monotonic() < deadline:
            for name in args.services:
                if name in containers:
                    result = subprocess.run(
                        [
                            "docker",
                            "inspect",
                            "--format",
                            "{{json .State}}",
                            containers[name],
                        ],
                        capture_output=True,
                        text=True,
                        timeout=2,
                        check=True,
                    )
                    state = json.loads(result.stdout)
                    if not state["Running"]:
                        raise RuntimeError(
                            f"{containers[name]} stopped: {state['Status']} (exit {state['ExitCode']})"
                        )
            if args.app_pid:
                os.kill(args.app_pid, 0)
            for name in list(pending):
                try:
                    if checks[name]():
                        pending.remove(name)
                        print(f"Ready: {name}", flush=True)
                except (OSError, ValueError, subprocess.SubprocessError) as error:
                    last_errors[name] = str(error)
            if pending:
                time.sleep(min(0.5, max(0, deadline - time.monotonic())))
        if pending:
            raise TimeoutError(
                f"Readiness deadline exceeded for {sorted(pending)}: {last_errors}"
            )
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        for name in args.services:
            if name in containers:
                subprocess.run(
                    ["docker", "logs", "--tail", "80", containers[name]], check=False
                )
        if args.app_log and args.app_log.exists():
            print(
                "\n".join(args.app_log.read_text().splitlines()[-100:]), file=sys.stderr
            )
        return 1


if __name__ == "__main__":
    sys.exit(main())
