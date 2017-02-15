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

const crypto = require("crypto");
const path = require("path");

const cloneRegexp = require("clone-regexp");
const del = require("del");
const expect = require("code").expect;
const glob2fp = require("glob2fp");
const gutil = require("gulp-util");
const ignore = require("gulp-ignore");
const is = require("is_js");
const map = require("async-map-stream");
const micromatch = require("micromatch");
const prettyHrtime = require("pretty-hrtime");
const pump = require("pump");
const streamify = require("stream-array");
const through2 = require("through2");
const vinylRead = require("vinyl-read");
const vinylWrite = require("vinyl-write");
const watch = require("glob-watcher");

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

maky.noop = files => files;

maky.read = maky.src = (patterns, options) => vinylRead(patterns, options).then(files => {
  if (is.not.array(patterns)) {
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

maky.write = maky.dest = writePath => {
  return files => {
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

maky.add = (...args) => files => maky.src(...args).then(newFiles => files.concat(newFiles));

maky.del = (...args) => files => del(...args).then(() => files);

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

maky.fromGulp = function (transform = maky.noop) {
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

maky.print = (formatter = (s => s)) => files => {
  files.forEach(file => maky.log(formatter(maky.colors.magenta(path.relative(file.cwd, file.path)))));

  return files;
};

maky.error = error => error && console.error(error);

maky.include = (...args) => maky.gulp(ignore.include(...args));
maky.exclude = (...args) => maky.gulp(ignore.exclude(...args));

maky.if = (condition, ifTransform = maky.noop, elseTransform = maky.noop) => files => {
  const matched = [];
  const notMatched = [];

  const test = testify(condition);

  files.forEach(file => (test(file) ? matched : notMatched).push(file));

  return Promise.all([ifTransform(matched), elseTransform(notMatched)]).then(a => a[0].concat(a[1]));
};

maky.filter = condition => {
  const test = testify(condition);

  let notMatched = [];

  const filter = files => {
    const matched = [];

    files.forEach(file => (test(file) ? matched : notMatched).push(file));

    return matched;
  };

  filter.restore = files => {
    files = files.concat(notMatched);
    return filter.clear(files);
  };

  filter.clear = files => {
    notMatched = [];
    return files;
  }

  return filter;
};

maky.series = function (first, ...tasks) {
  if (is.array(first)) {
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

maky.parallel = (...tasks) => files => Promise.map(tasks, task => taskify(task)(files)).then(() => files);

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

maky.caches = {};

maky.cache = (cacheName, strategy = "contents") => {
  expect(["timestamp", "contents", "checksum"]).to.include(strategy);

  return files => {
    const cache = maky.caches[cacheName] = maky.caches[cacheName] || {};

    return files.filter(file => {
      if (strategy === "timestamp") {
        const time = file.stat.mtime.getTime();

        if (!cache[file.path] || cache[file.path] !== time) {
          cache[file.path] = time;

          return true;
        }

        return false;
      }
      else if (strategy === "contents") {
        const contents = file.contents;

        if (!cache[file.path] || !cache[file.path].equals(contents)) {
          cache[file.path] = contents;

          return true;
        }

        return false;
      }
      else if (strategy === "checksum") {
        const checksum = crypto.createHash("md5").update(file.contents).digest();

        if (!cache[file.path] || !cache[file.path].equals(checksum)) {
          cache[file.path] = checksum;

          return true;
        }

        return false;
      }
    });
  };
};

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
  return (is.function(task) ? task : maky.tasks[task]);
}

function testify(condition) {
  if (is.function(condition)) {
    return condition;
  }
  else if (is.regexp(condition)) {
    const regex = cloneRegexp(condition);
    return file => {
      const result = regex.test(path.relative(file.cwd, file.path));
      regex.lastIndex = 0;
      return result;
    };
  }
  else if (is.array(condition) || is.string(condition)) {
    const isMatch = micromatch.matcher(condition);
    return file => isMatch(path.relative(file.cwd, file.path));
  }
  else {
    return () => condition;
  }
}
