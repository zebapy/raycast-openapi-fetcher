import { useEffect, useState } from "react";
import { showToast, Toast } from "@raycast/api";
import { getCachedSpec, fetchSpec } from "../lib/storage";
import { getTokenForSpec, saveToken } from "../lib/secure-storage";
import { parseEndpoints } from "../lib/openapi-parser";
import { OpenAPISpec, ParsedEndpoint, StoredSpec } from "../types/openapi";
import { getErrorMessage } from "../lib/toast-utils";

interface UseOpenApiSpecResult {
  openApiSpec: OpenAPISpec | null;
  endpoints: ParsedEndpoint[];
  token: string | undefined;
  isLoading: boolean;
  setToken: (token: string | undefined, tokenName?: string) => Promise<void>;
}

/**
 * Hook for loading an OpenAPI spec with caching and token loading
 */
export function useOpenApiSpec(spec: StoredSpec): UseOpenApiSpecResult {
  const [openApiSpec, setOpenApiSpec] = useState<OpenAPISpec | null>(null);
  const [endpoints, setEndpoints] = useState<ParsedEndpoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setTokenState] = useState<string | undefined>();

  useEffect(() => {
    async function load() {
      setIsLoading(true);

      try {
        // Try cache first, then fetch
        let loadedSpec = await getCachedSpec(spec.id);

        if (!loadedSpec) {
          await showToast({
            style: Toast.Style.Animated,
            title: "Fetching spec...",
          });
          loadedSpec = await fetchSpec(spec.url, spec.id);
        }

        setOpenApiSpec(loadedSpec);
        setEndpoints(parseEndpoints(loadedSpec));

        // Load token if available for this spec
        const savedToken = await getTokenForSpec(spec.id);
        setTokenState(savedToken);
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to load spec",
          message: getErrorMessage(error),
        });
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [spec.id, spec.url]);

  /**
   * Set or update the token for this spec
   */
  async function setToken(newToken: string | undefined, tokenName?: string): Promise<void> {
    if (newToken) {
      // Save the token with the spec as default
      await saveToken({
        name: tokenName || `Token for ${spec.name}`,
        token: newToken,
        defaultSpecId: spec.id,
      });
    }
    setTokenState(newToken);
  }

  return { openApiSpec, endpoints, token, isLoading, setToken };
}
