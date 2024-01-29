"use strict";
var displayMediaOptions = {
    video: {
        cursor: "always",
        width: Math.min(screen.width, 1920 * 0.75),
        height: Math.min(screen.height, 1080 * 0.75),
    },
    audio: false,
};
const uid = "test" + Math.random().toString(16).substr(-6);
const ws = new URL(location.href);
ws.protocol = ws.protocol.replace("http", "ws");
ws.pathname = "/WebSocket";
ws.search = "?uid=" + uid;
const webSocket = new WebSocket(ws);
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
            document.body.appendChild(canvasToJpg);
            canvasToJpg.width = width;
            canvasToJpg.height = height;
            const contextToJpg = canvasToJpg.getContext("2d", { willReadFrequently: true });
            const context = offscreen.getContext("2d", { willReadFrequently: true });
            if (!context || !contextToJpg)
                return;
            contextToJpg.fillStyle = "#000";
            contextToJpg.fillRect(0, 0, width, height);
            const lastFam = new Uint8Array(height * width * 3);
            const sendData = new Uint8Array(height * width * 3);
            webSocket.send(new Uint16Array([width, height]));
            let time = performance.now();
            while (videoTrack.readyState === "live") {
                await new Promise(r => setTimeout(r, Math.min(50, +time - (time = performance.now()))));
                context.drawImage(video, 0, 0, width, height);
                const nowFam = context.getImageData(0, 0, width, height);
                const canvasToJpgImageData = contextToJpg.getImageData(0, 0, width, height);
                let needSend = false;
                let p = 0;
                for (let i = 0; i < nowFam.data.length; i++) {
                    if (i % 4 === 3)
                        continue;
                    const nowPix = nowFam.data[i] || 1;
                    if (Math.abs(lastFam[p] - nowPix) < 5) {
                        sendData[p] = 0;
                        canvasToJpgImageData.data[i] = 0;
                    }
                    else {
                        canvasToJpgImageData.data[i] = lastFam[p] = sendData[p] = nowPix;
                        needSend = true;
                    }
                    p++;
                }
                contextToJpg.putImageData(canvasToJpgImageData, 0, 0);
                const [webp, raw] = await Promise.all([
                    new Promise(r => canvasToJpg.toBlob(a => new Response(a?.stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer().then(r), "image/webp", 1)),
                    new Response(new Response(sendData).body?.pipeThrough(new CompressionStream("gzip"))).arrayBuffer(),
                ]);
                console.log(webp.byteLength, raw.byteLength);
                needSend && webSocket.send(raw);
            }
        });
    }
    catch (err) {
        console.error("Error: " + err);
    }
};
const canvas = document.createElement("canvas");
canvas.style.maxWidth = "100vw";
canvas.style.maxHeight = "100vh";
document.body.appendChild(canvas);
const context = canvas.getContext("2d");
let myImageData;
webSocket.onmessage = async ({ data }) => {
    if (!context)
        return;
    try {
        const nowFam = new Uint8Array(await new Response(data.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
        let p = 0;
        for (let i = 0; i < myImageData.data.length; i++) {
            if (i % 4 === 3)
                continue;
            if (nowFam[p]) {
                myImageData.data[i] = nowFam[p];
            }
            p++;
        }
        context.putImageData(myImageData, 0, 0);
    }
    catch (e) {
        const [width, height] = new Uint16Array(await data.arrayBuffer());
        canvas.width = width;
        canvas.height = height;
        context.fillStyle = "#000";
        context.fillRect(0, 0, width, height);
        myImageData = context.getImageData(0, 0, width, height);
        canvas.style.transform = `rotate(${screen.width < screen.height && width > height ? 90 : 0}deg)`;
    }
};
//# sourceMappingURL=ScreenShare.js.map