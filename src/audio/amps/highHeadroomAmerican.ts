import type { HighHeadroomAmericanSettings } from '../../amps';
import { dbToLinearGain } from '../gain';
import { AmpPathBase, toneDb } from './shared';

export function topologyKey(settings: HighHeadroomAmericanSettings): string {
  return `${settings.bright}/${settings.headroom}`;
}

export class HighHeadroomAmericanPath extends AmpPathBase {
  constructor(context: BaseAudioContext, state: HighHeadroomAmericanSettings) {
    super(context);
    const thresholdScale = state.headroom === 'ultra' ? 0.18 : 0.27;
    this.connectPath([
      this.input,
      this.filter('highpass', 48),
      this.controlledGain('drive', dbToLinearGain((state.volume - 4) * 3)),
      this.controlledFilter(
        'bright',
        'highshelf',
        3_000,
        state.bright === 'on' ? 5 * (1 - state.volume / 12) : 0
      ),
      this.controlledFilter('bass', 'lowshelf', 95, (state.bass - 4) * 1.6),
      this.controlledFilter('middle', 'peaking', 720, toneDb(state.middle, 8), 0.7),
      this.controlledFilter('treble', 'highshelf', 3_100, (state.treble - 5.5) * 1.6),
      this.gain(thresholdScale),
      this.shaper(0.5, 0.01),
      this.filter('highpass', 20),
      this.gain(1 / thresholdScale),
      this.filter('lowpass', 7_200),
      this.gain(1),
      this.output,
    ]);
  }

  setControls(settings: unknown): void {
    const state = settings as HighHeadroomAmericanSettings;
    this.setControlDb('drive', (state.volume - 4) * 3);
    this.setControl('bass', (state.bass - 4) * 1.6);
    this.setControl('middle', toneDb(state.middle, 8));
    this.setControl('treble', (state.treble - 5.5) * 1.6);
    this.setControl('bright', state.bright === 'on' ? Math.max(0, 5 * (1 - state.volume / 12)) : 0);
  }
}
