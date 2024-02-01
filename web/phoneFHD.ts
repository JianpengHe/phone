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
const mediaStreamConstraints: MediaStreamConstraints = {
  audio: mediaStreamConstraintsAudio,
};

const ws = new URL(location.href);
ws.protocol = ws.protocol.replace("http", "ws");
ws.search = "?uid=" + uid;
ws.pathname = "/WebSocket";
const phoneWebSocketUrl = String(ws);
ws.pathname = "/WebSocketVideo";
const videoWebSocketUrl = String(ws);

(() => {
  const phoneTimerDOM = document.getElementById("phoneTimer");
  const phoneCancel = document.getElementById("phoneCancel");
  const phoneText = document.getElementById("phoneText");
  const script = document.getElementById("script");

  if (!phoneTimerDOM || !phoneCancel || !phoneText || !script) return;

  phoneCancel.onclick = function () {
    phoneCancel.style.display = "none";
    phoneText.innerHTML = "呼叫结束";
    state = 9;
    phoneTimer && clearInterval(phoneTimer);
  };

  let time = 0;
  /** 0刚打开，1Flac加载成功，2已发送第一帧，5点击了发起通话，6正在通话，9点击结束通话 */
  let state = 0;
  let phoneTimer = 0;
  // let isPc = navigator.platform.toLowerCase().includes("win") || navigator.platform.toLowerCase().includes("mac");
  const start = () => {
    state = 6;
    phoneText.innerHTML = "";
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
  };
  navigator.mediaDevices.getUserMedia(mediaStreamConstraints).then(async a => {
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
        script.innerHTML += "<p>优先选择：" + label + "</p>";
        mediaStreamConstraintsAudio.deviceId = deviceId;
        break;
      }
    }
    allDevices.forEach(function (device) {
      //audioinput   videoinput（视频）  audiooutput(音频)
      script.innerHTML += "<p>" + device.label + "</p>";
    });
  });
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

    new GetUserMediaAudioToFlac(await navigator.mediaDevices.getUserMedia(mediaStreamConstraints)).onFlacData(
      (buf, currentFrame) => {
        //  console.log(currentFrame)
        webSocket.send(buf);
        if (state === 1) {
          state = 2;
          return;
        }

        if (state === 6 && buf.byteLength > 300) {
          const totalSize = buf.byteLength;
          const ms = -time + (time = performance.now());
          script.innerHTML =
            "<p>" +
            ((totalSize * 8) / ms).toFixed(2) +
            " kbps</p>" +
            "<p>" +
            ((totalSize * 100) / ((Number(mediaStreamConstraintsAudio.sampleRate) / 1000) * (16 / 8) * ms)).toFixed(2) +
            " %</p><p>录音延迟" +
            (-time2 + (time2 = performance.now())).toFixed(2) +
            " ms</p><p>放音延迟" +
            (playFlacAudio.playPCMAudio?.quality() / (Number(mediaStreamConstraintsAudio.sampleRate) / 1000)).toFixed(
              1
            ) +
            "ms</p>";
        }
      }
    );
  };
  document.getElementById("phoneCall")?.addEventListener("click", async function () {
    state = 5;
    playFlacAudio = new PlayFlacAudio();
    this.style.display = "none";
    phoneCancel.style.display = "";
    phoneText.innerHTML = "正在拨号";
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
