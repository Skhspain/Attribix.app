import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** @type {import('@remix-run/node').LoaderFunction} */
export async function loader() {
  try {
    const filePath = join(
      process.cwd(),
      "extensions",
      "attribix-pixel",
      "dist",
      "main.js"
    );

    const code = await readFile(filePath, "utf8");
    return new Response(code, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch (err) {
    return new Response(
      `// Pixel bundle not found.\n// ${String(
        err && err.message ? err.message : err
      )}`,
      { status: 404, headers: { "Content-Type": "application/javascript" } }
    );
  }
}
