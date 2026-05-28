import theme from '../../theme.config.js';

const SOUND_ALIASES = theme.audio.sounds;
const DEFAULT_SOUND_NAMES = Object.values(SOUND_ALIASES);
const AUDIO_ENABLED_STORAGE_KEY = 'makaoAudioEnabled';

function isAudioDisabledByUser() {
  try {
    return window.localStorage.getItem(AUDIO_ENABLED_STORAGE_KEY) === '0';
  } catch {
    return false;
  }
}

function getAudioContextClass() {
  return window.AudioContext || window.webkitAudioContext;
}

function makeSeededRandom(seedText) {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createNoiseBuffer(context, duration, seedText = 'makao') {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const data = buffer.getChannelData(0);
  const random = makeSeededRandom(seedText);

  for (let index = 0; index < frameCount; index += 1) {
    data[index] = random() * 2 - 1;
  }

  return buffer;
}

function rampGain(gain, startAt, peak, attack, releaseAt, endAt) {
  gain.gain.cancelScheduledValues(startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), startAt + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt);
  gain.gain.setValueAtTime(0, endAt);
}

function noteToFrequency(note) {
  const notes = {
    C4: 261.63,
    D4: 293.66,
    E4: 329.63,
    F4: 349.23,
    G4: 392,
    A4: 440,
    B4: 493.88,
    C5: 523.25,
    D5: 587.33,
    E5: 659.25,
    G5: 783.99
  };
  return notes[note] || 440;
}

class AudioManager {
  constructor(config = theme.audio) {
    this.config = config;
    this.context = null;
    this.buffers = new Map();
    this.preloadStarted = false;
    this.activeVoices = [];
    this.sfxVolume = config.sfxVolume;
    this.musicVolume = config.musicVolume;
    this.muted = Boolean(config.muted) || isAudioDisabledByUser();
    this.unlockInstalled = false;
  }

  get maxConcurrentSfx() {
    return Math.max(1, this.config.maxConcurrentSfx || 8);
  }

  getContext() {
    if (this.context) return this.context;

    const AudioContextClass = getAudioContextClass();
    if (!AudioContextClass) return null;

    this.context = new AudioContextClass();
    this.installUnlockHandlers();
    return this.context;
  }

