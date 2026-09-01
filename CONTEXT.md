# Browser Amp

An interactive web-audio experience for shaping a live guitar signal through a fixed amp and studio chain.

## Language

**Clean Amp Workbench**:
The interactive experience for shaping a Live Guitar Input through an intentionally ordered Amp Chain.
_Avoid_: General Web Audio workbench, patch builder

**Amp Chain**:
The fixed sequence Input Trim, Amp Model, Cabinet, planned Noise Suppression, Studio Compression, Studio EQ, Reverb, and Master that transforms the Live Guitar Input before Processed Monitoring.
_Avoid_: Pedalboard, arbitrary graph

**Live Guitar Input**:
The guitar signal captured from a connected audio input device and used as the sole source in the first release.
_Avoid_: Demo signal, uploaded audio

**Input Channel**:
The single channel selected for guitar processing when an Input Connection exposes more than one channel.
_Avoid_: Stereo input, mixed interface inputs

**Input Level Meter**:
The continuously moving display of the Live Guitar Input before the Amp Chain transforms it, using level regions and a peak hold to make clipping visible.
_Avoid_: Output meter, volume control, numeric readout

**Output Level Meter**:
The display of the final Amp Chain signal before browser output, including a persistent indication when the processed signal overloads.
_Avoid_: Input Level Meter, limiter, hearing-safety guarantee

**Input Connection**:
The active browser capture of a selected Live Guitar Input, which can drive the Input Level Meter without making the signal audible.
_Avoid_: Processed Monitoring, Enable Monitoring

**Validation Interfaces**:
The available iRig HD 2, Scarlett, and USB instrument cable used to validate support for browser-visible audio interfaces without implying universal hardware compatibility.
_Avoid_: Reference Rig, supported-device list, universal compatibility

**Hardware Direct Monitoring**:
An interface-provided dry signal path that exists outside the Amp Chain and must be disabled when evaluating Processed Monitoring.
_Avoid_: Processed Monitoring, browser bypass

**Processed Monitoring**:
Monitoring in which listeners hear the Amp Chain's output rather than a parallel dry input signal; it remains silent until the player explicitly enables it.
_Avoid_: Dry monitoring, dry/wet blend

**Stage Bypass**:
A control that removes Studio Compression, Studio EQ, or Reverb without changing its settings. Reverb bypass also ends the existing tail.
_Avoid_: Per-parameter bypass, dry monitoring

**Noise Suppression**:
A gentle downward-expansion stage detected from the conditioned input and applied after Cabinet. Threshold chooses when it opens, Range bounds the maximum reduction, and Release controls how gradually it closes. Opening, hold, and hysteresis remain fixed.
_Avoid_: Browser voice processing, microphone cleanup, Noise Gate

**Input Trim**:
The global calibration gain before the selected Amp Model. It does not define an amp's drive or listening level.
_Avoid_: Overdrive, distortion, saturation

**Amp Model**:
One of six selectable jazz-oriented voicings. Each owns its gain staging, tone controls, and nonlinear behavior and remembers its settings independently.
_Avoid_: Preset, named amp replica, circuit-accurate simulation

**Studio EQ**:
The bypassable three-band EQ after Studio Compression, used for final polish rather than amp identity.
_Avoid_: Parametric EQ, graphic EQ

**Studio Compression**:
A bypassable post-cabinet stage with Amount, Level Match, and a live Reduction meter. Level Match is a stable trim, not signal-following gain.
_Avoid_: Limiter, individual compressor parameters

**Reverb**:
A bypassable Amp Chain stage with seven switchable modules and a shared Amount control for the wet return. The dry signal stays unchanged, and switching fades and retires the old tail. Studio Plate preserves the original sound; the other modules are original synthetic voices, not authentic hardware models.
_Avoid_: Circuit-accurate reverb, measured tank response

**Reverb Module**:
The selected reverb voice: Jazz Room, Studio Chamber, Studio Plate, Fender Spring, Polytone Spring, Digital Room, or Digital Hall. Each has its own saved parameters in Main Controls and Advanced Controls accordions. Selection and parameters remain saved while bypassed and do not change Amount, input capture, or monitoring. Only the selected module remains active after its switching transition.
_Avoid_: Amp Model, full-rig preset

**Master Volume**:
The final player-controlled Amp Chain stage that can attenuate, but not boost, the level sent into Processed Monitoring.
_Avoid_: Input Trim, Enable Monitoring

**Saved Control Settings**:
The last control values and bypass states restored on a later visit without restoring an Input Connection or enabling Processed Monitoring.
_Avoid_: Restored session, saved device, preset

**Reset Controls**:
The action that restores first-use control defaults without changing browser permissions or monitoring state.
_Avoid_: Factory reset, permission reset
