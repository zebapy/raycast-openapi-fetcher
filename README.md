# OpenAPI Fetcher

A Raycast extension to manage OpenAPI specifications, browse endpoints, and copy requests as cURL commands.

## Features

- **Add OpenAPI Specs** — Save OpenAPI specification URLs to your collection
- **Browse Endpoints** — View all endpoints grouped by tags with method indicators
- **Copy as cURL** — Generate and copy cURL commands with a single keystroke
- **API Token Management** — Store API tokens securely for each spec (used in cURL generation)
- **Spec Caching** — Fetched specs are cached locally for faster browsing

## Commands

| Command          | Description                                 |
| ---------------- | ------------------------------------------- |
| Add OpenAPI Spec | Add a new OpenAPI specification URL         |
| Browse API Specs | View saved specs and browse their endpoints |

## Usage

1. Open Raycast and run "Add OpenAPI Spec"
2. Enter the URL to your OpenAPI JSON spec
3. Browse your saved specs with "Browse API Specs"
4. Select an endpoint and press `⌘C` to copy as cURL
5. Optionally set an API token with `⌘T` for authenticated requests

## Security & Data Storage

API tokens and spec data are stored using [Raycast's LocalStorage API](https://developers.raycast.com/information/security#data-storage), which stores data in a **local encrypted database** accessible only by this extension.

If you need to clear all stored data (specs, tokens, cache), use Raycast's built-in **"Clear Local Storage"** command for this extension:

1. Open Raycast Preferences → Extensions
2. Find "OpenAPI Fetcher"
3. Click the ••• menu → "Clear Local Storage"

## TODO

- [ ] Allow pasting a spec URL directly (current)
- [ ] Allow pasting the entire OpenAPI spec JSON content
- [ ] Allow pointing to a local spec file path
- [ ] Support YAML spec format
- [ ] Support multiple auth types per spec (Bearer, API Key, Basic)
- [ ] Custom auth header name configuration
- [ ] Spec refresh/re-fetch action
- [ ] Export all endpoints as cURL collection
- [ ] Request parameter form for customizing cURL before copy

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Lint
npm run lint
```

## License

MIT
