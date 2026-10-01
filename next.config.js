/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/generate-docx": ["./assets/fonts/*.ttf"],
  },
};
module.exports = nextConfig;
