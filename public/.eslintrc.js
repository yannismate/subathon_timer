module.exports = {
  env: {
    browser: true,
    es2017: true,
    jquery: true
  },
  globals: {
    io: true
  },
  extends: "eslint:recommended",
  ignorePatterns: ["/js/**", ".eslintrc.js"]
};
