"""Readiness failures must stop CI promptly and preserve useful diagnostics."""

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location(
    "readiness", Path(__file__).with_name("wait-for-test-services.py")
)
readiness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(readiness)


class ReadinessTest(unittest.TestCase):
    def invoke(self, arguments, command):
        output = io.StringIO()
        with patch("sys.argv", ["readiness", *arguments]), patch.object(
            readiness.subprocess, "run", side_effect=command
        ), contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            return readiness.main(), output.getvalue()

    def test_exited_container_fails_immediately_and_prints_logs(self):
        calls = []

        def command(args, **kwargs):
            calls.append(args)
            return subprocess.CompletedProcess(
                args,
                0,
                json.dumps({"Running": False, "Status": "exited", "ExitCode": 17}),
            )

        status, output = self.invoke(["db", "--timeout", "180"], command)
        self.assertEqual(status, 1)
        self.assertIn("exit 17", output)
        self.assertTrue(any(args[:2] == ["docker", "logs"] for args in calls))

    def test_timeout_has_one_shared_deadline_and_diagnostics(self):
        with patch.object(readiness.time, "monotonic", side_effect=[0, 181]):
            status, output = self.invoke(
                ["db", "keycloak", "smtp", "--timeout", "180"],
                lambda args, **kwargs: subprocess.CompletedProcess(args, 0, ""),
            )
        self.assertEqual(status, 1)
        self.assertIn("Readiness deadline exceeded", output)
        for service in ["db", "keycloak", "smtp"]:
            self.assertIn(service, output)

    def test_ready_means_database_realm_and_both_mailpit_ports(self):
        urls = []
        ports = []

        def command(args, **kwargs):
            state = json.dumps({"Running": True}) if args[1] == "inspect" else ""
            return subprocess.CompletedProcess(args, 0, state)

        with patch.object(
            readiness, "http_ready", side_effect=lambda url: urls.append(url) or True
        ), patch.object(
            readiness, "smtp_ready", side_effect=lambda port: ports.append(port) or True
        ):
            status, output = self.invoke(["db", "keycloak", "smtp"], command)
        self.assertEqual(status, 0)
        self.assertIn("Ready: db", output)
        self.assertTrue(
            any("/realms/ANET/.well-known/openid-configuration" in url for url in urls)
        )
        self.assertIn("http://localhost:1180/api/v1/info", urls)
        self.assertEqual(ports, [1125])

    def test_dead_application_process_fails_before_network_probe(self):
        with patch.object(
            readiness.os, "kill", side_effect=ProcessLookupError("Application exited")
        ), patch.object(readiness, "http_ready") as http:
            status, output = self.invoke(
                ["app", "--app-pid", "123"], lambda args, **kwargs: None
            )
        self.assertEqual(status, 1)
        self.assertIn("Application exited", output)
        http.assert_not_called()


if __name__ == "__main__":
    unittest.main()
