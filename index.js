// index.js

// Function to create a button with specific styling
function createButton(text, id, buttonContainer) {
  const button = document.createElement('button');
  button.textContent = text;
  button.id = id;
  button.style.padding = '20px 40px';
  button.style.fontSize = '1.5em';
  button.style.margin = '10px';
  button.style.backgroundColor = '#666';
  button.style.color = '#eee';
  button.style.border = '2px solid #888';
  button.style.borderRadius = '8px';
  button.style.cursor = 'pointer';
  button.style.boxShadow = '0px 1em 2em rgba(0, 0, 0, 0.6)';
  button.style.fontFamily = 'monospace';
  buttonContainer.appendChild(button);
  return button;
}

class AudioTrack {
  constructor(audioContext, audioBuffer, startTime) {
    this.audioContext = audioContext;
    this.audioBuffer = audioBuffer;
    this.startTime = startTime;
    this.endTime = startTime + audioBuffer.duration;
    this.duration = audioBuffer.duration;
  }

  // Starts playback at the specified tape time.
  play(tapeTime) {
    const startTime = this.startTime - tapeTime;
    if (startTime >= this.endTime) {
      // Nothing to do, the track is entirely in the past.
      return;
    }
    this.source = this.audioContext.createBufferSource();
    source.buffer = this.audioBuffer;
    source.connect(this.audioContext.destination);
    if (startTime >= 0) {
      source.start(startTime);
    } else {
      source.start(0, -startTime);
    }
  }

  stop() {
    this.source.stop();
    this.source.disconnect();
  }
}

class TapeDeck {
  constructor() {
    this.tapeTime = 0;
    this.tracks = [];
  }

  // Starts playback at current tapeTime.
  play() {
    for (const track of this.tracks) {
      track.play(this.tapeTime);

    }
  }

  stop() {
    for (const track of this.tracks) {
      track.stop();
    }
  }
}

class CanvasCircle {
  constructor(container) {
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
    }
  }

  getTapeTime() {
    // Typical reel sizes are 7, 10.5, and 14 inches
    // Typical tape speeds are 3.75, 7.5, 15, and 30 inches per second
    // Assuming 7" reel and 7.5 inches per second, gives us about 3 seconds per rotation.
    return 3.0 * (this.totalRadiansMoved / 2.0 / Math.PI);
  }

  setTapeTime(tapeTime) {
    this.totalRadiansMoved = tapeTime / 3.0 * 2.0 * Math.PI;
    this.drawImage();
  }

  handleMouseUp(event) {
    this.isDragging = false;
  }
}

function init() {
  // Create a container for the buttons
  const buttonContainer = document.getElementById('buttons');

  // Create the buttons
  const fastReverseButton = createButton('<<', 'fastReverseButton', buttonContainer);
  const reverseButton = createButton('Reverse', 'reverseButton', buttonContainer);
  const stopButton = createButton('Stop', 'stopButton', buttonContainer);
  const recordButton = createButton('Record', 'recordButton', buttonContainer);
  const playButton = createButton('Play', 'playButton', buttonContainer);
  const fastPlayButton = createButton('>>', 'fastPlayButton', buttonContainer);

  // Add event listeners (for now, just log to console)
  playButton.addEventListener('click', () => {
    console.log('Play button clicked');
  });

  recordButton.addEventListener('click', () => {
    console.log('Record button clicked');
  });

  stopButton.addEventListener('click', () => {
    console.log('Stop button clicked');
  });

  // Append the container to the body
  document.body.appendChild(buttonContainer);

  new CanvasCircle(document.getElementById('leftReel'));
  new CanvasCircle(document.getElementById('rightReel'));
}
