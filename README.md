# Browser Amp

Browser Amp is a static web app for shaping and monitoring a live guitar input.

The canonical release is <https://jdyck.github.io/browser-amp/>. Current Google Chrome on macOS is supported.

## Signal chain

```text
Input Trim → Amp Model → Cabinet → Noise Suppression
→ Studio Compression → Studio EQ → Reverb → Master
```

- Six original, jazz-oriented [amp models](docs/jazz-amp-models-spec.md)
- Four filtered [cabinet voicings](docs/jazz-cabinet-models-spec.md), plus Direct / Full Range
- Configurable downward-expansion [noise suppression](docs/audio-path-spec.md#5-noise-suppression)
- Level-matched [studio compression](docs/studio-compression-controls-spec.md) with reduction metering
- Bypassable Studio EQ and seven saved [reverb modules](docs/reverb-modules.md)

Controls persist locally. Input connections, device choices, and monitoring state do not. Amp, cabinet, and reverb changes use click-resistant [stage switching](docs/audio-stage-switching.md).

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

`test:browser` covers the local UI and offline audio behavior. `test:production` repeats the UI suite against the built app. CI runs `test:deployed` against the live HTTPS release.

See [RELEASE_NOTES.md](RELEASE_NOTES.md) for supported scope and [docs/release-validation.md](docs/release-validation.md) for the Chrome macOS production and hardware sign-off record.
