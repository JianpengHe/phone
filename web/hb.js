const fs = require("fs");
const child_process = require("child_process");
const startSize = 100;
let lastBuf = Buffer.alloc(0);
let writeStreamPath = 0;
let writeStream;
let writeStreamSize = 0;
let busy = false;
const go = async () => {
  if (busy) return;
  busy = true;
  await new Promise((r) => setTimeout(r, 1000));
  const list = (await fs.promises.readdir("./"))
    .filter((a) => /^\d{13}\.flac$/.test(a))
    .sort((a, b) => parseInt(a) - parseInt(b));
  if (!list.length) {
    busy = false;
    return;
  }
  for (const file of list) {
    console.log(file);
    await new Promise((r) =>
      child_process.exec(`flac -d -f ${file}`, () => r())
    );
    const buf = await fs.promises.readFile(parseInt(file) + ".wav");
    await fs.promises.unlink(parseInt(file) + ".wav");
    const writeBuf = [];
    if (lastBuf.length) {
      const head = buf.subarray(startSize, startSize + 3000);
      const index = lastIndexOf(lastBuf, head);
      if (index < 0) {
        // 文件完成
        if (!writeStream) {
          console.log(writeStream?.writableEnded);
          throw new Error("writeStream不可写");
        }
        console.log(file, "第一个");
        endWriteStream();
      } else {
        writeBuf.push(lastBuf.subarray(0, index));
      }
    }
    if (!writeStream) {
      writeStreamPath = "PGM" + parseInt(file);
      writeStreamSize = 0;
      writeStream = fs.createWriteStream(writeStreamPath + ".pcm");
      writeBuf.push(buf.subarray(buf.indexOf("data") + 8, startSize));
    }
    if (buf.length > 100000 + startSize) {
      writeBuf.push(buf.subarray(startSize, buf.length - 100000));
      lastBuf = buf.subarray(buf.length - 100000);
    }
    const bufs = Buffer.concat(writeBuf);
    writeStreamSize += bufs.length;
    writeStream.write(bufs);
    await new Promise((r) => writeStream.once("drain", r));
    if (!lastBuf?.length || buf.length < 25 * 1024 * 1024) {
      console.log(file, "最后一个");
      endWriteStream();
    }
  }

  busy = false;
  endWriteStream();
  // go();
};
go();

// fs.watch("./", (_, a) => {
//   if (/^\d{13}\.wav$/.test(a)) {
//     go();
//   }
// });
const endWriteStream = () => {
  if (writeStream) {
    const lastWriteStreamPath = writeStreamPath;
    const lastWriteStreamSize = writeStreamSize + (lastBuf?.length || 0);
    // writeStream.once("close", () =>
    //   // child_process.exec(`flac.exe -s --endian=little --channels=1 --bps=16 --sample-rate=48000 --sign=signed -8 -f --delete-input-file "${lastWriteStreamPath}"`, () => {})

    // );
    const startTime = Number(String(lastWriteStreamPath).substring(3));

    writeStream.end(lastBuf || undefined);

    writeStream.once("close", () => {
      console.log(startTime, "close");
      child_process.exec(
        `flac.exe -s --endian=little --channels=1 --bps=16 --sample-rate=48000 --sign=signed -8 -f --delete-input-file "${lastWriteStreamPath}.pcm" && fileTime.exe "${lastWriteStreamPath}.flac" ${Math.floor(
          startTime / 1000
        )} ${Math.floor(startTime / 1000 + lastWriteStreamSize / 2 / 48000)} `,
        (...a) => console.log(...a)
      );
    });
    lastBuf = Buffer.alloc(0);

    writeStream = null;
  }
};
process.on("uncaughtException", (e) => {
  console.error(e);
  process.exit(1000);
});
process.on("SIGINT", () => process.exit(1001));
process.on("SIGTERM", () => process.exit(1002));
process.on("exit", endWriteStream);

// const r = (b) => {
//   return b;
//   const o = [];
//   for (let i = 0; i < b.length; i += 2) {
//     o.push(b.readInt16LE(i));
//   }
//   return o;
// };
// (async () => {
//   const file1 = r((await fs.promises.readFile("1.wav")).subarray(44));
//   const file2 = r(
//     (await fs.promises.readFile("1700790441314.wav")).subarray(44)
//   );
//   console.log(file1, file1.indexOf(file2.slice(startSize, startSize + 10)));
// })();
const lastIndexOf = (buf1, buf2) => {
  for (let i = buf1.length - buf2.length; i >= 0; i--) {
    let j = 0;
    for (; j < buf2.length; j++) {
      const diff = Math.abs(buf1[i + j] - buf2[j]);
      if (diff > 5 && diff < 250) break;
    }
    if (j === buf2.length) return i;
  }
  return -1;
};
// console.log(
//   lastIndexOf(
//     Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 39]),
//     Buffer.from([3, 4, 5, 6])
//   )
// );
// console.log(
//   lastIndexOf(
//     fs.readFileSync("1.wav").subarray(46),
//     fs.readFileSync("2.wav").subarray(46)
//   )
// );
