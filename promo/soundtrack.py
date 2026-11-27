#!/usr/bin/env python3
"""Original soundtrack for the CAPTION.Ninja promo video.

Everything is synthesised from scratch (no samples): a 120 BPM track in D major whose
sections follow the video's scenes, plus sound effects placed from the cue list that
index.html exports (window.__sfx). render.mjs runs this automatically.

usage: python3 soundtrack.py cues.json out.wav
needs: numpy, scipy
"""
import json
import sys

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
BPM = 120
BEAT = 60 / BPM            # 0.5 s
BAR = 4 * BEAT             # 2 s
DUR = 114.0
N = int(SR * DUR)
rng = np.random.default_rng(20260929)


# ---------------------------------------------------------------- helpers
def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def stereo(x, pan=0.0):
    """equal-power pan, pan in [-1, 1]"""
    a = (pan + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


def add(bus, at, x, gain=1.0, pan=0.0):
    if x.ndim == 1:
        x = stereo(x, pan)
    i = int(round(at * SR))
    if i >= len(bus):
        return
    if i < 0:
        x = x[-i:]
        i = 0
    j = min(len(bus), i + len(x))
    bus[i:j] += x[: j - i] * gain


def sos_lp(fc, order=2):
    return signal.butter(order, min(fc, SR * 0.45), 'low', fs=SR, output='sos')


def sos_hp(fc, order=2):
    return signal.butter(order, fc, 'high', fs=SR, output='sos')


def sos_bp(lo, hi, order=2):
    return signal.butter(order, [lo, min(hi, SR * 0.45)], 'band', fs=SR, output='sos')


def filt(sos, x):
    return signal.sosfilt(sos, x, axis=0)


def sweep_lp(x, f0, f1, block=1024):
    """low-pass whose cutoff glides exponentially from f0 to f1 across x"""
    out = np.zeros_like(x)
    zi = None
    nb = max(1, int(np.ceil(len(x) / block)))
    for b in range(nb):
        fc = f0 * (f1 / f0) ** (b / max(1, nb - 1))
        sos = sos_lp(fc)
        seg = x[b * block:(b + 1) * block]
        if zi is None:
            zi = np.zeros((sos.shape[0], 2) + seg.shape[1:])
        y, zi = signal.sosfilt(sos, seg, axis=0, zi=zi)
        out[b * block:(b + 1) * block] = y
    return out


def saw(f, n, phase0=0.0):
    """PolyBLEP band-limited sawtooth at constant frequency"""
    dt = f / SR
    ph = (phase0 + dt * np.arange(n)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    p = ph[m] / dt
    y[m] -= p + p - p * p - 1
    m = ph > 1 - dt
    p = (ph[m] - 1) / dt
    y[m] -= p * p + p + p + 1
    return y


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.1, hold=None):
    """envelope of n samples; the note is held for `hold` seconds then released"""
    t = tt(n)
    hold = (n / SR - r) if hold is None else hold
    env = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = t > hold
    if rel.any():
        at_rel = env[np.argmax(rel)] if np.argmax(rel) > 0 else s
        env[rel] = at_rel * np.exp(-(t[rel] - hold) / max(r / 4, 1e-6))
    return env


# ---------------------------------------------------------------- arrangement
CH = {  # bass root, pad voicing, arp tones
    'D': (38, [57, 62, 66, 69, 74], [74, 78, 81, 86]),
    'A': (33, [57, 61, 64, 69, 73], [69, 73, 76, 81]),
    'Bm': (35, [59, 62, 66, 71, 74], [71, 74, 78, 83]),
    'G': (31, [59, 62, 67, 71, 74], [67, 71, 74, 79]),
}
LOOP = ['D', 'A', 'Bm', 'G']


def chord_at(bar):
    if bar <= 4:
        return ['Bm', 'G', 'D', 'A', 'A'][bar]
    if 5 <= bar <= 26:
        return LOOP[(bar - 5) % 4]
    if 27 <= bar <= 30:
        return ['Bm', 'G', 'D', 'A'][bar - 27]
    if 31 <= bar <= 32:
        return ['G', 'A'][bar - 31]
    if 33 <= bar <= 48:
        return LOOP[(bar - 33) % 4]
    if 49 <= bar <= 52:
        return ['Bm', 'G', 'D', 'A'][bar - 49]
    return ['D', 'A', 'D', 'D'][min(bar - 53, 3)]


def section(bar):
    if bar <= 4:
        return 'intro'
    if bar <= 10:
        return 'dropA'
    if bar <= 19:
        return 'tutorial'
    if bar <= 26:
        return 'dropA2'
    if bar <= 30:
        return 'breakdown'
    if bar <= 32:
        return 'build'
    if bar <= 44:
        return 'dropB'
    if bar <= 48:
        return 'dropB2'
    if bar <= 52:
        return 'reveal'
    if bar <= 54:
        return 'final'
    return 'outro'


DRUMS = {'dropA', 'tutorial', 'dropA2', 'dropB', 'dropB2', 'final'}
LEAD = {'dropA', 'dropA2', 'dropB', 'final'}
NBARS = int(DUR / BAR)

# ---------------------------------------------------------------- instruments
def kick():
    n = int(SR * 0.42)
    t = tt(n)
    f = 46 + 130 * np.exp(-t * 36)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.0)
    click = filt(sos_hp(1500), rng.standard_normal(n)) * np.exp(-t * 500) * 0.35
    return np.tanh(1.8 * (body + click)) * 0.95


