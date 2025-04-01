
class Track extends EventTarget {
  constructor(container, source, destination, latency) {
    super();
    this.container = container;
    this.audioContext = source.context;
    this.tapeWorkletNode = new AudioWorkletNode(
      this.audioContext, 'tape-worklet-processor');
    this.tapeWorkletNode.connect(destination);
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

class TrackManager {
  constructor(trackCount, reel, container, source, destination, initialLatency) {
    this.tracks = [];
    this.reel = reel;
    this.audioContext = source.context;
    this.latency = initialLatency;
    this.initialLatency = initialLatency;

    this.motorEngaged = false;

    for (let i = 0; i < trackCount; i++) {
      const track = new Track(container, source, destination, initialLatency);
      this.tracks.push(track);
      track.addEventListener('armed', (event) => {
        for (const t of this.tracks) {
          if (t !== event.target) {
            t.disarm();
          }
        }
      });
    }

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