#!/usr/bin/env node

"use strict";

const path = require("path");

const argv = require("yargs").argv;

const maky = require("maky");

require(path.join(process.cwd(), "makyfile"));

const tasks = argv._;

if (tasks.length === 0) {
  tasks.push("default");
}

maky.series(...tasks)().catch(maky.error);