def clap():
    n = int(SR * 0.4)
    t = tt(n)
    noise = filt(sos_bp(800, 3000), rng.standard_normal(n))
    env = np.zeros(n)
    for d in (0.0, 0.012, 0.024):
        m = t >= d
        env[m] += np.exp(-(t[m] - d) * 140)
    m = t >= 0.03
    env[m] += 0.45 * np.exp(-(t[m] - 0.03) * 16)
    return noise * env * 0.9


def snare(level=1.0):
    n = int(SR * 0.25)
    t = tt(n)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 30)
    noise = filt(sos_bp(1200, 8000), rng.standard_normal(n)) * np.exp(-t * 22)
    return (tone * 0.5 + noise * 0.8) * level


def hat(open_=False):
    n = int(SR * (0.28 if open_ else 0.07))
    t = tt(n)
    x = filt(sos_hp(7000, 3), rng.standard_normal(n))
    return x * np.exp(-t * (13 if open_ else 85))


def bass_note(root, dur):
    n = int(SR * dur)
    f = midi(root + 12)
    x = saw(f, n) * 0.55 + saw(f * 1.004, n) * 0.35
    x = filt(sos_lp(520, 2), x)
    sub = np.sin(2 * np.pi * midi(root) * tt(n)) * 0.75
    env = adsr(n, a=0.004, d=0.12, s=0.75, r=0.05)
    return (x + sub) * env


def pad_chord(notes, dur, bright=1600):
    n = int(SR * dur)
    out = np.zeros((n, 2))
    for i, m in enumerate(notes):
        f = midi(m)
        for det, pan in ((-0.0045, -0.6), (0.0045, 0.6), (0.0, 0.0)):
            v = saw(f * (1 + det), n, rng.random())
            out += stereo(v, pan * (0.5 + 0.1 * i)) * 0.33
    out = filt(sos_lp(bright, 2), out)
    env = adsr(n, a=0.35, d=0.6, s=0.85, r=0.5)
    return out * env[:, None] / len(notes)


def pluck(m, dur=0.32, bright=4200):
    n = int(SR * dur)
    t = tt(n)
    f = midi(m)
    x = saw(f, n) * 0.6 + np.sign(np.sin(2 * np.pi * f * t)) * 0.25
    x = filt(sos_lp(bright, 2), x)
    return x * np.exp(-t * 16) * np.minimum(1, t / 0.002)


def lead_note(m, dur):
    n = int(SR * (dur + 0.25))
    t = tt(n)
    f = midi(m) * (1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(1, t / 0.25))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * 0.6 + np.sign(np.sin(ph)) * 0.18 + np.sin(2 * ph) * 0.15
    x = filt(sos_lp(3800, 2), x)
    return x * adsr(n, a=0.012, d=0.25, s=0.6, r=0.22, hold=dur)


def bell(m, dur=2.2):
    n = int(SR * dur)
    t = tt(n)
    f = midi(m)
    x = np.zeros(n)
    for ratio, amp, dec in ((1, 1, 1.6), (2.0, 0.35, 2.4), (2.76, 0.28, 3.5), (5.4, 0.12, 6), (8.93, 0.06, 9)):
        x += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * dec)
    return x * np.minimum(1, t / 0.003) * 0.4


