import type { WarmJazzComboSettings } from '../../amps';
import { dbToLinearGain } from '../gain';
import { AmpPathBase, toneDb } from './shared';

export function topologyKey(settings: WarmJazzComboSettings): string {
  return `${settings.color}/${settings.lowInput}`;
}

export class WarmJazzComboPath extends AmpPathBase {
  constructor(context: BaseAudioContext, state: WarmJazzComboSettings) {
    super(context);
    const colorDb = state.color === 'dark' ? -4 : state.color === 'bright' ? 3 : 0;
    this.connectPath([
      this.input,
      this.filter('highpass', 38),
      this.gain(state.lowInput ? 0.5 : 1),
      this.filter('lowpass', state.lowInput ? 7_000 : 10_000),
      this.controlledGain('drive', dbToLinearGain((state.volume - 4) * 3)),
      this.filter('highshelf', 2_200, colorDb),
      this.controlledFilter(
        'bass', 'lowshelf', 110,
        toneDb(state.bass, 10)
      ),
      this.controlledFilter(
        'middle', 'peaking', 650,
        toneDb(state.middle, 9), 0.75
      ),
      this.controlledFilter(
        'treble', 'highshelf', 3_000,
        toneDb(state.treble, 10)
      ),
      this.gain(0.42),
      this.shaper(1.1),
      this.gain(2.25),
      this.filter('lowpass', 7_500),
      this.gain(1.06),
      this.output,
    ]);
  }

  setControls(settings: unknown): void {
    const state = settings as WarmJazzComboSettings;
    this.setControlDb('drive', (state.volume - 4) * 3);
    this.setControl('bass', toneDb(state.bass, 10));
    this.setControl('middle', toneDb(state.middle, 9));
    this.setControl('treble', toneDb(state.treble, 10));
  }
}
