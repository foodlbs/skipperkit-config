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

## License

[Apache License 2.0](https://github.com/foodlbs/skipperkit/blob/main/LICENSE),
same as SkipperKit.
