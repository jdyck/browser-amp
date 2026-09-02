# Six jazz amp models

Build six useful jazz voices. They should feel different because their gain staging, tone-stack placement, filtering, and headroom differ—not because they share one shaper with different final EQ presets.

These are inspired voicings, not claims of exact hardware emulation.

## Signal chain

```text
Input trim
→ Amp model
→ Cabinet
→ Noise suppression
→ Studio compression
→ Studio EQ
→ Reverb
→ Master
```

An amp model owns its input voicing, preamp stages, tone stack, phase-inverter contribution, and power-stage behavior. Cabinet and studio processing stay separate.

## Shared behavior

- Amp controls use `0–10` with `0.1` steps. The numbers are knob positions, not dB.
- Gain/Volume controls amp drive. Master controls listening level.
- Each amp remembers its own controls.
- Switching amps never changes Cabinet, effects, Master, input, or monitoring.
- Use short smoothing and a click-free crossfade when topology changes.
- Keep one amp graph alive at steady state; dispose the old graph after a switch.
- Hidden parameters include shaper drive/bias, filter frequency/Q, feedback, sag, and output trim.
- Selecting an amp does not automatically select its suggested cabinet.

## 1. Studio Clean

Neutral, fast, and very high headroom.

**Controls**

- Gain — `0–10`, default `5`
- Bass — `0–10`, default `5`; flat at midpoint
- Middle — `0–10`, default `5`; flat at midpoint
- Treble — `0–10`, default `5`; flat at midpoint
- Headroom — `High | Maximum`, default `Maximum`

**Build notes**

- Stay linear at normal input levels.
- Use active, neutral tone controls.
- Add no fixed scoop, tube asymmetry, or sag.
- Maximum Headroom should be the cleanest reference in the app.

## 2. Warm Jazz Combo

Warm, focused solid-state clean with firm bass and a controlled top end.

**Controls**

- Volume — `0–10`, default `4`
- Bass — `0–10`, default `5`; active boost/cut
- Middle — `0–10`, default `5`; active boost/cut
- Treble — `0–10`, default `5`; active boost/cut
- Color — `Dark | Normal | Bright`, default `Normal`
- Input — `Normal | Low`, default `Normal`

**Build notes**

- Use op-amp/solid-state-inspired gain stages, not a reused tube path.
- Put Color before the active tone controls.
- Use little or no sag and near-symmetric limiting at the extreme.
- Low Input reduces sensitivity and slightly darkens hot pickups.

## 3. Blackface Combo

Airy American clean with scooped mids, sparkling highs, and moderate headroom.

**Controls**

- Volume — `0–10`, default `4`
- Bass — `0–10`, default `4`
- Treble — `0–10`, default `5.5`
- Bright — `Off | On`, default `Off`

**Build notes**

- Use an interacting passive-style tone stack with insertion loss.
- Keep Middle fixed internally.
- Make Bright strongest at low Volume, not a fixed high shelf.
- Break up later than Small Tweed and earlier than High-Headroom American.

## 4. High-Headroom American

Broad, tight, restrained clean that stays clean at higher virtual volume.

**Controls**

- Volume — `0–10`, default `4`
- Bass — `0–10`, default `4`
- Middle — `0–10`, default `5`
- Treble — `0–10`, default `5.5`
- Bright — `Off | On`, default `Off`
- Headroom — `Normal | Ultra`, default `Ultra`

**Build notes**

- Use high thresholds, strong feedback, tight bass, and minimal sag.
- Ultra must change breakup and compression, not merely reduce output.
- This should be the latest-breaking tube-inspired model.

## 5. Small Tweed Combo

Warm, mid-forward, touch-sensitive, and first to reach edge-of-breakup.

**Controls**

- Volume — `0–10`, default `3.5`
- Tone — `0–10`, default `5`
- Input — `Normal | Low`, default `Normal`

**Build notes**

- Do not add generic Bass or Middle controls.
- Use at least two gentle nonlinear contributions instead of one hard clipper.
- Reduce bass before later nonlinear stages so driven chords remain clear.
- Static compression is enough for v1; do not claim dynamic sag unless it exists.

## 6. British Chime

Lean bass, prominent upper mids, bright detail, and lively edge.

**Controls**

- Volume — `0–10`, default `4`
- Bass — `0–10`, default `4`
- Treble — `0–10`, default `5`
- Cut — `0–10`, default `5`; higher means darker
- Channel — `Normal | Top Boost`, default `Normal`

**Build notes**

- Do not add a generic Middle control.
- Put Cut after the main preamp nonlinear contribution.
- Top Boost changes gain staging and tone behavior, not just level.
- Keep low-frequency drive leaner than the American models.

## IDs and state

```ts
type JazzAmpId =
  | 'amp.studio-clean-v1'
  | 'amp.warm-jazz-combo-v1'
  | 'amp.blackface-combo-v1'
  | 'amp.high-headroom-american-v1'
  | 'amp.small-tweed-combo-v1'
  | 'amp.british-chime-v1';
```

Use a separate typed state for each amp. Do not make one large object full of optional controls. Published IDs are stable; a deliberate sound change gets a new revision.

Reset selects Studio Clean and restores all six amps to their defaults. Existing `clean-voice` settings should migrate without changing sound. Decide whether the two current tube models remain as legacy choices or migrate with a disclosed sound change.

**Implemented migration:** `clean-voice` becomes Studio Clean and its Clean Gain is preserved exactly as Input Trim. The retired `clean-tube` and `clean-tube-warm` selections become Blackface Combo and Small Tweed Combo respectively; these two mappings are intentional sound changes, while all downstream studio controls and effects are preserved.

## Done when

- All six models expose only the controls listed above.
- They remain distinct in loudness-matched listening with amp and cabinet tested separately.
- Small Tweed breaks up first; High-Headroom Ultra breaks up last.
- Warm Jazz sounds solid-state rather than like a darker tube preset.
- Defaults are level-matched within about 1 dB and leave output headroom.
- Offline tests cover 44.1/48 kHz, control direction, finite output, DC, and increasing distortion with drive.
- Rapid switching does not click, reconnect input, reset other stages, or leak old graphs.
- If two models are hard to tell apart in blind listening, retune or remove one.

## Later

- Dynamic sag and bias shift
- Circuit- or measurement-derived named models
- Reactive amp/cab interaction
- `Reset This Amp`
- Explicit `Use recommended cabinet`

## Related notes

- [Cabinet models](jazz-cabinet-models-spec.md)
- [Amp-modeling research](research/filter-and-waveshaper-amp-modeling.md)
