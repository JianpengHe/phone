// import * as Flac from "../libflac.js-5.4.0/libflac.js";
// const sleep = t => new Promise<void>(r => setTimeout(() => r(), t));
document.write(`<script src="/libflac.js-5.4.0/libflac.wasm.js"></scr` + `ipt>`);
/// <reference path='../libflac.js-5.4.0/libflac.wasm.d.ts'/>
export class ConvertInputAudioData {
  private flac_encoder: number;
  public readonly sample_rate: number = 48000;
  public readonly channels: number = 1;
  public readonly bps: number = 16;
  public readonly compression_level: Flac.CompressionLevel = 1;
  public readonly total_samples?: number | undefined;
  public readonly is_verify?: boolean | undefined = true;
  public readonly block_size?: number | undefined;
  constructor(
    write_callback_fn: Flac.encoder_write_callback_fn = () => {},
    metadata_callback_fn: Flac.metadata_callback_fn = () => {},
    opt: {
      sample_rate?: number;
      channels?: number;
      bps?: number;
      compression_level?: Flac.CompressionLevel;
      total_samples?: number | undefined;
      is_verify?: boolean | undefined;
      block_size?: number | undefined;
    } = {}
  ) {
    for (const k in opt) {
      this[k] = opt[k] ?? this[k];
    }
    this.flac_encoder = Flac.create_libflac_encoder(
      this.sample_rate,
      this.channels,
      this.bps,
      this.compression_level,
      this.total_samples,
      this.is_verify
    );
    if (this.flac_encoder === 0) {
      Flac.FLAC__stream_encoder_delete(this.flac_encoder);
      this.flac_encoder = 0;
      throw new Error("Error initializing the encoder.");
    }
    console.log(
      "flac encoder init: ",
      Flac.init_encoder_stream(this.flac_encoder, write_callback_fn, metadata_callback_fn, 0)
    );
  }
  public sendData(buf: Int32Array) {
    if (!this.flac_encoder) return;
    if (!Flac.FLAC__stream_encoder_process_interleaved(this.flac_encoder, buf, buf.length)) {
      Flac.FLAC__stream_encoder_delete(this.flac_encoder);
      this.flac_encoder = 0;
      throw new Error("Error: FLAC__stream_encoder_process_interleaved returned false. ");
    }
  }
}

export class ConvertOutputAudioData {
  public readonly flac_decoder: number;
  public readonly is_verify?: boolean | undefined = false;
  private error_callback_fn: Flac.decoder_error_callback_fn = (errorCode, errorDescription) => {
    // throw new Error(`errorCode:${errorCode}, errorDescription:${errorDescription}`);
  };
  constructor(
    write_callback_fn: Flac.decoder_write_callback_fn = () => {},
    metadata_callback_fn = () => {},
    opt: {
      error_callback_fn?: Flac.decoder_error_callback_fn;
      is_verify?: boolean | undefined;
    } = {}
  ) {
    for (const k in opt) {
      this[k] = opt[k] ?? this[k];
    }
    this.flac_decoder = Flac.create_libflac_decoder(this.is_verify);

    if (this.flac_decoder === 0) {
      Flac.FLAC__stream_decoder_delete(this.flac_decoder);
      throw new Error("Error initializing the decoder.");
    }

    console.log(
      "flac decoder init: ",
      Flac.init_decoder_stream(
        this.flac_decoder,
        this.read_callback_fn.bind(this),
        write_callback_fn,
        this.error_callback_fn,
        metadata_callback_fn,
        false
      )
    );
    // Flac.setOptions(this.flac_decoder, { analyseSubframes: analyse_frames, analyseResiduals: analyse_residuals, enableRawStreamMetadata: enable_raw_metadata });
  }
  private buffer: Uint8Array = new Uint8Array();
  // private tryToReadDataBusy = false;
  private read_callback_fn: Flac.decoder_read_callback_fn = numberOfBytes => {
    //  console.log("read_callback_fn", numberOfBytes, this.buffer.length);
    let readDataLength = 0;
    if (this.buffer.length > numberOfBytes) {
      readDataLength = numberOfBytes;

      // todo 可以继续读
    } else if (this.buffer.length === 1) {
      readDataLength = 1;
    } else if (this.buffer.length === 0) {
      readDataLength = 0;
      // const a=null as any
      // return null as any;
      throw new Error("读不到了");
    } else {
      readDataLength = this.buffer.length; //- 1;
    }
    const buffer = this.buffer.subarray(0, readDataLength);
    this.buffer = this.buffer.subarray(readDataLength);
    // console.log("readDataLength", readDataLength);
    //    this.tryToReadDataBusy = false;
    // this.tryToReadData(1);
    //  new Promise<void>(r => r()).then(() => this.tryToReadData(1));

    return { buffer, readDataLength, error: false };
  };

