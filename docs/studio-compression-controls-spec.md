# Studio compression controls

Make Studio Compression easier to judge without turning it into a full compressor editor.

## Problem

The current Amount control makes compression firmer by lowering threshold and raising ratio, but compression can also make the signal quieter. That makes bypass comparisons misleading: players may prefer the louder sound instead of the better dynamic response.

## Controls

Expose only:

- **Enable Compression** — bypasses the entire stage.
- **Amount** — `0–100%`, default `25%`; preserves the current threshold-and-ratio mapping.
- **Level Match** — `On | Off`, default `On`; applies post-compressor gain so enabled/bypassed comparisons stay perceptually close.

Show a compact **Reduction** meter beside Amount. It is feedback, not another setting.

Do not add an advanced accordion.

## Behavior

- Level Match uses a stable, capped gain derived from Amount. It must not chase the live signal or introduce pumping.
- At Amount `0%`, Level Match applies `0 dB` gain.
- Bypass removes both compression and its level-matching gain from the audible path.
- Amount and Level Match remain saved while Compression is bypassed.
- The Reduction meter reads `0 dB` while bypassed and shows current compressor gain reduction while active.
- Reset restores Compression to bypassed, Amount to `25%`, and Level Match to `On`.

## Not included

- Threshold, ratio, knee, attack, or release controls
- Manual output or makeup gain
- Dry/wet mix
- Compression presets or modes
- A limiter or clipping protection

Dry/wet mix is specifically excluded because the current compressor adds 6 ms of lookahead; blending it with the direct path would require latency alignment.

## Done when

- All three controls are keyboard accessible, numerically deterministic, saved, restored, and reset correctly.
- Level Match gain changes use the existing audio-parameter smoothing and do not click.
- Across the project’s representative guitar fixtures, enabling compression at `25%`, `50%`, and `100%` with Level Match on stays within `1.5 dB` integrated loudness of bypass.
- The Reduction meter updates while monitoring without affecting audio processing.
- Existing bypass behavior, click protection, and the compressor’s 6 ms active-path latency remain unchanged.

## Later, only with evidence

If players consistently ask to shape pick attack or recovery, test one musical **Feel** control before exposing separate Attack and Release parameters.
