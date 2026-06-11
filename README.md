# SkipperKit remote config

This repository hosts the remote button-configuration for
[SkipperKit](https://github.com/foodlbs/skipperkit), the Android accessibility
assistant that taps **Skip Intro / Skip Recap / Next Episode** buttons for you.

The app bundles the same defaults at build time; this file exists so identifiers
can be fixed **without an app release** when a streaming app changes its UI. On
startup SkipperKit applies its cached copy, then fetches
[`config.json`](config.json) over HTTPS (8 s timeout, 512 KB cap). Any failure
falls back cached → bundled.

## Trust model

The config can only change **which nodes get tapped inside the apps SkipperKit is
already scoped to** — it cannot widen the accessibility scope, add packages, or
exfiltrate anything. Changes land via reviewed pull requests only.

## Contributing

Found a broken or missing identifier? PRs welcome — see the schema in the
[SkipperKit README](https://github.com/foodlbs/skipperkit#configuration-data-driven--remote)
and capture identifiers with the app's debug Node Inspector. Please include the
app version and a snippet of the Logcat dump that shows the node.

Most submissions arrive automatically: the app's one-tap contribution flow posts
button data to a small ingestion service, which validates, deduplicates, and opens
a PR here (one per package, with report counts). Schema CI runs on every PR;
nothing is published without a human merge.

Since payload v2 the flow also carries **custom taught buttons** (arbitrary
buttons users teach the app to tap, e.g. "Skip Ad"). Two policies apply:

- The ingestion service rejects custom buttons whose name, label, or view-id
  looks payment-, destruction-, or consent-shaped (`pay`, `buy`, `delete`,
  `accept`, `agree`, `continue`, …). The filter is deliberately over-broad: a
  legitimately named button it blocks (say "Continue watching") can still be
  proposed as a manual PR here, where a human can judge the context.
- Custom buttons land in PRs with `"enabled": false`. Enabling one — making
  every install auto-tap it — is an editorial decision the maintainer takes
  during review by flipping the flag.

## Repo layout

- [`config.json`](config.json) — the served configuration; validated on every PR.
- [`supabase/functions/submit-config/`](supabase/functions/submit-config/) — the
  ingestion edge function (validate, dedupe, open PR) with Deno tests.
- [`supabase/migrations/`](supabase/migrations/) — reference copy of the database
  schema deployed to the project; migrations were applied via the Supabase
  management API and recorded here so the schema is reviewable.
- [`scripts/validate_config.py`](scripts/validate_config.py) — the schema CI
  used by `.github/workflows/validate.yml`. Mirrors what the app's
  `RemoteConfigParser` will accept.
- [`.github/workflows/keep-alive.yml`](.github/workflows/keep-alive.yml) — pings
  the Supabase project twice a week so the free tier doesn't auto-pause it.

## License

[Apache License 2.0](https://github.com/foodlbs/skipperkit/blob/main/LICENSE),
same as SkipperKit.
