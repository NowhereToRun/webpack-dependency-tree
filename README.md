
使用方法：

在webpack中引入：

```

var moduleDependency = require("@mfelibs/base-webpack-module_dependency");
module.exports = {
  ...
  plugins:[
    new moduleDependency()
  ]
  ...
};

```

功能说明：  
1. 生成依赖树文件dependencyGraph.json，存储到config中的输出目录下
2. 当同一entry依赖的某一库文件存在多个版本时禁止打包，停止后续一切操作
3. git钩子pre-push把工程目录下的dependencyGraph.json在push前提交到服务端（内部使用，这个功能可以忽略）
4. 本项目实际为npm包，在package.json的postinstall中执行自动安装git钩子pre-push；如果需要可手动拷贝过去