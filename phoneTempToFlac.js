const child_process = require("child_process");
const fs = require("fs");
const nullBuffer = Buffer.alloc(1024 * 128).fill(0);
const next = async files => {
  let timestamp = 0;
  let f;
  let savedFrame = 0;

  for (const [groupId, fileList] of files) {
    console.log(groupId, fileList);
    if (savedFrame && f) {
      const curFrame = (fileList[0] - timestamp) * 48;
      //  if (curFrame > savedFrame) {
      /** 补帧的大小 */
      let BFrameSize = (curFrame - savedFrame) * 2;
      const time = (BFrameSize * 2) / 48000;

      console.log("---------------------------------------");
      console.log("需要补帧" + time.toFixed(3) + "秒");
      if (time < -60 || time > 300) {
        console.log("?");
        f.end();
        endFile(timestamp, savedFrame / 48);
        f = undefined;
        timestamp = 0;
        savedFrame = 0;
      } else {
        savedFrame = curFrame;
        while (BFrameSize) {
          // console.log(1);
          const nowSize = Math.min(nullBuffer.length, BFrameSize);
          // await new Promise(r => {
          //   f.once("drain", () => r());
          f.write(nullBuffer.subarray(0, nowSize));
          await new Promise(r => setTimeout(r, 100));
          BFrameSize -= nowSize;
        }
      }
      // }
    }

    if (!f) {
      timestamp = fileList[0];
      f = fs.createWriteStream("PGM" + timestamp + ".pcm");
    }
    console.log("ff");
    const ffmpeg = child_process.spawn("ffmpeg", ["-i", "-", "-f", "s16le", "-"]);

    // ffmpeg.stderr.pipe(process.stdout, { end: false });
    ffmpeg.stdout.pipe(f, { end: false });
    for (const file of fileList) {
      await new Promise(r => {
        const readStream = fs.createReadStream(`${file}.${groupId}.temp`);
        readStream.once("close", () => setTimeout(() => r(), 500));
        readStream.pipe(ffmpeg.stdin, { end: false });
      });
    }

    await new Promise(r => {
      ffmpeg.stdout.once("close", () => setTimeout(() => r(), 500));
      ffmpeg.stdin.end();
    });
    const nowFrame = ffmpeg.stdout.bytesRead / 2;
    console.log(groupId, "时长" + (nowFrame / 48000).toFixed(3) + "秒");
    savedFrame += nowFrame;
  }

  // for(){

  // }
  f?.end();
  f = undefined;
  timestamp && endFile(timestamp, savedFrame / 48);
};

fs.readdir("./", (err, files) => {
  const groupMap = new Map();
  for (const file of files) {
    const [_, timestamp, groupId] = file.match(/^(\d{13})\.([\da-f]{6})\.temp$/) || [];
    if (!_) continue;
    const arr = groupMap.get(groupId) || [];
    arr.push(Number(timestamp));
    groupMap.set(groupId, arr);
  }
  for (const [k, arr] of groupMap) {
    arr.sort((a, b) => a - b);
  }
  next([...groupMap.entries()].sort((a, b) => a[1] - b[1]));
});

const endFile = async (timestamp, duration) => {
  console.log(" ");
  console.log("PGM" + timestamp + ".pcm", "转flac");
  console.log(" ");

  child_process.exec(
    `flac.exe -8 -f  -s --endian=little --channels=1 --bps=16 --sample-rate=48000 --sign=signed  --delete-input-file PGM${timestamp}.pcm && fileTime.exe "PGM${timestamp}.flac" ${Math.floor(
      timestamp / 1000
    )} ${Math.floor((timestamp + duration) / 1000)} `
  );
};
// ffmpeg.stdout.on("data", (data) => {
//   console.log(`stdout: ${data}`);
// });

// ffmpeg.stderr.on("data", (data) => {
//   console.error(`stderr: ${data}`);
// });

// ffmpeg.on("close", (code) => {
//   console.log(`child process exited with code ${code}`);
// });
