/** @type {import('next').NextConfig} */

// The band hub serves a production build while `next dev` may be running for
// ordinary UI work. They must not share a build directory: a dev server
// continuously rewrites it and deletes BUILD_ID, which breaks the hub the
// band is relying on. `npm run hub` sets HUB_DIST_DIR so each gets its own.
const nextConfig = {
  distDir: process.env.HUB_DIST_DIR || '.next',
};

module.exports = nextConfig;
