# Browser Amp

Browser Amp is a static Clean Amp Workbench for connecting a Live Guitar Input, shaping a fixed clean Amp Chain, and explicitly enabling Processed Monitoring.

The canonical release is <https://jdyck.github.io/browser-amp/>. Current Google Chrome on macOS is the supported first-release target; iPhone browsers remain experimental.

## Development

```sh
npm ci
npm run dev
```

## Verification

```sh
npm run typecheck
npm test
npm run test:browser
npm run test:production
```

`test:browser` exercises the localhost UI and OfflineAudioContext behavior. `test:production` builds the app and reruns the UI smoke suite from `/browser-amp/`, including generated-asset path checks. After Pages deploys, CI runs the same suite against the live HTTPS deployment with `PLAYWRIGHT_BASE_URL` and `npm run test:deployed`.

See [RELEASE_NOTES.md](RELEASE_NOTES.md) for supported scope and [docs/release-validation.md](docs/release-validation.md) for the Chrome macOS production and hardware sign-off record.
