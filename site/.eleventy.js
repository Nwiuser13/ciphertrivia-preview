const fs = require("fs");
const path = require("path");
const autolink = require("./lib/autolink");

// "/services/api-security-testing/" -> "services-api-security-testing", "/" -> "home"
function ogSlug(url) {
  if (!url || url === "/") return "home";
  return url.replace(/\.html$/, "").replace(/^\/+|\/+$/g, "").replace(/\//g, "-");
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy({ "src/robots.txt": "robots.txt" });
  eleventyConfig.addPassthroughCopy({ "src/llms.txt": "llms.txt" });

  // Each page's share image (assets/og/<slug>.jpg, 1200 x 630); the home card if it has none
  eleventyConfig.addFilter("ogImage", function (url) {
    const slug = ogSlug(url);
    const own = fs.existsSync(path.join(__dirname, "src", "assets", "og", slug + ".jpg"));
    return "/assets/og/" + (own ? slug : "home") + ".jpg";
  });

  // Contextual internal links (lib/autolink.js): the owner's words stay as written
  eleventyConfig.addTransform("autolink", function (content, outputPath) {
    const out = (this.page && this.page.outputPath) || outputPath;
    if (!out || !String(out).endsWith(".html")) return content;
    const url = (this.page && this.page.url) || "/" + path.relative("_site", out).replace(/\\/g, "/").replace(/index\.html$/, "");
    return autolink(content, url);
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes"
    }
  };
};
