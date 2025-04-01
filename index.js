// index.js

// Function to create a button with specific styling
function createButton(text, id, buttonContainer) {
  const button = document.createElement('button');
  button.textContent = text;
  button.id = id;
  buttonContainer.appendChild(button);
  return button;
}

class CanvasCircle extends EventTarget {
  constructor(container) {
    super();
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 400;
    this.canvas.height = 400;
    this.canvas.style.border = '1px solid black';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.radius = this.canvas.width / 2;
    this.centerX = this.canvas.width / 2;
    this.centerY = this.canvas.height / 2;
    this.circleX = this.centerX;
    this.circleY = this.centerY;
    this.isDragging = false;
    this.distanceFromCenter = 0;

    this.image = new Image();
    this.image.src = 'reel.jpg';
    this.image.onload = () => {
      this.ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);
    };

    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    // this.canvas.addEventListener('mouseout', this.handleMouseUp.bind(this));

    this.reelRadians = 0;
    this.fingerRadians = 0;
    this.lastDispatchTime = window.performance.now();
  }

  getMouseOffsetFromCenter(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { dx: x - this.centerX, dy: y - this.centerY };
  }

  drawImage() {
    this.ctx.save();
    this.ctx.translate(this.centerX, this.centerY);
    this.ctx.rotate(this.reelRadians);
    this.ctx.drawImage(this.image, -this.canvas.width / 2, -this.canvas.height / 2, this.canvas.width, this.canvas.height);
    this.ctx.restore();
    this.ctx.beginPath();
    this.ctx.arc(this.circleX, this.circleY, 5, 0, 2 * Math.PI);
    this.ctx.fillStyle = 'red';
    this.ctx.fill();
    this.ctx.fillStyle = 'white';
    const tapeTime = this.reelRadians * 3.0 / (2.0 * Math.PI);
    this.ctx.fillText(`${Math.round(tapeTime * 100) / 100}`,
      this.centerX, this.centerY);
  }

  handleMouseDown(event) {
    console.log('down');
    const { dx, dy } = this.getMouseOffsetFromCenter(event);
    const distance = Math.sqrt(dx * dx + dy * dy);
    this.circleX = this.centerX + dx;
    this.circleY = this.centerY + dy;
    this.fingerRadians = this.reelRadians;

    if (distance <= this.radius) {
      console.log('dragging')
      this.isDragging = true;
      this.distanceFromCenter = distance;
      this.drawImage();
    }
  }

  handleMouseMove(event) {
    if (this.isDragging) {
      const { dx, dy } = this.getMouseOffsetFromCenter(event);
      const previousAngle = Math.atan2(this.circleY - this.centerY, this.circleX - this.centerX);

      const length = Math.sqrt(dx * dx + dy * dy);
      const ratio = this.distanceFromCenter / length;
      this.circleX = this.centerX + dx * ratio;
      this.circleY = this.centerY + dy * ratio;
      this.drawImage();

      const currentAngle = Math.atan2(dy, dx);
      let deltaAngle = currentAngle - previousAngle;
      if (deltaAngle > Math.PI) {
        deltaAngle -= 2 * Math.PI;
      } else if (deltaAngle < -Math.PI) {
        deltaAngle += 2 * Math.PI;
      }
      this.fingerRadians += deltaAngle;
      this._dispatchTapeTime();
    }
  }

  _dispatchTapeTime() {
    const newDispatchTime = window.performance.now();
    const deltaTime = newDispatchTime - this.lastDispatchTime;
    if (deltaTime < 0.05) {
      // Don't send updates too frequently.
      return;
    }

    // Typical reel sizes are 7, 10.5, and 14 inches
    // Typical tape speeds are 3.75, 7.5, 15, and 30 inches per second
    // Assuming 7" reel and 7.5 inches per second, gives us about 3 seconds per rotation.
    let tapeTime = 3.0 * (this.fingerRadians / 2.0 / Math.PI);
    tapeTime = Math.max(0, tapeTime);
    this.lastDispatchTime = newDispatchTime;
    const reelMovedEvent = new CustomEvent('reelMoved', {
      detail: { tapeTime }
    });
    this.dispatchEvent(reelMovedEvent);
  }

  setTapeTime(tapeTime) {
    this.reelRadians = tapeTime / 3.0 * 2.0 * Math.PI;
    this.drawImage();
  }

  handleMouseUp(event) {
    this.isDragging = false;
  }
}

