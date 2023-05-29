document.write(`<script src="/libflac.js-5.4.0/libflac.min.wasm.js"></scr` + `ipt>`);
class ConvertInputAudioData {
  constructor(write_callback_fn, opt = {}) {
    const initOpt = { sample_rate: 48000, channels: 1, bps: 16, level: 1, tot_samples: 0, is_verify: 1 };
    for (const k in initOpt) {
      this[k] = opt[k] ?? initOpt[k];
    }
    this.flac_encoder = Flac.create_libflac_encoder(
      this.sample_rate,
      this.channels,
      this.bps,
      this.level,
      this.tot_samples,
      this.is_verify
    );
    let flac_ok = 1;
    if (this.flac_encoder != 0) {
      var init_status = Flac.init_encoder_stream(this.flac_encoder, write_callback_fn, () => {}, 0, 0);
      flac_ok &= init_status == 0;
      console.log("flac init: " + flac_ok);
    } else {
      Flac.FLAC__stream_encoder_delete(this.flac_encoder);
      var msg = "Error initializing the decoder.";
      console.error(msg);
      return { error: msg, status: 1 };
    }
  }
  sendData(buf) {
    buf = Int32Array.from(buf);
    const flac_return = Flac.FLAC__stream_encoder_process_interleaved(this.flac_encoder, buf, buf.length);
    if (flac_return != true) {
      console.error("Error: FLAC__stream_encoder_process_interleaved returned false. " + flac_return);
      const flac_ok = Flac.FLAC__stream_encoder_get_state(this.flac_encoder);
      Flac.FLAC__stream_encoder_delete(this.flac_encoder);
      return {
        error: "Encountered error while encoding.",
        status: flac_ok,
      };
    }
  }
}

class ConvertOutputAudioData {
  constructor() {}
}
