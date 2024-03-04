const child_process = require("child_process");
const fs = require("fs");
fs.readdir("./", async (err, names) => {
  for (const name of names) {
    const [_, oldTimestamp, simper] = name.match(/^PGM(\d{13})\+(\d+)\.wav$/) || [];
    if (!oldTimestamp) continue;
    const timestamp = Math.floor(Number(oldTimestamp) + Number(simper) / 48);
    const newName = `PGM${timestamp}.flac`;
    const duration = ((await fs.promises.stat(name)).size - 44) / 96;
    child_process.exec(
      `flac.exe -8 -f "${name}" -o"${newName}" && fileTime.exe "${newName}" ${Math.floor(
        timestamp / 1000
      )} ${Math.floor((timestamp + duration) / 1000)} `
    );
  }
});
