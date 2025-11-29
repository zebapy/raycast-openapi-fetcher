
# Raycast OpenAPI Specification Manager Extension

Build a Raycast extension that allows users to save OpenAPI spec URLs, browse endpoints, copy cURL commands, and securely store API tokens. The project is already scaffolded with Raycast dependencies but has no implementation.

## Steps

1. **Create storage utilities** — Add `src/lib/storage.ts` for managing specs in `LocalStorage` and `src/lib/secure-storage.ts` for API tokens using `useSecureStorage` (Keychain-backed).

2. **Implement Add Spec command** — Rename `add-openapi-spec.ts` to `.tsx`, create a `Form` with URL input, validate/fetch the spec, and store metadata (name, URL) in LocalStorage.

3. **Create Browse Specs command** — Add `src/list-specs.tsx` with a `List` view showing saved specs; each item opens a detail view to browse endpoints parsed from the spec.

4. **Build endpoint browser** — Add `src/browse-endpoints.tsx` to display operations grouped by path/method; include an `Action` to copy the endpoint as a cURL command to clipboard via `Clipboard.copy()`.

5. **Add token management command** — Create `src/manage-tokens.tsx` with a `Form` to associate API tokens (stored securely) with each spec; tokens auto-inject into generated cURL commands.

6. **Update package.json commands** — Register all new commands (`add-openapi-spec`, `list-specs`, `manage-tokens`) in the `$schema`-defined `commands` array with proper `mode: "view"`.

## Further Considerations

1. **OpenAPI parsing library?** — Use native `fetch` + JSON parsing for simple specs, or add `swagger-parser` for full OpenAPI 3.x/Swagger 2 support with dereferencing?

2. **Spec caching strategy?** — Cache fetched spec JSON in LocalStorage to reduce network calls, or always fetch fresh on browse?

3. **cURL generation scope?** — Support path/query parameters input via a form before copying, or generate a basic template cURL for the user to customize?
