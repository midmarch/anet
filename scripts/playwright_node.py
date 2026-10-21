#!/usr/bin/env python3
"""Resolve Gradle's Node toolchain and optionally run the Playwright CLI."""

from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent


def node_executable():
    output = subprocess.check_output(
        [str(ROOT / "gradlew"), "-q", "printPlaywrightNode"], cwd=ROOT, text=True
    )
    paths = [
        line.removeprefix("PLAYWRIGHT_NODE=")
        for line in output.splitlines()
        if line.startswith("PLAYWRIGHT_NODE=")
    ]
    if len(paths) != 1 or not Path(paths[0]).is_file():
        raise RuntimeError("Gradle did not provide its configured Node executable")
    return paths[0]


if __name__ == "__main__":
    try:
        sys.exit(
            subprocess.call(
                [
                    node_executable(),
                    str(ROOT / "client/node_modules/@playwright/test/cli.js"),
                    *sys.argv[1:],
                ],
                cwd=ROOT / "client",
            )
        )
    except (OSError, subprocess.CalledProcessError, RuntimeError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
