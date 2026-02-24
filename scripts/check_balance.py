#!/usr/bin/env python3
"""Utility script to query the CashBlocks wallet balance endpoint.

Usage:
    python scripts/check_balance.py bchtest:... [--server http://localhost:3001]

The script sends a GET request to the backend's `/api/wallet/balance` route,
parses the JSON response, and prints a friendly summary. Start the Express
server (`npm run dev` or `npx tsx server/index.ts`) before running this helper.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict


def fetch_balance(server: str, address: str) -> Dict[str, Any]:
    """Call the wallet balance endpoint and return the parsed JSON."""
    query = urllib.parse.urlencode({"address": address})
    url = f"{server.rstrip('/')}/api/wallet/balance?{query}"

    try:
        with urllib.request.urlopen(url, timeout=20) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload)
    except urllib.error.HTTPError as exc:  # structured API error
        try:
            payload = exc.read().decode("utf-8")
            data = json.loads(payload)
        except Exception:  # noqa: BLE001 - fall back to raw error message
            data = {"error": exc.reason}
        raise RuntimeError(f"API error ({exc.code}): {data.get('error', data)}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Failed to reach {url}: {exc.reason}") from exc


def main() -> None:
    parser = argparse.ArgumentParser(description="Query CashBlocks wallet balance")
    parser.add_argument(
        "address",
        help="CashAddress to query (e.g., bchtest:...)",
    )
    parser.add_argument(
        "--server",
        default="http://localhost:3001",
        help="Base URL of the CashBlocks backend (default: %(default)s)",
    )
    args = parser.parse_args()

    try:
        data = fetch_balance(args.server, args.address)
    except RuntimeError as err:
        print(f"Error: {err}", file=sys.stderr)
        sys.exit(1)

    confirmed = data.get("confirmed", "0")
    unconfirmed = data.get("unconfirmed", "0")
    utxos = data.get("utxos", 0)

    print("Address:", args.address)
    print("Server:", args.server)
    print("Confirmed sats:", confirmed)
    print("Unconfirmed sats:", unconfirmed)
    print("UTXO count:", utxos)


if __name__ == "__main__":
    main()
