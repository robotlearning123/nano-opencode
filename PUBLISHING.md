# Publishing Guide

## Publishing to GitHub

1. Create a new repository on GitHub:
   - Go to https://github.com/new
   - Name: `nano-opencode`
   - Description: "A minimal AI coding assistant for the terminal - 10x smaller, 90%+ features"
   - Make it public
   - Don't initialize with README (we already have one)

2. Push to GitHub:
```bash
git remote add origin https://github.com/yourusername/nano-opencode.git
git branch -M main
git push -u origin main
```

3. Add topics/tags on GitHub:
   - `ai`
   - `coding-assistant`
   - `cli`
   - `terminal`
   - `opencode`
   - `typescript`
   - `claude`
   - `openai`

## Publishing to npm

1. Update package.json with your details:
```json
{
  "name": "@yourusername/nano-opencode",
  "author": "Your Name <your.email@example.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/nano-opencode.git"
  },
  "bugs": {
    "url": "https://github.com/yourusername/nano-opencode/issues"
  },
  "homepage": "https://github.com/yourusername/nano-opencode#readme"
}
```

2. Login to npm:
```bash
npm login
```

3. Publish:
```bash
npm publish --access public
```

4. Install globally:
```bash
npm install -g @yourusername/nano-opencode
```

## Creating a Release

1. Update version in package.json:
```bash
npm version patch  # for bug fixes
npm version minor  # for new features
npm version major  # for breaking changes
```

2. Update CHANGELOG.md with changes

3. Commit and tag:
```bash
git add .
git commit -m "chore: bump version to x.x.x"
git push
git push --tags
```

4. Create GitHub release:
   - Go to https://github.com/yourusername/nano-opencode/releases/new
   - Choose the tag
   - Title: `v0.0.1 - Initial Release`
   - Description: Copy from CHANGELOG.md
   - Publish release

5. Publish to npm:
```bash
npm publish
```

## Setting up GitHub Actions (Optional)

Create `.github/workflows/test.yml`:
```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm test
```

## Package Statistics

After publishing, your package will be available at:
- GitHub: `https://github.com/yourusername/nano-opencode`
- npm: `https://www.npmjs.com/package/@yourusername/nano-opencode`
- Documentation: Auto-generated from README.md

## Marketing

Share your project:
- Post on Twitter/X with #AI #CLI #OpenSource
- Share on Reddit (r/programming, r/commandline)
- Post on Hacker News
- Add to Awesome Lists
- Write a blog post about the design decisions

## Monitoring

Track your project:
- GitHub stars and forks
- npm download statistics
- Issues and pull requests
- User feedback

Good luck with your launch! 🚀