  // private async tryToReadData(id = 0) {
  //   // console.log("tryToReadData", id, this.tryToReadDataBusy);
  //   if (this.tryToReadDataBusy || this.buffer.length <= 1) return;
  //   while (this.buffer.length) {
  //     Flac.FLAC__stream_decoder_process_single(this.flac_decoder);
  //     // await sleep(10);
  //   }
  // }

  public sendData(buf: Uint8Array) {
    // this.buffer = this.buffer.subarray(readDataLength);
    const mergedArray = new Uint8Array(this.buffer.length + buf.length);
    mergedArray.set(this.buffer);
    mergedArray.set(buf, this.buffer.length);
    this.buffer = mergedArray;
    // this.tryToReadData();
    while (this.buffer.length) {
      Flac.FLAC__stream_decoder_process_single(this.flac_decoder);
    }
  }
}

export class GetUserMediaAudio {
  public readonly audioContext: AudioContext;
  public readonly source: MediaStreamAudioSourceNode;
  constructor(mediaStream: MediaStream, audioContext = new AudioContext()) {
    this.audioContext = audioContext;
    this.source = this.audioContext.createMediaStreamSource(mediaStream);
    const objectUrl = URL.createObjectURL(
      new Blob(
        [
          "(" +
            String(() => {
              //@ts-ignore
              registerProcessor(
                "audioInput",
                //@ts-ignore
                class extends AudioWorkletProcessor {
                  constructor() {
                    super();
                  }
                  process(inputs: Float32Array[][]) {
                    //@ts-ignore
                    this.port.postMessage({ inputs });
                    return true;
                  }
                }
              );
            }) +
            ")()",
        ],
        { type: "application/javascript; charset=utf-8" }
      )
    );

    this.audioContext.audioWorklet.addModule(objectUrl).then(() => {
      URL.revokeObjectURL(objectUrl);
      const node = new AudioWorkletNode(audioContext, "audioInput");
      this.source.connect(node).connect(audioContext.destination);
      node.port.onmessage = ({ data }) => this.onDataFn(data.inputs);
    });
  }
  protected onDataFn(inputs: Float32Array[][]) {
    console.log(inputs);
  }
  public onData(onDataFn: GetUserMediaAudio["onDataFn"]) {
    this.onDataFn = onDataFn;
    return this;
  }
}

export class GetUserMediaAudioToFlac extends GetUserMediaAudio {
  public readonly convertInputAudioData: ConvertInputAudioData;
  private flacBufferCache: Uint8Array = new Uint8Array();
  private currentFrame: number = 0;
  private write_callback_fn: Flac.encoder_write_callback_fn = (data, numberOfBytes, samples, currentFrame) => {
    if (!this.currentFrame) this.currentFrame = currentFrame;
    if (this.flacBufferCache.length) {
      const mergedArray = new Uint8Array(this.flacBufferCache.length + data.length);
      mergedArray.set(this.flacBufferCache);
      mergedArray.set(data, this.flacBufferCache.length);
      this.flacBufferCache = mergedArray;
    } else {
      this.flacBufferCache = data;
    }
    if (this.flacBufferCache.length > 1024) {
      this.onFlacDataFn(this.flacBufferCache, this.currentFrame);
      this.currentFrame = 0;
      this.flacBufferCache = new Uint8Array();
    }
  };
  constructor(mediaStream: MediaStream, audioContext = new AudioContext()) {
    super(mediaStream, audioContext);
    this.convertInputAudioData = new ConvertInputAudioData(this.write_callback_fn.bind(this));
    //audioInput(a => convertInputAudioData.sendData(a));
  }
  public onDataFn(inputs: Float32Array[][]) {
    this.convertInputAudioData.sendData(
      Int32Array.from(inputs[0][0], s => {
        s = Math.max(-1, Math.min(1, s));
        return s < 0 ? s * 0x8000 : s * 0x7fff;
      })
    );
  }
  protected onFlacDataFn(data: Uint8Array, currentFrame: number) {
    console.log(data);
  }
  public onFlacData(onFlacDataFn: GetUserMediaAudioToFlac["onFlacDataFn"]) {
    this.onFlacDataFn = onFlacDataFn;
    return this;
  }
}

