# Clean Tube models

Clean Tube and Clean Tube Warm are original, tube-inspired voicings, not measured amplifier replicas or numerical triode circuit models. They are selectable beside the unchanged Clean Voice model. The original Clean Tube tuning is unchanged. The selection is saved with the other controls; old or unknown saved model IDs fall back to Clean Voice, and Reset Controls restores Clean Voice.

## Playing it

Select **Clean Tube** or **Clean Tube Warm** above Clean Gain. Begin with Clean Gain at 0 dB and Master low. Raise Clean Gain for stronger harmonics and gradual breakup; adjust Master for listening level. Warm is tuned for more low-mid body, a darker high end, and earlier breakup. The response depends on the interface's input level and the guitar's pickups. Keep the interface itself out of clipping. EQ, Compression, and Reverb remain available after the model. To compare voices, keep the input level fixed, bypass downstream effects, and match listening loudness with Master.

## Signal paths

The existing linear Clean Gain feeds a transparent path or one of these tube paths, before the existing Three-Band EQ.

### Clean Tube (original)

```text
45 Hz high-pass → 10 kHz low-pass
→ asymmetric soft saturation (drive 1.4, bias +0.12)
→ 20 Hz DC blocker → broad 650 Hz contour (-1.5 dB, Q 0.7)
→ asymmetric soft saturation (drive 0.7, bias -0.08)
→ 20 Hz DC blocker → 5.5 kHz low-pass
```

### Clean Tube Warm

```text
35 Hz high-pass → 8 kHz low-pass
→ asymmetric soft saturation (drive 2, bias +0.08)
→ 20 Hz DC blocker → broad 400 Hz contour (+2 dB, Q 0.65)
→ asymmetric soft saturation (drive 1, bias +0.02)
→ 20 Hz DC blocker → 4.2 kHz low-pass → 0.9 output gain
```

Warm uses stronger drive in both stages, with a different balance of asymmetry. The low-mid boost replaces the original's mid scoop; the lower output cutoff softens the upper harmonics. The final gain partly compensates for added body without reducing the signal driving saturation. It is not automatic loudness matching. Both models still use static curves; Warm does not add sag or dynamic bias.

Each saturation stage uses `(tanh(drive * x + bias) - tanh(bias)) / (drive * (1 - tanh(bias)^2))`. This gives zero output for zero input and unity slope near zero, with modest polarity asymmetry. The filters reduce rumble, shape the interstage response, remove generated DC, and soften the high end. The output filter suggests a speaker's bandwidth; it is not a measured cabinet response. These frequencies and curve parameters are original tuning choices, not coefficients taken from a published circuit.

The general arrangement follows the filter/nonlinearity approach described in the [2017 Web Audio amplifier paper](https://webaudioconf.com/posts/2017_26/). See the [research notes](research/filter-and-waveshaper-amp-modeling.md) for distinctions between this approach, fitted models, and circuit solvers.

## Implementation details

- Each model's two waveshapers request 4× oversampling. The lookup inputs are attenuated by 32 and 4 respectively, with the curve domains expanded by the same factors. This avoids reaching the lookup boundary prematurely at the supported Clean Gain settings. Each curve contains 65,537 samples, including exact zero. Browser lookup clipping, interpolation, and oversampling follow the [Web Audio specification](https://www.w3.org/TR/webaudio/#WaveShaperNode).
- Low/high-pass filters use Butterworth Q (about -3.01 dB in Web Audio's Q convention), and frequencies are bounded below Nyquist.
- Only the selected model stays connected. A newly selected tube path receives input while muted for 100 ms so its cascaded DC blockers can settle, then crossfades over 20 ms. The outgoing path is disconnected and disposed after the fade. Clean Voice needs no warmup. Rapid requests keep only the latest pending choice, with at most two live paths per stage; they do not recapture input or reset downstream effects. Curves are cached, but unused shapers and filters are not retained. Different filter phase and oversampling delay can briefly color the crossfade; no constant-loudness guarantee is made. See [stage switching](audio-stage-switching.md).
- Oversampling adds browser-dependent processing delay; this is not measured by the app's browser buffer/output latency display. Clean Voice itself has no added filter or oversampling delay. There is no lookahead, convolution, or audio worklet in this model.
- All model nodes disconnect when capture stops. The existing downstream monitoring mute and output meter remain in place. The model is not an output limiter; later EQ gain can still overload output.

## Verification and limits

OfflineAudioContext tests at 44.1 and 48 kHz check both tube models for silence, finite output at full-scale input with +24 dB gain, DC removal, light-input harmonic distortion below 2% for a 200 Hz sine at amplitude 0.1, and increasing distortion with drive. Comparison tests check Warm's stronger driven distortion, fuller low-mid balance, and darker high end. Additional tests check low/high-frequency attenuation, rapid crossfades across all three voices, exact return to the original clean signal, and unchanged downstream effects. Browser tests cover selection, persistence, reset, and switching without recapturing input or changing monitoring state.

These checks validate the intended DSP behavior, not perceptual realism. There has been no listening sign-off with a guitar/interface or comparison against reference amp recordings. There is no modeled power-supply sag, dynamic bias, transformer, reactive speaker load, circuit-derived tone stack, or cabinet impulse response. Oversampling reduces aliasing but is not a claim that every input and gain setting is alias-free. A named amp match would require a circuit-specific implementation and reference validation.
