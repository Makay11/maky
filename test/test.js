"use strict";

require("trace");
require("clarify");

const gulp = require("gulp");
const print = require("gulp-print");
const pump = require("pump");
const replace = require("gulp-replace");

const maky = require("..");

const filter = maky.filter("**/*1.*");

switch ("if") {
  case "maky":
    maky.series(
      maky.src("test/input/**/*.*"),
      maky.print(),
      filter,
      maky.print(p => "filtered: " + p),
      filter.restore,
      maky.print(p => "restored: " + p),
      maky.if(true, maky.print(p => "true: " + p), maky.print(p => "false: " + p)),
      maky.if(false, maky.print(p => "true: " + p), maky.print(p => "false: " + p)),
      maky.if(true, maky.print(p => "true: " + p)),
      maky.if(false, maky.print(p => "true: " + p)),
      maky.if(true),
      maky.if(false),
      maky.gulp(replace(" ", "_")),
      maky.dest("test/output"),
      maky.gulp(replace("_", "-")),
      maky.dest("test/output"),
      maky.print(p => "after replaces: " + p),
      maky.del("test/output/**/*.*"),
      maky.print(p => "after del: " + p),
      maky.parallel(
        maky.print(p => "1: " + p),
        maky.print(p => "2: " + p),
        maky.print(p => "3: " + p),
        function (files) {
          return new Promise(function (resolve, reject) {
            setTimeout(function () {
              console.log("Inside timeout!");
              resolve(files);
            }, 2000);
          });
        }
      ),
      maky.print(p => "after parallel: " + p)
    ).catch(maky.error);
  break;

  case "gulp":
    pump([
      gulp.src("test/input/**/*.*"),
      print(),
      maky.fromGulp(filter),
      maky.fromGulp(maky.print(p => "maky: " + p)),
      maky.fromGulp(filter.restore),
      maky.fromGulp(function (files) {
        files.forEach(file => console.log("custom (value): " + file.path));
        return files;
      }),
      maky.fromGulp(function (files) {
        files.forEach(file => console.log("custom (Promise): " + file.path));
        return Promise.resolve(files);
      }),
      print(p => "after: " + p)
    ], maky.error);
  break;

  case "tasks":
    maky.task("stuff", function () {
      return maky.series(
        maky.src("test/input/**/*.*"),
        maky.cache("tasks"),
        maky.print(),
        filter,
        maky.print(p => "filtered: " + p),
        filter.restore,
        maky.print(p => "restored: " + p),
        maky.exclude("test/input/**/*2.*"),
        maky.print(p => "after exclude: " + p),
        maky.add("test/input/**/*2.*"),
        maky.print(p => "after add: " + p),
        maky.parallel(
          maky.print(p => "1: " + p),
          maky.print(p => "2: " + p),
          maky.print(p => "3: " + p)
        ),
        maky.print(p => "after parallel: " + p)
      )
    });

    maky.task("twice", maky.series("cenas", "cenas"));

    maky.task("cenas", "stuff");

    maky.run("twice").catch(maky.error);

    maky.watch("test/input/**/*.*", "stuff");
  break;

  case "if":
    maky.series(
      maky.src("test/input/**/*.*"),
      maky.print(p => "before: " + p),
      maky.if(true, maky.print(p => "if: " + p), maky.print(p => "else: " + p)),
      maky.if(() => false, maky.print(p => "fn if: " + p), maky.print(p => "fn else: " + p)),
      maky.if(/test/g, maky.print(p => "regexp: " + p)),
      maky.if("test/**/subfolder/**/*.*", maky.print(p => "glob: " + p)),
      maky.print(p => "after: " + p)
    )
    .catch(maky.error);
  break;
}