// 测试用例
// const mediaStreamConstraints = {
//   audio: {
//     sampleRate: 48000,
//     autoGainControl: false,
//     noiseSuppression: false,
//     echoCancellation: false,
//   },
// };
// new GetUserMediaAudioToFlac(await navigator.mediaDevices.getUserMedia(mediaStreamConstraints)).onFlacData(
//   (buf, currentFrame) => {
//     console.log(buf, currentFrame);
//   }
// );

export class PlayPCMAudio {
  public readonly audioContext: AudioContext;
  public readonly durationPerBuffer: number;
  public readonly sampleRate: number;
  public readonly frameCount: number;
  public readonly sources: { buffer: Float32Array; source: AudioBufferSourceNode }[] = [];
  public nowPlayedSample = 0;
  public curSample = 0;
  private state = 0;
  constructor(audioContext = new AudioContext(), durationPerBuffer: number = 1, sampleRate: number = 48000) {
    this.audioContext = audioContext;
    this.durationPerBuffer = durationPerBuffer;
    this.sampleRate = sampleRate;
    this.frameCount = sampleRate * durationPerBuffer;
  }
  public sourceStartTime = performance.now();
  private addSource() {
    if (this.state === 2) return;
    const myArrayBuffer = this.audioContext.createBuffer(1, this.frameCount, this.sampleRate);
    const buffer = myArrayBuffer.getChannelData(0);
    const source = this.audioContext.createBufferSource();
    source.buffer = myArrayBuffer;
    source.connect(this.audioContext.destination);
    source.onended = () => {
      this.nowPlayedSample += this.frameCount;
      //  nowPlaySourceIndex++
      this.sources.shift();
      if (!this.sources[0]) this.addSource();
      this.sourceStartTime = performance.now();
      this.sources[0]?.source?.start();
      // console.log("onend", this.sources.length);
      // console.log((new Date().getTime()) - t)
    };
    // source.playBuffer = playBufferPen;
    this.sources.push({ buffer, source });
  }
  public quality() {
    return this.curSample - (this.nowPlayedSample + Math.floor(performance.now() - this.sourceStartTime) * 48);
  }
  public sendData(data: Float32Array) {
    //  console.log(data);
    if (!this.state) {
      this.state = 1;
      setTimeout(() => {
        this.sourceStartTime = performance.now();
        this.sources[0].source.start();
      }, 80);
    }
    if (this.state === 2) return;
    for (const s of data) {
      const cj = this.curSample - this.nowPlayedSample;
      if (cj < 0) {
        //  console.log("跟不上播放进度")
        this.curSample++;
        continue;
      }

      let buffer: Float32Array;
      while (!(buffer = this.sources[(cj / this.frameCount) | 0]?.buffer)) {
        this.addSource();
      }
      buffer[this.curSample++ % this.frameCount] = s;
    }
  }
  public close() {
    this.state = 2;
  }
}

export class PlayFlacAudio {
  public playPCMAudio: PlayPCMAudio;
  public readonly audioContext: AudioContext;
  public durationPerBuffer: number;
  public sampleRate: number;
  constructor(audioContext = new AudioContext(), durationPerBuffer: number = 1, sampleRate: number = 48000) {
    this.audioContext = audioContext;
    this.durationPerBuffer = durationPerBuffer;
    this.sampleRate = sampleRate;
    this.playPCMAudio = new PlayPCMAudio(this.audioContext, this.durationPerBuffer, this.sampleRate);
  }

  public readonly convertOutputAudioData = new ConvertOutputAudioData(([data]) => {
    this.playPCMAudio.sendData(Float32Array.from(new Int16Array(data.buffer), s => (s < 0 ? s / 0x8000 : s / 0x7fff)));
  });
  public lastQuality = 0;
  public sendFlacData(data: Uint8Array) {
    const nowQuality = this.playPCMAudio.quality();
    if (this.lastQuality < 0 && nowQuality < 0) this.restart();
    // console.log(nowQuality);
    this.lastQuality = nowQuality;
    this.convertOutputAudioData.sendData(new Uint8Array(data));
  }
  public restart() {
    this.playPCMAudio.close();
    this.playPCMAudio = new PlayPCMAudio(this.audioContext, this.durationPerBuffer, this.sampleRate);
  }
}
