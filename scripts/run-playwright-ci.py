#!/usr/bin/env python3
"""Reproduce an isolated CI browser shard, including fresh databases per phase."""

import argparse
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import sys
import time

from playwright_node import node_executable

ROOT = Path(__file__).resolve().parent.parent


def run(command, cwd_override=ROOT, **kwargs):
    subprocess.run(command, cwd=cwd_override, check=True, **kwargs)


def terminate(signum, _frame):
    raise SystemExit(128 + signum)


def main():
    signal.signal(signal.SIGTERM, terminate)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("suite", choices=["playwright", "playwright-noCF", "e2e"])
    parser.add_argument("--shard", choices=["1/2", "2/2"], default="1/2")
    parser.add_argument(
        "--phase", choices=["all", "contracts", "scenarios"], default="all"
    )
    parser.add_argument(
        "--prepared",
        action="store_true",
        help="Services, client build and Chromium are already installed (CI).",
    )
    parser.add_argument("--workers", type=int)
    args = parser.parse_args()
    if args.phase == "contracts" and (args.shard != "1/2" or args.suite == "e2e"):
        parser.error("Seed contracts run only on regression shard 1/2")
    with socket.socket() as connection:
        if connection.connect_ex(("localhost", 8180)) == 0:
            parser.error(
                "Port 8180 is in use; stop the test server before resetting its database"
            )
    environment = dict(
        os.environ,
        ANET_DB_SERVER="localhost",
        ANET_DB_NAME="testAnet",
        ANET_DB_USERNAME="anetTestUser",
        ANET_DB_PASSWORD="Test-P@ssw0rd",
        ANET_DB_EXPOSED_PORT="5433",
        ANET_PORT="8180",
        ANET_ADMIN_PORT="8181",
        ANET_DB_DROP="true",
        SPRING_PROFILES_ACTIVE="test",
        SERVER_URL="http://localhost:8180",
    )
    dictionary = (
        "testDictionaries/no-custom-fields.yml"
        if args.suite == "playwright-noCF"
        else "anet-dictionary.yml"
    )
    environment.update(
        ANET_DICTIONARY_NAME=dictionary,
        NODE_ENV="test",
        ANET_DICTIONARY=f"../{dictionary}",
        PLAYWRIGHT_SHARD=args.shard,
    )
    environment.pop("TEST_PLAYWRIGHT_SUITE", None)
    if args.suite == "playwright-noCF":
        environment["TEST_PLAYWRIGHT_SUITE"] = "noCustomFields"
    if args.workers:
        environment["PLAYWRIGHT_WORKERS"] = str(args.workers)
    if not args.prepared:
        for container, tasks in [
            ("anet-psql-test-server", ["dockerCreateDB", "dockerStartDB"]),
            (
                "anet-keycloak-server",
                ["dockerConfigureKeycloak", "dockerStartKeycloak"],
            ),
            (
                "anet-fake-smtp-test-server",
                ["dockerCreateFakeSmtpServer", "dockerStartFakeSmtpServer"],
            ),
        ]:
            if (
                subprocess.run(
                    ["docker", "inspect", container], capture_output=True, check=False
                ).returncode
                == 0
            ):
                run(["docker", "start", container])
            else:
                run(["./gradlew", "-PtestEnv", *tasks])
        run(["./gradlew", "-PtestEnv", "buildClient"])
        run(
            [
                "./gradlew",
                (
                    "yarn_run_install-playwright"
                    if sys.platform.startswith("linux")
                    else "yarn_run_install-playwright-browser"
                ),
            ]
        )
    run(
        [sys.executable, "scripts/wait-for-test-services.py", "db", "keycloak", "smtp"],
        env=environment,
    )
    node_binary = node_executable()
    phases = ["scenarios"]
    if args.suite != "e2e" and args.shard == "1/2":
        phases.insert(0, "contracts")
    if args.phase != "all":
        phases = [args.phase]
    output = (
        ROOT / "client/build/local-ci" / args.suite / args.shard.replace("/", "-of-")
    )
    output.mkdir(parents=True, exist_ok=True)
    timings = []
    try:
        for phase in phases:
            environment["PLAYWRIGHT_PHASE"] = phase
            log_path = output / f"{phase}-server.log"
            with log_path.open("w") as log:
                server = subprocess.Popen(
                    ["./gradlew", "-PtestEnv", "run", "-x", "buildClient"],
                    cwd=ROOT,
                    env=environment,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    start_new_session=True,
                )
                try:
                    run(
                        [
                            sys.executable,
                            "scripts/wait-for-test-services.py",
                            "db",
                            "keycloak",
                            "smtp",
                            "app",
                            "--app-pid",
                            str(server.pid),
                            "--app-log",
                            str(log_path),
                        ],
                        env=environment,
                    )
                    config = (
                        "playwright-e2e.config.js"
                        if args.suite == "e2e"
                        else "playwright.config.js"
                    )
                    command = [
                        node_binary,
                        "node_modules/@playwright/test/cli.js",
                        "test",
                        "--config",
                        f"config/{config}",
                    ]
                    if phase == "scenarios":
                        command.append(f"--shard={args.shard}")
                    started = time.monotonic()
                    if args.suite == "e2e" and args.shard == "2/2":
                        run(
                            [
                                node_binary,
                                "node_modules/@playwright/test/cli.js",
                                "test",
                                "--config",
                                "config/playwright-support.config.js",
                            ],
                            cwd_override=ROOT / "client",
                            env=environment,
                        )
                    result = subprocess.run(
                        command, cwd=ROOT / "client", env=environment, check=False
                    )
                    timings.append(
                        dict(
                            phase=phase,
                            seconds=round(time.monotonic() - started, 2),
                            exit_code=result.returncode,
                        )
                    )
                    if result.returncode:
                        return result.returncode
                finally:
                    # Gradle's daemon can launch Java outside the wrapper's process
                    # group. Stop the PID from this invocation's own startup log.
                    started_app = re.search(
                        r"Starting AnetApplication .*? with PID (\d+)",
                        log_path.read_text(),
                    )
                    if started_app:
                        try:
                            os.kill(int(started_app.group(1)), signal.SIGTERM)
                        except ProcessLookupError:
                            pass
                    if server.poll() is None:
                        os.killpg(server.pid, signal.SIGTERM)
                        try:
                            server.wait(timeout=30)
                        except subprocess.TimeoutExpired:
                            os.killpg(server.pid, signal.SIGKILL)
                            server.wait()
                    # Do not drop the next database until the previous app exits.
                    deadline = time.monotonic() + 30
                    while time.monotonic() < deadline:
                        with socket.socket() as connection:
                            if connection.connect_ex(("localhost", 8180)) != 0:
                                break
                        time.sleep(0.5)
                    else:
                        raise RuntimeError("The test server did not release port 8180")
        return 0
    finally:
        (output / "timings.json").write_text(json.dumps(timings, indent=2) + "\n")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (subprocess.CalledProcessError, RuntimeError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
