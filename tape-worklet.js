

/**
 * @class TapeWorkletProcessor
 * @description This class implements an AudioWorkletProcessor that simulates a tape deck.
 */
class TapeWorkletProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 't',
        description: 'The time index into the tape buffer in seconds.',
        defaultValue: 0,
        minValue: 0,
        maxValue: 300,
        automationRate: 'a-rate',
      },
    ];
  }

  constructor() {
    super();
    this.sampleRate = sampleRate;
    this.latencyFrames = 0;
    this.buffer = new Float32Array(this.sampleRate * 300); // 5 minutes
    this.bufferIndex = 0;
    this.isRecording = false;
    this.port.onmessage = (event) => {
      console.log(event.data.type);
      if (event.data.type === 'record') {
        this.isRecording = true;
      } else if (event.data.type === 'play') {
        this.isRecording = false;
      } else if (event.data.type === 'latency') {
        this.latencyFrames = Math.round(this.sampleRate * event.data.value);
        console.log(`Latency: ${event.data.value}`);
      }
    };

    this.currentFrame = 0;
    this.lastReportTime = 0;

    this.tValues = new Float32Array(128);
  }

  _play(ts, outputs) {
    if (outputs.length === 0) { return; }
    if (outputs[0].length === 0) {
      return;
    }
    const channel = outputs[0][0]

    for (let i = 0; i < ts.length; ++i) {
      channel[i] = this.buffer[Math.round(ts[i] * this.sampleRate)];
    }

    for (let output_index = 0; output_index < outputs.length; ++output_index) {
      for (let channel_index = 0; channel_index < outputs[output_index].length; ++channel_index) {
        if (output_index === 0 && channel_index === 0) {
          continue;
        } else {
          const o = outputs[output_index][channel_index];
          for (let i = 0; i < channel.length; ++i) {
            o[i] = channel[i];
          }
        }
      }
    }
    return true;
  }

  _record(ts, inputs) {
    if (inputs.length === 0) { return; }
    if (inputs[0].length === 0) { return; }
    const channel = inputs[0][0];
    for (let i = 0; i < ts.length; ++i) {
      let index = Math.round(ts[i] * this.sampleRate) - this.latencyFrames;
      if (index < 0) {
        index = 0;
      }
      this.buffer[index] = channel[i];
    }
    return true;
  }

  process(inputs, outputs, parameters) {
    const t = parameters.t;
    let ts = t;
    if (t.length === 1) {
      this.tValues.fill(t[0]);
      ts = this.tValues;
    }
    const currentTime = this.currentFrame / this.sampleRate;
    if (currentTime - this.lastReportTime > 1) {
      this.lastReportTime = currentTime;
      const startValue = ts[0];
      const endValue = ts[ts.length - 1];
      const duration = endValue - startValue;
      const ratioA = duration / (127 / this.sampleRate);
      const ratioB = duration / (128 / this.sampleRate);
    }

    this.currentFrame += ts.length;

    if (this.isRecording) {
      return this._record(ts, inputs);
    } else {
      return this._play(ts, outputs);
    }
  }

}

registerProcessor('tape-worklet-processor', TapeWorkletProcessor);
