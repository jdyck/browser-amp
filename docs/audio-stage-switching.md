# Audio stage switching

The shared `StageSwitcher` in `src/audio/stageSwitcher.ts` owns stable input/output nodes and the lifetime of selected processing paths. It is currently used for amp selection and the reverb wet path (plate or off). It does not add new effect choices, change saved settings, change monitoring, or rebuild input capture. EQ and Compression retain their existing bypass implementation for now.

## Lifetime contract

- A factory creates a fresh `StagePath` only when it is selected. The path exposes an input, an output, optional warmup duration and input-retirement policy, and `dispose()` for its internal nodes.
- The switcher connects one path initially. During switching, it connects an incoming path at zero gain, optionally warms it, and schedules complementary 20 ms fades.
- At the fade deadline it disconnects the outgoing path's input and output edges, disconnects its mix gain, and disposes the path's internal graph.
- At most two paths exist per stage. Requests during a transition replace one pending selection; they do not create more paths or interrupt the scheduled fade. Once retirement completes, the latest pending choice starts its own transition if needed. Returning to an outgoing selection creates fresh state, rather than reviving a fading effect's old history.
- Disposal cancels the pending selection, clears the deadline callback, and disconnects both paths if a transition is underway. Later callbacks and selections cannot recreate a disposed stage.

This interface is internal to `AudioEngine`. UI code still sends complete control settings to the engine; it does not manipulate nodes or coordinate fades. A future EQ or reverb implementation can use the same lifetime owner with its own factory. Ordinary parameter changes within one implementation do not require new paths.

## Audio-clock cleanup

An unconnected `ConstantSourceNode` with zero offset is started and scheduled to stop at the fade deadline. Its `ended` event triggers retirement. It never connects to the audible graph. This follows audio time, so suspending the context pauses the deadline along with the fades instead of allowing a wall-clock timer to retire the audible path prematurely.

The actual graph disconnection happens on the control thread when the ended event is delivered. A busy control thread can delay disposal, but the outgoing mix has already reached zero and the switcher never exceeds two paths. A new selection also checks audio time and completes an overdue transition before proceeding. No periodic polling or persistent timer is used.

## Current stage policies

| Stage | Policy |
| --- | --- |
| Amp | Keep the outgoing amp fed during the transition. New tube paths warm for 100 ms before a 20 ms fade; Clean Voice needs no warmup. The original model parameters are unchanged. |
| Reverb | The dry path stays at unity. Switching the wet effect to off disconnects its incoming audio immediately, fades its remaining tail over 20 ms, and disposes the convolver. Re-enabling builds fresh history. There is no preserve-trails mode. |

Reverb bypass does not create a replacement convolver. Its deterministic impulse response is generated on first use and cached for that input session. Amp lookup curves are likewise cached on first use. Caching these data avoids regeneration; it does not keep unselected processors running. Reverb Amount still changes only the wet return, and remains saved while bypassed.

Switching latency is distinct from steady audio latency: tube selection takes about 120 ms when idle, and a queued choice waits for the current transition to finish. No new delay is inserted into the selected audio path. Phase differences can color overlaps; the fades are not a promise of equal loudness or identical phase.

## Verification and limits

Unit tests exercise lazy creation, the two-path bound, latest-selection behavior, both-edge retirement, delayed callbacks, paused audio time, and disposal during a transition. Engine tests verify that Clean Voice creates no tube shapers, bypassed reverb creates no convolver, old shapers are disposed, impulse data is reused without retaining tails, and disconnect cancels pending callbacks.

Browser OfflineAudioContext tests check native deadline delivery and graph retirement without another control command, rapid amp switching, rapid reverb bypass without resurrecting tails, the original signal responses, and switching discontinuities. UI and production smoke tests cover selection, persistence, and unchanged monitoring behavior.

These checks establish graph lifetime and rendered behavior, not a measured CPU saving or a guitar/interface listening sign-off. Real-time performance still depends on the selected implementations, browser, sample rate, and hardware. Future effects with different latency or tail requirements need their own audible-transition tests.
