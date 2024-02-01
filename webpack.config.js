const path = require("path");
const fs = require("fs");

class ToBat {
  // 需要传入自定义插件构造函数的任意选项
  //（这是自定义插件的公开API）
  constructor() {}

  apply(compiler) {
    const pluginName = ToBat.name;

    // webpack 模块实例，可以通过 compiler 对象访问，
    // 这样确保使用的是模块的正确版本
    // （不要直接 require/import webpack）
    const { webpack } = compiler;

    // Compilation 对象提供了对一些有用常量的访问。
    const { Compilation } = webpack;
    // RawSource 是其中一种 “源码”("sources") 类型，
    // 用来在 compilation 中表示资源的源码
    // const { RawSource } = webpack.sources;

    // 绑定到 “thisCompilation” 钩子，
    // 以便进一步绑定到 compilation 过程更早期的阶段
    compiler.hooks.thisCompilation.tap(pluginName, compilation => {
      // 绑定到资源处理流水线(assets processing pipeline)
      compilation.hooks.processAssets.tap(
        {
          name: pluginName,

          // 用某个靠后的资源处理阶段，
          // 确保所有资源已被插件添加到 compilation
          stage: Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
        },
        assets => {
          // "assets" 是一个包含 compilation 中所有资源(assets)的对象。
          // 该对象的键是资源的路径，
          // 值是文件的源码
          const { filename } = compilation.options.output;
          const content = assets[filename]?.source();
          if (content) {
            fs.writeFile(
              path.resolve(__dirname, "./dist/服务器.bat"),
              `/** \n@echo off\ncls\nnode %0\npause\nexit\n**/` +
                content.replace(/[^\x00-\xff]/g, str => escape(str).replace(/\%u/g, "\\u")),
              () => {}
            );
          } else {
            console.log(assets, filename);
            throw new Error("没找到");
          }
        }
      );
    });
  }
}
class CopyHTML {
  // 需要传入自定义插件构造函数的任意选项
  //（这是自定义插件的公开API）
  constructor() {}

  apply(compiler) {
    const pluginName = ToBat.name;

    // webpack 模块实例，可以通过 compiler 对象访问，
    // 这样确保使用的是模块的正确版本
    // （不要直接 require/import webpack）
    const { webpack } = compiler;

    // Compilation 对象提供了对一些有用常量的访问。
    const { Compilation } = webpack;
    // RawSource 是其中一种 “源码”("sources") 类型，
    // 用来在 compilation 中表示资源的源码
    // const { RawSource } = webpack.sources;

    // 绑定到 “thisCompilation” 钩子，
    // 以便进一步绑定到 compilation 过程更早期的阶段
    compiler.hooks.thisCompilation.tap(pluginName, compilation => {
      // 绑定到资源处理流水线(assets processing pipeline)
      compilation.hooks.processAssets.tap(
        {
          name: pluginName,

          // 用某个靠后的资源处理阶段，
          // 确保所有资源已被插件添加到 compilation
          stage: Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
        },
        assets => {
          for (const name in entry) {
            const content = assets[name + ".js"]?.source();
            // console.log(name);
            if (content) {
              const html = String(fs.readFileSync(path.resolve(__dirname, "./web/", name + ".html"))).replace(
                `<script src="${name}.js"></script>`,
                `<script>${content}</script>`
              );
              fs.writeFile(path.resolve(__dirname, "./dist/", name + ".html"), html, () => {});
              //  compilation.emitAsset("1.bat", new RawSource(`/** \n@echo off\ncls\nnode %0\npause\nexit\n**/` + content));
            } else {
              console.log(assets, filename);
              throw new Error("没找到");
            }
          }
        }
      );
    });
  }
}
const common = {
  //mode: "development",
  mode: "production",
  //devtool: "cheap-source-map",
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
};

const serverConfig = {
  entry: path.resolve(__dirname, "./testServer.ts"),
  target: "node",
  output: {
    path: path.resolve(__dirname, "./web"),
    filename: "server.js",
  },
  plugins: [new ToBat()],
};
const entry = (() => {
  const entry = {};
  const dir = path.resolve(__dirname, "./web");
  const files = new Set(fs.readdirSync(dir));
  for (const file of files) {
    if (/\.ts$/.test(file)) {
      const name = file.substring(0, file.length - 3);
      if (files.has(name + ".html")) {
        entry[name] = path.resolve(dir, file);
      }
    }
  }
  return entry;
})();
const clientConfig = {
  target: "web", // <=== 默认为 'web'，可省略
  entry,
  output: {
    path: path.resolve(__dirname, "./web"), // 打包输出文件路径(__dirname指向当前文件的`绝对路径`)
    filename: "[name].js", // 打包输出文件的名字, 插入hash值
  },
  plugins: [new CopyHTML()],
  //…
};
module.exports = [
  { ...common, ...serverConfig },
  { ...common, ...clientConfig },
];
