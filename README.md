
使用方法：
安装

```
cnpm install @mfelibs/base-webpack-module_dependency
```
在webpack中引入：

```

var moduleDependency = require("@mfelibs/base-webpack-module_dependency");
module.exports = webpackMerge(commonConfig, {
    plugins: [
        new moduleDependency()
    ]
})

```

History  
1.0.1： 支持输出webpack工程依赖树及版本信息  
1.0.2： 修复 输出json的key值统一  
1.0.3： 修复同一模块引用不同版本时的显示问题  
1.1.1： 新增git Hook功能，下载插件初始化时检测工程目录下有.git目录存在，写入pre-push钩子，发送依赖树到服务端