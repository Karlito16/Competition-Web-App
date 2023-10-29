// Code used for transforming regural .cert and .key files into base64text (used for storing into .env file)
// Code from: https://dop3ch3f.medium.com/working-with-ssl-as-env-variables-in-node-js-bonus-connecting-mysql-with-ssl-2bd49508fe14

// import dependencies
const fs = require("fs");
const path = require("path");

// ensure the filepath is relative to this script
const filePath = "filepath";        // e.g. 'server.cert'

// the main operation
const base64Text = fs.readFileSync(path.resolve(filePath)).toString('base64');

// write output to console
console.log(base64Text);