  installUnlockHandlers() {
    if (this.unlockInstalled) return;
    this.unlockInstalled = true;

    const unlock = () => {
      this.resume();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  async resume() {
    const context = this.getContext();
    if (context?.state === 'suspended') {
      await context.resume().catch(() => {});
    }
  }

  async preloadAll(soundNames = DEFAULT_SOUND_NAMES) {
    if (this.preloadStarted) return;
    this.preloadStarted = true;
    await Promise.allSettled(soundNames.map(soundName => this.preloadSound(soundName)));
  }

  async preloadSound(soundName) {
    const context = this.getContext();
    if (!context || this.buffers.has(soundName)) return;

    for (const extension of this.config.extensionPreference || ['ogg', 'mp3']) {
      const url = `${this.config.basePath}/${soundName}.${extension}`;
      try {
        const response = await fetch(url);
        if (!response.ok) continue;

        const arrayBuffer = await response.arrayBuffer();
        const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
        this.buffers.set(soundName, decoded);
        return;
      } catch {
        // Missing or unsupported files fall back to synthesized Web Audio.
      }
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
  }

  setSfxVolume(volume) {
    this.sfxVolume = Math.max(0, Math.min(1, Number(volume) || 0));
  }

  setMusicVolume(volume) {
    this.musicVolume = Math.max(0, Math.min(1, Number(volume) || 0));
  }

  setVolumes({ sfxVolume, musicVolume } = {}) {
    if (sfxVolume !== undefined) this.setSfxVolume(sfxVolume);
    if (musicVolume !== undefined) this.setMusicVolume(musicVolume);
  }

  playSound(soundName, options = {}) {
    if (this.muted) return false;

    const context = this.getContext();
    if (!context) return false;

    if (context.state === 'suspended') {
      context.resume().catch(() => {});
    }

    const buffer = this.buffers.get(soundName);
    if (buffer) {
      return this.playBuffer(soundName, buffer, options);
    }

    return this.playFallback(soundName, options);
  }

  playBuffer(soundName, buffer, options = {}) {
    const context = this.getContext();
    const source = context.createBufferSource();
    const gain = context.createGain();
    const startAt = context.currentTime + (options.delay || 0);
    const volume = this.sfxVolume * (options.volume ?? 1);

    source.buffer = buffer;
    source.playbackRate.value = options.playbackRate || 1;
    gain.gain.setValueAtTime(Math.max(0.0001, volume), startAt);
    source.connect(gain);
    gain.connect(context.destination);
    source.start(startAt);

    const voice = {
      soundName,
      gain,
      startedAt: startAt,
      stop: () => {
        gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.025);
        window.setTimeout(() => {
          try {
            source.stop();
          } catch {
            // The source may have already ended naturally.
          }
        }, 80);
      }
    };

    source.onended = () => {
      this.activeVoices = this.activeVoices.filter(activeVoice => activeVoice !== voice);
    };

    this.registerVoice(voice);
    return true;
  }

  playFallback(soundName, options = {}) {
    const context = this.getContext();
    const master = context.createGain();
    const startAt = context.currentTime + (options.delay || 0);
    const volume = this.sfxVolume * (options.volume ?? 1);
    const voice = {
      soundName,
      gain: master,
      startedAt: startAt,
      stop: () => {
        master.gain.setTargetAtTime(0.0001, context.currentTime, 0.025);
      }
    };

    master.gain.setValueAtTime(volume, startAt);
    master.connect(context.destination);
    this.registerVoice(voice);

    const duration = this.synthesizeSound(soundName, context, master, startAt);
    window.setTimeout(() => {
      master.disconnect();
      this.activeVoices = this.activeVoices.filter(activeVoice => activeVoice !== voice);
    }, Math.ceil((options.delay || 0) * 1000 + duration * 1000 + 120));

    return true;
  }

  registerVoice(voice) {
    this.activeVoices.push(voice);

    while (this.activeVoices.length > this.maxConcurrentSfx) {
      const oldestVoice = this.activeVoices.shift();
      oldestVoice?.stop();
    }
  }

  synthesizeSound(soundName, context, output, startAt) {
    const synths = {
      card_throw: () => this.synthSwoosh(context, output, startAt),
      card_land: () => this.synthTap(context, output, startAt),
      card_draw: () => this.synthSlide(context, output, startAt),
      deck_shuffle: () => this.synthShuffle(context, output, startAt),
      card_function: () => this.synthFunctionHit(context, output, startAt),
      turn_ping: () => this.synthPing(context, output, startAt),
      makao: () => this.synthMakao(context, output, startAt),
      round_win: () => this.synthFanfare(context, output, startAt),
      illegal_move: () => this.synthError(context, output, startAt)
    };

    return (synths[soundName] || synths.card_land)();
  }

  synthNoise(context, output, startAt, {
    duration,
    seed,
    filterType = 'bandpass',
    frequency = 1200,
    q = 0.8,
    peak = 0.35,
    attack = 0.012,
    release = duration
  }) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    source.buffer = createNoiseBuffer(context, duration, seed);
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, startAt);
    filter.Q.setValueAtTime(q, startAt);
    rampGain(gain, startAt, peak, attack, startAt + release, startAt + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start(startAt);
    source.stop(startAt + duration + 0.02);
  }

  synthTone(context, output, startAt, {
    type = 'sine',
    frequency = 440,
    endFrequency = frequency,
    duration = 0.2,
    peak = 0.25,
    attack = 0.012,
    release = duration
  }) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    if (endFrequency !== frequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), startAt + duration);
    }

    rampGain(gain, startAt, peak, attack, startAt + release, startAt + duration);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }

  synthSwoosh(context, output, startAt) {
    this.synthNoise(context, output, startAt, {
      duration: 0.42,
      seed: 'card_throw',
      filterType: 'bandpass',
      frequency: 1800,
      q: 0.9,
      peak: 0.22,
      attack: 0.035,
      release: 0.36
    });
    return 0.42;
  }

  synthTap(context, output, startAt) {
    this.synthNoise(context, output, startAt, {
      duration: 0.09,
      seed: 'card_land',
      filterType: 'highpass',
      frequency: 1500,
      peak: 0.16,
      attack: 0.003,
      release: 0.06
    });
    this.synthTone(context, output, startAt, {
      type: 'triangle',
      frequency: 180,
      endFrequency: 95,
      duration: 0.08,
      peak: 0.08,
      attack: 0.002,
      release: 0.07
    });
    return 0.12;
  }

  synthSlide(context, output, startAt) {
    this.synthNoise(context, output, startAt, {
      duration: 0.28,
      seed: 'card_draw',
      filterType: 'bandpass',
      frequency: 900,
      q: 1.4,
      peak: 0.18,
      attack: 0.018,
      release: 0.24
    });
    return 0.3;
  }

  synthShuffle(context, output, startAt) {
    const hits = [0, 0.045, 0.09, 0.145, 0.19, 0.245, 0.31, 0.37, 0.44, 0.52];
    hits.forEach((offset, index) => {
      this.synthNoise(context, output, startAt + offset, {
        duration: 0.08,
        seed: `shuffle_${index}`,
        filterType: 'highpass',
        frequency: 850 + index * 80,
        peak: 0.09,
        attack: 0.004,
        release: 0.055
      });
    });
    return 0.64;
  }

  synthFunctionHit(context, output, startAt) {
    this.synthTone(context, output, startAt, {
      type: 'triangle',
      frequency: 146,
      endFrequency: 82,
      duration: 0.22,
      peak: 0.18,
      attack: 0.006,
      release: 0.2
    });
    this.synthTone(context, output, startAt + 0.035, {
      type: 'sine',
      frequency: 740,
      endFrequency: 980,
      duration: 0.18,
      peak: 0.12,
      attack: 0.01,
      release: 0.17
    });
    return 0.28;
  }

  synthPing(context, output, startAt) {
    this.synthTone(context, output, startAt, {
      type: 'sine',
      frequency: 660,
      endFrequency: 880,
      duration: 0.22,
      peak: 0.16,
      attack: 0.015,
      release: 0.2
    });
    return 0.24;
  }

  synthMakao(context, output, startAt) {
    this.synthTone(context, output, startAt, {
      type: 'sine',
      frequency: 587,
      endFrequency: 659,
      duration: 0.22,
      peak: 0.2,
      attack: 0.012,
      release: 0.2
    });
    this.synthTone(context, output, startAt + 0.16, {
      type: 'sine',
      frequency: 784,
      endFrequency: 1046,
      duration: 0.34,
      peak: 0.18,
      attack: 0.012,
      release: 0.32
    });
    return 0.55;
  }

  synthFanfare(context, output, startAt) {
    const melody = [
      ['C5', 0, 0.2],
      ['E5', 0.2, 0.2],
      ['G5', 0.4, 0.22],
      ['C5', 0.7, 0.18],
      ['G5', 0.88, 0.36],
      ['E5', 1.22, 0.28],
      ['G5', 1.5, 0.46]
    ];

    melody.forEach(([note, offset, duration]) => {
      this.synthTone(context, output, startAt + offset, {
        type: 'triangle',
        frequency: noteToFrequency(note),
        duration,
        peak: 0.13,
        attack: 0.014,
        release: duration * 0.86
      });
    });
    return 2.05;
  }

  synthError(context, output, startAt) {
    this.synthTone(context, output, startAt, {
      type: 'sawtooth',
      frequency: 118,
      endFrequency: 88,
      duration: 0.32,
      peak: 0.2,
      attack: 0.006,
      release: 0.3
    });
    this.synthTone(context, output, startAt + 0.075, {
      type: 'square',
      frequency: 94,
      endFrequency: 74,
      duration: 0.22,
      peak: 0.08,
      attack: 0.006,
      release: 0.2
    });
    return 0.36;
  }
}

const audioManager = new AudioManager();

export { SOUND_ALIASES, AudioManager };
export default audioManager;
