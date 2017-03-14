var path = require('path');
var fs = require('fs');
var project_path = process.env.PWD;

fs.exists(path.resolve(project_path, '.git'), function (exists) {
    if (exists) {
        // 存在git项目
        var hook_path = path.resolve(__dirname, 'pre-push');        
        var dst = path.resolve(project_path, '.git/hooks/pre-push')        
        console.log('Git exist. Copy pre-push to ' + dst );
        fs.writeFileSync(dst, fs.readFileSync(hook_path));
        fs.chmod(dst, 777, function (err) {
            if(err){
                console.log(err);
            }
        });        
    }
});
