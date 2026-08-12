# Bézier-drawn EQ: products, semantics, and a Web Audio implementation

Date: 2026-08-11

## Short answer

Yes. The useful mental model is not “a Bézier path *is* an EQ,” but “the path specifies a desired magnitude response, and a DSP renderer approximates that response.” Existing products do both versions of the idea:

- FabFilter Pro-Q 4's **EQ Sketch** interprets one left-to-right gesture and creates conventional low/high-pass, bell, and shelf bands. FabFilter says explicitly that it is for a rough global starting curve rather than many precise bands ([official EQ Sketch help](https://www.fabfilter.com/help/pro-q/using/eq-sketch)).
- Cockos **ReaFIR** is an FFT processor whose response can be defined by any number of points or by freehand mouse drawing; its EQ mode can operate as a linear-phase EQ ([official ReaPlugs page](https://www.cockos.com/reaper/reaplugs/)).
- Voxengo **CurveEQ** calls itself a spline EQ, supports freehand curve drawing and spectrum matching, and offers linear- and minimum-phase modes ([official product page](https://www.voxengo.com/product/curveeq/), [official manual, pp. 2–5](https://www.voxengo.com/files/userguides/VoxengoCurveEQ_en.pdf/getbyname/Voxengo%20CurveEQ%20User%20Guide%20en.pdf)).
- MeldaProduction **MFreeformEqualizer** says its shape graph defines the desired response and lets the user draw any response; its envelope editor has unlimited points, several curve types, adjustable curvature, and smoothing ([official manual, pp. 7–8](https://www.meldaproduction.com/download/documentation/MFreeformEqualizer.pdf)).

So the interaction is established. The engineering decision is how faithfully, and with how much phase shift or latency, the audio engine should realize the path.

## Three different things that look similar

| Kind | What the line means | Examples | DSP consequence |
|---|---|---|---|
| Parametric EQ display | The line is the **result** of filter nodes. Dragging adds or edits a low-pass, shelf, bell, etc. | A normal Pro-Q display; this project's current three-band EQ | A small cascade of biquads; efficient and low-latency, but not an arbitrary curve. Web Audio defines `BiquadFilterNode` as a common low-order filter and explicitly says multiple nodes can form more complex filters ([Web Audio spec](https://webaudio.github.io/web-audio-api/#BiquadFilterNode)). |
| Gesture-to-bands / matching | The gesture or measured spectrum is a **target**, then software infers a limited set of ordinary bands. | Pro-Q 4 EQ Sketch; Pro-Q EQ Match | The result is intentionally an approximation. Pro-Q EQ Match compares spectra and proposes a user-adjustable number of EQ bands ([official EQ Match help](https://www.fabfilter.com/help/pro-q/using/eqmatch)). |
| Freeform response | The curve itself is the **target response**, sampled densely and implemented with FFT/FIR processing or a dense/fitted filter bank. | ReaFIR, CurveEQ, MFreeformEqualizer | Can follow the drawing closely, but resolution, ringing, phase, latency, and update cost become explicit design parameters. |

This distinction matters in the UI: show the editable target curve and, ideally, a second “actual response” line. Otherwise a low-order approximation can misleadingly look exact.

## What an Illustrator-like editor may draw

An EQ magnitude response is one-valued: each frequency has one gain. It therefore cannot accept an arbitrary closed Illustrator shape, loop, or vertical segment. A practical editor should constrain the path so its x coordinate always increases, or flatten an unconstrained stroke and reduce it to one gain per x position.

Use normalized coordinates and keep them independent of canvas size:

```text
frequency(x) = fMin * (fMax / fMin) ** x       x in [0, 1]
gainDb(y)     = maxDb - y * (maxDb - minDb)    y in [0, 1]
linearGain    = 10 ** (gainDb / 20)
```

The x-axis should be logarithmic (for example 20 Hz–20 kHz) so equal horizontal distances represent equal frequency ratios/octaves. The y-axis should be linear in dB. The Web Audio specification uses `20 log10(v)` and `10 ** (dB/20)` for gain conversion ([Web Audio spec](https://webaudio.github.io/web-audio-api/#dom-gainnode-gain)).

A cubic Bézier is only the control representation. At render time, adaptively flatten it or evaluate it at a fixed log-frequency grid. Require monotone-x handles, or invert `x(t)` numerically to obtain exactly one `y` for each requested frequency. Do not feed canvas-pixel samples directly to DSP.

Before filter design:

1. Clamp the response to a deliberate range (the current product already uses ±12 dB).
2. Resample uniformly in log frequency.
3. Smooth or regularize the target in **dB**, not linear amplitude. A minimum feature width such as 1/6–1/3 octave prevents pointer jitter from becoming high-Q ringing.
4. Penalize curvature/second differences or simplify excess points. Product manuals support the underlying tradeoff: CurveEQ warns that its low-frequency curve has limited resolution and that more spectrum-match points need not sound better ([official manual, pp. 4–5](https://www.voxengo.com/files/userguides/VoxengoCurveEQ_en.pdf/getbyname/Voxengo%20CurveEQ%20User%20Guide%20en.pdf)); Pro-Q describes EQ Sketch as deliberately imprecise ([official help](https://www.fabfilter.com/help/pro-q/using/eq-sketch)).
5. Preserve output headroom. A +12 dB target can multiply amplitude by about 4 before the existing compressor/master stages.

## Browser implementation choices

### 1. Log-spaced biquad bank — best live-monitoring MVP

Create perhaps 12–18 fixed-center `peaking` `BiquadFilterNode`s across the audible band, optionally with low/high shelves at the ends. Sample the target at those centers, but do not simply copy the samples into band gains: overlapping filters interact. Solve a regularized least-squares gain problem from a precomputed interaction matrix, and optionally iterate once. Published graphic-EQ work uses one biquad per band and weighted least squares specifically to account for interaction between filters ([Liski, Rämö, and Välimäki, 2019](https://research.aalto.fi/en/publications/graphic-equalizer-design-with-symmetric-biquad-filters/)); a cascade design similarly uses interpolated target gains, least squares, and one iteration ([Välimäki and Liski, 2017](https://research.aalto.fi/en/publications/accurate-cascade-graphic-equalizer/)).

Advantages:

- Built from the same native node type already used by this project.
- No intentional block/FIR delay; appropriate for live guitar monitoring.
- Parameters can be updated smoothly and the actual cascade response can be calculated by multiplying the nodes' linear magnitude responses. `getFrequencyResponse()` is specified for this purpose ([Web Audio spec](https://webaudio.github.io/web-audio-api/#dom-biquadfilternode-getfrequencyresponse)).

Costs:

- It approximates the path, especially narrow notches or steep edges.
- More nodes consume more CPU and graph-management work; benchmark on target browsers/devices.
- Direct `.value` writes are not automatically smoothed. The specification recommends `setTargetAtTime()` for smooth transitions, and also warns that parameter automation can make an otherwise fixed, stable biquad unstable ([AudioParam transitions](https://webaudio.github.io/web-audio-api/#AudioParam-transitions), [biquad stability note](https://webaudio.github.io/web-audio-api/#filters-characteristics)). Clamp frequency/Q/gain, rate-limit refits, and use short ramps.

A more Pro-Q-like variant fits a sparse set of bells/shelves with variable frequency and Q. It produces fewer, human-editable bands, but needs a nonlinear optimizer and is less predictable than a fixed bank. Sparse graphic-EQ research demonstrates that band selection plus least-squares gain optimization can reduce the number of active sections ([Antonelli, Liski, and Välimäki, 2022](https://research.aalto.fi/en/publications/sparse-graphic-equalizer-design/)).

### 2. FIR impulse response through `ConvolverNode` — closest curve

Sample the desired dB curve on an FFT frequency grid, convert to linear magnitude, choose a phase response, and inverse-transform/window it into FIR taps. SciPy's first-party `firwin2` documentation describes this exact frequency-sampling pattern: interpolate a desired response, inverse FFT it to a convolution kernel, truncate it to a chosen number of taps, and window it ([SciPy `firwin2`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.firwin2.html)). Put those taps in a mono `AudioBuffer`, set `convolver.normalize = false`, then set `convolver.buffer`. With normalization disabled, Web Audio specifies exact linear convolution with the supplied impulse response ([Web Audio `ConvolverNode`](https://webaudio.github.io/web-audio-api/#ConvolverNode)).

Advantages:

- Much closer to a genuine arbitrary curve.
- FIR filters are finite and do not have feedback-pole stability problems.
- One EQ node at the graph level.

Costs:

- Frequency detail requires taps. At 48 kHz, a 2049-tap symmetric FIR has about 23.4 Hz FFT-bin spacing and about 21.3 ms linear-phase delay; 4097 taps roughly halves that spacing while doubling the delay.
- Linear phase preserves relative phase but a symmetric `N`-tap FIR delays by `(N-1)/2` samples and can pre-ring around sharp transients. CurveEQ's manual explicitly contrasts linear phase/pre-ringing with minimum phase ([official manual, p. 4](https://www.voxengo.com/files/userguides/VoxengoCurveEQ_en.pdf/getbyname/Voxengo%20CurveEQ%20User%20Guide%20en.pdf)).
- A minimum-phase FIR moves energy earlier and reduces perceived/algorithmic delay, but changes phase. Homomorphic/cepstral conversion is a standard option; SciPy documents both magnitude-matching and shorter minimum-phase conversions and shows the group-delay difference ([SciPy `minimum_phase`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.minimum_phase.html)).
- Replacing a convolver buffer may glitch. The Web Audio specification recommends constructing a new convolver and crossfading old/new nodes ([Web Audio `ConvolverNode.buffer`](https://webaudio.github.io/web-audio-api/#dom-convolvernode-buffer)). Rebuild on pointer-up, or debounce while dragging and crossfade each accepted revision.

The built-in convolver does not promise a particular internal partition size or processing latency, so live-monitoring behavior must be measured in each target browser in addition to accounting for the FIR's own phase delay.

### 3. Custom FIR/FFT in `AudioWorklet` — maximum control, maximum work

An `AudioWorkletProcessor` can run JavaScript or WebAssembly synchronously on the audio rendering thread ([Web Audio spec](https://webaudio.github.io/web-audio-api/#AudioWorklet-concepts)). It can implement partitioned convolution, a minimum-phase FIR, or an overlap-add STFT EQ and control coefficient interpolation precisely. The default Web Audio render quantum is 128 frames, though Web Audio 1.1 exposes configurable/hardware-sized quanta, so code should use the received block length rather than hard-code 128 ([rendering model](https://webaudio.github.io/web-audio-api/#rendering-a-graph)).

This is justified only if built-in `ConvolverNode` latency/update behavior or a native biquad bank fails requirements. It adds real-time allocation, underrun, coefficient handoff, SIMD/WASM, testing, and recovery concerns.

### 4. Why `IIRFilterNode` is usually not the answer

`IIRFilterNode` accepts arbitrary feed-forward/feedback coefficients, but each coefficient array is capped at 20 values, coefficients cannot change after construction, and the specification recommends cascaded biquads for higher-order filters because they are less sensitive to numeric issues and can be automated ([creation limits](https://webaudio.github.io/web-audio-api/#dom-baseaudiocontext-createiirfilter), [IIR node guidance](https://webaudio.github.io/web-audio-api/#IIRFilterNode)). It is therefore awkward for an interactive curve: every edit means designing, creating, and crossfading a new fixed IIR, while stability of fitted poles remains the application's responsibility.

## Recommendation for `browser-amp`

For this live guitar app, start with the **log-spaced biquad bank**, behind the existing `AudioEngine` seam:

1. Keep a normalized, monotone Bézier/envelope model in UI state: `{frequencyHz, gainDb}` control points plus curvature/smoothing.
2. On drag, update the target path immediately but rate-limit DSP refits. On pointer-up, compute the final fit.
3. Use 12–18 log-spaced peaking bands plus optional end shelves, fixed conservative Q, regularized least-squares gains, and ±12 dB clamps.
4. Draw both target and actual response; obtain each biquad response with `getFrequencyResponse()` and multiply magnitudes before converting to dB.
5. Smooth accepted gain changes with short `AudioParam` ramps. Keep coefficient/optimization work off the audio rendering thread.
6. Add offline impulse/sine-sweep tests for response error, boost headroom, and no transient NaN/instability. Use `OfflineAudioContext`, which the specification defines for rendering a graph to an `AudioBuffer` ([Web Audio spec](https://webaudio.github.io/web-audio-api/#OfflineAudioContext)).

If listening tests show that the approximation is visibly/audibly too coarse, add an optional **high-quality FIR mode** that commits edits on pointer-up and crossfades convolver instances. It should not be the default for live monitoring until end-to-end latency has been measured.

This is not merely a new skin for the current controls. The repository currently instantiates three fixed serial biquads in [`AudioEngine.ts`](../../src/audio/AudioEngine.ts), while [`PLAN.md`](../../PLAN.md) explicitly scoped the first release to bass/middle/treble and away from parametric or graphic EQ. A drawn response changes the control model, persistence format, accessibility design, test matrix, and product scope; it fits best as a later EQ mode or replacement stage behind the existing deep audio-engine interface.

## Bottom line

The exact Illustrator-like interaction is viable. Treat the Bézier as a **smoothed target magnitude curve on log-frequency/dB axes**, not as filter coefficients. For low-latency live audio, approximate it with a regularized bank of native biquads and be honest by displaying the realized curve. For highest visual fidelity, synthesize a linear- or minimum-phase FIR and run it through a crossfaded `ConvolverNode`, accepting the phase/latency tradeoff.
