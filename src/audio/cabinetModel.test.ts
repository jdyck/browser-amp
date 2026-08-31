import { describe, expect, it, vi } from 'vitest';
import { CABINET_RECIPES, CabinetModelStage } from './cabinetModel';

function audioNode(properties: Record<string, unknown> = {}) {
  return { connect: vi.fn(), disconnect: vi.fn(), ...properties };
}

function fixture(initial: ConstructorParameters<typeof CabinetModelStage>[1]) {
  let currentTime = 0;
  const filters: ReturnType<typeof audioNode>[] = [];
  const clocks: ReturnType<typeof audioNode>[] = [];
  const context = {
    get currentTime() { return currentTime; },
    sampleRate: 48_000,
    createGain: vi.fn(() => audioNode({ gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() } })),
    createBiquadFilter: vi.fn(() => {
      const filter = audioNode({ type: 'peaking', frequency: { value: 0 }, gain: { value: 0 }, Q: { value: 0 } });
      filters.push(filter);
      return filter;
    }),
    createConstantSource: vi.fn(() => {
      const clock = audioNode({ offset: { value: 1 }, start: vi.fn(), stop: vi.fn(), onended: null });
      clocks.push(clock);
      return clock;
    }),
  };
  const stage = new CabinetModelStage(context as unknown as BaseAudioContext, initial);
  const finish = () => {
    const clock = clocks.at(-1)! as typeof clocks[number] & { stop: ReturnType<typeof vi.fn>; onended: (() => void) | null };
    currentTime = clock.stop.mock.calls[0][0];
    clock.onended?.();
  };
  return { context, filters, clocks, stage, finish };
}

describe('CabinetModelStage', () => {
  it('uses no filters or trim for Direct / Full Range', () => {
    const { context, stage } = fixture('cab.direct-full-range-v1');
    expect(context.createBiquadFilter).not.toHaveBeenCalled();
    // Stage I/O, path I/O, and the switcher's mix are the only unity gains.
    expect(context.createGain).toHaveBeenCalledTimes(5);
    stage.disconnect();
  });

  it('builds only one recipe at steady state and retires old filters after a switch', () => {
    const { context, filters, stage, finish } = fixture('cab.compact-jazz-1x12-v1');
    const filterCount = CABINET_RECIPES['cab.compact-jazz-1x12-v1'].filters.length;
    expect(filters).toHaveLength(filterCount);

    stage.setModel('cab.american-open-1x12-v1');
    stage.setModel('cab.open-4x10-v1');
    expect(filters).toHaveLength(filterCount * 2);
    expect(filters.slice(0, filterCount).every((filter) => vi.mocked(filter.disconnect).mock.calls.length === 0)).toBe(true);
    finish();
    expect(filters.slice(0, filterCount).every((filter) => vi.mocked(filter.disconnect).mock.calls.length === 1)).toBe(true);
    expect(filters).toHaveLength(filterCount * 3);
    finish();
    expect(filters.filter((filter) => vi.mocked(filter.disconnect).mock.calls.length === 0)).toHaveLength(filterCount);
    expect(context.createConstantSource).toHaveBeenCalledTimes(2);
    stage.disconnect();
    expect(filters.every((filter) => vi.mocked(filter.disconnect).mock.calls.length === 1)).toBe(true);
  });
});
