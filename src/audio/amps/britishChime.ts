import type { BritishChimeSettings } from '../../amps';
import { dbToLinearGain } from '../gain';
import { AmpPathBase, toneDb } from './shared';

export function topologyKey(settings: BritishChimeSettings): string {
  return String(settings.topBoost);
}

export class BritishChimePath extends AmpPathBase {
  constructor(context: BaseAudioContext, state: BritishChimeSettings) {
    super(context);
    const topBoost = state.topBoost;
    this.connectPath([
      this.input,
      this.filter('highpass', topBoost ? 95 : 75),
      this.controlledGain(
        'drive',
        dbToLinearGain((state.volume - 4) * 3.5)
      ),
      this.controlledFilter(
        'bass',
        'lowshelf',
        120,
        (state.bass - 4) * 1.7 - (topBoost ? 1 : 0)
      ),
      this.filter(
        'peaking',
        topBoost ? 1_800 : 1_350,
        topBoost ? 3.5 : 1.8,
        0.85
      ),
      this.controlledFilter(
        'treble',
        'highshelf',
        topBoost ? 2_200 : 2_800,
        toneDb(state.treble, 10) + (topBoost ? 1.5 : 0)
      ),
      this.gain(topBoost ? 0.62 : 0.48),
      this.shaper(topBoost ? 1.4 : 1.1, 0.055),
      this.filter('highpass', 20),
      this.controlledFilter(
        'cut', 'highshelf', 3_200,
        -state.cut * 1.2
      ),
      this.filter('lowpass', 7_800),
      this.gain(topBoost ? 1.78 : 2.09),
      this.output,
    ]);
  }

  setControls(settings: unknown): void {
    const state = settings as BritishChimeSettings;
    const topBoost = state.topBoost;
    this.setControlDb('drive', (state.volume - 4) * 3.5);
    this.setControl(
      'bass',
      (state.bass - 4) * 1.7 - (topBoost ? 1 : 0)
    );
    this.setControl(
      'treble',
      toneDb(state.treble, 10) + (topBoost ? 1.5 : 0)
    );
    this.setControl('cut', -state.cut * 1.2);
  }
}
