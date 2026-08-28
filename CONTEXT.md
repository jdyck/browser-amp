# Browser Amp

An interactive web-audio experience for exploring a guitar-amp signal path. Its initial identity is a Fender-inspired clean amp, not a general-purpose audio graph editor.

## Language

**Clean Amp Workbench**:
The interactive experience for shaping a Live Guitar Input through an intentionally ordered Amp Chain.
_Avoid_: General Web Audio workbench, patch builder

**Clean Voice**:
The sparkling, high-headroom tonal identity that guides the initial amp chain and is shaped by the player rather than modeled after a named amplifier.
_Avoid_: Fender clone, Silverface clone, Blackface clone

**Amp Chain**:
The fixed sequence Clean Gain, selected Amp Model, Three-Band EQ, Compression, Reverb, and Master Volume that transforms the Live Guitar Input before Processed Monitoring; Noise Gate is reserved ahead of Clean Gain for a later release.
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
A control that immediately removes a bypassable Amp Chain stage from Processed Monitoring without changing that stage's settings; the first release exposes it for Compression and Reverb, and bypassing Reverb also ends its existing tail.
_Avoid_: Per-parameter bypass, dry monitoring

**Noise Gate**:
A planned Amp Chain stage, positioned before Clean Gain, that attenuates the signal when its level falls beneath a player-controlled threshold.
_Avoid_: Noise suppression, microphone cleanup

**Clean Gain**:
The linear Gain stage that changes signal level before the selected Amp Model; raising it also drives either Clean Tube model harder when selected.
_Avoid_: Overdrive, distortion, saturation

**Amp Model**:
The selectable voicing after Clean Gain and before Three-Band EQ. Clean Voice leaves the signal unchanged; Clean Tube adds original tube-inspired filtering and gentle saturation; Clean Tube Warm adds fuller low mids, darker highs, and earlier breakup. Only the selected model remains active after its switching transition. Selection does not change the other controls or monitoring state.
_Avoid_: Preset, named amp replica, circuit-accurate simulation

**Three-Band EQ**:
The fixed bass, middle, and treble tone-shaping stage in the Amp Chain.
_Avoid_: Parametric EQ, graphic EQ

**Compression**:
A bypassable Amp Chain stage whose single Amount control moves from effectively uncompressed sound toward progressively firmer dynamics control.
_Avoid_: Limiter, individual compressor parameters

**Reverb**:
A bypassable Amp Chain stage with seven switchable modules and a shared Amount control for the wet return. The dry signal stays unchanged, and switching fades and retires the old tail. Studio Plate preserves the original sound; the other modules are original synthetic voices, not authentic hardware models.
_Avoid_: Circuit-accurate reverb, measured tank response

**Reverb Module**:
The selected reverb voice: Jazz Room, Studio Chamber, Studio Plate, Fender Spring, Polytone Spring, Digital Room, or Digital Hall. Each has its own saved parameters in Main Controls and Advanced Controls accordions. Selection and parameters remain saved while bypassed and do not change Amount, input capture, or monitoring. Only the selected module remains active after its switching transition.
_Avoid_: Amp Model, full-rig preset

**Master Volume**:
The final player-controlled Amp Chain stage that can attenuate, but not boost, the level sent into Processed Monitoring.
_Avoid_: Clean Gain, Enable Monitoring

**Saved Control Settings**:
The last control values and bypass states restored on a later visit without restoring an Input Connection or enabling Processed Monitoring.
_Avoid_: Restored session, saved device, preset

**Reset Controls**:
The action that restores first-use control defaults without changing browser permissions or monitoring state.
_Avoid_: Factory reset, permission reset
