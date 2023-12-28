"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayFlacAudio = exports.PlayPCMAudio = exports.GetUserMediaAudioToFlac = exports.GetUserMediaAudio = exports.ConvertOutputAudioData = exports.ConvertInputAudioData = void 0;
document.write(`<script src="/libflac.js-5.4.0/libflac.wasm.js"></scr` + `ipt>`);
class ConvertInputAudioData {
    flac_encoder;
    sample_rate = 48000;
    channels = 1;
    bps = 16;
    compression_level = 1;
    total_samples;
    is_verify = true;
    block_size;
    constructor(write_callback_fn = () => { }, metadata_callback_fn = () => { }, opt = {}) {
        for (const k in opt) {
            this[k] = opt[k] ?? this[k];
        }
        this.flac_encoder = Flac.create_libflac_encoder(this.sample_rate, this.channels, this.bps, this.compression_level, this.total_samples, this.is_verify);
        if (this.flac_encoder === 0) {
            Flac.FLAC__stream_encoder_delete(this.flac_encoder);
            this.flac_encoder = 0;
            throw new Error("Error initializing the encoder.");
        }
        console.log("flac encoder init: ", Flac.init_encoder_stream(this.flac_encoder, write_callback_fn, metadata_callback_fn, 0));
    }
    sendData(buf) {
        if (!this.flac_encoder)
            return;
        if (!Flac.FLAC__stream_encoder_process_interleaved(this.flac_encoder, buf, buf.length)) {
            Flac.FLAC__stream_encoder_delete(this.flac_encoder);
            this.flac_encoder = 0;
            throw new Error("Error: FLAC__stream_encoder_process_interleaved returned false. ");
        }
    }
}
exports.ConvertInputAudioData = ConvertInputAudioData;
class ConvertOutputAudioData {
    flac_decoder;
    is_verify = false;
    error_callback_fn = (errorCode, errorDescription) => {
    };
    constructor(write_callback_fn = () => { }, metadata_callback_fn = () => { }, opt = {}) {
        for (const k in opt) {
            this[k] = opt[k] ?? this[k];
        }
        this.flac_decoder = Flac.create_libflac_decoder(this.is_verify);
        if (this.flac_decoder === 0) {
            Flac.FLAC__stream_decoder_delete(this.flac_decoder);
            throw new Error("Error initializing the decoder.");
        }
        console.log("flac decoder init: ", Flac.init_decoder_stream(this.flac_decoder, this.read_callback_fn.bind(this), write_callback_fn, this.error_callback_fn, metadata_callback_fn, false));
    }
    buffer = new Uint8Array();
    read_callback_fn = numberOfBytes => {
        let readDataLength = 0;
        if (this.buffer.length > numberOfBytes) {
            readDataLength = numberOfBytes;
        }
        else if (this.buffer.length === 1) {
            readDataLength = 1;
        }
        else if (this.buffer.length === 0) {
            readDataLength = 0;
            throw new Error("读不到了");
        }
        else {
            readDataLength = this.buffer.length;
        }
        const buffer = this.buffer.subarray(0, readDataLength);
        this.buffer = this.buffer.subarray(readDataLength);
        return { buffer, readDataLength, error: false };
    };
    sendData(buf) {
        const mergedArray = new Uint8Array(this.buffer.length + buf.length);
        mergedArray.set(this.buffer);
        mergedArray.set(buf, this.buffer.length);
        this.buffer = mergedArray;
        while (this.buffer.length) {
            Flac.FLAC__stream_decoder_process_single(this.flac_decoder);
        }
    }
}
exports.ConvertOutputAudioData = ConvertOutputAudioData;
class GetUserMediaAudio {
    audioContext;
    source;
    constructor(mediaStream, audioContext = new AudioContext()) {
        this.audioContext = audioContext;
        this.source = this.audioContext.createMediaStreamSource(mediaStream);
        const objectUrl = URL.createObjectURL(new Blob([
            "(" +
                String(() => {
                    registerProcessor("audioInput", class extends AudioWorkletProcessor {
                        constructor() {
                            super();
                        }
                        process(inputs) {
                            this.port.postMessage({ inputs });
                            return true;
                        }
                    });
                }) +
                ")()",
        ], { type: "application/javascript; charset=utf-8" }));
        this.audioContext.audioWorklet.addModule(objectUrl).then(() => {
            URL.revokeObjectURL(objectUrl);
            const node = new AudioWorkletNode(audioContext, "audioInput");
            this.source.connect(node).connect(audioContext.destination);
            node.port.onmessage = ({ data }) => this.onDataFn(data.inputs);
        });
    }
    onDataFn(inputs) {
        console.log(inputs);
    }
    onData(onDataFn) {
        this.onDataFn = onDataFn;
        return this;
    }
}
exports.GetUserMediaAudio = GetUserMediaAudio;
class GetUserMediaAudioToFlac extends GetUserMediaAudio {
    convertInputAudioData;
    flacBufferCache = new Uint8Array();
    currentFrame = 0;
    write_callback_fn = (data, numberOfBytes, samples, currentFrame) => {
        if (!this.currentFrame)
            this.currentFrame = currentFrame;
        if (this.flacBufferCache.length) {
            const mergedArray = new Uint8Array(this.flacBufferCache.length + data.length);
            mergedArray.set(this.flacBufferCache);
            mergedArray.set(data, this.flacBufferCache.length);
            this.flacBufferCache = mergedArray;
        }
        else {
            this.flacBufferCache = data;
        }
        if (this.flacBufferCache.length > 1024) {
            this.onFlacDataFn(this.flacBufferCache, this.currentFrame);
            this.currentFrame = 0;
            this.flacBufferCache = new Uint8Array();
        }
    };
    constructor(mediaStream, audioContext = new AudioContext()) {
        super(mediaStream, audioContext);
        this.convertInputAudioData = new ConvertInputAudioData(this.write_callback_fn.bind(this));
    }
    onDataFn(inputs) {
        this.convertInputAudioData.sendData(Int32Array.from(inputs[0][0], s => {
            s = Math.max(-1, Math.min(1, s));
            return s < 0 ? s * 0x8000 : s * 0x7fff;
        }));
    }
    onFlacDataFn(data, currentFrame) {
        console.log(data);
    }
    onFlacData(onFlacDataFn) {
        this.onFlacDataFn = onFlacDataFn;
        return this;
    }
}
exports.GetUserMediaAudioToFlac = GetUserMediaAudioToFlac;
class PlayPCMAudio {
    audioContext;
    durationPerBuffer;
    sampleRate;
    frameCount;
    sources = [];
    nowPlayedSample = 0;
    curSample = 0;
    state = 0;
    constructor(audioContext = new AudioContext(), durationPerBuffer = 1, sampleRate = 48000) {
        this.audioContext = audioContext;
        this.durationPerBuffer = durationPerBuffer;
        this.sampleRate = sampleRate;
        this.frameCount = sampleRate * durationPerBuffer;
    }
    addSource() {
        if (this.state === 2)
            return;
        const myArrayBuffer = this.audioContext.createBuffer(1, this.frameCount, this.sampleRate);
        const buffer = myArrayBuffer.getChannelData(0);
        const source = this.audioContext.createBufferSource();
        source.buffer = myArrayBuffer;
        source.connect(this.audioContext.destination);
        source.onended = () => {
            this.nowPlayedSample += this.frameCount;
            this.sources.shift();
            if (!this.sources[0])
                this.addSource();
            this.sources[0]?.source?.start();
        };
        this.sources.push({ buffer, source });
    }
    sendData(data) {
        if (!this.state) {
            this.state = 1;
            setTimeout(() => this.sources[0].source.start(), 80);
        }
        if (this.state === 2)
            return;
        for (const s of data) {
            const cj = this.curSample - this.nowPlayedSample;
            if (cj < 0) {
                this.curSample++;
                continue;
            }
            let buffer;
            while (!(buffer = this.sources[(cj / this.frameCount) | 0]?.buffer)) {
                this.addSource();
            }
            buffer[this.curSample++ % this.frameCount] = s;
        }
    }
    close() {
        this.state = 2;
    }
}
exports.PlayPCMAudio = PlayPCMAudio;
class PlayFlacAudio {
    playPCMAudio;
    audioContext;
    durationPerBuffer;
    sampleRate;
    constructor(audioContext = new AudioContext(), durationPerBuffer = 1, sampleRate = 48000) {
        this.audioContext = audioContext;
        this.durationPerBuffer = durationPerBuffer;
        this.sampleRate = sampleRate;
        this.playPCMAudio = new PlayPCMAudio(this.audioContext, this.durationPerBuffer, this.sampleRate);
    }
    convertOutputAudioData = new ConvertOutputAudioData(([data]) => {
        this.playPCMAudio.sendData(Float32Array.from(new Int16Array(data.buffer), s => (s < 0 ? s / 0x8000 : s / 0x7fff)));
    });
    sendFlacData(data) {
        this.convertOutputAudioData.sendData(new Uint8Array(data));
    }
    restart() {
        this.playPCMAudio.close();
        this.playPCMAudio = new PlayPCMAudio(this.audioContext, this.durationPerBuffer, this.sampleRate);
    }
}
exports.PlayFlacAudio = PlayFlacAudio;
//# sourceMappingURL=flac.wasm.js.map