class Monitor {
  constructor(inputSource) {
    console.log('Setting up monitor.');
    this.audioContext = inputSource.context;

    this.inputGain = this.audioContext.createGain();
    inputSource.connect(this.inputGain);
    this.inputGain.gain.value = 1.0;

    const kernelSize = 0.1;
    const halflife = 0.2;  // The halflife of the reverb in seconds.
    // Reverb kernel and convolution
    const kernel = this._kernel(kernelSize, halflife);
    this.convolver = this.audioContext.createConvolver();
    // Important: turn off normalization so we don't get a ringing effect.
    this.convolver.normalize = false;
    this.convolver.buffer = kernel;

    // Loopback
    this.loopbackDelay = this.audioContext.createDelay(kernelSize);
    this.loopbackDelay.delayTime.value = kernelSize;
    this.loopbackGain = this.audioContext.createGain();
    // g ^ (haflife / kernelSize) = 0.5
    // (haflife / kernelSize) ln g = ln(0.5)
    // ln g = ln(0.5) / (halflife / kernelSize)
    // g = exp(ln(0.5) / (halflife / kernelSize))
    // g = pow(0.5, (halflife / kernelSize))
    this.loopbackGain.gain.value = Math.pow(0.5, kernelSize / halflife);

    //
    // inputSource ------------------------------------------> convolver -> output
    //               ^                                    /
    //               \                                   /
    //                 loopback delay <- loopback gain <-
    this.inputGain.connect(this.convolver);
    this.convolver.connect(this.audioContext.destination);

    this.inputGain.connect(this.loopbackGain);
    this.loopbackGain.connect(this.loopbackDelay);
    this.loopbackDelay.connect(this.loopbackGain);
    this.loopbackDelay.connect(this.convolver);

    this.testTone = this.audioContext.createOscillator();
    this.testTone.type = 'sine';
    this.testTone.frequency.value = 440;
    this.testGain = this.audioContext.createGain();
    this.testGain.gain.value = 0;
    this.testTone.start();
    this.testTone.connect(this.testGain);
    this.testGain.connect(this.inputGain);
    document.body.addEventListener('keydown', (event) => {
      if (event.code === 'Backquote') {
        console.log('boop');
        this.testGain.gain.value = 0.05;
      }
    });
    document.body.addEventListener('keyup', (event) => {
      if (event.code === 'Backquote') {
        console.log('unboop');
        this.testGain.gain.value = 0.0;
      }
    });

    inputSource.connect(this.audioContext.destination);
    console.log('Monitor connected.');
  }

  // Returns an AudioBuffer filled with noise of the specified duration.
  _kernel(durationSeconds, halflife) {
    const sampleRate = this.audioContext.sampleRate;
    const frameCount = Math.round(sampleRate * durationSeconds);
    const buffer = this.audioContext.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);
    let g = 1.0;
    const decayRate = Math.pow(0.5, halflife / sampleRate);
    for (let i = 0; i < frameCount; i++) {
      if (Math.random() < 0.1) {
        channelData[i] = 0.1 * g * (2 * Math.random() - 1);
      } else {
        channelData[i] = 0;
      }
      g *= decayRate;
    }
    this._lowPassFilter(channelData);
    this._normalize(channelData);
    return buffer;

  }

  // Applies a low pass filter to the buffer with a simple IIR model
  _lowPassFilter(channelData) {
    const sampleRate = this.audioContext.sampleRate;
    const alpha = 0.1;
    let lastValue = 0;
    for (let pass = 0; pass < 2; ++pass) {
      // Do two passes so that the 'lastValue' from the first pass can be used in the
      // second pass.
      for (let i = 0; i < channelData.length; i++) {
        const value = channelData[i];
        channelData[i] = alpha * lastValue + (1 - alpha) * value;
        lastValue = channelData[i];
      }
    }
  }

  // Normalizes the buffer so the maximum value is 1.0 (or -1.0)
  _normalize(channelData) {
    let max = 0;
    for (let i = 0; i < channelData.length; i++) {
      const value = Math.abs(channelData[i]);
      if (value > max) {
        max = value;
      }
    }
    const scale = max > 0 ? 1.0 / max : 1.0;
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] *= scale * 0.05;
    }
  }

}

class VUMeter {
  constructor(inputNode, div) {
    this.audioContext = inputNode.context;
    this.inputNode = inputNode;
    this.div = div;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 150;
    this.canvas.height = 75;
    this.div.appendChild(this.canvas);

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.inputNode.connect(this.analyser);
    this.ctx = this.canvas.getContext('2d');
    const bufferLength = this.analyser.frequencyBinCount;
    this.vuArray = new Float32Array(bufferLength);
    this.previousDb = -40;
    this._drawCanvas();
  }

  _drawCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    let amplitude = 0.0;
    this.analyser.getFloatTimeDomainData(this.vuArray);
    for (let i = 0; i < this.vuArray.length; i++) {
      amplitude = Math.max(Math.abs(this.vuArray[i]), amplitude);
    }
    let dbs = -40;
    if (amplitude > 0) {
      dbs = Math.max(-40, 20 * Math.log10(amplitude));
    }
    dbs = Math.max(this.previousDb - 0.1, dbs);
    this.previousDb = dbs;

