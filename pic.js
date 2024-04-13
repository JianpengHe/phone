const fs = require("fs");
const dist = new Set();
const files = new Set();
for (const name of fs.readdirSync("./")) {
    if (/^\d{13}\.[a-z\d]{6}\.webp$/.test(name)) {
        files.add(name)
    } else {
        dist.add(name)
    }
}

for (const file of files) {
    const date = String(new Date(parseInt(file)).getDate());
    if (!dist.has(date)) {
        fs.mkdirSync(date);
        dist.add(date);
        console.log("mkdir", date)
    }
    fs.renameSync(file, date + "/" + file)
    console.log("rename", file, date + "/" + file)
}