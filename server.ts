import * as https from "https";
import * as fs from "fs";
import * as zlib from "zlib";
import * as path from "path";
import * as os from "os";
import staticWebServerPlugin from "../tools/dist/node/staticWebServerPlugin";
import * as ws from "ws";
const wss = new ws.WebSocketServer({ noServer: true });
const flacHead = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x00]);
class MatchPartner<T> {
  //   private nameItem: Map<string, T> = new Map();
  private partner: Map<T, T | undefined> = new Map();
  public addPartner(item1: T, item2: T | undefined) {
    this.partner.set(item1, item2);
    if (item2) {
      this.partner.set(item2, item1);
    }
    return this;
  }
  public add(item: T, name?: string) {
    let other: T | undefined = this.partner.get(item);
    if (!other) {
      for (const [otherItem, v] of this.partner) {
        if (!v) {
          other = otherItem;
        }
      }
    }
    this.addPartner(item, other);
    // if (name) {
    //   this.nameItem.set(name, item);
    // }
    return this;
  }
  public del(item: T) {
    const partner = this.getPartner(item);
    this.partner.delete(item);
    if (partner) {
      this.partner.set(partner, undefined);
    }
    // for (const [name, item2] of this.nameItem) {
    //   if (item2 === item) {
    //     this.nameItem.delete(name);
    //     break;
    //   }
    // }
    return this;
  }
  public getPartner(item: T) {
    return this.partner.get(item);
  }
  //   public getPartnerByName(name: string) {
  //     const my = this.nameItem.get(name);
  //     if (!my) return undefined;
  //     return this.getPartner(my);
  //   }
}
const phoneMatchPartner = new MatchPartner<ws.WebSocket>();

wss.on("connection", function (webSocket, req) {
  webSocket.on("error", console.error);

  const url = new URL("http://127.0.0.1" + req.url);
  const uid = url.searchParams.get("uid");
  const isSave = uid && !/^test/.test(uid);
  let flacFile: fs.WriteStream;

  phoneMatchPartner.add(webSocket);
  webSocket.on("message", (data: Buffer) => {
    const buf = Buffer.from(data);
    phoneMatchPartner.getPartner(webSocket)?.send(buf);

    if (isSave && buf.subarray(0, 6).equals(flacHead)) {
      if (!flacFile) flacFile = fs.createWriteStream(new Date().getTime() + "." + uid + ".temp");
      flacFile.write(buf);
      return;
    }
  });

  webSocket.on("close", () => {
    setTimeout(() => {
      flacFile?.end();
    }, 500);
    phoneMatchPartner.del(webSocket);
  });
  console.log(uid);
});

const myName = path.parse(__filename).name;

(async () => {
  const server = https.createServer(
    os.userInfo().username === "Administrator"
      ? {
          key: await fs.promises.readFile("../sz.hejianpeng.cn.key"),
          cert: await fs.promises.readFile("../sz.hejianpeng.cn.crt"),
        }
      : await (await fetch("https://tool.hejianpeng.cn/certificate/t.hejianpeng.com")).json(),
    (req, res) => {
      if (!req.url) return;
      if (req.method === "PUT") {
        const url = new URL("http://127.0.0.1" + req.url);
        const uid = url.searchParams.get("uid");
        let name = 0;
        if (uid && url.pathname.endsWith(".gzip") && (name = Number(url.pathname.match(/\d{13}/)?.[0]))) {
          const w = fs.createWriteStream(name + "." + uid + ".webp");
          req.pipe(zlib.createGunzip()).pipe(w);
          return;
        }
      }
      staticWebServerPlugin(req, res);
    }
  );
  server.on("upgrade", function (request, socket, head) {
    wss.handleUpgrade(request, socket, head, function (ws) {
      wss.emit("connection", ws, request);
    });
  });
  server.listen(48452, () => {
    console.log(myName, "https://t.hejianpeng.com:48452");
  });
})();