    const minDbs = -20;
    const maxDbs = 8;
    const range = maxDbs - minDbs;
    const p = (dbs - minDbs) / range;

    const minAngle = Math.PI * 2 / 3;
    const maxAngle = Math.PI / 3;

    const angle = minAngle + p * (maxAngle - minAngle);
    const radius = this.canvas.height * 0.9;
    const x = this.canvas.width / 2 + Math.cos(angle) * radius;
    const y = this.canvas.height - Math.sin(angle) * radius;
    this.ctx.beginPath();
    this.ctx.moveTo(this.canvas.width / 2, this.canvas.height);
    this.ctx.lineTo(x, y);
    this.ctx.strokeStyle = 'red';
    this.ctx.stroke();

    this.ctx.fillStyle = 'white';
    this.ctx.fillText(`${Math.round(dbs)} dB`,
      this.canvas.width / 2, this.canvas.height / 2);

    requestAnimationFrame(this._drawCanvas.bind(this));
  }
}


class Main {
  constructor() {
    this.audioContext = new AudioContext();
    this.playbackLatency = this.audioContext.baseLatency;
    // Initialize the recording latency to be the same as the playback
    // latency. This is a good guess, but if we have another number
    // from the media stream, we should use that.
    this.recordLatency = this.audioContext.baseLatency;
    this._init();
  }

  async _init() {
    // Create a container for the buttons
    const buttonContainer = document.getElementById('buttons');

    // Create the buttons
    const playButton = createButton('Play', 'playButton', buttonContainer);
    // Append the container to the body
    document.body.appendChild(buttonContainer);

    const leftReel = document.getElementById('leftReel');
    this.leftReelCanvasCircle = new CanvasCircle(leftReel);

    await this._initAudio();
    this._createTracks();
  }


  _createGainSlider(buttonContainer, sourceElement, name) {
    const gainNode = this.audioContext.createGain();
    if (sourceElement) {
      sourceElement.connect(gainNode);
    }

    const gainSliderElement = document.createElement('input');
    gainSliderElement.type = 'range';
    gainSliderElement.min = '-30';
    gainSliderElement.max = '50';
    gainSliderElement.value = '0';
    gainSliderElement.style.width = '200px';
    gainSliderElement.addEventListener('input', () => {
      const gain = gainSliderElement.value;
      gainLabelElement.textContent = `${name}: ${gain} dB`;
      gainNode.gain.value = Math.pow(10, gain / 20);
    });
    const gainLabelElement = document.createElement('label');
    gainLabelElement.textContent = `${name}: 0 dB`;
    gainLabelElement.style.width = '100px';
    gainLabelElement.style.display = 'inline-block';
    const gainDiv = document.createElement('div');
    gainDiv.appendChild(gainLabelElement);
    gainDiv.appendChild(gainSliderElement);
    buttonContainer.appendChild(gainDiv);

    return gainNode;
  }

  async _initAudio() {
    await this.audioContext.audioWorklet.addModule('tape-worklet.js');

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: 'default',
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        latencyHint: 'low',
      }
    });
    this.source = this.audioContext.createMediaStreamSource(stream);
    // Get the input latency from the MediaStreamTrack
    const audioTrack = stream.getAudioTracks()[0];
    const capabilities = audioTrack.getCapabilities();
    if (capabilities && capabilities.latency) {
      this.recordLatency = capabilities.latency.max;
      console.log("Input Latency (from capabilities):", this.inputLatency);
    }

    const buttonContainer = document.getElementById('buttons');

    this.sourceGain = this._createGainSlider(buttonContainer, this.source, 'Gain');
    new VUMeter(this.sourceGain, buttonContainer);
    this.volumeGain = this._createGainSlider(buttonContainer, null, 'Volume');
    this.volumeGain.connect(this.audioContext.destination);
  }

  _createTracks() {
    // Create a container for the track images
    const tracksContainer = document.getElementById('tracks');
    tracksContainer.style.display = 'flex';
    tracksContainer.style.flexWrap = 'wrap';
    tracksContainer.style.width = '900px'; // Adjust as needed
    console.log(`Total latency = ${this.playbackLatency + this.recordLatency} seconds.`);
    console.log(`Playback latency = ${this.playbackLatency} seconds.`);
    console.log(`Record latency = ${this.recordLatency} seconds.`);
    this.tracks = new TrackManager(14, this.leftReelCanvasCircle, tracksContainer,
      this.sourceGain, this.volumeGain,
      this.playbackLatency + this.recordLatency);
  }
}

function init() {
  const startButton = document.getElementById('start');
  startButton.remove();
  const main = new Main();
}
