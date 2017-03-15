var async = require("async");
var RawModule = require("webpack/lib/RawModule");

var gModuleVersion = {};

function moduleDependency() {
    console.log("Webpack plugin moduleDependency Init");
}

function loaderToIdent(data) {
    if (!data.options)
        return data.loader;
    if (typeof data.options === "string")
        return data.loader + "?" + data.options;
    if (typeof data.options !== "object")
        throw new Error("loader options must be string or object");
    if (data.ident)
        return data.loader + "??" + data.ident;
    return data.loader + "?" + JSON.stringify(data.options);
}

function identToLoaderRequest(resultString) {
    var idx = resultString.indexOf("?");
    var options;

    if (idx >= 0) {
        options = resultString.substr(idx + 1);
        resultString = resultString.substr(0, idx);

        return {
            loader: resultString,
            options: options
        };
    } else {
        return {
            loader: resultString
        };
    }
}

function canBundle(entryCallStack) {
    var result = {
        result: true,
        msg: []
    };
    for (var entry in entryCallStack) {
        for (var lib in entryCallStack[entry]) {
            libVersionNum = Object.keys(entryCallStack[entry][lib]).length;
            if (libVersionNum > 1) {
                // 依赖库不止一个版本
                result.result = false;
                result.msg.push('\nThere are ' + libVersionNum + ' version of ' + lib + ' in ' + entry + ' :');
                for (version in entryCallStack[entry][lib]) {
                    result.msg.push('Version: ' + version);
                    result.msg = result.msg.concat(entryCallStack[entry][lib][version]);
                }
            }
        }
    }
    return result
}

function recursiveDependenceBuild(entry, prefix, callStack) {
    var prefix = prefix + '--> ';
    var dependenceList = [];
    var dependencies = entry.dependencies;
    var requireList = ['HarmonyImportDependency', 'CommonJsRequireDependency', 'AMDRequireDependency']
    dependencies.forEach(function (dependence) {
        var type = dependence.__proto__.constructor.name;
        if (requireList.indexOf(type) !== -1) {
            var temp = {};
            temp.name = dependence.request;
            temp.type = type === 'AMDRequireDependency'? 'AMD':'CMD';
            gModuleVersion[temp.name] && gModuleVersion[temp.name].forEach(function (subModule) {
                if (subModule.path === dependence.module.request) {
                    temp.version = subModule.version
                }
            });
            if (temp.version) {
                // 没有version 默认为引用的是该模块内置js文件或者公用模块，非第三方模块。  忽略掉，不在依赖树内显示
                // 直接忽略的另一个原因是 递归可能无法终止，因为引用的公共模块内又引了公共模块

                // callStack相关
                var tempPrefix = prefix + temp.name;
                callStack[temp.name] = callStack[temp.name] || {};
                if (callStack[temp.name][temp.version]) {
                    callStack[temp.name][temp.version].push(tempPrefix);
                } else {
                    callStack[temp.name][temp.version] = [tempPrefix];
                }

                temp.dependency = recursiveDependenceBuild(dependence.module, tempPrefix, callStack);

                // dependenceList相关                
                dependenceList.push(temp);
            }
        }
    })
    return dependenceList
}

