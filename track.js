
class Track extends EventTarget {
  constructor(container, source, destination, latency) {
    super();
    this.container = container;
    this.audioContext = source.context;
    this.tapeWorkletNode = new AudioWorkletNode(
      this.audioContext, 'tape-worklet-processor');
    // this.tapeWorkletNode.connect(destination);
    source.connect(this.tapeWorkletNode);
    this.tapeWorkletNode.port.onmessage = (event) => {
      console.log('message from worklet', event.data);
    };
    this.tapeWorkletNode.port.postMessage({ type: 'play' });
    this.tapeWorkletNode.port.postMessage({ type: 'latency', value: latency })

    this.div = document.createElement('div');
    this.div.style.width = '100px';
    this.div.style.height = '100px';
    this.div.style.margin = '5px';
    this.div.innerHTML = 'R M S';
    container.appendChild(this.div);

    this.div.addEventListener('click', (event) => {
      if (this.div.classList.contains('armed')) {
        this.disarm();
      } else {
        this.dispatchEvent(new CustomEvent('armed'));
        this.arm();
      }
    });
  }

  arm() {
    if (!this.div.classList.contains('armed')) {
      this.div.classList.add('armed');
      this.tapeWorkletNode.port.postMessage({ type: 'record' });
    }
  }

  disarm() {
    if (this.div.classList.contains('armed')) {
      this.div.classList.remove('armed');
      this.tapeWorkletNode.port.postMessage({ type: 'play' });
    }
  }
  getTapeTime() {
    const t = this.tapeWorkletNode.parameters.get('t');
    return t.value;
  }

  setTapeTime(tapeTime) {
    this.tapeWorkletNode.parameters.get('t')
      .linearRampToValueAtTime(tapeTime, this.audioContext.currentTime + 0.1);
  }

  forward(nowTime, tapeTime) {
    if (this.div.classList.contains('armed')) {
      this.div.classList.add('content');
    }
    const t = this.tapeWorkletNode.parameters.get('t');
    t.cancelScheduledValues(nowTime);
    t.value = tapeTime;
    t.linearRampToValueAtTime(t.value + 120, nowTime + 120);
  }

  stop(tapeTime) {
    this.disarm();
    const t = this.tapeWorkletNode.parameters.get('t');
    t.cancelScheduledValues(this.audioContext.currentTime);
    t.value = tapeTime;
  }
}

class OutputEffectManager {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.effects = [];
    this.effects.push(this._makeLowPass(60));
    this.effects.push(this._makeLowPass(120));
    this.effects.push(this._makePan(-0.7));
    this.effects.push(this._makeNop());
    this.effects.push(this._makePan(0.7));
    this.effects.push(this._makeHighPass(480));
    this.effects.push(this._makeHighPass(960));

    this.previousConnections = new Map();
  }

  _makeNop() {
    const nop = this.audioContext.createGain();
    nop.connect(this.audioContext.destination);
    return nop;
  }

  _makeLowPass(cutoff) {
    const lowPassFilter = this.audioContext.createBiquadFilter();
    lowPassFilter.type = 'lowpass';
    lowPassFilter.frequency.value = cutoff;
    lowPassFilter.connect(this.audioContext.destination);
    return lowPassFilter
  }

  _makeHighPass(cutoff) {
    const highPassFilter = this.audioContext.createBiquadFilter();
    highPassFilter.type = 'highpass';
    highPassFilter.frequency.value = cutoff;
    highPassFilter.connect(this.audioContext.destination);
    return highPassFilter
  }

  _makePan(pan) {
    const panner = this.audioContext.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.audioContext.destination);
    return panner;
  }

  reconnect(sources) {
    const numSources = Math.min(sources.length, this.effects.length);
    for (let i = 0; i < numSources; i++) {
      const source = sources[i];
      const effect = this.effects[i];
      if (this.previousConnections.has(source)) {
        if (this.previousConnections.get(source) === effect) {
          continue;
        }
        source.disconnect(this.previousConnections.get(source));
      }
      source.connect(effect);
      this.previousConnections.set(source, effect);
    }
  }
}

