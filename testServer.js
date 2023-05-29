const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocket } = require("../tools/dist/node/WebSocket");
http
  .createServer((req, res) => {
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
    console.log(fullPath);
    if (/[\\\/]$/.test(req.url)) {
      fs.readdir(fullPath, (err, d) => res.end(JSON.stringify(d || [])));
    } else {
      const f = fs.createReadStream(fullPath);
      f.pipe(res);
      f.once("error", () => {
        res.end("404");
      });
    }
  })
  .listen(48452, () => {
    console.log("http://127.0.0.1:48452");
  });
