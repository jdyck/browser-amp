# Audio stage switching

The shared `StageSwitcher` in `src/audio/stageSwitcher.ts` owns stable input/output nodes and the lifetime of selected processing paths. It is used for amp selection, cabinet selection, and the reverb wet path. It does not own saved settings, monitoring, or input capture. Studio EQ and Studio Compression use their own bypass paths.

## Lifetime contract

- A factory creates a fresh `StagePath` only when it is selected. The path exposes an input, an output, optional warmup duration and input-retirement policy, and `dispose()` for its internal nodes.
- The switcher connects one path initially. During switching, it connects an incoming path at zero gain, optionally warms it, and schedules complementary 20 ms fades.
- At the fade deadline it disconnects the outgoing path's input and output edges, disconnects its mix gain, and disposes the path's internal graph.
- At most two paths exist per stage. Requests during a transition replace one pending selection; they do not create more paths or interrupt the scheduled fade. Once retirement completes, the latest pending choice starts its own transition if needed. Returning to an outgoing selection creates fresh state, rather than reviving a fading effect's old history.
- Disposal cancels the pending selection, clears the deadline callback, and disconnects both paths if a transition is underway. Later callbacks and selections cannot recreate a disposed stage.

This interface is internal to `AudioEngine`. UI code still sends complete control settings to the engine; it does not manipulate nodes or coordinate fades. Keys use strict equality: amp selections are strings; reverb selections are immutable parameter snapshots whose identity is reused until the effective settings change. Gain/Amount edits do not require new paths. Reverb response, Dwell, and modulation edits create a fresh path through the same bounded transition, coalescing intermediate slider positions.

## Audio-clock cleanup

An unconnected `ConstantSourceNode` with zero offset is started and scheduled to stop at the fade deadline. Its `ended` event triggers retirement. It never connects to the audible graph. This follows audio time, so suspending the context pauses the deadline along with the fades instead of allowing a wall-clock timer to retire the audible path prematurely.

The actual graph disconnection happens on the control thread when the ended event is delivered. A busy control thread can delay disposal, but the outgoing mix has already reached zero and the switcher never exceeds two paths. A new selection also checks audio time and completes an overdue transition before proceeding. No periodic polling or persistent timer is used.

## Current stage policies

| Stage | Policy |
| --- | --- |
| Amp | Keep the outgoing amp fed during the transition. Non-Studio-Clean paths warm for 60 ms before a 20 ms fade; Studio Clean needs no warmup. |
| Cabinet | Crossfade for 20 ms, then dispose the outgoing filter path. |
| Reverb | The dry path stays at unity. Switching modules or bypassing disconnects the outgoing effect's incoming audio immediately, fades its remaining tail over 20 ms, and disposes the convolver. Re-enabling or returning to a module builds fresh history. There is no preserve-trails mode. |

Reverb bypass does not create a replacement convolver. Each module's impulse response is generated on enabled use or a response-parameter change. The cache keeps only the latest response for each module, at most seven entries, and is cleared on disconnect. Outgoing convolvers can retain their previous buffers only until retirement. Dwell and modulation edits reuse the response data; their extra nodes are disposed with the path, including stopping modulation oscillators. Choosing or editing a module while bypassed generates nothing. Amp lookup curves are likewise cached on first use. Reverb Amount still changes only the wet return; Amount, selection, and each module's parameters remain saved while bypassed. See [Reverb modules](reverb-modules.md) for the response generators.

Switching latency is distinct from steady audio latency: a non-Studio-Clean topology switch takes about 80 ms when idle, and queued choices wait for the current transition. The switcher adds no delay to the steady path. Selected effects may add their own latency.

## Verification and limits

Unit tests exercise lazy creation, the two-path bound, latest-selection behavior, retirement, paused audio time, and disposal. Engine tests verify lazy reverb creation, amp-path disposal, impulse reuse without retained tails, and cleanup on disconnect.

Browser OfflineAudioContext tests check native deadline delivery and graph retirement without another control command, rapid amp switching, rapid reverb module switching/bypass without resurrecting tails, the original signal responses, and switching discontinuities. All seven reverb responses are checked at 44.1, 48, and 96 kHz for deterministic output, finite samples, decay, stereo differences, dry attack, and bounded wet energy. UI and production smoke tests cover selection, persistence, and unchanged monitoring behavior.

These checks establish graph lifetime and rendered behavior, not a measured CPU saving or a guitar/interface listening sign-off. Real-time performance still depends on the selected implementations, browser, sample rate, and hardware. Future effects with different latency or tail requirements need their own audible-transition tests.
