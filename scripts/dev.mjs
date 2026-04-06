import { spawn } from "node:child_process";
import readline from "node:readline";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const useRemoteDb = process.argv.includes("--remote-db");
const commands = [
  {
    name: "api",
    color: "\x1b[36m",
    args: ["run", useRemoteDb ? "dev:remote-db" : "dev", "--workspace", "@family-tree/api"],
  },
  {
    name: "web",
    color: "\x1b[35m",
    args: ["run", "dev", "--workspace", "@family-tree/web"],
  },
];

if (useRemoteDb) {
  process.stdout.write("\x1b[33m[dev]\x1b[0m API runs via Cloudflare remote dev and uses deployed D1 data.\n");
}

const children = new Set();
let shuttingDown = false;
let exitCode = 0;

for (const command of commands) {
  const child = spawn(npmCommand, command.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  children.add(child);
  pipeOutput(child.stdout, command.name, command.color, process.stdout);
  pipeOutput(child.stderr, command.name, command.color, process.stderr);

  child.on("exit", (code, signal) => {
    children.delete(child);

    if (!shuttingDown) {
      exitCode = code ?? 1;
      const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
      process.stderr.write(`${command.color}[${command.name}]\x1b[0m exited with ${reason}\n`);
      shutdown("SIGTERM");
    }

    if (children.size === 0) {
      process.exit(exitCode);
    }
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    exitCode = 0;
    shutdown(signal);
  });
}

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
  }, 3_000).unref();
}

function pipeOutput(stream, name, color, target) {
  if (!stream) {
    return;
  }

  const lineReader = readline.createInterface({ input: stream });

  lineReader.on("line", (line) => {
    target.write(`${color}[${name}]\x1b[0m ${line}\n`);
  });
}
