module.exports = {
  env: {
    node: true
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    sourceType: "module" // Allows for the use of imports
  },
  extends: [
    "plugin:@typescript-eslint/recommended" // Uses the recommended rules from the @typescript-eslint/eslint-plugin
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": [1, { "argsIgnorePattern": "^_" }]
  }
};