# ---------------------------------------------------------------- sound effects
def fx_whoosh(dur=0.7, lo=300, hi=2600, level=1.0):
    n = int(SR * dur)
    t = tt(n)
    x = rng.standard_normal(n)
    cen = lo * (hi / lo) ** np.sin(np.pi * np.clip(t / dur, 0, 1))
    out = np.zeros(n)
    blk = 512
    zi = None
    for b in range(0, n, blk):
        c = cen[b]
        sos = sos_bp(max(60, c * 0.6), c * 1.6)
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        y, zi = signal.sosfilt(sos, x[b:b + blk], zi=zi)
        out[b:b + blk] = y
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    pan = np.linspace(-0.8, 0.8, n)
    a = (pan + 1) * np.pi / 4
    s = out * env * level
    return np.stack([s * np.cos(a), s * np.sin(a)], axis=1)


def fx_slash():
    # a quick air swipe into a metallic "shing"
    sw = fx_whoosh(0.22, 900, 7000, 0.9)
    n = int(SR * 1.6)
    t = tt(n)
    ring = np.zeros(n)
    for f, a, d in ((2489, 0.5, 2.2), (3322, 0.42, 2.8), (4435, 0.3, 3.3), (5920, 0.2, 4.2), (7040, 0.12, 5.5)):
        ring += a * np.sin(2 * np.pi * f * t * (1 + 0.0015 * np.sin(2 * np.pi * 7 * t))) * np.exp(-t * d)
    ring *= np.minimum(1, t / 0.004) * 0.55
    out = np.zeros((int(SR * 1.9), 2))
    out[: len(sw)] += sw
    i = int(SR * 0.19)
    out[i:i + n] += np.stack([ring, np.roll(ring, 90)], axis=1)
    return out


def fx_impact():
    n = int(SR * 1.8)
    t = tt(n)
    f = 38 + 50 * np.exp(-t * 6)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.6)
    crash = filt(sos_hp(2500), rng.standard_normal(n)) * np.exp(-t * 3.2) * 0.22
    thump = filt(sos_lp(900), rng.standard_normal(n)) * np.exp(-t * 18) * 0.5
    return np.tanh(1.3 * (boom + thump + crash))


def fx_pop(level=1.0, k=0):
    n = int(SR * 0.16)
    t = tt(n)
    f0 = 880 * 2 ** ((k % 5) / 12 * 2)
    f = f0 * (0.55 + 0.45 * np.exp(-t * 40))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 26)
    return x * level * np.minimum(1, t / 0.001)


def fx_blip(level=1.0):
    n = int(SR * 0.4)
    t = tt(n)
    a = np.sin(2 * np.pi * 1318.5 * t) * np.exp(-t * 14)
    b = np.sin(2 * np.pi * 1975.5 * t) * np.exp(-np.clip(t - 0.07, 0, None) * 14) * (t > 0.07)
    return (a * 0.6 + b * 0.5) * level * np.minimum(1, t / 0.002)


def fx_click(level=1.0):
    n = int(SR * 0.03)
    t = tt(n)
    x = filt(sos_hp(2000), rng.standard_normal(n)) * np.exp(-t * 900) + np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 700) * 0.6
    return x * level


def fx_key(level=1.0):
    n = int(SR * 0.05)
    t = tt(n)
    x = filt(sos_bp(1500, 6000), rng.standard_normal(n)) * np.exp(-t * 500) * 0.7
    x += np.sin(2 * np.pi * 160 * t) * np.exp(-t * 120) * 0.5
    return x * level


def fx_type(level=1.0, count=9):
    out = np.zeros(int(SR * 1.0))
    at = 0.0
    for _ in range(count):
        k_ = fx_key(level * (0.6 + 0.4 * rng.random()))
        i = int(at * SR)
        out[i:i + len(k_)] += k_[: len(out) - i]
        at += 0.06 + rng.random() * 0.05
    return out


def fx_ding(level=1.0):
    n = int(SR * 1.2)
    t = tt(n)
    x = np.sin(2 * np.pi * 1760 * t) * np.exp(-t * 5) + 0.5 * np.sin(2 * np.pi * 2637 * t) * np.exp(-t * 7)
    y = np.sin(2 * np.pi * 2349 * t) * np.exp(-np.clip(t - 0.09, 0, None) * 5) * (t > 0.09)
    return (x * 0.45 + y * 0.4) * level * np.minimum(1, t / 0.002)


