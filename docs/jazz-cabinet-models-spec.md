# Filter-based cabinet voicings

Build four simple cabinet characters from biquad filters, plus a Direct path. This is the shippable version.

The goal is useful tonal variety, not exact speaker or microphone emulation.

## Signal chain

```text
Amp model
→ Cabinet voicing
→ Noise suppression
→ Studio compression
→ Studio EQ
→ Reverb
→ Master
```

## Controls

One selector:

- Compact 1×12 Jazz — default
- American 1×12 Open-Back
- American 2×12 Open-Back
- 4×10 Open-Back
- Direct / Full Range

No mic, position, blend, level, or extra EQ controls.

## Filter shape

Each processed voicing may use:

```text
High-pass
→ low resonance
→ 2–4 broad peaks or dips
→ high-frequency rolloff
→ hidden level trim
```

- Use `BiquadFilterNode` sections only.
- Keep filters causal; no FIR, IR, convolution, or lookahead.
- Smooth parameter changes and crossfade when replacing a full recipe.
- Tune by ear, then save the response as a test fingerprint.

## 1. Compact 1×12 Jazz

Warm, focused, and controlled on top.

- Present lower mids without becoming muddy.
- Smooth the highs while keeping pick and chord detail.
- Use a compact low resonance with little open-back bloom.
- Best first pairing for Warm Jazz Combo.

## 2. American 1×12 Open-Back

Airy, moderately bright, and controlled in the bass.

- More open upper mids than Compact 1×12.
- Less contained bass than Compact without becoming loose.
- Do not make it the Compact recipe with a treble boost.
- Best first pairing for Blackface Combo.

## 3. American 2×12 Open-Back

Broad and authoritative.

- Add low-mid breadth without losing chord definition.
- Use a different resonance pattern from American 1×12, not just more bass.
- Keep the top smooth enough for clean jazz tones.
- Best first pairing for High-Headroom American.

## 4. 4×10 Open-Back

Fast, punchy, and articulate.

- Use the tightest low-frequency resonance of the four.
- Preserve bass energy; do not fake speed by cutting all lows.
- Keep low notes and dense chords separated.

## 5. Direct / Full Range

- Use a unity-gain pass-through.
- Create no cabinet filters.
- Add no hidden trim, widening, or latency.
- Warn that driven amps may sound unusually bright without speaker voicing.

## Suggested pairings

These are hints only. Changing amps never changes cabinets.

| Amp | Cabinet |
|---|---|
| Studio Clean | Direct or Compact 1×12 Jazz |
| Warm Jazz Combo | Compact 1×12 Jazz |
| Blackface Combo | American 1×12 Open-Back |
| High-Headroom American | American 2×12 Open-Back |
| Small Tweed Combo | American 1×12 Open-Back |
| British Chime | 4×10 Open-Back |

The last two are useful pairings, not historical matches.

## IDs and state

```ts
type JazzCabinetId =
  | 'cab.compact-jazz-1x12-v1'
  | 'cab.american-open-1x12-v1'
  | 'cab.american-open-2x12-v1'
  | 'cab.open-4x10-v1'
  | 'cab.direct-full-range-v1';
```

Persist only the selected ID. Reset and unknown local IDs return to Compact 1×12 Jazz.

## Switching

- Prepare a new filter graph disconnected.
- Crossfade briefly, then dispose the old graph.
- Keep one cabinet graph at steady state and at most two during a switch.
- A failed switch leaves the old cabinet selected and audible.
- Never change Amp, effects, Master, input, or monitoring.

## Done when

- Direct nulls against a plain slot connection.
- The four processed voicings are clearly different in loudness-matched listening.
- Compact is warm/focused, American 1×12 is more open, American 2×12 is broader, and 4×10 has the tightest bass.
- Defaults are matched within about 1 dB and leave output headroom.
- Offline tests cover response shape, finite output, control smoothing, switching, and 44.1/48 kHz.
- If two voicings sound redundant, retune or remove one.

## Later

- Add speaker dynamics only if listening tests justify the added complexity.
- Tweed 1×12 and British 2×12 voicings
- Explicit `Use recommended cabinet`

## Related notes

- [Jazz amp models](jazz-amp-models-spec.md)
- [Audio path](audio-path-spec.md)
