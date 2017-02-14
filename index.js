"use strict";

/*
     ######                                ##
     ##   ##
     ##   ##   #####    ######  ##   ##  ####     ## ###    #####    #####
     ######   ##   ##  ##   ##  ##   ##    ##     ###      ##   ##  ##
     ## ##    #######  ##   ##  ##   ##    ##     ##       #######   ####
     ##  ##   ##       ##   ##  ##  ###    ##     ##       ##           ##
     ##   ##   #####    ######   ### ##  ######   ##        #####   #####
                            ##
                            ##
*/

const Promise = require("bluebird");

const del = require("del");
const glob2fp = require("glob2fp");
const gulpif = require("gulp-if");
const gutil = require("gulp-util");
const ignore = require("gulp-ignore");
const map = require("async-map-stream");
const micromatch = require("micromatch");
const path = require("path");
const prettyHrtime = require("pretty-hrtime");
const print = require("gulp-print");
const pump = require("pump");
const streamify = require("stream-array");
const through2 = require("through2");
const vinylRead = require("vinyl-read");
const vinylWrite = require("vinyl-write");
const watch = require("glob-watcher");

const lme = require("lme");

/*
     ##         ##     ##
     ##                ##
     ##       ####     ######
     ##         ##     ##   ##
     ##         ##     ##   ##
     ##         ##     ##   ##
     ######   ######   ######
*/

const maky = module.exports;

maky.log = gutil.log;

maky.colors = gutil.colors;

maky.read = maky.src = (patterns, options) => vinylRead(patterns, options).then(files => {
  if (!Array.isArray(patterns)) {
    patterns = [patterns];
  }

  const bases = glob2fp(patterns);

  files.forEach(file => {
    bases.some(base => {
      if (path.relative(file.cwd, file.dirname).indexOf(base) === 0) {
        file.base = path.join(file.cwd, base);

        return true;
      }

      return false;
    })
  });

  return files;
});

maky.write = maky.dest = function (writePath) {
  return function (files) {
    files.forEach(file => {
      file.dirname = path.join(file.cwd, writePath, path.relative(file.base, file.dirname));
    });

    return Promise.map(files, writeFile);

    function writeFile(file) {
      return new Promise(function (resolve, reject) {
        vinylWrite(file, function (error) {
          if (error) {
            reject(error);
          }
          else {
            resolve(file);
          }
        });
      });
    }
  };
};

maky.add = (...args) => (files) => maky.src(...args).then(newFiles => files.concat(newFiles));

maky.del = (...args) => (files) => del(...args).then(() => files);

maky.gulp = maky.toGulp = function (transform) {
  return function (files) {
    return new Promise(function (resolve, reject) {
      const transformedFiles = [];

      pump([
        streamify(files),
        transform,
        map(file => {
          transformedFiles.push(file);
          return Promise.resolve(file);
        })
      ], function (error) {
        if (error) {
          reject(error);
        }
        else {
          resolve(transformedFiles);
        }
      });
    });
  };
};

maky.fromGulp = function (transform = (o => o)) {
  const files = [];

  return through2.obj(function (file, enc, cb) {
    files.push(file);
    cb();
  }, function (cb) {
    let result;

    try {
      result = transform(files);
    }
    catch (e) {
      return cb(e);
    }

    Promise.resolve(result)
    .then(files => files.forEach(file => this.push(file)))
    .then(cb)
    .catch(maky.error);
  });
};

maky.print = (...args) => maky.gulp(print(...args));

maky.error = error => error && lme.e(error.stack || error);

maky.include = (...args) => maky.gulp(ignore.include(...args));
maky.exclude = (...args) => maky.gulp(ignore.exclude(...args));

maky.if = (condition, ifTransform, elseTransform) => maky.gulp(gulpif(condition, maky.fromGulp(ifTransform), maky.fromGulp(elseTransform)));

maky.filter = function (patterns, options) {
  const isMatch = micromatch.matcher(patterns, options);

  let notMatched = [];

  const filter = function (files) {
    const matched = [];

    files.forEach(function (file) {
      if (isMatch(path.relative(file.cwd, file.path))) {
        matched.push(file);
      }
      else {
        notMatched.push(file);
      }
    });

    return matched;
  };

  filter.restore = function (files) {
    files = files.concat(notMatched);
    notMatched = [];
    return files;
  };

  return filter;
};

maky.series = function (first, ...tasks) {
  if (Array.isArray(first)) {
    first = Promise.resolve(first);
  }

  let promise;

  if (!first) {
    promise = Promise.resolve(taskify(tasks[0])());
    tasks = tasks.slice(1);
  }
  else if (first.then) {
    promise = first;
  }

  if (promise) {
    tasks.forEach(task => {
      promise = promise.then(taskify(task));
    });

    return promise;
  }

  return function (files) {
    let promise = Promise.resolve(files);

    if (first) {
      promise = promise.then(taskify(first));

      tasks.forEach(task => {
        promise = promise.then(taskify(task));
      });
    }

    return promise;
  };
};

maky.parallel = (...tasks) => (files) => Promise.map(tasks, task => taskify(task)(files)).then(() => files);

maky.tasks = {};

maky.task = (taskName, ...tasks) => maky.tasks[taskName] = (files) => {
  maky.log(`Starting task '${maky.colors.cyan(taskName)}'...`);
  const start = process.hrtime();

  return maky.series(files, ...tasks).then(files => {
    maky.log(`Finished task '${maky.colors.cyan(taskName)}' after ${maky.colors.magenta(prettyHrtime(process.hrtime(start)))}`);

    return files;
  });
};

maky.run = (taskName, files) => maky.tasks[taskName](files);

maky.watch = (patterns, ...tasks) => new Promise((resolve, reject) => {
  const task = maky.series(...tasks);

  watch(patterns, () => task().catch(maky.error)).on("ready", resolve);
});

/*
     ##   ##    ##       ##       ##       ##       ##                       #######                               ##       ##
     ##   ##    ##                ##                ##                       ##                                    ##
     ##   ##  ######   ####       ##     ####     ######   ##  ##            ##       ##   ##  ## ###    #####   ######   ####      #####   ## ###    #####
     ##   ##    ##       ##       ##       ##       ##     ##  ##            #####    ##   ##  ###  ##  ##         ##       ##     ##   ##  ###  ##  ##
     ##   ##    ##       ##       ##       ##       ##     ##  ##            ##       ##   ##  ##   ##  ##         ##       ##     ##   ##  ##   ##   ####
     ##   ##    ##       ##       ##       ##       ##     ##  ##            ##       ##  ###  ##   ##  ##         ##       ##     ##   ##  ##   ##      ##
      #####      ###   ######    ####    ######      ###    #####            ##        ### ##  ##   ##   #####      ###   ######    #####   ##   ##  #####
                                                               ##
                                                            ####
*/

function taskify(task) {
  return (typeof task !== "function" ? maky.tasks[task] : task);
}