def fx_confetti(level=1.0):
    n = int(SR * 1.2)
    t = tt(n)
    pop = filt(sos_bp(300, 4000), rng.standard_normal(n)) * np.exp(-t * 45) * 0.8
    pop += np.sin(2 * np.pi * 120 * t) * np.exp(-t * 30) * 0.6
    out = stereo(pop)
    for _ in range(14):
        at = 0.05 + rng.random() * 0.8
        f = 2500 + rng.random() * 3500
        m = int(SR * 0.08)
        tm = tt(m)
        tw = np.sin(2 * np.pi * f * tm) * np.exp(-tm * 50) * 0.18
        add(out, at, tw, 1.0, rng.random() * 1.6 - 0.8)
    return out * level


def fx_bonk(level=1.0):
    n = int(SR * 0.3)
    t = tt(n)
    f = 330 * (0.62 + 0.38 * np.exp(-t * 18))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = (np.sin(ph) * 0.7 + np.sign(np.sin(ph)) * 0.12) * np.exp(-t * 11)
    return filt(sos_lp(2500), x) * level


def riser(dur, level=1.0):
    n = int(SR * dur)
    t = tt(n)
    x = sweep_lp(rng.standard_normal((n, 2)), 300, 9000)
    f = 180 * (8 ** (t / dur))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.15
    env = (t / dur) ** 2.2
    return (x * 0.5 + tone[:, None]) * env[:, None] * level


SFX = {
    'whoosh': lambda g, k: fx_whoosh(0.7, 280, 2600, g),
    'swish': lambda g, k: fx_whoosh(0.32, 900, 5000, g * 0.8),
    'slash': lambda g, k: fx_slash() * g,
    'impact': lambda g, k: fx_impact() * g,
    'pop': lambda g, k: fx_pop(g, k),
    'blip': lambda g, k: fx_blip(g),
    'click': lambda g, k: fx_click(g),
    'key': lambda g, k: fx_key(g),
    'type': lambda g, k: fx_type(g),
    'ding': lambda g, k: fx_ding(g),
    'confetti': lambda g, k: fx_confetti(g),
    'bonk': lambda g, k: fx_bonk(g),
}


