class ConvertInputAudioData {
  constructor(write_callback_fn) {
    this.write_callback_fn = write_callback_fn;
  }
  sendData(buf) {
    this.write_callback_fn(buf);
  }
}

class ConvertOutputAudioData {
  constructor(write_callback_fn) {
    this.write_callback_fn = write_callback_fn;
  }
  sendData(buf) {
    this.write_callback_fn(buf);
  }
}
