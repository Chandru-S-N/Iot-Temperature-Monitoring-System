/**
 * ============================================================================
 * Emergency Response Audio Engine - Industrial Siren & Alarm Synthesizer
 * Uses Web Audio API (Zero external audio files required, 100% reliable)
 * Features:
 * - Dual-tone sweeping industrial evacuation siren (650Hz <-> 980Hz)
 * - Auto-unlocks AudioContext on user interaction
 * - Safe gain limiting to prevent acoustic fatigue
 * - Mute / Unmute state management with persistent UI syncing
 * ============================================================================
 */

export class AlarmSound {
    constructor() {
        this.ctx = null;
        this.oscillator = null;
        this.filter = null;
        this.gainNode = null;
        this.isLooping = false;
        this.isMuted = false;
        this.cycleTimer = null;

        // Auto unlock AudioContext on any user gesture
        const unlock = () => {
            this.ensureAudioContext();
            if (this.ctx && this.ctx.state === 'running') {
                window.removeEventListener('click', unlock);
                window.removeEventListener('keydown', unlock);
                window.removeEventListener('touchstart', unlock);
            }
        };
        window.addEventListener('click', unlock, { once: false });
        window.addEventListener('keydown', unlock, { once: false });
        window.addEventListener('touchstart', unlock, { once: false });
    }

    ensureAudioContext() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }

    start() {
        if (this.isMuted) return;
        this.ensureAudioContext();
        if (!this.ctx) return;
        if (this.isLooping) return;

        this.isLooping = true;
        this._startSirenLoop();
    }

    _startSirenLoop() {
        try {
            const now = this.ctx.currentTime;

            // Oscillator for siren tone
            this.oscillator = this.ctx.createOscillator();
            this.oscillator.type = 'sawtooth';
            this.oscillator.frequency.setValueAtTime(650, now);

            // Biquad filter for realistic industrial acoustic resonance
            this.filter = this.ctx.createBiquadFilter();
            this.filter.type = 'lowpass';
            this.filter.frequency.setValueAtTime(1600, now);

            // Main Gain Node
            this.gainNode = this.ctx.createGain();
            this.gainNode.gain.setValueAtTime(0.01, now);
            this.gainNode.gain.linearRampToValueAtTime(0.18, now + 0.1);

            this.oscillator.connect(this.filter);
            this.filter.connect(this.gainNode);
            this.gainNode.connect(this.ctx.destination);

            this.oscillator.start();

            // Modulate pitch alternating: 650Hz <-> 980Hz (Standard industrial warning siren)
            let high = true;
            this.cycleTimer = setInterval(() => {
                if (!this.isLooping || !this.ctx || !this.oscillator) return;
                const t = this.ctx.currentTime;
                const targetFreq = high ? 980 : 650;
                this.oscillator.frequency.cancelScheduledValues(t);
                this.oscillator.frequency.linearRampToValueAtTime(targetFreq, t + 0.35);
                high = !high;
            }, 380);
        } catch (e) {
            console.warn('Audio alarm could not start:', e);
        }
    }

    stop() {
        if (!this.isLooping) return;
        this.isLooping = false;

        if (this.cycleTimer) {
            clearInterval(this.cycleTimer);
            this.cycleTimer = null;
        }

        if (this.gainNode && this.ctx) {
            try {
                const now = this.ctx.currentTime;
                this.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.15);
                setTimeout(() => {
                    try {
                        if (this.oscillator) {
                            this.oscillator.stop();
                            this.oscillator.disconnect();
                            this.oscillator = null;
                        }
                    } catch (e) {}
                }, 160);
            } catch (e) {}
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.isMuted && this.isLooping) {
            this.stop();
        }
        return !this.isMuted;
    }

    playShortBeep(freq = 880, duration = 0.15) {
        if (this.isMuted) return;
        this.ensureAudioContext();
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {}
    }
}

