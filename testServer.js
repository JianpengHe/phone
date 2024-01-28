"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const https = require("https");
const fs = require("fs");
const zlib = require("zlib");
const child_process = require("child_process");
const path = require("path");
const os = require("os");
const WebSocket_1 = require("../tools/dist/node/WebSocket");
const get = () => new Promise(r => https.get("https://tool.hejianpeng.cn/certificate/t.hejianpeng.com", async (res) => {
    const body = [];
    for await (const chunk of res) {
        body.push(chunk);
    }
    r(Buffer.concat(body));
}));
const myName = path.parse(__filename).name;
const userWebSocket = new Map();
const userChat = new Map();
const fileMap = new Map();
(async () => {
    https
        .createServer(os.userInfo().username === "Administrator"
        ? {
            key: await fs.promises.readFile("../sz.hejianpeng.cn.key"),
            cert: await fs.promises.readFile("../sz.hejianpeng.cn.crt"),
        }
        : JSON.parse(String(await get())), (req, res) => {
        if (!req.url)
            return;
        const url = new URL("http://127.0.0.1" + req.url);
        if (url.pathname === "/WebSocket") {
            const uid = url.searchParams.get("uid");
            if (!uid) {
                res.end("403");
                return;
            }
            const webSocket = new WebSocket_1.WebSocket(req, res, {})
                .on("subStream", async (subStream) => {
                const body = [];
                for await (const chunk of subStream) {
                    body.push(chunk);
                }
                const buffer = Buffer.concat(body);
                fileMap.get(webSocket)?.write(buffer);
                userChat.get(webSocket)?.send(buffer);
            })
                .on("close", () => {
                setTimeout(() => {
                    fileMap.get(webSocket)?.end();
                    fileMap.delete(webSocket);
                }, 500);
                const otherWebSocket = userChat.get(webSocket);
                if (otherWebSocket)
                    userChat.set(otherWebSocket, null);
                userChat.delete(webSocket);
                if (userWebSocket.get(uid) === webSocket)
                    userWebSocket.delete(uid);
                console.log(new Date().toLocaleString(), uid, "断开连接", "剩余用户", userChat.size, userWebSocket.size);
            })
                .on("error", e => {
                console.log(e);
            });
            if (!webSocket.isWebSocket) {
                res.end("404");
            }
            else {
                const oldWebSocket = userWebSocket.get(uid);
                if (oldWebSocket) {
                    const oldOtherWebSocket = userChat.get(oldWebSocket);
                    if (oldOtherWebSocket)
                        userChat.set(oldOtherWebSocket, null);
                    userChat.delete(oldWebSocket);
                    userWebSocket.delete(uid);
                }
                userWebSocket.set(uid, webSocket);
                !/^test/.test(uid) &&
                    fileMap.set(webSocket, fs.createWriteStream(new Date().getTime() + "." + uid + ".temp"));
                for (const [otherWebSocket, u] of userChat) {
                    if (!u) {
                        userChat.set(webSocket, otherWebSocket);
                        userChat.set(otherWebSocket, webSocket);
                        console.log(new Date().toLocaleString(), uid, "匹配成功", "当前用户", userChat.size, userWebSocket.size);
                        return;
                    }
                }
                console.log(new Date().toLocaleString(), uid, "待匹配", "当前用户", userChat.size, userWebSocket.size);
                userChat.set(webSocket, null);
            }
            return;
        }
        const fullPath = path.resolve(__dirname + decodeURIComponent(url.pathname));
        if (fullPath.indexOf(path.resolve(__dirname)) !== 0) {
            console.log(path.resolve(__dirname), fullPath);
            res.end("403");
            return;
        }
        console.log(req.method, fullPath);
        if (/[\\\/]$/.test(url.pathname)) {
            fs.readdir(fullPath, (err, d) => res.end(JSON.stringify(d.filter(fileName => !fileName.includes(myName) && /\.js$/.test(fileName)) || [])));
            return;
        }
        if (req.method === "GET" || req.method === "HEAD") {
            fs.stat(fullPath, (err, a) => {
                if (err) {
                    res.end("404");
                    return;
                }
                if (/\.wasm$/.test(fullPath)) {
                    res.setHeader("Content-type", "application/wasm");
                }
                res.setHeader("Content-Length", a.size);
                res.setHeader("Accept-Ranges", "bytes");
                const range = String(req.headers["range"] || "")
                    .toLowerCase()
                    .match(/bytes=(\d+)-(\d*)/);
                const start = Number(range?.[1] || 0);
                const end = Number(range?.[2] || 0);
                if (start || end) {
                    if (start >= a.size || end >= a.size) {
                        res.statusCode = 416;
                        res.setHeader("Content-Range", `bytes */${a.size}`);
                        res.end("416");
                        return;
                    }
                    res.setHeader("Content-Range", `bytes ${start}-${end ? end : a.size - 1}/${a.size}`);
                }
                if (req.method === "HEAD") {
                    res.end();
                }
                else {
                    const f = fs.createReadStream(fullPath, { start, end: end || a.size });
                    f.pipe(res);
                    f.once("error", () => {
                        res.end("404");
                        return;
                    });
                }
            });
            return;
        }
        if (req.method === "PUT") {
            let name;
            if (url.pathname.includes("deflate") && (name = Number(url.pathname.substr(1, 13)))) {
                const w = fs.createWriteStream(name + ".webm");
                req.pipe(zlib.createInflate()).pipe(w);
                w.once("close", () => {
                    res.end(`{}`);
                    child_process.exec(`ffmpeg.exe -i ^"${__dirname + "/" + (name + ".webm")}^" -ac 1 -f wav ^"${__dirname + "/" + name + ".wav.temp"}^"`, async () => {
                        await fs.promises.unlink(name + ".webm");
                        await fs.promises.rename(name + ".wav.temp", name + ".wav");
                        const { size } = await fs.promises.stat(name + ".wav");
                        console.log(size);
                        child_process.exec(`flac.exe -8 -f  --delete-input-file "${name}.wav" && fileTime.exe "${name}.flac" ${Math.floor(name / 1000)} ${Math.floor(name / 1000 + size / 2 / 48000)} `, () => { });
                    });
                });
            }
            else {
                req.pipe(fs.createWriteStream(url.pathname.replace(/[\\\/]/g, "") + "." + Math.random() + ".temp"));
                req.once("close", () => {
                    res.end(`{}`);
                });
            }
            return;
        }
        res.end("404");
    })
        .listen(48452, () => {
        console.log(myName, "https://t.hejianpeng.com:48452");
    });
})();
//# sourceMappingURL=testServer.js.map