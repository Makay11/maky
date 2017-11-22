"use strict";

const gulp = require("gulp");
const print = require("gulp-print");
const pump = require("pump");
const replace = require("gulp-replace");

const maky = require("..");

const filter = maky.filter("**/*1.*");

switch ("tasks") {
  case "maky":
    maky.series(
      maky.src("test/input/**/*.*"),
      maky.print("prefix"),
      maky.print(p => "formatter <" + p + ">"),
      filter,
      maky.print("filtered"),
      filter.restore,
      maky.print("restored"),
      maky.if(true, maky.print("true"), maky.print("false")),
      maky.if(false, maky.print("true"), maky.print("false")),
      maky.if(true, maky.print("true")),
      maky.if(false, maky.print("true")),
      maky.if(true),
      maky.if(false),
      maky.gulp(replace(" ", "_")),
      maky.dest("test/output"),
      maky.gulp(replace("_", "-")),
      maky.forEach(file => console.log(file.contents.toString())),
      maky.replace(/-/g, "."),
      maky.forEach(file => console.log(file.contents.toString())),
      maky.dest("test/output"),
      maky.print("after replaces"),
      maky.del("test/output/**/*.*"),
      maky.print("after del"),
      maky.parallel(
        maky.print("1"),
        maky.print("2"),
        maky.print("3"),
        files => {
          return new Promise((resolve, reject) => {
            setTimeout(() => {
              console.log("Inside timeout!");
              resolve(files);
            }, 2000);
          });
        }
      ),
      maky.print("after parallel")
    ).catch(maky.error);
  break;

  case "gulp":
    pump([
      gulp.src("test/input/**/*.*"),
      print(),
      maky.fromGulp(filter),
      maky.fromGulp(maky.print("maky filtered")),
      maky.fromGulp(filter.restore),
      maky.fromGulp(files => {
        files.forEach(file => console.log("custom (value) " + file.path));
        return files;
      }),
      maky.fromGulp(files => {
        files.forEach(file => console.log("custom (Promise) " + file.path));
        return Promise.resolve(files);
      }),
      print(s => "after " + s)
    ], maky.error);
  break;

  case "tasks":
    maky.task("stuff", () => {
      return maky.series(
        maky.src("test/input/**/*.*"),
        maky.changed("tasks"),
        maky.print(),
        filter,
        maky.print("filtered"),
        filter.restore,
        maky.print("restored"),
        maky.exclude("test/input/**/*2.*"),
        maky.print("after exclude"),
        maky.keep("test/input/**/*3.*"),
        maky.print("after keep"),
        maky.add("test/input/**/*{1,2}.*"),
        maky.print("after add"),
        maky.parallel(
          maky.print("1"),
          maky.print("2"),
          maky.print("3")
        ),
        maky.print("after parallel")
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
      maky.print("before"),
      maky.if(true, maky.print("if"), maky.print("else")),
      maky.if(() => false, maky.print("fn if"), maky.print("fn else")),
      maky.if(/test/g, maky.print("regexp")),
      maky.if("test/**/subfolder/**/*.*", maky.print("glob")),
      maky.print("after")
    )
    .catch(maky.error);
  break;
}
