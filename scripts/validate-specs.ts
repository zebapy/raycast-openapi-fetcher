/**
 * Script to validate that all popular OpenAPI specs are accessible and valid
 * Run with: npx tsx scripts/validate-specs.ts
 */

import * as fs from "fs";
import * as path from "path";

interface PopularSpec {
  name: string;
  description: string;
  url: string;
  category: string;
  website?: string;
}

interface ValidationResult {
  name: string;
  category: string;
  url: string;
  status: "valid" | "invalid" | "failed";
  httpCode?: number;
  version?: string;
  error?: string;
}

// Load specs from the JSON file
function loadSpecs(): PopularSpec[] {
  const filePath = path.join(__dirname, "../src/data/popular-specs.json");
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as PopularSpec[];
}

async function validateSpec(spec: PopularSpec): Promise<ValidationResult> {
  const result: ValidationResult = {
    name: spec.name,
    category: spec.category,
    url: spec.url,
    status: "failed",
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(spec.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "OpenAPI-Validator/1.0",
      },
    });

    clearTimeout(timeout);

    result.httpCode = response.status;

    if (!response.ok) {
      result.status = "failed";
      result.error = `HTTP ${response.status}`;
      return result;
    }

    const content = await response.text();

    // Check for OpenAPI indicators
    const hasOpenApi3 = /["']?openapi["']?\s*:\s*["']?3/i.test(content.slice(0, 5000));
    const hasSwagger2 = /["']?swagger["']?\s*:\s*["']?2/i.test(content.slice(0, 5000));

    if (hasOpenApi3) {
      result.status = "valid";
      result.version = "OpenAPI 3.x";
    } else if (hasSwagger2) {
      result.status = "valid";
      result.version = "Swagger 2.x";
    } else {
      result.status = "invalid";
      result.error = "No openapi/swagger field found";
    }
  } catch (err) {
    result.status = "failed";
    result.error = err instanceof Error ? err.message : "Unknown error";
  }

  return result;
}

// ANSI colors
const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

function formatResult(result: ValidationResult): string {
  const namePadded = result.name.padEnd(20);

  switch (result.status) {
    case "valid":
      return `${namePadded} ${colors.green}✅ VALID${colors.reset} (${result.version})`;
    case "invalid":
      return `${namePadded} ${colors.yellow}⚠️  NOT OPENAPI${colors.reset} (${result.error})`;
    case "failed":
      return `${namePadded} ${colors.red}❌ FAILED${colors.reset} (${result.error})`;
  }
}

async function main() {
  console.log("🔍 Validating OpenAPI Specs...");
  console.log("================================\n");

  const specs = loadSpecs();
  console.log(`Found ${specs.length} specs to validate\n`);

  const results: ValidationResult[] = [];

  // Group specs by category
  const byCategory = new Map<string, PopularSpec[]>();
  for (const spec of specs) {
    const existing = byCategory.get(spec.category) || [];
    existing.push(spec);
    byCategory.set(spec.category, existing);
  }

  // Validate each category
  for (const [category, categorySpecs] of byCategory) {
    console.log(`${colors.bold}${category}${colors.reset}`);
    console.log("-".repeat(category.length));

    for (const spec of categorySpecs) {
      const result = await validateSpec(spec);
      results.push(result);
      console.log(formatResult(result));
    }
    console.log();
  }

  // Summary
  const valid = results.filter((r) => r.status === "valid").length;
  const invalid = results.filter((r) => r.status === "invalid").length;
  const failed = results.filter((r) => r.status === "failed").length;

  console.log("================================");
  console.log("📊 Summary");
  console.log("================================");
  console.log(`Total specs:  ${results.length}`);
  console.log(`${colors.green}Valid:        ${valid}${colors.reset}`);
  console.log(`${colors.yellow}Invalid:      ${invalid}${colors.reset}`);
  console.log(`${colors.red}Failed:       ${failed}${colors.reset}`);
  console.log();

  if (failed > 0 || invalid > 0) {
    console.log("⚠️  Some specs need attention!");

    if (failed > 0) {
      console.log("\n❌ Failed specs:");
      results.filter((r) => r.status === "failed").forEach((r) => console.log(`   - ${r.name}: ${r.error}`));
    }

    if (invalid > 0) {
      console.log("\n⚠️  Invalid specs:");
      results.filter((r) => r.status === "invalid").forEach((r) => console.log(`   - ${r.name}: ${r.error}`));
    }

    process.exit(1);
  } else {
    console.log("✅ All specs are valid!");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