moduleDependency.prototype.apply = function (compiler) {
    var requests = [];
    compiler.plugin("normal-module-factory", function (nmf) {
        // 重写NormalModuleFactory.js内120行 为了得到request内的模块版本信息
        nmf.plugin("resolver", function () {
            var _this = nmf;
            return function (data, callback) {
                var contextInfo = data.contextInfo;
                var context = data.context;
                var request = data.request;
                var resolveContextInfo = {};

                var noAutoLoaders = /^-?!/.test(request);
                var noPrePostAutoLoaders = /^!!/.test(request);
                var noPostAutoLoaders = /^-!/.test(request);
                var elements = request.replace(/^-?!+/, "").replace(/!!+/g, "!").split("!");
                var resource = elements.pop();
                elements = elements.map(identToLoaderRequest);

                async.parallel([
                    function (callback) {
                        _this.resolveRequestArray(resolveContextInfo, context, elements, _this.resolvers.loader, callback);
                    },
                    function (callback) {
                        if (resource === "" || resource[0] === "?")
                            return callback(null, resource);
                        _this.resolvers.normal.resolve(resolveContextInfo, context, resource, function (err, result, request) {
                            requests.push(request);
                            if (err) return callback(err);
                            callback(null, result);
                        });
                    }
                ], function (err, results) {
                    if (err) return callback(err);
                    var loaders = results[0];
                    resource = results[1];

                    // translate option idents
                    try {
                        loaders.forEach(function (item) {
                            if (typeof item.options === "string" && /^\?/.test(item.options)) {
                                item.options = _this.ruleSet.findOptionsByIdent(item.options.substr(1));
                            }
                        });
                    } catch (e) {
                        return callback(e);
                    }

                    if (resource === false)
                        return callback(null,
                            new RawModule("/* (ignored) */",
                                "ignored " + context + " " + request,
                                request + " (ignored)")); // ignored

                    var userRequest = loaders.map(loaderToIdent).concat([resource]).join("!");

                    var resourcePath = resource;
                    var resourceQuery = "";
                    var queryIndex = resourcePath.indexOf("?");
                    if (queryIndex >= 0) {
                        resourceQuery = resourcePath.substr(queryIndex);
                        resourcePath = resourcePath.substr(0, queryIndex);
                    }

                    var result = _this.ruleSet.exec({
                        resource: resourcePath,
                        resourceQuery: resourceQuery,
                        issuer: contextInfo.issuer
                    });
                    var settings = {};
                    var useLoadersPost = [];
                    var useLoaders = [];
                    var useLoadersPre = [];
                    result.forEach(function (r) {
                        if (r.type === "use") {
                            if (r.enforce === "post" && !noPostAutoLoaders && !noPrePostAutoLoaders)
                                useLoadersPost.push(r.value);
                            else if (r.enforce === "pre" && !noPrePostAutoLoaders)
                                useLoadersPre.push(r.value);
                            else if (!r.enforce && !noAutoLoaders && !noPrePostAutoLoaders)
                                useLoaders.push(r.value);
                        } else {
                            settings[r.type] = r.value;
                        }
                    });
                    async.parallel([
                        _this.resolveRequestArray.bind(_this, resolveContextInfo, _this.context, useLoadersPost, _this.resolvers.loader),
                        _this.resolveRequestArray.bind(_this, resolveContextInfo, _this.context, useLoaders, _this.resolvers.loader),
                        _this.resolveRequestArray.bind(_this, resolveContextInfo, _this.context, useLoadersPre, _this.resolvers.loader)
                    ], function (err, results) {
                        if (err) return callback(err);
                        loaders = results[0].concat(loaders).concat(results[1]).concat(results[2]);
                        process.nextTick(onDoneResolving);
                    });

                    function onDoneResolving() {
                        callback(null, {
                            context: context,
                            request: loaders.map(loaderToIdent).concat([resource]).join("!"),
                            dependencies: data.dependencies,
                            userRequest: userRequest,
                            rawRequest: request,
                            loaders: loaders,
                            resource: resource,
                            parser: _this.getParser(settings.parser)
                        });
                    }
                });
            };
        });
    });

    compiler.plugin("emit", function (compilation, callback) {
        requests.forEach(function (request) {
            if (!gModuleVersion[request.descriptionFileData.name]) {
                gModuleVersion[request.descriptionFileData.name] = [{
                    'path': request.path,
                    'version': request.descriptionFileData.version
                }]
            } else {
                var newVersion = false;
                gModuleVersion[request.descriptionFileData.name].forEach(function (subModule) {
                    if (subModule.path !== request.path || subModule.version !== request.descriptionFileData.version) {
                        newVersion = true;
                    }
                })
                if (newVersion) {
                    gModuleVersion[request.descriptionFileData.name].push({
                        'path': request.path,
                        'version': request.descriptionFileData.version
                    })
                }
            }
        })

        var dependencyGraph = [];
        var entryCallStack = {};
        compilation.chunks.forEach(function (chunk) {
            var entry = {};
            entry.entry = chunk.name; // 入口名
            entryCallStack[chunk.name] = {};
            entry.dependency = recursiveDependenceBuild(chunk.entryModule, chunk.name, entryCallStack[chunk.name]) // 依赖模块数组
            dependencyGraph.push(entry)
        });

        var result = canBundle(entryCallStack);
        if (result.result) {
            // 无版本冲突 生成依赖树文件 正常执行后续操作
            dependencyGraphJsonStr = JSON.stringify(dependencyGraph)
            compilation.assets['dependencyGraph.json'] = {
                'source': function () {
                    return dependencyGraphJsonStr
                },
                'size': function () {
                    return dependencyGraphJsonStr.length;
                }
            };
            console.log("Prepare to generate dependencyGraph.json in " + compilation.outputOptions.path);
            callback();
        } else {
            // 版本冲突 不执行callback，即不生成任何文件，终止打包
            console.error('---Version conflict---');
            result.msg.forEach(function(msg){
                console.log(msg);
            })
            console.log('---End bundle! Please make sure your libs has no version conflict!---');
            console.log('---     If you have any questions, please contact QQ:452242153    ---');            
        }

    });
};

module.exports = moduleDependency;