# ---------------------------------------------------------------- build
def build(cues):
    drums = np.zeros((N, 2))
    bass = np.zeros((N, 2))
    pads = np.zeros((N, 2))
    keys = np.zeros((N, 2))
    lead = np.zeros((N, 2))
    fx = np.zeros((N, 2))
    send = np.zeros((N, 2))   # reverb send

    K, C = kick(), clap()
    HC, HO = hat(False), hat(True)

    for bar in range(NBARS + 1):
        t0 = bar * BAR
        if t0 >= DUR:
            break
        sec = section(bar)
        root, voicing, tones = CH[chord_at(bar)]

        # drums
        if sec in DRUMS:
            for b in range(4):
                add(drums, t0 + b * BEAT, K, 0.95)
                if b in (1, 3):
                    add(drums, t0 + b * BEAT, C, 0.42 if sec != 'tutorial' else 0.32, 0.05)
                    add(send, t0 + b * BEAT, C, 0.12)
                add(drums, t0 + b * BEAT + BEAT / 2, HO if sec in ('dropB', 'final') else HC, 0.16, 0.25)
                if sec != 'tutorial':
                    add(drums, t0 + b * BEAT + BEAT / 4, HC, 0.07, -0.3)
                    add(drums, t0 + b * BEAT + 3 * BEAT / 4, HC, 0.07, -0.3)
            if bar in (26, 48):  # little fill before the section change
                for i in range(4):
                    add(drums, t0 + 3 * BEAT + i * BEAT / 4, snare(0.25 + i * 0.12), 1.0, 0.1)
        if sec == 'intro' and bar >= 2:
            for b in range(4):  # soft heartbeat pulse
                add(drums, t0 + b * BEAT, K, 0.18 + 0.08 * (bar - 2))
        if sec == 'breakdown':
            for e in range(8):  # soft shaker keeps the pulse without drums
                add(drums, t0 + e * BEAT / 2 + BEAT / 4, HC, 0.05 + 0.03 * (e % 2), 0.4)
        if sec == 'build':
            steps = 8 if bar == 31 else 16
            for i in range(steps):
                lvl = 0.25 + 0.6 * ((bar - 31) * steps + i) / 24
                add(drums, t0 + i * BAR / steps, snare(min(1, lvl)), 0.7, 0.1)
            for b in range(4):
                add(drums, t0 + b * BEAT, K, 0.5 + 0.1 * b)

        # bass
        if sec in DRUMS:
            for e in range(8):  # rolling eighths, ducked by the kick
                n = bass_note(root, BEAT / 2 * 0.95)
                g = 0.30 if e % 2 == 0 else 0.42
                add(bass, t0 + e * BEAT / 2, n, g)
        elif sec in ('breakdown', 'reveal', 'outro'):
            add(bass, t0, bass_note(root, BAR) * adsr(int(SR * BAR), a=0.3, d=1, s=0.8, r=0.4), 0.22 if sec != 'outro' else 0.3)
        elif sec == 'build':
            for e in range(8):
                add(bass, t0 + e * BEAT / 2, bass_note(root, BEAT / 2 * 0.9), 0.3)

        # pads
        bright = {'intro': 900 + 250 * bar, 'breakdown': 1400, 'reveal': 1100, 'build': 1500 + 1200 * (bar - 31),
                  'tutorial': 1500, 'outro': 1800}.get(sec, 2200)
        pg = {'intro': 0.5, 'tutorial': 0.36, 'breakdown': 0.72, 'reveal': 0.5, 'outro': 0.7}.get(sec, 0.45)
        if sec == 'outro':
            if bar == 55:
                p = pad_chord(voicing, 4.0, 2000) * adsr(int(SR * 4.0), a=0.02, d=1.5, s=0.7, r=1.8, hold=2.2)[:, None]
                add(pads, t0, p, pg)
                add(send, t0, p, 0.35)
        else:
            p = pad_chord(voicing, BAR + 0.5, bright)
            add(pads, t0, p, pg)
            add(send, t0, p, 0.25)

        # arp / plucks
        if sec not in ('outro',):
            pattern = [0, 2, 1, 3, 2, 1, 3, 2]
            if sec == 'reveal':
                pass
            else:
                for i in range(16):
                    if sec == 'intro' and bar == 0 and i < 8:
                        continue
                    m = tones[pattern[i % 8]] + (12 if sec in ('dropB', 'final') and i % 8 == 3 else 0)
                    g = {'intro': 0.1 + 0.02 * bar, 'breakdown': 0.19, 'build': 0.16, 'tutorial': 0.12}.get(sec, 0.13)
                    pl = pluck(m, 0.3, 2600 if sec in ('intro', 'breakdown') else 4200)
                    pan = -0.35 if i % 2 else 0.35
                    add(keys, t0 + i * BEAT / 2 / 2, pl, g, pan)
                    add(send, t0 + i * BEAT / 4, pl, g * 0.4)
                    # dotted-eighth echo
                    add(keys, t0 + i * BEAT / 4 + 0.375, pl, g * 0.35, -pan)

        # bells in the reflective sections
        if sec in ('reveal', 'breakdown'):
            mel = {49: [78, 74, 71], 50: [74, 71, 67], 51: [78, 81, 74], 52: [76, 73, 69],
                   27: [78, 74], 28: [79, 74], 29: [81, 78], 30: [76, 73]}.get(bar, [])
            for i, m in enumerate(mel):
                bl = bell(m)
                add(keys, t0 + i * (BAR / len(mel)), bl, 0.3 if sec == 'reveal' else 0.2, 0.2 * (i - 1))
                add(send, t0 + i * (BAR / len(mel)), bl, 0.3)

    # lead hook over the drops (8 bars, in beats)
    HOOK = [
        [(78, 1), (81, .5), (78, .5), (76, 1), (74, 1)],
        [(76, 1.5), (73, .5), (76, 1), (81, 1)],
        [(78, 1), (74, .5), (78, .5), (83, 1.5), (81, .5)],
        [(79, 1), (78, 1), (76, 1), (74, 1)],
        [(81, 1), (78, .5), (81, .5), (86, 1), (81, 1)],
        [(85, 1.5), (83, .5), (81, 1), (76, 1)],
        [(78, 1), (83, 1), (81, 1), (78, 1)],
        [(79, 1), (81, 1), (83, .5), (81, .5), (78, 1)],
    ]
    first = {}
    for bar in range(NBARS + 1):
        sec = section(bar)
        if sec not in LEAD:
            continue
        first.setdefault(sec, bar)
        phrase = HOOK[(bar - first[sec]) % 8]
        at = bar * BAR
        for m, beats in phrase:
            ln = lead_note(m, beats * BEAT * 0.92)
            add(lead, at, ln, 0.16, 0.1)
            add(send, at, ln, 0.08)
            add(lead, at + 0.375, ln, 0.05, -0.4)
            at += beats * BEAT

    # risers into the drops
    add(fx, 6.0, riser(4.0), 0.5)
    add(fx, 62.0, riser(4.0), 0.55)
    add(fx, 103.0, riser(3.0), 0.35)
    add(fx, 64.0, fx_whoosh(2.0, 200, 6000, 0.35))

    # sound effects from the page's cue list
    for idx, (at, name, gain) in enumerate(cues):
        if name not in SFX:
            continue
        s = SFX[name](gain, idx)
        g = {'impact': 0.85, 'slash': 0.55, 'whoosh': 0.3, 'swish': 0.22, 'pop': 0.2, 'blip': 0.16,
             'click': 0.3, 'key': 0.22, 'type': 0.2, 'ding': 0.28, 'confetti': 0.35, 'bonk': 0.3}[name]
        add(fx, at, s, g, 0.0)
        if name in ('slash', 'impact', 'ding', 'blip', 'confetti', 'pop'):
            add(send, at, s, g * 0.35)

    # sidechain: pads, bass and keys duck under each kick in drum sections
    t = tt(N)
    duck = np.ones(N)
    beat_phase = (t % BEAT)
    in_drums = np.array([section(int(x // BAR)) in DRUMS for x in np.arange(0, DUR, BEAT)])
    active = in_drums[np.minimum((t // BEAT).astype(int), len(in_drums) - 1)]
    duck[active] = 1 - 0.55 * np.exp(-beat_phase[active] * 11)
    pads *= duck[:, None]
    keys *= (0.5 + 0.5 * duck)[:, None]
    bass_duck = np.ones(N)
    bass_duck[active] = 0.35 + 0.65 * (1 - 0.8 * np.exp(-beat_phase[active] * 16))
    bass *= bass_duck[:, None]

    # reverb: convolution with a decorrelated, darkened noise tail
    rl = int(SR * 2.4)
    rt = tt(rl)
    ir = rng.standard_normal((rl, 2)) * np.exp(-rt * 2.9)[:, None]
    ir = filt(sos_lp(5500), ir)
    ir[: int(SR * 0.012)] = 0
    ir /= np.sqrt((ir ** 2).sum(axis=0))
    wet = np.stack([signal.fftconvolve(send[:, c], ir[:, c])[:N] for c in range(2)], axis=1)

    mix = drums * 0.9 + bass * 0.85 + pads * 0.8 + keys * 0.9 + lead * 0.9 + fx * 1.0 + wet * 0.55
    mix = filt(sos_hp(28), mix)

    # fades
    fade_in = np.minimum(1, t / 1.2)
    fade_out = np.clip((DUR - t) / 2.2, 0, 1) ** 1.5
    mix *= (fade_in * fade_out)[:, None]

    # gentle bus compression + soft clip
    env = np.abs(mix).max(axis=1)
    env = signal.sosfilt(sos_lp(8), env)
    target = 0.5
    gain = np.where(env > target, (target / np.maximum(env, 1e-9)) ** 0.4, 1.0)
    mix *= gain[:, None]
    mix = mix / (np.abs(mix).max() + 1e-9) * 1.05
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    mix = mix / (np.abs(mix).max() + 1e-9) * 0.89
    return mix


if __name__ == '__main__':
    cues_path, out_path = sys.argv[1], sys.argv[2]
    with open(cues_path) as f:
        cues = json.load(f)
    audio = build(cues)
    wavfile.write(out_path, SR, (audio * 32767).astype(np.int16))
    print(f'wrote {out_path}: {len(audio) / SR:.1f}s, {len(cues)} cues')
