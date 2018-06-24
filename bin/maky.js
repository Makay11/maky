#!/usr/bin/env node


const path = require("path");

const { argv } = require("yargs");

const maky = require(path.join(process.cwd(), "node_modules", "maky"));

require(path.join(process.cwd(), "makyfile"));

const tasks = argv._;

if (tasks.length === 0) {
  tasks.push("default");
}

maky.series(...tasks)().catch(maky.error);
