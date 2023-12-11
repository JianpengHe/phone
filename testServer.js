const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const zlib = require("zlib");
const child_process = require("child_process");
const path = require("path");
const { WebSocket } = require("../tools/dist/node/WebSocket");
const isDev = os.userInfo().username !== "Administrator";
const myName = path.parse(__filename).name;

(isDev ? http : https)

  .createServer(
    isDev ? {} : { key: fs.readFileSync("../sz.hejianpeng.cn.key"), cert: fs.readFileSync("../sz.hejianpeng.cn.crt") },
    (req, res) => {
      if (req.url === "/WebSocket") {
        let file;
        const fileName = new Date().getTime() + ".temp";
        const t = new WebSocket(req, res, {})
          .on("subStream", subStream => {
            if (!file) {
              file = fs.createWriteStream(fileName);
            }
            subStream.pipe(file, { end: false });
          })
          .on("close", () => {
            file && file.end();
          })
          .on("error", e => {
            console.log(e);
          });
        if (!t.isWebSocket) {
          res.end("404");
        }
        return;
      }

      const fullPath = path.resolve(__dirname + decodeURIComponent(new URL("http://127.0.0.1" + req.url).pathname));
      /** 不允许脱离当前目录 */
      if (fullPath.indexOf(path.resolve(__dirname)) !== 0) {
        console.log(path.resolve(__dirname), fullPath);
        res.end("403");
        return;
      }
      console.log(req.method, fullPath);
      if (/[\\\/]$/.test(req.url)) {
        fs.readdir(fullPath, (err, d) =>
          res.end(JSON.stringify(d.filter(fileName => !fileName.includes(myName) && /\.js$/.test(fileName)) || []))
        );
        return;
      }
      if (req.method === "GET" || req.method === "HEAD") {
        fs.stat(fullPath, (err, a) => {
          if (err) {
            res.end("404");
            return;
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
          } else {
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
        // if (new Date().getHours() < 9) {
        //   res.end(`{}`);
        //   return;
        // }
        let name;
        if (req.url.includes("deflate") && (name = Number(req.url.substr(1, 13)))) {
          const w = fs.createWriteStream(name + ".webm");
          req.pipe(zlib.createInflate()).pipe(w);
          w.once("close", () => {
            res.end(`{}`);
            child_process.exec(
              `ffmpeg.exe -i ^"${__dirname + "/" + (name + ".webm")}^" -ac 1 -f wav ^"${
                __dirname + "/" + name + ".wav.temp"
              }^"`,
              async () => {
                await fs.promises.unlink(name + ".webm");
                await fs.promises.rename(name + ".wav.temp", name + ".wav");
                const { size } = await fs.promises.stat(name + ".wav");
                console.log(size);
                child_process.exec(
                  `flac.exe -8 -f  --delete-input-file "${name}.wav" && fileTime.exe "${name}.flac" ${Math.floor(
                    name / 1000
                  )} ${Math.floor(name / 1000 + size / 2 / 48000)} `,
                  () => {}
                );
              }
            );
          });
        } else {
          req.pipe(fs.createWriteStream(req.url.replace(/[\\\/]/g, "") + "." + Math.random() + ".temp"));
          req.once("close", () => {
            res.end(`{}`);
          });
        }

        return;
      }
      res.end("404");
    }
  )
  .listen(48452, () => {
    console.log(myName, "http://127.0.0.1");
  });
