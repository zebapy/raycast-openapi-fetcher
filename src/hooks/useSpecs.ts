import { useEffect, useState, useCallback } from "react";
import { getSpecs } from "../lib/storage";
import { hasToken } from "../lib/secure-storage";
import { StoredSpec } from "../types/openapi";

interface UseSpecsResult {
  specs: StoredSpec[];
  specsWithToken: Set<string>;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook for loading and managing API specs
 */
export function useSpecs(): UseSpecsResult {
  const [specs, setSpecs] = useState<StoredSpec[]>([]);
  const [specsWithToken, setSpecsWithToken] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const loadedSpecs = await getSpecs();
    setSpecs(loadedSpecs);

    // Check which specs have tokens
    const tokenSet = new Set<string>();
    for (const spec of loadedSpecs) {
      if (await hasToken(spec.id)) {
        tokenSet.add(spec.id);
      }
    }
    setSpecsWithToken(tokenSet);

    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { specs, specsWithToken, isLoading, refresh };
}
