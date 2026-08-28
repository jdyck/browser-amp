import { describe, expect, it, vi } from 'vitest';
import { StageSwitcher, type StagePath } from './stageSwitcher';

function gainNode() {
  return {
    connect: vi.fn(), disconnect: vi.fn(),
    gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
  };
}

function fixture(options: { warmupSeconds?: number; stopInputOnSwitch?: boolean } = {}) {
  const paths: Array<{ key: string; input: ReturnType<typeof gainNode>; output: ReturnType<typeof gainNode>; dispose: ReturnType<typeof vi.fn> }> = [];
  const clocks: Array<{
    offset: { value: number }; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended: (() => void) | null;
  }> = [];
  const context = {
    currentTime: 0,
    createGain: vi.fn(gainNode),
    createConstantSource: vi.fn(() => {
      const clock = { offset: { value: 1 }, start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: null };
      clocks.push(clock);
      return clock;
    }),
  };
  const create = vi.fn((key: string): StagePath => {
    const path = { key, input: gainNode(), output: gainNode(), dispose: vi.fn() };
    paths.push(path);
    return {
      ...path,
      input: path.input as unknown as AudioNode,
      output: path.output as unknown as AudioNode,
      warmupSeconds: options.warmupSeconds,
      stopInputOnSwitch: options.stopInputOnSwitch,
    };
  });
  const stage = new StageSwitcher<string>(context as unknown as BaseAudioContext, 'a', create);
  const finish = () => {
    const clock = clocks.at(-1)!;
    context.currentTime = clock.stop.mock.calls[0][0];
    clock.onended?.();
  };
  return { context, create, stage, paths, clocks, finish };
}

describe('StageSwitcher', () => {
  it('constructs only the selected path and retires both edges after its audio-time fade', () => {
    const { stage, paths, clocks, context, finish } = fixture({ warmupSeconds: 0.06 });
    stage.select('a');
    expect(paths).toHaveLength(1);
    expect(clocks).toHaveLength(0);
    stage.select('b');
    expect(paths).toHaveLength(2);
    expect(paths[0].dispose).not.toHaveBeenCalled();
    const mixes = context.createGain.mock.results.slice(2).map(({ value }) => value);
    expect(mixes[0].gain.setValueAtTime).toHaveBeenCalledWith(1, 0.06);
    expect(mixes[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 0.08);
    expect(mixes[1].gain.setValueAtTime).toHaveBeenCalledWith(0, 0.06);
    expect(mixes[1].gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 0.08);
    expect(clocks[0].connect).not.toHaveBeenCalled();
    finish();
    expect(stage.input.disconnect).toHaveBeenCalledWith(paths[0].input);
    expect(paths[0].output.disconnect).toHaveBeenCalledWith(mixes[0]);
    expect(mixes[0].disconnect).toHaveBeenCalledOnce();
    expect(paths[0].dispose).toHaveBeenCalledOnce();
    expect(paths[1].dispose).not.toHaveBeenCalled();
    expect(clocks[0].onended).toBeNull();
    stage.dispose();
  });

  it('coalesces rapid requests to the latest selection without a third live path', () => {
    const { stage, paths, finish } = fixture();
    stage.select('b');
    for (const selection of ['c', 'a', 'b', 'd']) stage.select(selection);
    expect(paths.map(({ key }) => key)).toEqual(['a', 'b']);
    finish();
    expect(paths.map(({ key }) => key)).toEqual(['a', 'b', 'd']);
    expect(paths.filter(({ dispose }) => dispose.mock.calls.length === 0)).toHaveLength(2);
    finish();
    expect(paths.filter(({ dispose }) => dispose.mock.calls.length === 0).map(({ key }) => key)).toEqual(['d']);
    stage.select('d');
    expect(paths).toHaveLength(3);
    stage.dispose();
  });

  it('cancels a superseded pending selection when the user returns to the incoming path', () => {
    const { stage, paths, finish } = fixture();
    stage.select('b');
    stage.select('c');
    stage.select('b');
    finish();
    expect(paths.map(({ key }) => key)).toEqual(['a', 'b']);
    stage.dispose();
  });

  it('stops feeding tail effects immediately, but disposes them only after the fade', () => {
    const { stage, paths, finish } = fixture({ stopInputOnSwitch: true });
    stage.select('b');
    expect(stage.input.disconnect).toHaveBeenCalledWith(paths[0].input);
    expect(paths[0].dispose).not.toHaveBeenCalled();
    stage.select('a');
    finish();
    // A return to the retired selection creates fresh history, never revives it.
    expect(paths.map(({ key }) => key)).toEqual(['a', 'b', 'a']);
    expect(stage.input.disconnect).toHaveBeenCalledTimes(2);
    stage.dispose();
  });

  it('does not retire a path while audio time is paused, and catches up after a late callback', () => {
    const { stage, context, paths, clocks } = fixture();
    stage.select('b');
    stage.select('c');
    expect(paths[0].dispose).not.toHaveBeenCalled();
    context.currentTime = 0.1;
    const lateCallback = clocks[0].onended;
    stage.select('d');
    expect(paths.map(({ key }) => key)).toEqual(['a', 'b', 'd']);
    lateCallback?.();
    expect(paths[1].dispose).not.toHaveBeenCalled();
    stage.dispose();
  });

  it('disposes during warmup or fade without leaving callbacks that can recreate paths', () => {
    const { stage, paths, clocks } = fixture({ warmupSeconds: 0.06 });
    stage.select('b');
    stage.select('c');
    const callback = clocks[0].onended;
    stage.dispose();
    stage.dispose();
    callback?.();
    stage.select('d');
    expect(paths).toHaveLength(2);
    for (const path of paths) expect(path.dispose).toHaveBeenCalledOnce();
    expect(clocks[0].onended).toBeNull();
    expect(clocks[0].disconnect).toHaveBeenCalledOnce();
  });
});
