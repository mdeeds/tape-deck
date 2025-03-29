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

  drawReel() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = 'grey';
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, this.radius, 0, 2 * Math.PI);
    this.ctx.fill();

    const holeRadius = this.radius / 4;
    const holeCenterRadius = this.radius * 0.75;
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      const holeCenterX = this.centerX + holeCenterRadius * Math.cos(angle);
      const holeCenterY = this.centerY + holeCenterRadius * Math.sin(angle);
      this.ctx.beginPath();
      this.ctx.arc(holeCenterX, holeCenterY, holeRadius, 0, 2 * Math.PI);
      this.ctx.fillStyle = 'white';
      this.ctx.fill();
    }

    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, this.radius / 4, 0, 2 * Math.PI);
    this.ctx.fillStyle = 'black';
    this.ctx.fill();
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
    this.canvas.dispatchEvent(reelMovedEvent);
  }

  setTapeTime(tapeTime) {
    this.totalRadiansMoved = tapeTime / 3.0 * 2.0 * Math.PI;
    this.drawImage();
  }

  handleMouseUp(event) {
    this.isDragging = false;
  }
}

class Monitor {
  constructor(inputSource) {
    this.audioContext = inputSource.context;

    this.predelay = this.audioContext.createDelay(1.0);
    this.predelay.delayTime.value = 0.05;
    inputSource.connect(this.predelay);

    const kernelSize = 0.1;
    const halflife = 1.0;  // The halflife of the reverb in seconds.
    const kernel = this._kernel(kernelSize, halflife);

    this.convolver = this.audioContext.createConvolver();
    this.convolver.buffer = kernel;
    this.predelay.connect(this.convolver);
    this.convolver.connect(this.audioContext.destination);

    this.loopback = this.audioContext.createDelay(kernelSize);
    this.loopback.delayTime.value = kernelSize;
    this.predelay.connect(this.loopback);

    this.loopbackGain = this.audioContext.createGain();

    // g ^ (haflife / kernelSize) = 0.5
    // (haflife / kernelSize) ln g = ln(0.5)
    // ln g = ln(0.5) / (halflife / kernelSize)
    // g = exp(ln(0.5) / (halflife / kernelSize))
    // g = pow(0.5, (halflife / kernelSize))
    this.loopbackGain.gain.value = Math.pow(0.5, kernelSize / halflife);

    this.loopback.connect(this.loopbackGain);
    this.loopbackGain.connect(this.convolver);
    this.loopbackGain.connect(this.loopback);
  }

  // Returns an AudioBuffer filled with noise of the specified duration.
  _kernel(durationSeconds, halflife) {
    const sampleRate = this.audioContext.sampleRate;
    const frameCount = Math.round(sampleRate * durationSeconds);
    const buffer = this.audioContext.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const g = Math.pow(0.5, t / halflife);
      // channelData[i] = Math.random() * 2 - 1;
      if (Math.random() < 0.01) {
        channelData[i] = 0.1 * g * (2 * Math.random() - 1);
      } else {
        channelData[i] = 0;
      }
    }
    return buffer;
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
    div.innerHTML = 'R M S';;
    return div;
  }

  async _initAudio() {
    await this.audioContext.audioWorklet.addModule('tape-worklet.js');

    this.tapeWorkletNode = new AudioWorkletNode(this.audioContext, 'tape-worklet-processor');

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.tapeWorkletNode);

    new Monitor(source);

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
      const nowTime = this.audioContext.currentTime;
      t.cancelScheduledValues(nowTime);
      t.value = 0;
      playButton.classList.remove('down');
    });
    const leftReel = document.getElementById('leftReel');
    const leftReelCanvasCircle = new CanvasCircle(leftReel);
    leftReelCanvasCircle.canvas.addEventListener('reelMoved', (event) => {
      const t = this.tapeWorkletNode.parameters.get('t');
      if (this.motorEngaged) {
        playButton.classList.remove('down');
        this.motorEngaged = false;
        t.cancelScheduledValues(nowTime);
      }
      const tapeTime = event.detail.tapeTime;
      const oldValue = t.value;
      if (Math.abs(oldValue - tapeTime) > 0.1) {
        const nowTime = this.audioContext.currentTime;
        t.linearRampToValueAtTime(tapeTime, nowTime + Math.abs(oldValue - tapeTime));
        // console.log(`Ramp to ${tapeTime}`);
      }
    });
  }
}

function init() {
  const startButton = document.getElementById('start');
  startButton.remove();
  const main = new Main();
}
