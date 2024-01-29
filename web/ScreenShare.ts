/** RGB每个通道的容错率 */
const ErrorRate = 3;
/** 最大帧率 */
const Fps = 50;
/** 最大传输网速（字节/秒） */
const maxSpeed = 500 * 1024;
/** 最大传输网速统计周期（多少毫秒内） */
const speedStatistical = 3000;
const displayMediaOptions = {
  video: {
    cursor: "always",
    width: Math.min(screen.width, 1920),
    height: Math.min(screen.height, 1080),
    // frameRate: 10
  },
  audio: false,
};

const uid = "test" + Math.random().toString(16).substr(-6);
const ws = new URL(location.href);
ws.protocol = ws.protocol.replace("http", "ws");
ws.pathname = "/WebSocket";
ws.search = "?uid=" + uid;
const webSocket = new WebSocket(ws);

const showFps = document.createElement("div");
let framesPerSec = 0;
setInterval(() => {
  showFps.innerText = framesPerSec + "fps";
  framesPerSec = 0;
}, 1000);
document.body.appendChild(showFps);

const video = document.createElement("video");
video.autoplay = true;
window.onclick = async function () {
  window.onclick = null;
  try {
    video.srcObject = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
    const videoTrack = video.srcObject.getVideoTracks()[0];
    video.addEventListener("canplay", async () => {
      const height = video.videoHeight;
      const width = video.videoWidth;
      const offscreen = new OffscreenCanvas(width, height);
      const canvasToJpg = document.createElement("canvas");
      canvasToJpg.width = width;
      canvasToJpg.height = height;
      const contextToJpg = canvasToJpg.getContext("2d", { willReadFrequently: true });
      const context = offscreen.getContext("2d", { willReadFrequently: true });

      if (!context || !contextToJpg) return;
      contextToJpg.fillStyle = "#000";
      contextToJpg.fillRect(0, 0, width, height);

      const lastFam = new Uint8Array(height * width * 3);
      //  const sendData = new Uint8Array(height * width * 3);
      webSocket.send(new Uint16Array([width, height]));
      //   console.log(videoTrack);
      //   console.info(JSON.stringify(videoTrack.getSettings(), null, 2));
      //   console.info(JSON.stringify(videoTrack.getConstraints(), null, 2));
      let nowTime = performance.now();
      const dataList: [number, number][] = [];
      // let totalDatas = 0;
      while (videoTrack.readyState === "live") {
        await new Promise(r => setTimeout(r, 1000 / Fps + nowTime - (nowTime = Math.floor(performance.now()))));

        let totalDatas = 0;
        for (let i = 0; i < dataList.length; i++) {
          const [time, data] = dataList[i];
          if (time + speedStatistical < nowTime) {
            dataList.length = i;
            break;
          }
          totalDatas += data;
        }
        if (totalDatas > (maxSpeed * speedStatistical) / 1000) {
          console.log(totalDatas - maxSpeed, nowTime);
          continue;
        }
        context.drawImage(video, 0, 0, width, height);
        const nowFam = context.getImageData(0, 0, width, height);
        const canvasToJpgImageData = contextToJpg.getImageData(0, 0, width, height);
        let needSend = false;
        let p = 0;
        for (let i = 0; i < nowFam.data.length; i += 4) {
          const r = nowFam.data[i];
          const g = nowFam.data[i + 1];
          const b = nowFam.data[i + 2];

          const r1 = lastFam[p];
          const g1 = lastFam[p + 1];
          const b1 = lastFam[p + 2];

          if (Math.abs(r - r1) <= ErrorRate && Math.abs(b - b1) <= ErrorRate && Math.abs(g - g1) <= ErrorRate) {
            // lastFam[p] = sendData[p];
            // sendData[p] = 0;
            canvasToJpgImageData.data[i] = 0;
            canvasToJpgImageData.data[i + 1] = 0;
            canvasToJpgImageData.data[i + 2] = 0;
            canvasToJpgImageData.data[i + 3] = 0;
          } else {
            //  debugger;
            needSend = true;
            lastFam[p] = canvasToJpgImageData.data[i] = r;
            lastFam[p + 1] = canvasToJpgImageData.data[i + 1] = g;
            lastFam[p + 2] = canvasToJpgImageData.data[i + 2] = b;
            canvasToJpgImageData.data[i + 3] = 255;
          }
          p += 3;
        }
        framesPerSec++;
        // console.log(webp.byteLength);
        if (needSend) {
          contextToJpg.putImageData(canvasToJpgImageData, 0, 0);
          const webp = await new Promise<ArrayBuffer>(r =>
            canvasToJpg.toBlob(
              a => new Response(a?.stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer().then(r),
              "image/webp",
              1
            )
          );

          dataList.unshift([nowTime, webp.byteLength]);
          webSocket.send(webp);
        }
      }
    });
  } catch (err) {
    console.error("Error: " + err);
  }
};

const canvas = document.createElement("canvas");
// canvas.style.maxWidth = "100vw";
// canvas.style.maxHeight = "100vh";
document.body.appendChild(canvas);
const context = canvas.getContext("2d");

let myImageData: ImageData; // = context.getImageData(left, top, width, height);
webSocket.onmessage = async ({ data }: { data: Blob }) => {
  if (!context) return;

  try {
    // const nowFam = new Uint8Array(await new Response().arrayBuffer());

    const img = new Image();
    img.src = URL.createObjectURL(
      await new Response(data.stream().pipeThrough(new DecompressionStream("gzip"))).blob()
    );
    img.onload = () => {
      framesPerSec++;
      context.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
    };

    //  URL.revokeObjectURL(img.src);
    // let p = 0;
    // for (let i = 0; i < myImageData.data.length; i++) {
    //   if (i % 4 === 3) continue;
    //   if (nowFam[p]) {
    //     // console.log(nowFam[p]);
    //     myImageData.data[i] = nowFam[p];
    //   }
    //   p++;
    // }
    // context.putImageData(myImageData, 0, 0);
  } catch (e) {
    const [width, height] = new Uint16Array(await data.arrayBuffer());
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    myImageData = context.getImageData(0, 0, width, height);
    // canvas.style.transform = `rotate(${screen.width < screen.height && width > height ? 90 : 0}deg)`;
  }
};

// function stopCapture(evt) {
//   let tracks = video.srcObject.getTracks();
//   tracks.forEach(track => track.stop());
//   video.srcObject = null;
// }
