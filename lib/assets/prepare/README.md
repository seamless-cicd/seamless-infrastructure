# Octokit Test

A script for using the GitHub Octokit SDK authenticating a GitHub account using a PAT, and using `execa` to clone a private repo.
https://github.com/octokit/octokit.js

## Execa issues

https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

See `package.json` for settings required for `execa` to work:

```
"type": "module",
"engines": {
  "node": ">=14.16"
},
```

Also see `tsconfig.json`:

```
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "module": "ESNext",
    "target": "ESNext",
    "sourceMap": true,
    "moduleResolution": "Node",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "ts-node": {
    "esm": true
  },
  "include": [
    "./src",
  ],
  "exclude": [
    "node_modules"
  ],
}
```
