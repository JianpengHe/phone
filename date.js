const fs = require("fs");
const obj = {};
fs.readdirSync("./").forEach(a => {
    if (a.indexOf(".flac") < 0) { return; }
    const d = fs.statSync(a);
    obj[a]={
        m:d.mtimeMs,
        a:d.ctimeMs,
        b:d.birthtimeMs
    }
});
fs.writeFileSync("date.json",JSON.stringify(obj));