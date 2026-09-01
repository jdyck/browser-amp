# Speaker dynamics — optional later layer

Add subtle speaker-style compression and distortion on top of the [filter-based cabinet voicings](jazz-cabinet-models-spec.md).

Do not build this unless A/B listening shows a worthwhile improvement.

## Signal chain

```text
Amp model
→ Speaker dynamics
→ Cabinet filters
→ Noise suppression
→ Studio compression
→ Studio EQ
→ Reverb
→ Master
```

Direct / Full Range bypasses both Speaker Dynamics and Cabinet Filters.

## What this adds

- **Cone nonlinearity** — subtle harmonics that increase with level.
- **Speaker compression** — small level-dependent reduction when pushed.
- **Bass damping** — stronger low notes soften more than mids.
- **Dynamic high softening** — hard playing becomes slightly less bright.

This is not another general-purpose compressor or distortion effect. It should feel like part of the selected cabinet and remain subtle.

## Controls

No normal player controls.

During development, expose one temporary A/B switch:

- Speaker Dynamics — `Off | On`

Remove or hide the switch after tuning unless it proves useful as a product control.

## Cabinet behavior

| Cabinet | Dynamic character |
|---|---|
| Compact 1×12 Jazz | Earliest compression, warmer harmonics, more bass softening |
| American 1×12 Open-Back | Moderate compression and open upper mids |
| American 2×12 Open-Back | Least compression and greatest clean headroom |
| 4×10 Open-Back | Tight bass, fast recovery, restrained compression |
| Direct / Full Range | Full bypass |

## Implementation rules

- Use a causal, no-lookahead design.
- Do not use `DynamicsCompressorNode`; it adds a fixed 6 ms lookahead delay.
- Prefer one small `AudioWorklet` that owns its envelope and nonlinear state.
- Avoid internal FFTs, long buffers, and block lookahead.
- Keep frequency-dependent compression modest so it does not replace Studio Compression.
- Keep added harmonics below the amp's intentional breakup character.
- Smooth state changes and clear all history on disposal.
- Measure any latency introduced by oversampling or resampling.

## Low-level behavior

- At quiet levels, Speaker Dynamics should approach a linear unity path.
- As level rises, compression and harmonics increase gradually.
- Hard notes may pass a natural initial transient; the processor must not delay the whole signal to catch it.
- Hidden output trim may loudness-match On/Off comparisons, but it must not erase the dynamic difference.

## State

Dynamic parameters belong to the cabinet definition, not global effect settings. Examples include:

- compression threshold and amount
- attack/recovery timing
- low-frequency sensitivity
- high-frequency softening
- nonlinear curve and drive
- output trim

Do not expose these as amp-designer controls.

## Done when

- Off is a unity path and adds no processor latency.
- On adds no fixed lookahead delay.
- Compression and harmonics rise smoothly with input level.
- The four cabinets follow the dynamic ordering in the table above.
- Speaker Dynamics remains subtler than Amp breakup and Studio Compression.
- Offline tests cover latency, level sweeps, harmonics, recovery, finite output, DC, and 44.1/48 kHz.
- Rapid cabinet switching clears old dynamic state and does not click or leak worklets.
- Loudness-matched blind A/B listening shows a repeatable benefit. If it does not, shelve this feature.

## Not included

- Full physical speaker simulation
- Voice-coil temperature modeling
- Cone excursion geometry
- Detailed impedance/reactive-load feedback into the power amp
- User-facing compression or distortion controls

## Related notes

- [Filter-based cabinet voicings](jazz-cabinet-models-spec.md)
- [Audio path](audio-path-spec.md)
- [Latency research](research/realtime-effect-latency.md)

