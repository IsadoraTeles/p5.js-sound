define(function (require) {
  'use strict';

  var p5sound = require('master');

  // oscBuffer CLASS, a private function
  var oscBuffer = function(name, tableSize) {
    this.name = name; // required for constructor, no default
    this.tableSize = tableSize || 2048; // optional, defaults to 2 seconds
    var real = new Float32Array(this.tableSize);
    var imag = new Float32Array(this.tableSize);

    this.array;
    this.buffer;

    this.fill(this.name);
    return this.buffer;
  };


  oscBuffer.prototype.fill = function(name) {
    switch (name.toLowerCase()) {
      case 'sine':
          this.array = generateSin(this.tableSize);
          this.decodeBuffer(this.array);
          break;
      case 'square':
          this.array = generateSqr(this.tableSize);
          this.decodeBuffer(this.array);
          break;
      case 'sawtooth':
          this.array = generateSaw(this.tableSize);
          this.decodeBuffer(this.array);
          break;
      case 'triangle':
          this.array = generateTri(this.tableSize);
          this.decodeBuffer(this.array);
          break;
      // case 'phasor':
      //     return generatePhasor();
      default:
          this.array = generateSin(this.tableSize);
          this.decodeBuffer(this.array);
    }
  };

  // convert array to buffer
  oscBuffer.prototype.decodeBuffer = function(newArray){
    var newBuffer = p5sound.audiocontext.createBuffer(1, this.tableSize, p5sound.audiocontext.sampleRate);
    var channelData = newBuffer.getChannelData(0);
    channelData.set(newArray);
    this.setBuffer(newBuffer);
  };

  // set the buffer for this oscBuffer to a new buffer
  oscBuffer.prototype.setBuffer = function(newBuf){
    this.buffer = newBuf;
  };

  oscBuffer.prototype.getBuffer = function(){
    return this.buffer;
  };

  // Osc is the new oscillator for phase manipulation
  p5.prototype.Osc = function(name, tableSize) {
    this.name = name || 'sine';
    var tableSize = tableSize || 2048;
    // assign buffer to sine by default
    this.buffer = new oscBuffer(this.name, tableSize);
    console.log(this.name);

    this.input = p5sound.audiocontext.createGain();
    this.output = p5sound.audiocontext.createGain();

    this.frequency = 400; //default

    this._phase = 0.0; // float between 0.0 and 1.0
    this.playing = false;

    // stereo panning
    this.panPosition = 0.0;
    this.panner = p5sound.audiocontext.createPanner();
    this.panner.panningModel = 'equalpower';
    this.panner.distanceModel = 'linear';
    this.panner.setPosition(0,0,0);

    this.output.connect(this.panner);

    // by default, the panner is connected to the p5s destination
    this.panner.connect(p5sound.input);
  };

  // start playback
  p5.prototype.Osc.prototype.start = function(t, amp) {
    var time = t || p5sound.audiocontext.currentTime;

    this.source = p5sound.audiocontext.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = true;

    // playback rate controls frequency
    var rate = this.frequency * (this.buffer.length / p5sound.audiocontext.sampleRate);
    this.source.playbackRate.setValueAtTime(rate, time);

    // set phase
    this.source.loopStart = ( this.buffer.duration * this.source.playbackRate.value) % this.buffer.duration;
    this.source.loopEnd = ( this.source.loopStart - this.buffer.duration * this.source.playbackRate.value / p5sound.audiocontext.sampleRate ) % this.buffer.duration;

    // control gain
    if (!this.source.gain) {
      this.source.gain = p5sound.audiocontext.createGain();
      this.source.connect(this.source.gain);
      // set local amp if provided, otherwise 1
      this.source.gain.gain.value = amp || 1;
      this.source.gain.connect(this.output); 
    }
    // chrome method of controlling gain without resetting volume
    else {
      this.source.gain.value = amp || 1;
      this.source.connect(this.output); 
    }

    // START
    this.source.start(time, this.source.loopStart);
    // startTime is used to determine the currentTime or currentFrame of playback
    this.timeStarted = time;

    this.playing = true;
  };

  p5.prototype.Osc.prototype.stop = function(t) {
    var time = t || p5sound.audiocontext.currentTime;
    if (this.buffer && this.source) {
      this.source.stop(time);
    }
    this.playing = false;
  };


  // change playback rate
  p5.prototype.Osc.prototype.freq = function(f, t) {
    var time = t || 0;
    var now = p5sound.audiocontext.currentTime;
    if (typeof(f) === 'number') {
      this.frequency = f;
      if (this.source){
        this.source.playbackRate.cancelScheduledValues(time + now);
        var rate = f* (this.buffer.length / p5sound.audiocontext.sampleRate);
        if (rate === 0) {
          this.source.playbackRate.setValueAtTime(rate, time + now);
        } else {
        this.source.playbackRate.exponentialRampToValueAtTime(rate, time + now);
        }
      }
    }
    // if 'f' is an oscillator
    else if (f.output) {
      // TO DO: make this work if source hasn't been initialized yet // keep track of connections
      // OR: always connected to an oscillator at a constant value
      f.disconnect();
      this.source.playbackRate.cancelScheduledValues(time + now);
      f.output.connect(this.source.playbackRate);
      console.log('yo');
    }
  };

  var scaler = function(){
    // TO DO: connect this to freq value, always scale it
  }

  p5.prototype.Osc.prototype.amp = function(a, t) {
    if (typeof(a) === 'number') {
      var time = t || 0;
      var now = p5sound.audiocontext.currentTime;
      this.output.gain.cancelScheduledValues(time + now);
      this.output.gain.linearRampToValueAtTime(a, time + now);
    }
    else if (a.output) {
      a.disconnect();
      a.output.connect(this.output.gain);
    }
  };

  p5.prototype.Osc.prototype.phase = function(p) {
    var oldPhase = this._phase;
    var newPhase = Math.abs(p - this._phase) % (1);
    this._phase = newPhase;
    console.log(this._phase);
    var oldBuffer = this.buffer.getChannelData(0);
    var slicePoint = ( this._phase * this.buffer.length ) % this.buffer.length;
    var parts = new Array(2);
    parts[1] = oldBuffer.subarray(0, slicePoint)
    parts[0] = oldBuffer.subarray(slicePoint+1, this.buffer.length);
    var result = new Float32Array(this.buffer.length);
    var offset = 0;
    for (var i = 0; i < parts.length; i++){
      result.set(parts[i], offset);
      offset += parts[i].length;
    }
    this.setBuff(result);
  };

  p5.prototype.Osc.prototype.setBuff = function(buf) {
    // create an AudioBuffer of the appropriate size and # of channels,
    // and copy the data from one Float32 buffer to another
    var audioContext = p5sound.audiocontext;
    var newBuffer = audioContext.createBuffer(1, buf.length, audioContext.sampleRate);
    var channel = newBuffer.getChannelData(0);
    channel.set(buf);
    if (this.source && this.source.buffer){
      this.source.buffer = newBuffer;
    }
    this.buffer = newBuffer;
  };

  p5.prototype.Osc.prototype.currentTime = function() {
    var howLong;
    if (this.playing === true) {
      var timeSinceStart = p5sound.audiocontext.currentTime - this.timeStarted;
      console.log(timeSinceStart);
      howLong = ( timeSinceStart ) % (this.buffer.length / p5sound.audiocontext.sampleRate)* this.source.playbackRate.value;
      return howLong;
    } else {
      return 0;
    }
  };

  // current frame of the buffer
  p5.prototype.Osc.prototype.currentFrame = function() {
    if (this.playing === true) {
      var howLong = ( (p5sound.audiocontext.currentTime - this.timeStarted) ) % (this.buffer.length / this.buffer.sampleRate * this.source.playbackRate.value);
      var f = ( howLong / this.duration() ) * this.buffer.length;
      return Math.round(f);
    } else {
      return 0;
    }
  };

  p5.prototype.Osc.prototype.connect = function(unit) {
    if (!unit) {
       this.panner.connect(p5sound.input);
    }
    else if (this.buffer && this.source) {
      if (unit.hasOwnProperty('input')){
        this.panner.connect(unit.input);
      } else {
      this.panner.connect(unit);
      }
    }
  };

  p5.prototype.Osc.prototype.disconnect = function(unit){
    this.panner.disconnect(unit);
  };

  // duration in seconds
  p5.prototype.Osc.prototype.duration = function(){
    return (this.buffer.length / this.buffer.sampleRate) * this.source.playbackRate.value;
  };

  // ================
  // generate buffers
  // ================

  // via http://music.columbia.edu/cmc/musicandcomputers/popups/chapter4/xbit_4_1.php
  var generateSin = function(tableSize) {
    var samples = new Float32Array(tableSize);
    var phaseInc = TWO_PI/tableSize;
    var currentPhase = 0.0;
    for (var i = 0; i < tableSize; i++){
      samples[i] = Math.sin(currentPhase);
      currentPhase += phaseInc;
    }
    return samples;
  };

  var generateSaw = function(tableSize) {
    var samples = new Float32Array(tableSize);
    var phaseInc = TWO_PI/tableSize;
    var a = 1;
    var currentPhase = 0.0;
    for (var i = 0; i < tableSize; i++){
      // samples[i] = Math.abs(currentPhase % 2) - 1;
      samples[i] = a - (a / PI * currentPhase);
      currentPhase += phaseInc;
    }
    return samples;
  };

  var generateSqr = function(tableSize) {
    var samples = new Float32Array(tableSize);
    for (var i = 0; i < tableSize/2; i++){
      samples[i] = 1;
    }
    for (var i = tableSize/2; i < tableSize; i++){
      samples[i] = -1;
    }
    return samples;
  };

  // via http://en.wikibooks.org/wiki/Sound_Synthesis_Theory/Oscillators_and_Wavetables
  var generateTri = function(tableSize) {
    var samples = new Float32Array(tableSize);
    var a = 1; //amp
    var phaseInc = TWO_PI/tableSize;
    var currentPhase = 0.0;
    for (var i = 0; i < tableSize/2; i++){
      samples[i] = -a + (2*a / PI) * currentPhase;
      currentPhase += phaseInc;
    }
    for (var i = tableSize/2; i < tableSize; i++){
      samples[i] = 3*a - (2*a / PI) * currentPhase;
      currentPhase += phaseInc;
    }
    return samples;
  };

});