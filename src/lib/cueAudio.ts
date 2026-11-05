import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { AppState, Platform } from 'react-native';
import { speakSoothing } from './voice';

/**
 * Pre-recorded panic-screen voice cues, bundled as app assets.
 *
 * The clips were generated once with OpenAI's text-to-speech and ship inside
 * the app: nothing is generated or sent anywhere at runtime. Because the voice
 * is AI-generated, the panic screen says so beside the Mute voice control
 * (OpenAI's usage policies require that disclosure), and so does the privacy
 * policy.
 *
 * A fixed clip per phrase plays instantly and sounds the same on every device.
 * Native plays the clip; web uses live system TTS (bundled-audio autoplay is
 * unreliable there, and web is only a dev/verification target).
 *
 * A cue is never silent on purpose. If a clip is missing, throws, or loads but
 * never actually starts (a decode failure plays nothing and reports nothing),
 * the same words are spoken with system TTS instead, and that clip is skipped
 * for the rest of the session.
 */
export type CueKey =
  | 'breathe-in'
  | 'hold'
  | 'breathe-out'
  | 'ground-see'
  | 'ground-feel'
  | 'ground-hear'
  | 'ground-smell'
  | 'ground-taste';

// Voice: OpenAI "sage" with a warm, soft, intimate meditation-guide tone.
const SOURCES: Record<CueKey, number> = {
  'breathe-in': require('../../assets/audio/sage-breathe-in.mp3'),
  hold: require('../../assets/audio/sage-hold.mp3'),
  'breathe-out': require('../../assets/audio/sage-breathe-out.mp3'),
  'ground-see': require('../../assets/audio/sage-ground-see.mp3'),
  'ground-feel': require('../../assets/audio/sage-ground-feel.mp3'),
  'ground-hear': require('../../assets/audio/sage-ground-hear.mp3'),
  'ground-smell': require('../../assets/audio/sage-ground-smell.mp3'),
  'ground-taste': require('../../assets/audio/sage-ground-taste.mp3'),
};

/**
 * How long a clip gets to show signs of life before we give up on it and
 * speak the words instead. Bundled files load in well under this; a clip that
 * has neither loaded nor advanced by then is not going to play.
 */
const START_GRACE_MS = 1200;

let players: Partial<Record<CueKey, AudioPlayer>> = {};
let ready = false;
// Clips that failed once this session go straight to TTS from then on, so a
// broken file costs one late cue rather than one per breath.
let broken = new Set<CueKey>();
// Bumped by every play and stop, so a watchdog from an older cue never speaks
// over a newer one (or over a mute).
let generation = 0;

/**
 * Create the players once. Idempotent and a no-op on web.
 *
 * Call it as early as possible - during the panic screen's first render, not
 * in its effect. React runs a child's effects before its parent's, so the
 * breathing guide's first cue fires before the screen's own mount effect; if
 * preloading waited for that effect, the first "Breathe in" was always system
 * TTS, in a different voice, and silent with the ringer switch off. playCue
 * also preloads on demand as a backstop.
 */
export function preloadCues(): void {
  if (ready || Platform.OS === 'web') return;
  try {
    // Play even when the ringer switch is on silent - urge support must be heard.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    for (const key of Object.keys(SOURCES) as CueKey[]) {
      players[key] = createAudioPlayer(SOURCES[key]);
    }
    ready = true;
  } catch {
    ready = false;
  }
}

/** Play a cue; falls back to live TTS on web or if the clip cannot play. */
export function playCue(key: CueKey, fallbackText: string): void {
  const gen = ++generation;
  if (Platform.OS !== 'web' && !broken.has(key)) {
    preloadCues();
    const p = players[key];
    if (p) {
      try {
        p.seekTo(0).catch(() => {});
        p.play();
        setTimeout(() => {
          if (gen !== generation) return;
          // In the background (a helpline call from panic, say) a clip is
          // paused or never starts, and that says nothing about the file.
          // Judging it then marked a good clip broken for the whole session -
          // a different, system voice from then on - and spoke a cue into
          // the background. Only a clip that fails in the foreground counts.
          if (AppState.currentState !== 'active') return;
          // Every clip runs well past the grace period, so a healthy one is
          // still playing (or at least has moved) when this runs. "Loaded"
          // alone is not enough: a clip that decodes to nothing loads fine.
          let started = false;
          try {
            started = p.playing || p.currentTime > 0;
          } catch {
            started = false;
          }
          if (started) return;
          broken.add(key);
          try {
            p.pause();
          } catch {}
          void speakSoothing(fallbackText);
        }, START_GRACE_MS);
        return;
      } catch {
        broken.add(key);
        // fall through to TTS
      }
    }
  }
  void speakSoothing(fallbackText);
}

/** Pause any playing cue immediately (e.g. when the user mutes). */
export function stopCues(): void {
  generation++;
  for (const key of Object.keys(players) as CueKey[]) {
    try {
      players[key]?.pause();
    } catch {}
  }
}

export function releaseCues(): void {
  generation++;
  for (const key of Object.keys(players) as CueKey[]) {
    try {
      players[key]?.remove();
    } catch {}
  }
  players = {};
  broken = new Set();
  ready = false;
}
