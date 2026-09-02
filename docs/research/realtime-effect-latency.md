# Real-time latency of the amp, EQ, compression, reverb, delay, and chorus

Date: 2026-08-11

## Short answer

The current low latency is credible, especially with the default settings. Compression and Reverb default to bypassed, the three EQ bands default to 0 dB, and the monitored path is therefore gain plus an effectively identity biquad cascade and direct gain paths; there is no intentional effect delay in that default path ([control defaults](../../src/signalChain/settings.ts), [current audio graph](../../src/audio/AudioEngine.ts#L204-L273)). Web Audio also gives a no-options `AudioContext` the default `"interactive"` latency category, defined as the lowest output latency possible without glitching ([Web Audio `latencyHint`](https://webaudio.github.io/web-audio-api/#dom-audiocontextoptions-latencyhint)).

The important exception is **Compression**. Web Audio normatively defines `DynamicsCompressorNode` with a fixed 6 ms lookahead delay, independent of its attack and release settings. Enabling this project's compressor therefore adds 6 ms to the monitored main path ([Web Audio compressor processing](https://webaudio.github.io/web-audio-api/#DynamicsCompressorNode), [project compressor routing](../../src/audio/AudioEngine.ts#L233-L264)).

The current **Reverb** does not delay the dry attack. Its 12 ms of leading silence is pre-delay in only the parallel wet impulse response; a unity dry branch goes straight to Master while the convolver output is added separately. The 1.5-second impulse length is tail duration, not 1.5 seconds of input latency ([generated impulse](../../src/audio/reverb.ts), [dry/wet routing](../../src/audio/AudioEngine.ts#L241-L269), [Web Audio convolution semantics](https://webaudio.github.io/web-audio-api/#ConvolverNode)). A future delay or chorus should use this same always-direct dry/send-return topology: then echo/modulation time is effect character, not monitoring latency.

## Keep signal delay, wet timing, filter phase, and capacity separate

| Meaning | Examples | What the player experiences |
|---|---|---|
| Whole-path algorithmic delay | Compressor lookahead; an FFT/FIR block; oversampling filters | The monitored attack itself arrives later. Delays in serial stages accumulate. |
| Intentional wet timing | Reverb pre-delay; delay repeats; the modulated delay line in chorus | The dry attack need not move at all if it has a direct parallel route. Only the effect arrives later. |
| Filter phase/group delay | Biquad or other IIR tone-stack/EQ; a cabinet impulse response | Different frequency components shift by different amounts. This is not necessarily a silent gap before the attack or a single whole-signal delay. |
| Real-time capacity/buffering | Input capture buffer, render/output buffers, a processor missing its deadline | More DSP normally raises CPU load rather than smoothly adding latency. If rendering takes longer than the available callback interval, Web Audio defines that as an underrun; glitches can result ([Web Audio rendering load](https://webaudio.github.io/web-audio-api/#rendering-an-audio-graph), [audio glitching](https://webaudio.github.io/web-audio-api/#audio-glitching)). A browser/device may use larger buffers to gain stability, which does raise system latency. |

The Web Audio specification explicitly says end-to-end latency is cumulative across input device latency, internal buffering, DSP, output device latency, and even acoustic distance. It lists `BiquadFilterNode`, `IIRFilterNode`, `ConvolverNode`, `DynamicsCompressorNode`, oversampled `WaveShaperNode`, media-stream sources, and internally buffering worklets as possible graph-delay sources ([Web Audio latency considerations](https://webaudio.github.io/web-audio-api/#latency)).

## Current implementation, stage by stage

### Gain and the three-band EQ

`GainNode` has no delay mechanism; it multiplies each input sample by the computed gain ([Web Audio gain processing](https://webaudio.github.io/web-audio-api/#dom-gainnode-gain)). The current Bass, Middle, and Treble stages are serial low-shelf, peaking, and high-shelf `BiquadFilterNode`s at 120 Hz, 800 Hz/Q 0.8, and 3.2 kHz ([current graph](../../src/audio/AudioEngine.ts#L209-L232)).

A Web Audio biquad is a second-order causal recurrence whose current output includes the current input sample, so it does not require a lookahead or an FFT block before producing output. At 0 dB, substituting `A = 1` into the specified shelf and peaking coefficient formulae makes numerator and denominator equal, so each of this project's default EQ sections is an identity transfer ([normative biquad transfer function and coefficients](https://webaudio.github.io/web-audio-api/#filters-characteristics)). At non-zero gain the first output still occurs in the same sample frame, but the filter has frequency-dependent phase/group delay. Web Audio calls that delay a natural consequence of causal filtering; stable IIR filters are not linear phase and their group delay is not constant with frequency ([Web Audio latency considerations](https://webaudio.github.io/web-audio-api/#latency), [MathWorks group/phase delay reference](https://www.mathworks.com/help/signal/ug/delay.html)).

**Project conclusion:** the existing biquad EQ and a future tone-stack fitted as one or more biquads/IIR sections have no fixed whole-path lookahead and are appropriate for live monitoring. They can change transient shape and phase near their bends, but adding another such section does not automatically add a 128-frame block of delay. A sample-by-sample tone-stack model in an `AudioWorklet` can have the same property; a worklet adds algorithmic latency only if its processor buffers internally ([Web Audio worklet latency note](https://webaudio.github.io/web-audio-api/#latency)).

An arbitrary-curve **linear-phase FIR EQ** is different. A symmetric linear-phase FIR of order `N` has constant group delay `N/2` samples ([MathWorks FIR group-delay derivation](https://www.mathworks.com/help/signal/ug/delay.html)). At 48 kHz, illustrative serial-path costs are:

| FIR taps | Fixed group delay |
|---:|---:|
| 257 | 2.67 ms |
| 513 | 5.33 ms |
| 1,025 | 10.67 ms |
| 2,049 | 21.33 ms |
| 4,097 | 42.67 ms |

Those values are arithmetic from `(taps - 1) / (2 × 48,000)` and exclude input/output buffering and any implementation-specific convolution pipeline. A minimum-phase FIR moves energy toward the beginning but gives up linear phase; for a live default, the existing research recommendation to use a fitted biquad bank is therefore also the safer latency choice ([Bézier EQ research](./bezier-drawn-eq.md)).

### Compression

The specification requires fixed lookahead and describes the compressor internally with a `DelayNode` whose `delayTime` is exactly `0.006` seconds. Attack and release control the gain-reduction envelope; changing this project's 10 ms attack or 150 ms release does **not** change the fixed 6 ms signal delay ([Web Audio compressor algorithm](https://webaudio.github.io/web-audio-api/#DynamicsCompressorNode), [project parameter mapping](../../src/audio/AudioEngine.ts#L22-L40)). Even Amount 0, which maps to threshold 0 dB and ratio 1:1, retains the delay when the compressor branch is active because the node's lookahead is fixed. At 48 kHz, 6 ms is 288 samples.

The project bypasses Compression by crossfading over 20 ms between a direct path and the compressor path ([gain smoothing](../../src/audio/gain.ts), [bypass routing and automation](../../src/audio/AudioEngine.ts#L260-L264), [bypass crossfade](../../src/audio/AudioEngine.ts#L367-L373)). **Inference:** while that fade is in progress, the mix contains the same signal at 0 ms and 6 ms offsets. This can smear a transient and creates a comb response for steady broadband content (null/peak spacing based on `1 / 0.006 ≈ 166.7 Hz`). The existing test limits clicks, but it does not test this time alignment ([current bypass test](../../tests/audio/studio-chain.spec.ts)).

Practical choices are:

1. Accept the 6 ms only while Compression is active and add an impulse/phase-alignment transition test.
2. Replace it with a custom no-lookahead compressor when minimum monitoring latency matters more than anticipatory peak control.
3. Delay the bypass path by the same 6 ms for a phase-safe crossfade, accepting 6 ms even when bypassed.

### Reverb

The impulse generator writes zeros for the first 12 ms and then decaying filtered noise for the remainder of its 1.5-second total length. At 48 kHz, the intentional wet pre-delay is 576 samples ([reverb source](../../src/audio/reverb.ts)). `ConvolverNode` performs linear convolution with the exact impulse when normalization is disabled, as it is here ([Web Audio convolver processing](https://webaudio.github.io/web-audio-api/#dom-convolvernode-normalize), [project convolver creation](../../src/audio/AudioEngine.ts#L533-L544)).

The dry branch goes from `reverbInput` through `reverbDryGain` directly to Master, while the convolver has a separate wet return to Master. Thus:

- Dry attack: no intentional reverb delay.
- First wet energy: 12 ms after the corresponding input, by construction.
- Wet tail: approximately 1.5 seconds; this is persistence after the input, not monitoring lag.

The Web Audio API promises the convolution result, not an implementation's FFT partition size or a numerical `ConvolverNode` pipeline latency. Its informative convolution architecture explains both why a naive FFT partition incurs block latency and how processing the leading impulse directly can make the output zero-latency ([Web Audio convolution architecture](https://webaudio.github.io/web-audio-api/convolution.html)). Therefore keep the direct dry branch and measure each supported browser rather than budgeting the 1.5-second IR length as latency.

### Baseline browser and device latency

The project creates `new AudioContext()` without options, so it receives the default `"interactive"` latency hint and default render-quantum choice ([context construction](../../src/audio/browserAudio.ts), [Web Audio context options](https://webaudio.github.io/web-audio-api/#AudioContextOptions)). The current Web Audio specification's default render quantum is 128 frames—2.67 ms at 48 kHz—but nodes are rendered as one graph in quanta; this is not a per-node surcharge ([rendering model](https://webaudio.github.io/web-audio-api/#rendering-an-audio-graph)).

`AudioContext.baseLatency` covers destination-to-audio-subsystem processing but explicitly excludes latency inside the graph and further processing between the subsystem and hardware. `outputLatency` estimates host request to physical output. Neither includes microphone capture latency ([Web Audio latency attributes](https://webaudio.github.io/web-audio-api/#dom-audiocontext-baselatency)). Microphone-track `latency`, where exposed, is a target estimate from real-world capture until data is available to the next processing step, and actual values may vary ([Media Capture latency setting](https://w3c.github.io/mediacapture-main/#def-constraint-latency)). The project requests raw capture features off but does not currently request or record a capture latency setting ([capture constraints](../../src/audio/AudioEngine.ts#L182-L195)).

This means the observation “I cannot perceive latency” is more informative about the full device/browser setup than counting Web Audio nodes. With Compression bypassed, it is consistent with the graph: there is no deliberate whole-path DSP delay to add to the capture and output buffers.

## Delay and chorus: effect time need not be input latency

Web Audio defines `DelayNode` exactly as `output(t) = input(t - delayTime(t))`; the default delay is zero ([DelayNode processing](https://webaudio.github.io/web-audio-api/#DelayNode)). A conventional chorus is also a modulated delay line with a dry/wet mix: JUCE's first-party chorus API exposes LFO rate/depth, a 1–100 ms center delay, feedback, and a mix from full dry to full wet ([JUCE chorus documentation](https://docs.juce.com/master/classjuce_1_1dsp_1_1Chorus.html)).

Recommended topology for both future effects:

```text
effect input ───────────────> dry gain ──┐
      └─> delay/modulated delay ─> wet ──┴─> next stage
```

With the dry branch permanently direct, 100–500 ms delay repeats and a several-millisecond chorus voice are the desired wet timing, not 100–500 ms or several milliseconds added to the player's dry attack. Full-wet mode, or putting the delay line in series with no dry branch, intentionally makes the heard attack late. Feedback changes the number/decay of repeats, not the direct-path latency. Bypass transitions should fade the wet return while leaving the dry branch alone, avoiding the compressor's unequal-delay crossfade problem.

## Future amp and cabinet modeling

The proposed amp research includes oversampled `WaveShaperNode` nonlinear stages and a serial cabinet IR ([amp-modeling research](./fender-amp-gain-and-era-voicings.md)). These have different latency risks:

- A non-oversampled waveshaper applies its curve directly to current input samples. With `oversample = "2x"` or `"4x"`, Web Audio requires upsampling and downsampling filters, explicitly says the filters are implementation-defined, and warns that their latency varies by implementation ([WaveShaper oversampling algorithm](https://webaudio.github.io/web-audio-api/#dom-waveshapernode-oversample)). Measure `none`, `2x`, and `4x` in every target browser; do not promise a number from the enum.
- A cabinet convolver is normally **serial/full-wet**, unlike today's parallel reverb. Any leading silence, linear-phase group delay, or browser convolution pipeline therefore moves the monitored attack. Trim unintended IR silence, prefer a causal/minimum-phase or otherwise latency-qualified cabinet IR for live mode, and impulse-test the exact asset plus browser. `ConvolverNode`'s specified result depends on the impulse itself, and the specification flags convolution delay as impulse-dependent ([Web Audio convolver semantics](https://webaudio.github.io/web-audio-api/#ConvolverNode), [latency considerations](https://webaudio.github.io/web-audio-api/#latency)).
- An AudioWorklet circuit model does not inherently owe one extra render quantum. A sample-by-sample processor can produce the current quantum's output, while an FFT, resampler, or explicit internal block buffer adds whatever it holds. Keep allocation and heavyweight coefficient design off the rendering callback; an underrun occurs when callback load exceeds the available real-time interval ([Web Audio rendering load](https://webaudio.github.io/web-audio-api/#rendering-an-audio-graph)).

## Measurement plan for this project

### Deterministic per-stage tests

Extend the existing `OfflineAudioContext` harness, which already renders stage behavior deterministically ([offline harness](../../tests/support/offlineAudioHarness.ts), [studio-chain tests](../../tests/audio/studio-chain.spec.ts)):

1. Render an impulse through a baseline graph and through each stage/mode independently at 44.1 and 48 kHz.
2. Record first sample above a defined threshold, impulse peak time, and cross-correlation offset. Assert 0-sample dry reverb onset, 12 ms wet onset, and 6 ms active compressor offset.
3. For EQ/tone stacks, compute unwrapped phase and group delay over log-spaced frequencies rather than claiming one latency number. Web Audio exposes each biquad's phase response through `getFrequencyResponse()` ([Web Audio frequency response](https://webaudio.github.io/web-audio-api/#dom-biquadfilternode-getfrequencyresponse)).
4. During compressor bypass transitions, test an impulse, noise, and swept sine for doubled attacks/comb response as well as the existing maximum-sample-step click criterion.
5. For every future cabinet IR, FIR EQ length, oversampling mode, delay, and chorus topology, make “dry onset unchanged” an explicit test where that is the intended contract.

### Physical end-to-end test

Web-exposed component estimates are useful diagnostics but do not replace a physical round-trip measurement. Log `sampleRate`, render quantum size when available, `baseLatency`, `outputLatency`, the input track's `getSettings().latency`, browser/OS, and exact input/output device; then use an electrical interface loopback (or an acoustic click when necessary) and cross-correlate the recorded return against the emitted stimulus. This measures the cumulative path that the Web Audio specification says matters, including device and system buffers ([Web Audio latency model](https://webaudio.github.io/web-audio-api/#latency), [capture latency definition](https://w3c.github.io/mediacapture-main/#def-constraint-latency)). Repeat with baseline, Compressor active, Reverb active, and every future quality mode; the pairwise difference isolates graph effects while the absolute result measures the playing experience.

### Capacity/dropout test

Latency and stability are separate gates. Run sustained all-effects-on stress passes on the slowest supported devices, switch controls and bypasses during playback, and inspect the captured output for discontinuities. Longer/stereo convolution, more EQ sections, modulation voices, oversampling, and custom worklet DSP all consume more real-time budget even when their direct path adds no intentional delay. Web Audio defines CPU work exceeding the callback interval as an underrun and describes over-budget DSP as a cause of glitches ([rendering load](https://webaudio.github.io/web-audio-api/#rendering-an-audio-graph), [audio glitching](https://webaudio.github.io/web-audio-api/#audio-glitching)).

## Recommended latency policy

For Browser Amp's live mode:

- Treat the current default path as the latency baseline and publish measured device/browser round-trip ranges, not a node-count estimate.
- Keep tone-stack and interactive EQ implementations IIR/biquad-based; reserve long linear-phase FIR for an explicitly non-live/high-quality mode.
- Keep Reverb, Delay, and Chorus as parallel sends with a permanent zero-delay dry path. Label their pre-delay/delay values as effect timing, not input latency.
- Budget exactly 6 ms for the current active compressor and test its unequal-delay bypass crossfade. If that becomes objectionable after future serial stages are added, use a no-lookahead compressor rather than hiding the cost.
- Qualify cabinet IR onset and waveshaper oversampling separately on each browser; both are serial and therefore matter more to the player's attack than the current wet-only reverb.
- Track dropout margin independently from impulse/cross-correlation latency. More CPU load is a reliability risk before it is a reason to report a larger algorithmic-latency number.

The likely near-term outcome is still good: adding delay and chorus need not change dry monitoring latency at all, and richer tone stacks based on biquads should remain near the present feel. The latency features to watch closely are the existing 6 ms compressor, any serial cabinet convolution, oversampling filters, and any future linear-phase/FFT processing.
