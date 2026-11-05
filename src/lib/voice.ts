import * as Speech from 'expo-speech';

/**
 * System text-to-speech for the panic screen: the fallback behind the bundled
 * voice clips in cueAudio.ts, and the only voice on web. It runs on the
 * device's own speech engine; nothing is sent anywhere.
 *
 * Picks a calm female English voice from whatever the device offers (to match
 * the recorded clips as closely as a system voice can) and speaks slowly.
 * Quality varies by device, which is why the clips are the primary voice.
 */

let resolved: string | null | undefined; // undefined = not yet resolved

// Names/identifiers that indicate a female voice across iOS and Android TTS.
const FEMALE_HINTS = [
  'female', 'samantha', 'karen', 'moira', 'tessa', 'fiona', 'victoria',
  'serena', 'allison', 'ava', 'susan', 'zoe', 'joana', 'catherine', 'nora',
  // Android Google TTS female variants
  'en-us-x-iob', 'en-us-x-tpf', 'en-us-x-tpc', 'en-us-x-sfg',
  'en-gb-x-gba', 'en-gb-x-gbc', 'en-gb-x-rjs',
];

async function resolveVoice(): Promise<string | null> {
  if (resolved !== undefined) return resolved;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const en = voices.filter((v) => (v.language || '').toLowerCase().startsWith('en'));
    const female = en.find((v) =>
      FEMALE_HINTS.some((h) => `${v.name ?? ''} ${v.identifier ?? ''}`.toLowerCase().includes(h)),
    );
    resolved = (female ?? en[0])?.identifier ?? null;
  } catch {
    resolved = null;
  }
  return resolved;
}

/**
 * Resolve the voice ahead of time so the very first spoken cue isn't delayed
 * by the one-time getAvailableVoicesAsync lookup (that lag was the main reason
 * the voice drifted behind the on-screen phase). Call on screen mount.
 */
export async function warmUpVoice(): Promise<void> {
  await resolveVoice();
}

export async function speakSoothing(text: string): Promise<void> {
  const voice = await resolveVoice();
  try {
    // Interrupt any lingering cue so the spoken word always matches the phase
    // currently on screen - utterances must never queue up and drift.
    Speech.stop();
    Speech.speak(text, {
      voice: voice ?? undefined,
      rate: 0.82, // slow and calm, but not so slow it lags the visual
      pitch: 1.05, // gently warm
    });
  } catch {
    // TTS unavailable (some browsers) - the on-screen guide still works.
  }
}

export function stopSpeaking(): void {
  try {
    Speech.stop();
  } catch {}
}
