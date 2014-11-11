var _       = require("lodash");
var Promise = require("bluebird");
var gulp    = require("gulp");
var plugins = require("./gulp-plugins")();
var config  = require("./config");

var paths = {
    "docs":  ['./lib/**/*.js', './README.md'],
    "lint":  ['./gulpfile.js', './lib/**/*.js', './test/**/*.js', './migrations/**/*.js'],
    "tests": ['./test/**/*test.js', '!test/{temp,temp,support/**}']
};

gulp.task('test', ['lint', 'mocha']);

gulp.task('lint', function () {
  return gulp.src(paths.lint)
    .pipe(plugins.jshint('.jshintrc'))
    // .pipe(plugins.jscs())
    .pipe(plugins.jshint.reporter('jshint-stylish'));
});

gulp.task('mocha', function(cb) {
  return gulp.start("db:ensure-created-test")
    .src(paths.tests, {"cwd": "./"})
    .pipe(plugins.spawnMocha({
      'reporter' : 'list',
      'env'      : {'NODE_ENV': 'test'},
      'istanbul' : true
    }));
});

gulp.task('db:ensure-created-test', function (done) {
    if (process.env.NODE_ENV === 'test') {
        gulp.start("db:ensure-created")
            .start("db:migrate");
    } else {
        var options = {
            stdio: 'inherit',
            env: _.defaults({NODE_ENV: "test"}, process.env),
            cwd: process.cwd
        };
        spawnGulpTask("db:ensure-created-test", "test").then(done);
  }
});

gulp.task('db:ensure-created', function (done) {
    try {
        var Knex = require('knex');
        var dbConfig   = _.extend({}, config.db);
        var dbToCreate = dbConfig.connection.database;
        // create a connection to the db without specifying the db
        delete dbConfig.connection.database;
        var db = Knex.initialize(dbConfig);
        config.db.connection.database = dbToCreate;
        return db.raw("CREATE DATABASE IF NOT EXISTS `" + dbToCreate + "`")
            .then(function() {})
            .finally(function(){
                db.client.pool.destroy();
            });
    } catch (e) {
        console.error(e);
    }
});

gulp.task('db:migrate', function (done) {
    var Knex = require('knex');
    var db = Knex.initialize(config.db);
    try {
        return db.migrate.latest()
            .then(function() { /* noop */ })
            .finally(function(){
                db.client.pool.destroy();
            });
    } catch (e) {
        console.error(e);
    }
});

gulp.task('submit-coverage', function(cb) {
    return gulp
        .src("./coverage/**/lcov.info", {"cwd": "./"})
        .pipe(plugins.coveralls());
});

function spawnGulpTask(task, targetEnv) {
    return new Promise(function (resolve, reject) {
        var join  = require('path').join;
        var spawn = require('child_process').spawn;
        var bin   = "node_modules/gulp/bin/gulp.js";
        var env = _.assign({}, process.env);
        env.NODE_ENV = targetEnv;
        var proc = spawn(bin, [task], { stdio: 'inherit', env: env });
        proc.on('close', function (code) {
            if(code === 0) {
                resolve();
            } else {
                reject(new Error("Process failed: " + code));
            }
        });
    });
}