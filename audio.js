// Resilient, procedural Web Audio foundation. No context is created before a user gesture.
(function (global) {
  const SETTINGS_KEY = "canva-war-settings";
  const DEFAULT_SETTINGS = Object.freeze({ masterMuted: false, masterVolume: 0.75, sfxVolume: 0.75 });
  const CUES = Object.freeze({
    playerFire: [520, 0.035, "square", 0], weaponHit: [170, 0.04, "triangle", 1], enemyKill: [240, 0.08, "sawtooth", 1],
    playerDamage: [95, 0.16, "sawtooth", 4], levelUp: [760, 0.20, "sine", 4], waveComing: [330, 0.32, "square", 5],
    enemyIntroduction: [440, 0.18, "sine", 4], bossIncoming: [70, 0.55, "sawtooth", 6], death: [110, 0.60, "triangle", 6],
    victory: [880, 0.65, "sine", 6], interceptorTelegraph: [610, 0.15, "square", 5], interceptorCharge: [180, 0.12, "sawtooth", 4],
    tankSlamTelegraph: [130, 0.26, "sine", 5], tankSlamImpact: [65, 0.28, "square", 5], gunnerBurst: [410, 0.08, "square", 2],
    artilleryWarning: [740, 0.35, "sine", 5], artilleryImpact: [55, 0.34, "sawtooth", 5], denierCast: [280, 0.20, "triangle", 3],
    supportLinkOn: [660, 0.12, "sine", 2], supportLinkOff: [390, 0.10, "sine", 2], trapperArm: [820, 0.08, "square", 2],
    trapperTrigger: [150, 0.20, "square", 4], tetherConnect: [560, 0.15, "sine", 3], tetherBreak: [220, 0.12, "triangle", 3],
    scatterFire: [260, 0.07, "sawtooth", 2], piercerFire: [690, 0.09, "square", 2],
    piercerHit: [115, 0.08, "triangle", 2], burstFire: [470, 0.055, "square", 2],
    launcherFire: [145, 0.16, "sawtooth", 3], launcherExplosion: [58, 0.25, "square", 4],
    arcBladeSweep: [780, 0.14, "sawtooth", 3], weaponSwitch: [620, 0.06, "sine", 1]
  });
  const LIMITS = Object.freeze({ defaultConcurrency: 4, lowConcurrency: 2, globalConcurrency: 12, retrigger: 0.035 });

  function loadSettings(storage = global.localStorage) {
    try {
      const value = JSON.parse(storage?.getItem(SETTINGS_KEY));
      if (!value || typeof value !== "object") return { ...DEFAULT_SETTINGS };
      const masterVolume = Number(value.masterVolume), sfxVolume = Number(value.sfxVolume);
      return { masterMuted: Boolean(value.masterMuted),
        masterVolume: Number.isFinite(masterVolume) ? Math.max(0, Math.min(1, masterVolume)) : DEFAULT_SETTINGS.masterVolume,
        sfxVolume: Number.isFinite(sfxVolume) ? Math.max(0, Math.min(1, sfxVolume)) : DEFAULT_SETTINGS.sfxVolume };
    } catch { return { ...DEFAULT_SETTINGS }; }
  }

  function createAudioManager(options = {}) {
    const storage = options.storage ?? global.localStorage;
    const settings = loadSettings(storage);
    let context = null, master = null, sfx = null, music = null;
    const active = new Map(), lastPlayed = new Map();
    let activeVoices = [];
    const AudioContextClass = options.AudioContext || global.AudioContext || global.webkitAudioContext;

    function persist() { try { storage?.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* optional */ } }
    function apply() {
      if (!master || !sfx) return;
      master.gain.value = settings.masterMuted ? 0 : settings.masterVolume;
      sfx.gain.value = settings.sfxVolume;
    }
    async function unlock() {
      try {
        if (!context) {
          if (!AudioContextClass) return false;
          context = new AudioContextClass();
          master = context.createGain(); sfx = context.createGain(); music = context.createGain();
          sfx.connect(master); music.connect(master); master.connect(context.destination); apply();
        }
        if (context.state === "suspended") await context.resume();
        return context.state === "running";
      } catch { return false; }
    }
    function setSettings(next) {
      if (Object.hasOwn(next, "masterMuted")) settings.masterMuted = Boolean(next.masterMuted);
      for (const key of ["masterVolume", "sfxVolume"]) if (Object.hasOwn(next, key)) {
        settings[key] = Math.max(0, Math.min(1, Number(next[key]) || 0));
      }
      apply(); persist(); return { ...settings };
    }
    function play(name, options = {}) {
      try {
        const cue = CUES[name];
        if (!cue || !context || context.state !== "running" || settings.masterMuted) return false;
        const now = context.currentTime;
        activeVoices = activeVoices.filter(voice => voice.end > now);
        const retrigger = options.retrigger ?? LIMITS.retrigger;
        if (now - (lastPlayed.get(name) ?? -Infinity) < retrigger) return false;
        const concurrency = options.concurrency ?? (cue[3] <= 1 ? LIMITS.lowConcurrency : LIMITS.defaultConcurrency);
        const voices = active.get(name) || [];
        const living = voices.filter(end => end > now);
        if (living.length >= concurrency) return false;
        const priority = options.priority ?? cue[3];
        if (activeVoices.length >= LIMITS.globalConcurrency) {
          const lowest = activeVoices.reduce((candidate, voice) =>
            voice.priority < candidate.priority ? voice : candidate, activeVoices[0]);
          if (!lowest || priority <= lowest.priority) return false;
          try { lowest.oscillator.stop(now); } catch { /* An already-ended voice is harmless. */ }
          activeVoices = activeVoices.filter(voice => voice !== lowest);
        }
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        let destination = sfx;
        if (options.world && typeof context.createStereoPanner === "function") {
          const panner = context.createStereoPanner();
          panner.pan.value = Math.max(-1, Math.min(1, options.pan || 0));
          gain.connect(panner); panner.connect(sfx); destination = null;
        }
        if (destination) gain.connect(destination);
        oscillator.connect(gain); oscillator.type = cue[2]; oscillator.frequency.value = cue[0];
        const volume = Math.max(0, Math.min(1, options.volume ?? 0.16));
        gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(0.0001, now + cue[1]);
        oscillator.start(now); oscillator.stop(now + cue[1]);
        living.push(now + cue[1]); active.set(name, living); lastPlayed.set(name, now);
        activeVoices.push({ oscillator, end: now + cue[1], priority });
        return true;
      } catch { return false; }
    }
    return Object.freeze({ unlock, play, setSettings, getSettings: () => ({ ...settings }),
      isUnlocked: () => Boolean(context && context.state === "running"), cues: CUES,
      buses: () => ({ master, sfx, music }) });
  }

  const api = Object.freeze({ SETTINGS_KEY, DEFAULT_SETTINGS, CUES, LIMITS, loadSettings, createAudioManager });
  global.CanvaWarAudio = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
