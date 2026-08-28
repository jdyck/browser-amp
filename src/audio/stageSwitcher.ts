import { GAIN_SMOOTHING_SECONDS } from './gain';

/** A disconnected graph owned by one selection. Factories create fresh state. */
export interface StagePath {
  readonly input: AudioNode;
  readonly output: AudioNode;
  readonly warmupSeconds?: number;
  /** Tail effects stop accepting new input as soon as switching begins. */
  readonly stopInputOnSwitch?: boolean;
  dispose(): void;
}

interface Branch<Key> {
  readonly key: Key;
  readonly path: StagePath;
  readonly mix: GainNode;
  inputConnected: boolean;
}

interface Transition<Key> {
  readonly incoming: Branch<Key>;
  readonly deadline: number;
  readonly clock: ConstantSourceNode;
}

/** One active path; at most one incoming path and one latest queued selection. */
export class StageSwitcher<Key extends string> {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly #context: BaseAudioContext;
  readonly #create: (key: Key) => StagePath;
  #active: Branch<Key>;
  #requested: Key;
  #transition: Transition<Key> | undefined;
  #disposed = false;

  constructor(context: BaseAudioContext, initial: Key, create: (key: Key) => StagePath) {
    this.#context = context;
    this.#create = create;
    this.input = context.createGain();
    this.output = context.createGain();
    this.#requested = initial;
    this.#active = this.#connect(initial, 1);
  }

  select(key: Key): void {
    if (this.#disposed) return;
    this.#requested = key;
    // Catch up if the control thread delivered an ended event late.
    if (this.#transition !== undefined && this.#context.currentTime >= this.#transition.deadline) {
      this.#finishTransition();
    } else if (this.#transition === undefined) {
      this.#startTransition();
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#transition !== undefined) {
      this.#cancelClock(this.#transition.clock);
      this.#retire(this.#transition.incoming);
      this.#transition = undefined;
    }
    this.#retire(this.#active);
    this.input.disconnect();
    this.output.disconnect();
  }

  #connect(key: Key, gain: number): Branch<Key> {
    const path = this.#create(key);
    const mix = this.#context.createGain();
    mix.gain.value = gain;
    this.input.connect(path.input);
    path.output.connect(mix);
    mix.connect(this.output);
    return { key, path, mix, inputConnected: true };
  }

  #startTransition(): void {
    if (this.#requested === this.#active.key) return;
    const incoming = this.#connect(this.#requested, 0);
    const now = this.#context.currentTime;
    const fadeStart = now + (incoming.path.warmupSeconds ?? 0);
    const deadline = fadeStart + GAIN_SMOOTHING_SECONDS;
    // These ramps are never interrupted. Further selections are coalesced until
    // the old path is gone, including requests to return to that old selection.
    this.#active.mix.gain.setValueAtTime(1, fadeStart);
    this.#active.mix.gain.linearRampToValueAtTime(0, deadline);
    incoming.mix.gain.setValueAtTime(0, fadeStart);
    incoming.mix.gain.linearRampToValueAtTime(1, deadline);
    if (this.#active.path.stopInputOnSwitch) this.#detachInput(this.#active);

    // An unconnected, silent source is an audio-clock deadline, not a wall-clock
    // timer. Suspension pauses it along with the fades; it never reaches output.
    const clock = this.#context.createConstantSource();
    clock.offset.value = 0;
    this.#transition = { incoming, deadline, clock };
    clock.onended = () => {
      if (!this.#disposed && this.#transition?.clock === clock) this.#finishTransition();
    };
    clock.start();
    clock.stop(deadline);
  }

  #finishTransition(): void {
    const transition = this.#transition;
    if (transition === undefined) return;
    this.#transition = undefined;
    this.#cancelClock(transition.clock);
    this.#retire(this.#active);
    this.#active = transition.incoming;
    this.#startTransition();
  }

  #detachInput(branch: Branch<Key>): void {
    if (!branch.inputConnected) return;
    this.input.disconnect(branch.path.input);
    branch.inputConnected = false;
  }

  #retire(branch: Branch<Key>): void {
    this.#detachInput(branch);
    branch.path.output.disconnect(branch.mix);
    branch.mix.disconnect();
    branch.path.dispose();
  }

  #cancelClock(clock: ConstantSourceNode): void {
    clock.onended = null;
    clock.stop();
    clock.disconnect();
  }
}
