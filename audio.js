(function () {
  'use strict';

  var context, assets, active;
  var generation = 0;
  var beat = 0.75; // A gentle 80 BPM waltz.
  var reverbLength = 1.65;

  function dispose(session) {
    if (!session || session.disposed) return;
    session.disposed = true;
    session.sources.forEach(function (source) {
      source.onended = null;
      try { source.stop(); } catch (_) {}
    });
    session.nodes.forEach(function (node) { node.disconnect(); });
    session.sources.clear();
    session.nodes.clear();
    if (active === session) active = null;
  }

  function stop() {
    generation += 1;
    dispose(active);
  }

  function own(session, node) {
    session.nodes.add(node);
    return node;
  }

  function source(session, node, owned, start, end) {
    own(session, node);
    session.sources.add(node);
    session.lastEnd = Math.max(session.lastEnd, end);
    node.onended = function () {
      if (session.disposed || !session.sources.delete(node)) return;
      [node].concat(owned).forEach(function (item) {
        item.disconnect();
        session.nodes.delete(item);
      });
    };
    node.start(start);
    node.stop(end);
  }

  function prepareAssets() {
    var seed = 92741;
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 2147483648 - 1;
    }
    var impulse = context.createBuffer(2, Math.ceil(context.sampleRate * reverbLength), context.sampleRate);
    for (var channel = 0; channel < 2; channel += 1) {
      var data = impulse.getChannelData(channel);
      var smooth = 0;
      for (var i = 0; i < data.length; i += 1) {
        smooth = smooth * 0.64 + random() * 0.36;
        data[i] = smooth * Math.exp(-5.7 * i / data.length);
      }
      [0.023, 0.047, 0.081].forEach(function (delay, index) {
        data[Math.floor((delay + channel * 0.003) * context.sampleRate)] += 0.65 / (index + 1);
      });
    }
    var noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.15), context.sampleRate);
    var noiseData = noise.getChannelData(0);
    for (var n = 0; n < noiseData.length; n += 1) noiseData[n] = random();
    return {
      impulse: impulse,
      noise: noise,
      piano: context.createPeriodicWave(new Float32Array(7), new Float32Array([0, 1, 0.3, 0.13, 0.065, 0.025, 0.012])),
      mellow: context.createPeriodicWave(new Float32Array(4), new Float32Array([0, 1, 0.13, 0.035]))
    };
  }

  function graph(run) {
    var session = { id: run, nodes: new Set(), sources: new Set(), lastEnd: 0, disposed: false };
    active = session;
    session.bus = own(session, context.createGain());
    session.master = own(session, context.createGain());
    var dry = own(session, context.createGain());
    var wet = own(session, context.createGain());
    var room = own(session, context.createConvolver());
    var damping = own(session, context.createBiquadFilter());
    var compressor = own(session, context.createDynamicsCompressor());
    dry.gain.value = 0.92;
    wet.gain.value = 0.25;
    session.master.gain.value = 0.64;
    room.buffer = assets.impulse;
    damping.type = 'lowpass';
    damping.frequency.value = 6200;
    compressor.threshold.value = -18;
    compressor.knee.value = 14;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.18;
    session.bus.connect(dry).connect(session.master);
    session.bus.connect(damping).connect(room).connect(wet).connect(session.master);
    session.master.connect(compressor).connect(context.destination);
    return session;
  }

  function tone(session, midi, time, length, level, kind, pan, release) {
    var oscillator = context.createOscillator();
    var envelope = own(session, context.createGain());
    var owned = [envelope];
    if (kind === 'piano' || kind === 'mellow') oscillator.setPeriodicWave(assets[kind]);
    else oscillator.type = 'sine';
    oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(level, time + 0.008);
    envelope.gain.exponentialRampToValueAtTime(level * 0.52, time + Math.min(0.16, length * 0.45));
    envelope.gain.exponentialRampToValueAtTime(level * 0.19, time + length);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + length + release);
    oscillator.connect(envelope);
    if (context.createStereoPanner) {
      var panner = own(session, context.createStereoPanner());
      panner.pan.value = pan || 0;
      envelope.connect(panner).connect(session.bus);
      owned.push(panner);
    } else envelope.connect(session.bus);
    source(session, oscillator, owned, time, time + length + release + 0.025);
  }

  function brush(session, time, level, isPop) {
    var noise = context.createBufferSource();
    var filter = own(session, context.createBiquadFilter());
    var envelope = own(session, context.createGain());
    noise.buffer = assets.noise;
    filter.type = isPop ? 'lowpass' : 'bandpass';
    filter.frequency.setValueAtTime(isPop ? 2800 : 3500, time);
    filter.Q.value = 0.65;
    if (isPop) filter.frequency.exponentialRampToValueAtTime(350, time + 0.12);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(level, time + 0.003);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + (isPop ? 0.13 : 0.075));
    noise.connect(filter).connect(envelope).connect(session.bus);
    source(session, noise, [filter, envelope], time, time + 0.15);
    if (isPop) {
      var bubble = context.createOscillator();
      var shape = own(session, context.createGain());
      bubble.frequency.setValueAtTime(430, time);
      bubble.frequency.exponentialRampToValueAtTime(85, time + 0.13);
      shape.gain.setValueAtTime(0, time);
      shape.gain.linearRampToValueAtTime(0.19, time + 0.004);
      shape.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
      bubble.connect(shape).connect(session.bus);
      source(session, bubble, [shape], time, time + 0.15);
    }
  }

  function arrange(session) {
    var origin = context.currentTime;
    var now = origin + 0.025;
    var start = now + 0.25;
    brush(session, now, 0.22, true);
    var melody = [
      [67,.75],[67,.25],[69,1],[67,1],[72,1],[71,2],
      [67,.75],[67,.25],[69,1],[67,1],[74,1],[72,2],
      [67,.75],[67,.25],[79,1],[76,1],[72,1],[71,1],[69,1],
      [77,.75],[77,.25],[76,1],[72,1],[74,1],[72,2]
    ];
    var position = 0;
    melody.forEach(function (note, index) {
      var time = start + position * beat;
      var emphasis = note[1] < 1 ? 0.85 : 1;
      tone(session, note[0], time, note[1] * beat * 0.86, 0.205 * emphasis, 'piano', -0.04, 0.48);
      tone(session, note[0] + 12, time + 0.006, 0.085, 0.027 * emphasis, 'sine', 0.12, 0.55);
      if (index === 12 || index === 19) tone(session, note[0] + 24, time, 0.06, 0.011, 'sine', 0.3, 0.65);
      position += note[1];
    });

    var chords = [
      [1,36,[48,55,60,64]],[4,43,[50,53,59,62]],
      [7,43,[50,53,59,62]],[10,36,[48,55,60,64]],
      [13,36,[48,55,60,64]],[16,43,[50,53,59,62]],
      [18,41,[48,53,57,60]],[19,43,[48,55,60,64]],
      [21,43,[50,53,59,62]],[22,36,[48,55,60,64,67]]
    ];
    chords.forEach(function (chord, chordIndex) {
      var time = start + chord[0] * beat;
      var final = chordIndex === chords.length - 1;
      tone(session, chord[1], time, final ? 1.4 : 0.65, 0.088, 'sine', -0.12, 0.55);
      chord[2].forEach(function (midi, index) {
        tone(session, midi, time + index * 0.055, final ? 1.05 : 0.48,
          final ? 0.038 : 0.03, 'mellow', -0.38 + index * 0.18, final ? 0.95 : 0.6);
      });
    });
    for (var tick = 2; tick < 22; tick += 1) {
      brush(session, start + tick * beat, tick % 3 === 1 ? 0.009 : 0.016, false);
    }
    // A final C-major music-box flourish, followed by the room's natural tail.
    [72,76,79,84].forEach(function (midi, index) {
      tone(session, midi, start + 23.25 * beat + index * 0.12, 0.08,
        0.036 - index * 0.004, 'sine', -0.3 + index * 0.2, 1.0);
    });
    var end = session.lastEnd + reverbLength + 0.12;
    session.master.gain.setValueAtTime(0.64, end - 0.75);
    session.master.gain.linearRampToValueAtTime(0, end);

    // An audio-clock sentinel cleans the graph without timers or stale callbacks.
    var sentinel = own(session, context.createBufferSource());
    sentinel.buffer = context.createBuffer(1, 1, context.sampleRate);
    sentinel.connect(session.bus);
    session.sources.add(sentinel);
    sentinel.onended = function () {
      if (generation === session.id && active === session) dispose(session);
    };
    sentinel.start(end);
    return { duration: Math.ceil((end - origin) * 1000) / 1000 };
  }

  function play() {
    stop();
    var run = generation;
    var ready;
    try {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Web Audio is not supported by this browser.');
      if (!context || context.state === 'closed') {
        context = new AudioContext();
        assets = null;
      }
      // Preserve user activation: do not move this resume behind an await.
      ready = context.resume();
    } catch (error) { return Promise.reject(error); }
    return Promise.resolve(ready).then(function () {
      if (run !== generation) return { cancelled: true, duration: 0 };
      if (context.state !== 'running') throw new Error('Browser audio could not start.');
      if (!assets) assets = prepareAssets();
      return arrange(graph(run));
    }).catch(function (error) {
      if (run === generation) stop();
      throw error;
    });
  }

  window.BirthdayAudio = { play: play, stop: stop };
}());
