import { copyFile } from "node:fs/promises"

for (const filename of ["blufin-ui.js", "blufin-ui.css"]) {
  await copyFile(new URL(`../dist-ui/${filename}`, import.meta.url), new URL(`../${filename}`, import.meta.url))
}
