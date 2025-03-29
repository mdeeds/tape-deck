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

    this.totalRadiansMoved = 0;
    this.lastDispatchTime = window.performance.now();
    this.lastDispatchedTapeTime = 0;
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
    this.ctx.rotate(this.totalRadiansMoved);
    this.ctx.drawImage(this.image, -this.canvas.width / 2, -this.canvas.height / 2, this.canvas.width, this.canvas.height);
    this.ctx.restore();
    this.ctx.beginPath();
    this.ctx.arc(this.circleX, this.circleY, 5, 0, 2 * Math.PI);
    this.ctx.fillStyle = 'red';
    this.ctx.fill();
    this.ctx.fillStyle = 'white';
    const tapeTime = this.totalRadiansMoved / (3.0 * 2.0 * Math.PI);
    this.ctx.fillText(`${Math.round(tapeTime * 100) / 100}`,
      this.centerX, this.centerY);
  }

  handleMouseDown(event) {
    console.log('down');
    const { dx, dy } = this.getMouseOffsetFromCenter(event);

    const distance = Math.sqrt(dx * dx + dy * dy);
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
      this.totalRadiansMoved += deltaAngle;
      this.totalRadiansMoved = Math.max(0, this.totalRadiansMoved);
      this._dispatchTapeTime();
    }
  }

  _dispatchTapeTime() {
    // Typical reel sizes are 7, 10.5, and 14 inches
    // Typical tape speeds are 3.75, 7.5, 15, and 30 inches per second
    // Assuming 7" reel and 7.5 inches per second, gives us about 3 seconds per rotation.

    const newDispatchTime = window.performance.now();
    const deltaTime = newDispatchTime - this.lastDispatchTime;
    const tapeTime = 3.0 * (this.totalRadiansMoved / 2.0 / Math.PI);
    // Get 50% of the way there in 500ms
    const alpha = Math.pow(0.5, deltaTime / 500.0);
    const smoothedTapeTime = alpha * this.lastDispatchedTapeTime + (1 - alpha) * tapeTime;

    this.lastDispatchTime = newDispatchTime;
    this.lastDispatchedTapeTime = smoothedTapeTime;

    const reelMovedEvent = new CustomEvent('reelMoved', {
      detail: { tapeTime: smoothedTapeTime }
    });
    this.dispatchEvent(reelMovedEvent);
  }

  setTapeTime(tapeTime) {
    this.totalRadiansMoved = tapeTime / 3.0 * 2.0 * Math.PI;
    this.lastDispatchTime = tapeTime;
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
    this.canvas.width = 50;
    this.canvas.height = 50;
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
    dbs = Math.max(this.previousDb - 1, dbs);
    this.previousDb = dbs;
    const angle = (dbs + 40) / 80 * Math.PI / 3 - Math.PI / 3;
    const radius = this.canvas.height * 0.9;
    const x = this.canvas.width / 2 + Math.sin(angle) * radius;
    const y = this.canvas.height - Math.cos(angle) * radius;
    this.ctx.beginPath();
    this.ctx.moveTo(this.canvas.width / 2, this.canvas.height);
    this.ctx.lineTo(x, y);
    this.ctx.strokeStyle = 'red';
    this.ctx.stroke();
    requestAnimationFrame(this._drawCanvas.bind(this));
  }

}

class Main {
  constructor() {
    this.audioContext = new AudioContext();
    this._init();

    this._initAudio();

    this.motorEngaged = false;
  }

  _init() {
    // Create a container for the buttons
    const buttonContainer = document.getElementById('buttons');

    // Create the buttons
    const stopButton = createButton('Stop', 'stopButton', buttonContainer);
    const recordButton = createButton('Record', 'recordButton', buttonContainer);
    const playButton = createButton('Play', 'playButton', buttonContainer);
    // Append the container to the body
    document.body.appendChild(buttonContainer);

    // Create a container for the track images
    const tracksContainer = document.getElementById('tracks');
    tracksContainer.style.display = 'flex';
    tracksContainer.style.flexWrap = 'wrap';
    tracksContainer.style.width = '900px'; // Adjust as needed

    this.leftReel = document.getElementById('leftReel');
    this.leftReelCanvasCircle = new CanvasCircle(leftReel);

    // Create 16 img elements and add them to the container
    for (let i = 0; i < 16; i++) {
      const trackElement = this._createTrack();
      tracksContainer.appendChild(trackElement);
    }
  }

  _createTrack() {
    const div = document.createElement('div');
    div.style.width = '100px';
    div.style.height = '100px';
    div.style.margin = '5px';
    div.innerHTML = 'R M S';
    return div;
  }

  async _initAudio() {
    await this.audioContext.audioWorklet.addModule('tape-worklet.js');

    this.tapeWorkletNode = new AudioWorkletNode(this.audioContext, 'tape-worklet-processor');

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: false,
        echoCancelation: false,
        noiseSuppresion: false,
      }
    });
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.tapeWorkletNode);

    new Monitor(source);
    new VUMeter(source, document.body);

    this.tapeWorkletNode.connect(this.audioContext.destination);

    this.tapeWorkletNode.port.onmessage = (event) => {
      console.log('message from worklet', event.data);
    };
    this.tapeWorkletNode.port.postMessage({ type: 'play' });
    const playButton = document.getElementById('playButton');
    playButton.addEventListener('click', () => {
      playButton.classList.toggle('down');
      this.motorEngaged = playButton.classList.contains('down');
      const t = this.tapeWorkletNode.parameters.get('t');
      const nowTime = this.audioContext.currentTime;
      t.cancelScheduledValues(nowTime);
      if (this.motorEngaged) {
        const oldValue = t.value;
        t.linearRampToValueAtTime(oldValue + 120, nowTime + 120);
        this._updateReel();
      }
    });
    const recordButton = document.getElementById('recordButton');
    recordButton.addEventListener('click', () => {
      recordButton.classList.toggle('down');
      if (recordButton.classList.contains('down')) {
        this.tapeWorkletNode.port.postMessage({ type: 'record' });
      } else {
        this.tapeWorkletNode.port.postMessage({ type: 'play' });
      }
    });
    const stopButton = document.getElementById('stopButton');
    stopButton.addEventListener('click', () => {
      const t = this.tapeWorkletNode.parameters.get('t');
      t.value = 0;
      this.leftReelCanvasCircle.setTapeTime(0);
      this._stopMotor();
    });
    this.leftReelCanvasCircle.addEventListener('reelMoved', (event) => {
      const t = this.tapeWorkletNode.parameters.get('t');
      const nowTime = this.audioContext.currentTime;
      if (this.motorEngaged) {
        this._stopMotor();

      }
      const tapeTime = event.detail.tapeTime;
      const oldValue = t.value;
      if (Math.abs(oldValue - tapeTime) > 0.1) {
        t.linearRampToValueAtTime(tapeTime, nowTime + Math.abs(oldValue - tapeTime));
        // console.log(`Ramp to ${tapeTime}`);
      }
    });
  }

  _updateReel() {
    if (this.motorEngaged) {
      const t = this.tapeWorkletNode.parameters.get('t');
      this.leftReelCanvasCircle.setTapeTime(t.value);
      requestAnimationFrame(this._updateReel.bind(this));
    }
  }

  _stopMotor() {
    const t = this.tapeWorkletNode.parameters.get('t');
    const nowTime = this.audioContext.currentTime;
    t.cancelScheduledValues(nowTime);
    playButton.classList.remove('down');
    this.motorEngaged = false;
    t.cancelScheduledValues(nowTime);
  }
}

function init() {
  const startButton = document.getElementById('start');
  startButton.remove();
  const main = new Main();
}
