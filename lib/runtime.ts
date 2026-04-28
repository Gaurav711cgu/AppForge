// ================================================================
// RUNTIME ENGINE
// Converts AppConfig JSON → executable React application
// ================================================================

import type { AppConfig, UISchema } from "@/types";

export function generateRuntimeCode(config: AppConfig): Record<string, string> {
  const files: Record<string, string> = {};

  files["types/generated.ts"] = generateTypes(config);
  files["lib/api-client.ts"] = generateAPIClient(config);
  files["db/migrations/001_init.sql"] = config.db.migration_sql;
  files["lib/auth.ts"] = generateAuthConfig(config);

  for (const page of config.ui.pages) {
    const filePath = `app/${page.path === "/" ? "page" : page.path.replace(/^\//, "").replace(/\//g, "/")}/page.tsx`;
    files[filePath] = generatePage(page, config);
  }

  files["app/layout.tsx"] = generateLayout(config);
  files[".env.example"] = generateEnvTemplate(config);
  files["package.json"] = generatePackageJson(config);

  return files;
}

function generateTypes(config: AppConfig): string {
  const types = config.db.tables.map(table => {
    const typeName = toPascalCase(table.name);
    const fields = table.columns.map(col => {
      const tsType = sqlToTsType(col.sql_type);
      return `  ${col.name}${col.nullable ? "?" : ""}: ${tsType};`;
    }).join("\n");
    return `export interface ${typeName} {\n${fields}\n}`;
  });

  return `// AUTO-GENERATED\n${types.join("\n\n")}`;
}

function generateAPIClient(config: AppConfig): string {
  const methods = config.api.endpoints.map(endpoint => {
    const fnName = endpointToFunctionName(endpoint.method, endpoint.path);
    const hasBody = ["POST", "PUT", "PATCH"].includes(endpoint.method);

    const params = [
      ...extractPathParams(endpoint.path).map(p => `${p}: string`),
      ...(hasBody ? ["body: Record<string, unknown>"] : []),
      ...(endpoint.query_params?.length ? ["params?: Record<string, string>"] : []),
    ].join(", ");

    const pathWithParams = endpoint.path.replace(/:([a-z_]+)/g, "${$1}");

    return `
export async function ${fnName}(${params}) {
  const url = \`${config.api.base_path}${pathWithParams}\`;
  const res = await fetch(url, {
    method: "${endpoint.method}",
    headers: { "Content-Type": "application/json" },
    ${hasBody ? "body: JSON.stringify(body)," : ""}
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}`;
  });

  return methods.join("\n");
}

function generatePage(page: UISchema["pages"][0], config: AppConfig): string {
  return `"use client";
export default function Page() {
  return <div>${page.name}</div>;
}`;
}

function generateLayout(config: AppConfig): string {
  return `export default function Layout({ children }) {
  return <div>{children}</div>;
}`;
}

function generateAuthConfig(config: AppConfig): string {
  return `export const AUTH_CONFIG = ${JSON.stringify(config.auth, null, 2)};`;
}

function generateEnvTemplate(config: AppConfig): string {
  return `DATABASE_URL=...`;
}

function generatePackageJson(config: AppConfig): string {
  return JSON.stringify({ name: config.intent.app_name }, null, 2);
}

// =====================
// HELPERS
// =====================

function toPascalCase(str: string): string {
  return str.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
}

function sqlToTsType(sqlType: string): string {
  return "string";
}

function endpointToFunctionName(method: string, path: string): string {
  return method.toLowerCase();
}

/* ✅ UPDATED FUNCTION */
function extractPathParams(path: string): string[] {
  return Array.from(path.matchAll(/:([a-z_]+)/g)).map(m => m[1]);
}
