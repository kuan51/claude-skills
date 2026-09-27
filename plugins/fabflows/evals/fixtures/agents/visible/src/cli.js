'use strict';

const { slugify, truncate } = require('./slug.js');

const max = Number(process.env.SLUG_MAX || 60);
for (const title of process.argv.slice(2)) console.log(truncate(slugify(title), max));