class TrackManager {
  constructor(trackCount, reel, container, source, destination, initialLatency) {
    this.tracks = [];
    this.reel = reel;
    this.audioContext = source.context;
    this.latency = initialLatency;
    this.initialLatency = initialLatency;

    this.effectsManager = new OutputEffectManager(this.audioContext);
    this.sources = [];

    this.motorEngaged = false;

    for (let i = 0; i < trackCount; i++) {
      const track = new Track(container, source, destination, initialLatency);
      this.sources.push(track.tapeWorkletNode);
      this.tracks.push(track);
      track.addEventListener('armed', (event) => {
        for (const t of this.tracks) {
          if (t !== event.target) {
            t.disarm();
          }
        }
      });
      // Drag and drop handling
      this._addDragDropHandler(track.div, i);
    }

    this.effectsManager.reconnect(this.sources);

    this._updateReel();

    reel.addEventListener('reelMoved', (event) => {
      const oldValue = this.tracks[0].getTapeTime();
      const nowTime = this.audioContext.currentTime;
      const tapeTime = event.detail.tapeTime;
      if (this.motorEngaged) {
        this._stopAllTracks(tapeTime, nowTime);
      }
      if (Math.abs(oldValue - tapeTime) > 0.02) {
        for (const track of this.tracks) {
          track.setTapeTime(tapeTime);
        };
      }
    });

    const playButton = document.getElementById('playButton');
    playButton.addEventListener('click', () => {
      playButton.classList.toggle('down');
      this.motorEngaged = playButton.classList.contains('down');

      const tapeTime = this.tracks[0].getTapeTime();
      const nowTime = this.audioContext.currentTime;
      if (this.motorEngaged) {
        this._startAllTracks(tapeTime, nowTime);
      } else {
        this._stopAllTracks(tapeTime, nowTime)
      }
    });

    this.latencySlider = document.createElement('input');
    this.latencySlider.type = 'range';
    this.latencySlider.min = '0';
    this.latencySlider.max = '100';
    // 0.11 seems to be about right.
    this.latencySlider.value = 11;
    this.latencySlider.style.width = '200px';
    const latencyLabel = document.createElement('label');
    latencyLabel.textContent = 'Latency: ';
    this.latencySlider.addEventListener('input', () => {
      this.latency = this.latencySlider.value / 100.0;
      latencyLabel.textContent = `Latency: ${this.latency * 1000}ms`;
      for (const track of this.tracks) {
        track.tapeWorkletNode.port.postMessage({ type: 'latency', value: this.latency });
      }
    });
    const latencyDiv = document.createElement('div');
    latencyDiv.appendChild(latencyLabel);
    latencyDiv.appendChild(this.latencySlider);
    document.body.appendChild(latencyDiv);

    for (const track of this.tracks) {
      track.tapeWorkletNode.port.postMessage({ type: 'latency', value: this.latency });
    }
  }

  _swap(arr, i, j) {
    if (i < 0 || j < 0 || i >= arr.length || j >= arr.length) {
      return;
    }
    if (i === j) {
      return;
    }
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }

  _addDragDropHandler(div, i) {
    div.style.order = i;
    div.draggable = true;
    div.innerHTML = `<b>${i}</b>`;
    div.addEventListener('dragstart', (event) => {
      console.log(`Start: ${div.style.order}`);
      event.dataTransfer.setData('text/plain', div.style.order.toString());
    });
    div.addEventListener('dragover', (event) => {
      event.preventDefault();
    });
    div.addEventListener('drop', (event) => {
      const index = parseInt(event.dataTransfer.getData('text/plain'));
      console.log(`Drop onto ${div.style.order} ; source: ${index}`)
      event.preventDefault();
      this._swap(this.tracks, div.style.order, index);
      this._swap(this.sources, div.style.order, index)
      for (let j = 0; j < this.tracks.length; j++) {
        this.tracks[j].div.style.order = j;
      }
      this.effectsManager.reconnect(this.sources);
    });
  }

  _stopAllTracks(tapeTime, nowTime) {
    for (const track of this.tracks) {
      track.stop(tapeTime);
    }
    this.motorEngaged = false;
  }

  _startAllTracks(tapeTime, nowTime) {
    for (const track of this.tracks) {
      track.forward(nowTime, tapeTime);
    }
    this.motorEngaged = true;
  }

  _updateReel() {
    this.reel.setTapeTime(this.tracks[0].getTapeTime());
    requestAnimationFrame(this._updateReel.bind(this));
  }
}
