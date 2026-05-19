import { spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const tauriBin = join(root, "node_modules", ".bin", process.platform === "win32" ? "tauri.cmd" : "tauri");

const child = spawn(tauriBin, args, {
  cwd: root,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  if (code !== 0) {
    process.exit(code ?? 1);
    return;
  }

  if (args[0] === "build") {
    renameMacDmg();
  }
});

function renameMacDmg() {
  if (process.platform !== "darwin") {
    return;
  }

  const config = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
  const version = config.version;
  const dmgDir = join(root, "src-tauri", "target", "release", "bundle", "dmg");
  const arch = getMacArtifactArch();
  const from = join(dmgDir, `Freemodel Auto Router_${version}_${arch}.dmg`);
  const to = join(dmgDir, `freemodel-auto-router_${version}_${arch}.dmg`);

  if (!existsSync(from)) {
    return;
  }

  if (existsSync(to)) {
    rmSync(to);
  }

  renameSync(from, to);
  console.log(`Renamed DMG: ${to}`);
}

function getMacArtifactArch() {
  const targetArg = args.find((arg) => arg.startsWith("--target="));
  const targetIndex = args.indexOf("--target");
  const target = targetArg?.slice("--target=".length) ?? (targetIndex === -1 ? "" : args[targetIndex + 1] ?? "");

  if (target.includes("aarch64-apple-darwin")) {
    return "aarch64";
  }

  if (target.includes("x86_64-apple-darwin")) {
    return "x64";
  }

  return process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x64" : process.arch;
}
