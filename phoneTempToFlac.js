const child_process = require("child_process");
const fs = require("fs");
const nullBuffer = Buffer.alloc(1024 * 128).fill(0);
(async () => {
  let timestamp = 0;
  let f;
  let savedFrame = 0;
  for (const file of (await fs.promises.readdir("./"))
    .filter((f) => /^\d{13}\.[\da-f]{6}\.temp$/.test(f))
    .sort()) {
    if (savedFrame && f) {
      const curFrame = (parseInt(file) - timestamp) * 48;
      if (curFrame > savedFrame) {
        /** 补帧的大小 */
        let BFrameSize = (curFrame - savedFrame) * 2;
        const time = (BFrameSize * 2) / 48000;

        console.log("---------------------------------------");
        console.log("需要补帧" + time.toFixed(3) + "秒");
        if (time > 300) {
          f.end();
          endFile(timestamp, savedFrame / 48);
          f = undefined;
          timestamp = 0;
          savedFrame = 0;
        } else {
          savedFrame = curFrame;
          while (BFrameSize) {
            const nowSize = Math.min(nullBuffer.length, BFrameSize);
            await new Promise((r) => {
              f.once("drain", () => r());
              f.write(nullBuffer.subarray(0, nowSize));
            });
            BFrameSize -= nowSize;
          }
        }
      }
    }

    if (!f) {
      timestamp = parseInt(file);
      f = fs.createWriteStream("PGM" + timestamp + ".pcm");
    }
    const ffmpeg = child_process.spawn("ffmpeg", [
      "-i",
      file,
      "-f",
      "s16le",
      "-",
    ]);

    // ffmpeg.stderr.pipe(process.stdout, { end: false });

    await new Promise((r) => {
      ffmpeg.stdout.once("close", () => r());
      ffmpeg.stdout.pipe(f, { end: false });
    });
    const nowFrame = ffmpeg.stdout.bytesRead / 2;
    console.log(file, "时长" + (nowFrame / 48000).toFixed(3) + "秒");
    savedFrame += nowFrame;
  }
  f?.end();
  timestamp && endFile(timestamp, savedFrame / 48);
})();
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
