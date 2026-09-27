'use strict';

// Turns a title into a URL slug: lower case, words joined by single hyphens.
function slugify(title) {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Cuts a slug to at most `max` characters without leaving a trailing hyphen.
function truncate(slug, max) {
  if (slug.length <= max) return slug;
  return slug.slice(0, max).replace(/-+$/, '');
}

module.exports = { slugify, truncate };
