module.exports = {
  extends: ['alloy', 'alloy/typescript'],
  rules: {
    'spaced-comment': [
      'error',
      'always',
      {
        markers: ['/'],
      },
    ],
    'no-use-before-define': 'off',
  },
  overrides: [
    {
      files: ['packages/core/cypress/component/**/*.ts'],
      plugins: ['cypress'],
      extends: ['plugin:cypress/recommended'],
      env: {
        'cypress/globals': true,
      },
    },
  ],
}
