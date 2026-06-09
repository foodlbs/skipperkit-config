#!/usr/bin/env python3
"""Schema check for config.json. Exit 0 = valid, 1 = invalid (reasons on stderr)."""
import json
import re
import sys

PACKAGE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$")
LIST_FIELDS = [
    "skipIntroViewIds", "skipIntroLabels", "skipRecapViewIds", "skipRecapLabels",
    "nextEpisodeViewIds", "nextEpisodeLabels", "skipIntroLabelPrefixes",
    "skipRecapLabelPrefixes", "nextEpisodeLabelPrefixes",
]

def fail(msg: str) -> None:
    print(f"INVALID: {msg}", file=sys.stderr)
    sys.exit(1)

def main() -> None:
    with open("config.json") as f:
        config = json.load(f)
    if config.get("version") != 1:
        fail("version must be 1")
    apps = config.get("apps")
    if not isinstance(apps, list) or not apps:
        fail("apps must be a non-empty array")
    seen: set[str] = set()
    for app in apps:
        pkg = app.get("packageName", "")
        if not PACKAGE_RE.match(pkg):
            fail(f"bad packageName: {pkg!r}")
        if pkg in seen:
            fail(f"duplicate packageName: {pkg}")
        seen.add(pkg)
        for field in LIST_FIELDS:
            value = app.get(field, [])
            if not isinstance(value, list) or any(
                not isinstance(s, str) or not s.strip() or len(s) > 256 for s in value
            ):
                fail(f"{pkg}: {field} must be a list of non-empty strings ≤256 chars")
        for field in ("enabled", "autoNextEnabled"):
            if not isinstance(app.get(field, False), bool):
                fail(f"{pkg}: {field} must be a boolean")
    print(f"OK: {len(apps)} apps")

if __name__ == "__main__":
    main()
