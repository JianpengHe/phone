import { GetUserMediaAudioToFlac, PlayFlacAudio } from "./flac.wasm";
import { ReliableWebSocket } from "../../code-snippet/browser/ReliableWebSocket";

/// <reference path='../libflac.js-5.4.0/libflac.wasm.d.ts'/>
const { searchParams } = new URL(location.href);
const uid = searchParams.get("uid") || Math.random().toString(16).substr(-6);
let playFlacAudio: PlayFlacAudio;
const mediaStreamConstraintsAudio: MediaTrackConstraints = {
  sampleRate: 48000,
  //   sampleSize: 16,
  autoGainControl: Boolean(searchParams.get("autoGainControl")),
  noiseSuppression: Boolean(searchParams.get("noiseSuppression")),
  echoCancellation: Boolean(searchParams.get("echoCancellation")),
};
const isPc = navigator.platform.toLowerCase().includes("win") || navigator.platform.toLowerCase().includes("mac");
const mediaStreamConstraints: MediaStreamConstraints = {
  audio: mediaStreamConstraintsAudio,
  video: !searchParams.get("disableCamera") && { facingMode: "user", height: 720, width: 1280 },
};

const ws = new URL(location.href);
ws.protocol = ws.protocol.replace("http", "ws");
ws.search = "?uid=" + uid;
ws.pathname = "/WebSocket";
const phoneWebSocketUrl = String(ws);
ws.pathname = "/WebSocketVideo";
const videoWebSocketUrl = String(ws);

