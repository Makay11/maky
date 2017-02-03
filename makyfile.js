"use strict";

const maky = require("maky");

maky.task("default", function () {
  console.log("I am the default task!");
});

maky.task("build", function () {
  console.log("I am the build task!");
});
