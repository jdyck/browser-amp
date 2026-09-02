import type { Page } from '@playwright/test';


export async function installAudioBrowser(page: Page, options: {
  clipOnce?: boolean;
  outputSelection?: boolean;
  permissionDenied?: boolean;
  routingFailure?: boolean;
} = {}): Promise<void> {
  await page.addInitScript(({ clipOnce, outputSelection, permissionDenied, routingFailure }) => {
    const testWindow = window as Window & {
      captureRequests?: number;
      resumeRequests?: number;
      selectedSink?: string;
      setInputConnected?: (connected: boolean) => void;
      setOutputConnected?: (connected: boolean) => void;
      simulateBackground?: () => void;
      simulateForeground?: () => void;
    };
    let inputConnected = true;
    let outputConnected = true;
    let activeContext: MockAudioContext | undefined;
    const mediaDevices = Object.assign(new EventTarget(), {
      getUserMedia: async (constraints: MediaStreamConstraints) => {
        testWindow.captureRequests = (testWindow.captureRequests ?? 0) + 1;
        if (permissionDenied) throw new DOMException('Denied', 'NotAllowedError');
        const audio = typeof constraints.audio === 'object' ? constraints.audio : undefined;
        const exactDevice = typeof audio?.deviceId === 'object' && 'exact' in audio.deviceId
          ? String(audio.deviceId.exact)
          : undefined;
        if ((exactDevice === 'irig-hd-2' && !inputConnected) || (exactDevice !== undefined && exactDevice !== 'irig-hd-2')) {
          throw new DOMException('Unavailable', 'NotFoundError');
        }
        const deviceId = exactDevice ?? (inputConnected ? 'irig-hd-2' : 'microphone');
        const track = Object.assign(new EventTarget(), {
          getSettings: () => ({ channelCount: 1, deviceId, echoCancellation: false, noiseSuppression: false, autoGainControl: false }),
          stop: () => undefined,
        });
        const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
        return stream;
      },
      enumerateDevices: async () => [
        { deviceId: 'microphone', kind: 'audioinput', label: 'Built-in Microphone' },
        ...(inputConnected ? [{ deviceId: 'irig-hd-2', kind: 'audioinput', label: 'iRig HD 2' }] : []),
        ...(outputConnected ? [{ deviceId: 'headphones', kind: 'audiooutput', label: 'Studio Headphones' }] : []),
      ],
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: mediaDevices,
      configurable: true,
    });
    testWindow.setInputConnected = (connected) => {
      inputConnected = connected;
      mediaDevices.dispatchEvent(new Event('devicechange'));
    };
    testWindow.setOutputConnected = (connected) => {
      outputConnected = connected;
      mediaDevices.dispatchEvent(new Event('devicechange'));
    };

    const node = (properties: Record<string, unknown> = {}) => ({ connect: () => undefined, disconnect: () => undefined, ...properties });
    let analyserIndex = 0;
    class MockAudioContext extends EventTarget {
      currentTime = 1;
      sampleRate = 48_000;
      destination = node();
      state = 'running';
      audioWorklet = { addModule: async () => undefined };
      constructor() {
        super();
        activeContext = this;
      }
      createMediaStreamSource() { return node(); }
      createAnalyser() {
        const index = analyserIndex++;
        let reads = 0;
        return node({
          fftSize: 2048,
          getFloatTimeDomainData: (samples: Float32Array) => {
            samples.fill(0);
            if (clipOnce && index === 1 && reads++ === 0) samples[0] = 1;
          },
        });
      }
      createChannelSplitter() { return node(); }
      createChannelMerger() { return node(); }
      createDelay() { return node({ delayTime: { value: 0 } }); }
      createOscillator() { return node({ frequency: { value: 0 }, start: () => undefined, stop: () => undefined }); }
      createGain() {
        const gain = {
          value: 1,
          cancelScheduledValues: () => gain,
          setValueAtTime: (value: number) => { gain.value = value; return gain; },
          linearRampToValueAtTime: (value: number) => { gain.value = value; return gain; },
        };
        return node({ gain });
      }
      createBiquadFilter() {
        const parameter = (initialValue: number) => {
          const value = {
            value: initialValue,
            cancelScheduledValues: () => value,
            setValueAtTime: (nextValue: number) => { value.value = nextValue; return value; },
            linearRampToValueAtTime: (nextValue: number) => { value.value = nextValue; return value; },
          };
          return value;
        };
        return node({ type: 'peaking', frequency: parameter(0), Q: { value: 0 }, gain: parameter(0) });
      }
      createWaveShaper() { return node({ curve: null, oversample: 'none' }); }
      createConstantSource() { return node({ offset: { value: 1 }, start: () => undefined, stop: () => undefined, onended: null }); }
      createDynamicsCompressor() {
        const parameter = (value: number) => ({ value, cancelScheduledValues: () => undefined, setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined });
        return node({ reduction: -4, threshold: parameter(-24), ratio: parameter(12), attack: parameter(0.003), release: parameter(0.25), knee: parameter(30) });
      }
      createBuffer(channels: number, length: number, sampleRate: number) {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return { duration: length / sampleRate, length, numberOfChannels: channels, sampleRate, getChannelData: (channel: number) => data[channel] };
      }
      createConvolver() { return node({ buffer: null, normalize: true }); }
      resume() {
        testWindow.resumeRequests = (testWindow.resumeRequests ?? 0) + 1;
        this.state = 'running';
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    }
    class MockAudioWorkletNode {
      port = { onmessage: null, postMessage: () => undefined };
      constructor(_context: BaseAudioContext, _name: string, _options?: AudioWorkletNodeOptions) {}
      connect() { return undefined; }
      disconnect() { return undefined; }
    }
    if (outputSelection) {
      Object.defineProperty(MockAudioContext.prototype, 'setSinkId', {
        value: (deviceId: string) => {
          if (routingFailure) return Promise.reject(new DOMException('Unavailable', 'NotFoundError'));
          testWindow.selectedSink = deviceId;
          return Promise.resolve();
        },
      });
    }
    testWindow.simulateBackground = () => {
      if (activeContext === undefined) return;
      activeContext.state = 'suspended';
      activeContext.dispatchEvent(new Event('statechange'));
    };
    testWindow.simulateForeground = () => {
      if (activeContext === undefined) return;
      activeContext.state = 'running';
      activeContext.dispatchEvent(new Event('statechange'));
      document.dispatchEvent(new Event('visibilitychange'));
    };
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true });
    Object.defineProperty(window, 'AudioWorkletNode', { value: MockAudioWorkletNode, configurable: true });
  }, options);
}

export type AmpSection = 'Input' | 'Amp + Cabinet' | 'Compression' | 'EQ' | 'Reverb' | 'Master';

export async function openSection(page: Page, section: AmpSection): Promise<void> {
  await page.getByRole('button', { name: section, exact: true }).click();
}

export async function resetControlsFrom(page: Page, section: AmpSection): Promise<void> {
  await openSection(page, 'Master');
  await page.getByRole('button', { name: 'Reset Controls' }).click();
  await openSection(page, section);
}

