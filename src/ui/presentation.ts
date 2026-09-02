import type { AudioSnapshot } from '../audio/types';
import type { RecoveryPresentation } from './sections/types';

export function isConnected(snapshot: AudioSnapshot): boolean {
  return snapshot.lifecycle === 'connected-muted' || snapshot.lifecycle === 'monitoring' || snapshot.lifecycle === 'interrupted';
}

export function recoveryPresentation(snapshot: AudioSnapshot): RecoveryPresentation {
  const connected = isConnected(snapshot);
  const presentation: RecoveryPresentation = {
    connectButtonLabel: connected ? 'Reconnect Input' : 'Connect Input',
    inputMessage: undefined,
    monitoringMessage: undefined,
    monitoringButtonLabel: snapshot.monitoring ? 'Disable Monitoring' : 'Enable Monitoring',
    monitoringDisabled: !connected,
    retrySelectedOutput: false,
  };
  if (snapshot.recovery === undefined) return presentation;
  switch (snapshot.recovery.action) {
    case 'reconnect-input': return {
      ...presentation,
      connectButtonLabel: snapshot.recovery.code === 'permission-denied' || snapshot.recovery.code === 'no-input-devices' || snapshot.recovery.code === 'input-connection-failed' ? 'Try Again' : 'Reconnect Input',
      inputMessage: snapshot.recovery.message,
    };
    case 'resume-monitoring': return { ...presentation, monitoringMessage: snapshot.recovery.message, monitoringButtonLabel: 'Resume Monitoring' };
    case 'choose-output': return {
      ...presentation,
      monitoringButtonLabel: 'Choose Output Before Monitoring',
      monitoringDisabled: true,
      retrySelectedOutput: snapshot.outputRouting.selectedDeviceId !== undefined && snapshot.outputRouting.devices.some((device) => device.id === snapshot.outputRouting.selectedDeviceId),
    };
  }
}

export function latencyDescription(latency: AudioSnapshot['latency']): string {
  if (latency === undefined) return '';
  const baseMs = latency.baseSeconds * 1_000;
  if (latency.outputSeconds === undefined) return `Browser output latency: ~${baseMs.toFixed(1)} ms processing buffer (device output latency not reported by this browser). Input capture latency is not measurable and adds to the total.`;
  const outputMs = latency.outputSeconds * 1_000;
  return `Browser output latency: ~${(baseMs + outputMs).toFixed(1)} ms (${baseMs.toFixed(1)} ms processing buffer + ${outputMs.toFixed(1)} ms device output). Input capture latency is not measurable and adds to the total.`;
}
