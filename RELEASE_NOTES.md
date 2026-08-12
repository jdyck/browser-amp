# Browser Amp 0.1.0

Browser Amp 0.1.0 is the first release of the Clean Amp Workbench.

## Supported platform

- Current Google Chrome on macOS is the supported first-release browser and operating system.
- Chrome and Safari on iPhone remain experimental and are not part of first-release support.
- Noise Gate is outside the first-release scope and is not included.

## Included

- Explicit Live Guitar Input connection with silent metering before Processed Monitoring is enabled.
- Fixed Amp Chain: Clean Gain, Three-Band EQ, Compression, Reverb, and Master Volume.
- Exact numeric entry, keyboard-accessible controls, Compression and Reverb Stage Bypass, Saved Control Settings, and Reset Controls.
- Input and output meters, latched CLIP indication, explicit device-loss recovery, and capability-driven output routing.
- Static HTTPS deployment at <https://jdyck.github.io/browser-amp/>.

## First-release behavior

- Every page load starts disconnected and muted, even when Saved Control Settings exist.
- Hardware Direct Monitoring should be disabled before enabling Processed Monitoring.
- Reverb Stage Bypass intentionally chops the current tail with a short transition.
- Browser and interface latency varies. The release does not promise a universal round-trip latency threshold.

Hardware evidence and the production sign-off procedure are recorded in [the release validation log](docs/release-validation.md).