(async () => {
  const phoneTimerDOM = document.getElementById("phoneTimer");
  const phoneCancelDOM = document.getElementById("phoneCancel");
  const duringDOM = document.getElementById("during");

  const phoneTextDOM = document.getElementById("phoneText");
  const scriptDOM = document.getElementById("script");
  const video = document.getElementById("myVideo") as HTMLVideoElement;
  const videoCall = document.getElementById("videoCall");
  const main = document.getElementById("main");

  if (!phoneTimerDOM || !phoneCancelDOM || !phoneTextDOM || !scriptDOM || !duringDOM || !videoCall || !main) return;

  /** 申请权限 */
  while (1) {
    try {
      const a = await navigator.mediaDevices.getUserMedia(mediaStreamConstraints);
      // alert(JSON.stringify(a.getTracks()[0].getSettings()))
      a.getTracks().forEach(track => track.stop());
      const allDevices = (await navigator.mediaDevices.enumerateDevices()).filter(
        ({ kind, deviceId }) => kind === "audioinput"
      );
      if (allDevices.find(({ label }) => label.includes("bluetooth"))) alert("请关闭蓝牙开关，暂不支持蓝牙耳机");

      for (const keyword of ["usb", "wire", "speaker"]) {
        const { deviceId, label } = allDevices.find(({ label }) => label.toLowerCase().includes(keyword)) || {};
        if (deviceId) {
          if (String(label).toLowerCase().includes("speaker"))
            phoneTimerDOM.innerHTML = "当前使用的是扬声器，通话质量会非常差，建议使用有线耳机！";
          scriptDOM.innerHTML += "<p>优先选择：" + label + "</p>";
          mediaStreamConstraintsAudio.deviceId = deviceId;
          break;
        }
      }
      allDevices.forEach(function (device) {
        //audioinput   videoinput（视频）  audiooutput(音频)
        scriptDOM.innerHTML += "<p>" + device.label + "</p>";
      });
      break;
    } catch (e) {
      console.log(e);
      const res = String(e).toLowerCase();
      if (res.includes("permission denied")) {
        alert("没有麦克风/摄像头权限");
        location.reload();
      } else if (res.includes("device not found")) {
        if (mediaStreamConstraints.video) {
          delete mediaStreamConstraints.video;
          continue;
        } else if (mediaStreamConstraints.audio) {
          phoneTimerDOM.innerHTML = "没找到麦克风设备";
          delete mediaStreamConstraints.audio;
          break;
        } else {
          break;
        }
      } else {
        phoneTimerDOM.innerHTML = res;
        break;
      }
    }
  }

  videoCall.onclick = () => {
    video.style.display = video.style.display === "block" ? "none" : "block";
  };
  phoneCancelDOM.onclick = () => {
    duringDOM.style.display = "none";
    phoneTextDOM.innerHTML = "呼叫结束";
    state = 9;
    phoneTimer && clearInterval(phoneTimer);
    video.style.display === "block" && videoCall.click();
  };

  let time = 0;
  /** 0刚打开，1Flac加载成功，2已发送第一帧，5点击了发起通话，6正在通话，9点击结束通话 */
  let state = 0;
  let phoneTimer = 0;
  //
  const start = () => {
    state = 6;
    phoneTextDOM.innerHTML = "";
    phoneTimerDOM.innerHTML = "00:00";
    phoneTimer = Number(
      setInterval(function () {
        time++;
        phoneTimerDOM.innerHTML =
          (time >= 3600 ? ((time / 3600) | 0) + ":" : "") +
          ((((time / 60) | 0) % 60) + 100 + ":").substr(1) +
          ((time % 60) + 100 + "").substr(1);
      }, 1000)
    );
    /** 全屏 */
    // document.body?.requestFullscreen?.();
  };
  const mediaStream = await navigator.mediaDevices.getUserMedia(mediaStreamConstraints);
  Flac.onready = async () => {
    let time = performance.now();
    let time2 = performance.now();
    const webSocket = new ReliableWebSocket(phoneWebSocketUrl);
    webSocket.addEventListener("message", ({ data }) => {
      switch (state) {
        case 6: //(isPc || !document.hidden) &&
          data.arrayBuffer().then(audioData => playFlacAudio?.sendFlacData(audioData));
          return;
        case 5:
          start();
          return;
      }
    });

    window.onclick = e => {
      playFlacAudio?.restart();
      wakeLock(e);
    };

    new GetUserMediaAudioToFlac(mediaStream).onFlacData((buf, currentFrame) => {
      //  console.log(currentFrame)
      webSocket.send(buf);
      if (state === 1) {
        state = 2;
        return;
      }

      if (state === 6 && buf.byteLength > 300) {
        const totalSize = buf.byteLength;
        const ms = -time + (time = performance.now());
        scriptDOM.innerHTML =
          "<p>" +
          ((totalSize * 8) / ms).toFixed(2) +
          " kbps</p>" +
          "<p>" +
          ((totalSize * 100) / ((Number(mediaStreamConstraintsAudio.sampleRate) / 1000) * (16 / 8) * ms)).toFixed(2) +
          " %</p><p>录音延迟" +
          (-time2 + (time2 = performance.now())).toFixed(2) +
          " ms</p><p>放音延迟" +
          (playFlacAudio.playPCMAudio?.quality() / (Number(mediaStreamConstraintsAudio.sampleRate) / 1000)).toFixed(1) +
          "ms</p>";
      }
    });
  };

  (() => {
    if (mediaStreamConstraints.video) {
      video.srcObject = mediaStream;
      video.play();
    }
    const webSocket = new ReliableWebSocket(videoWebSocketUrl);
    const canvas = document.createElement("canvas");
    // canvas.style.maxWidth = "100vw";
    // canvas.style.maxHeight = "100vh";
    document.body.appendChild(canvas);
    const context = canvas.getContext("2d");
    const screenShare = document.getElementById("screenShare");
    if (!context || !screenShare) return;
    screenShare.onclick = () => {
      if (!isPc) return;
      webSocket.close();
      window.open("ScreenShare.html", "ScreenShare", "height=600,width=600");
    };
    const queue: HTMLImageElement[] = [];
    const tryTo = () => {
      let img: HTMLImageElement | undefined;
      while (queue[0]?.dataset?.load && (img = queue.shift())) {
        const { height, width } = img;

        if (height && canvas.height !== height) {
          canvas.height = height;
          isStart || start(width, height);
        }
        if (width && canvas.width !== width) {
          canvas.width = width;
          isStart || start(width, height);
        }

        context.drawImage(img, 0, 0);
      }
    };
    //  let myImageData: ImageData; // = context.getImageData(left, top, width, height);
    webSocket.addEventListener("message", async ({ data }: { data: Blob }) => {
      if (state !== 6) return;
      try {
        // nowQueueId++;
        const img = new Image();
        queue.push(img);
        img.src = URL.createObjectURL(
          await new Response(data.stream().pipeThrough(new DecompressionStream("gzip"))).blob()
        );

        img.onload = () => {
          // framesPerSec++;
          // context.drawImage(img, 0, 0);
          URL.revokeObjectURL(img.src);
          img.dataset.load = "1";
          tryTo();
        };
      } catch (e) {
        const [width, height] = new Uint16Array(await data.arrayBuffer());
        canvas.width = width;
        canvas.height = height;
        context.fillStyle = "#000";
        context.fillRect(0, 0, width, height);
        //  myImageData = context.getImageData(0, 0, width, height);
        queue.length = 0;
        // canvas.style.transform = `rotate(${screen.width < screen.height && width > height ? 90 : 0}deg)`;
      }
    });
    let isStart = false;
    let mainShowTimer = 0;
    const start = (width: number, height: number) => {
      isStart = true;
      main.style.animation = "hide 0.5s forwards";
      context.fillStyle = "#000";
      context.fillRect(0, 0, width, height);
      document.body.onclick = () => {
        mainShowTimer && clearTimeout(mainShowTimer);
        main.style.animation = "show 0.5s forwards";
        mainShowTimer = Number(
          setTimeout(() => {
            mainShowTimer = 0;
            main.style.animation = "hide 0.5s forwards";
          }, 3000)
        );
      };
    };

    const videoTrack = mediaStream.getVideoTracks()[0];
    video.addEventListener("canplay", async () => {
      const height = video.videoHeight;
      const width = video.videoWidth;
      const offscreen = new OffscreenCanvas(width, height);
      const context = offscreen.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      while (videoTrack.readyState === "live") {
        await new Promise(r => setTimeout(r, 10000));
        context.drawImage(video, 0, 0, width, height);

        const webp = await new Response(
          (
            await offscreen.convertToBlob({
              quality: 1,
              type: "image/webp",
            })
          )
            .stream()
            .pipeThrough(new CompressionStream("gzip"))
        ).arrayBuffer();
        webSocket.send(webp);
      }
    });
  })();
  document.getElementById("phoneCall")?.addEventListener("click", async function () {
    state = 5;
    playFlacAudio = new PlayFlacAudio();
    this.style.display = "none";
    duringDOM.style.display = "";
    phoneTextDOM.innerHTML = "正在拨号";
    wakeLock();
  });

  const wakeLock = (e?: any) => {
    if (document.hidden) return;
    if (navigator.wakeLock) {
      navigator.wakeLock.request("screen");
      //   alert("支持锁定")
    } else if (!e) {
      alert("不支持锁定，请一直保持APP前台");
    }
  };
  setInterval(() => wakeLock(1), 10000);
  // document.getElementById("phoneCall").click()
})();
