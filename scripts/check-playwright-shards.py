#!/usr/bin/env python3
"""Check that seed contracts plus both shards cover every browser case once."""

import argparse
import json
import os
from pathlib import Path
import subprocess

from playwright_node import node_executable

ROOT = Path(__file__).resolve().parent.parent


def discover(client, suite, phase=None, shard=None, node_binary="node"):
    dictionary = (
        "testDictionaries/no-custom-fields.yml"
        if suite == "playwright-noCF"
        else "anet-dictionary.yml"
    )
    environment = dict(os.environ, NODE_ENV="test", ANET_DICTIONARY=f"../{dictionary}")
    for name in ["PLAYWRIGHT_PHASE", "PLAYWRIGHT_SHARD", "TEST_PLAYWRIGHT_SUITE"]:
        environment.pop(name, None)
    if suite == "playwright-noCF":
        environment["TEST_PLAYWRIGHT_SUITE"] = "noCustomFields"
    if phase:
        environment["PLAYWRIGHT_PHASE"] = phase
    config = "playwright-e2e.config.js" if suite == "e2e" else "playwright.config.js"
    command = [
        node_binary,
        "node_modules/@playwright/test/cli.js",
        "test",
        "--config",
        f"config/{config}",
        "--list",
        "--reporter=json",
    ]
    if shard:
        command.append(f"--shard={shard}")
    result = subprocess.run(
        command, cwd=client, env=environment, capture_output=True, text=True, check=True
    )
    report = json.loads(result.stdout[result.stdout.index("{") :])
    if report.get("errors"):
        raise RuntimeError(report["errors"])
    cases = []

    def visit(suite, parents):
        titles = parents + [suite["title"]]
        for spec in suite.get("specs", []):
            cases.append(" > ".join(titles + [spec["title"]]))
        for child in suite.get("suites", []):
            visit(child, titles)

    for item in report["suites"]:
        visit(item, [])
    if len(cases) != len(set(cases)):
        raise RuntimeError(
            "Duplicate test titles prevent a reliable coverage inventory"
        )
    return set(cases)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--baseline",
        type=Path,
        help="Optional checkout of improve-playwright-tests for unchanged regression coverage comparison",
    )
    args = parser.parse_args()
    inventory = {}
    node_binary = node_executable()
    for suite in ["playwright", "playwright-noCF", "e2e"]:
        all_cases = discover(ROOT / "client", suite, node_binary=node_binary)
        contracts = (
            discover(ROOT / "client", suite, "contracts", node_binary=node_binary)
            if suite != "e2e"
            else set()
        )
        first = discover(ROOT / "client", suite, "scenarios", "1/2", node_binary)
        second = discover(ROOT / "client", suite, "scenarios", "2/2", node_binary)
        if contracts & first or contracts & second or first & second:
            raise RuntimeError(f"Overlapping phase/shard cases: {suite}")
        if contracts | first | second != all_cases:
            raise RuntimeError(f"Missing or extra phase/shard cases: {suite}")
        if suite != "e2e" and {case.split(" > ")[0] for case in first} & {
            case.split(" > ")[0] for case in second
        }:
            raise RuntimeError(
                f"A dependent regression file is split across shards: {suite}"
            )
        if suite == "e2e":
            report_cases = {
                case for case in all_cases if case.startswith("approval.spec.js > ")
            }
            if report_cases & first and report_cases & second:
                raise RuntimeError(
                    "The serial report approval workflow is split across shards"
                )
        if args.baseline and suite != "e2e":
            baseline = discover(
                args.baseline / "client", suite, node_binary=node_binary
            )
            if baseline != all_cases:
                raise RuntimeError(
                    f"Regression coverage changed: removed {baseline - all_cases}; added {all_cases - baseline}"
                )
        inventory[suite] = {
            "contracts": sorted(contracts),
            "shard-1": sorted(first),
            "shard-2": sorted(second),
        }
        print(
            f"{suite}: {len(all_cases)} cases = {len(contracts)} contracts + {len(first)} shard 1 + {len(second)} shard 2",
            flush=True,
        )
    output = ROOT / "client/build/throughput"
    output.mkdir(parents=True, exist_ok=True)
    (output / "coverage.json").write_text(json.dumps(inventory, indent=2) + "\n")


if __name__ == "__main__":
    main()
