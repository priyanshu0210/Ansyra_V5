// Scans publishable Git files; never prints matching secret values.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { parse } from "dotenv";

const files = [...new Set(execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean))];
const localSecrets = [];
for (const file of readdirSync(".")) {
  if (!file.startsWith(".env") || file === ".env.example" || !statSync(file).isFile()) continue;
  for (const [key, value] of Object.entries(parse(readFileSync(file)))) {
    if (/PASSWORD|TOKEN|SECRET|KEY|DATABASE_URL/.test(key) && value.length >= 10) localSecrets.push(value);
  }
}
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  ["provider key", /\b(?:AIza[A-Za-z0-9_-]{30,}|sk-(?:ant-|or-)?[A-Za-z0-9_-]{30,}|sb_secret_[A-Za-z0-9_-]{20,})/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/],
];
const fixtureUrls = new Set([
  "postgres://user:secret@aws-0-region.pooler.supabase.com:6543/postgres",
  "postgres://user:secret@db.example/postgres?sslmode=no-verify&ssl=false&uselibpqcompat=true&application_name=test",
  "postgres://local:local@127.0.0.1/example",
  "postgresql://postgres:local-test@127.0.0.1:54322/postgres",
  "postgresql://user:pass@remote.supabase.co/postgres",
]);
const findings = [];
for (const file of files) {
  if (file !== ".env.example" && /(^|\/)(\.env(?:\.|$)|credentials\.(json|csv)$|accounts\.csv$|usernames\.txt$|passwords\.txt$|secrets\.json$)|\.(pem|key|p12|pfx|dump|sqlite3?)$/.test(file)) findings.push(`${file}: private file type`);
  if (/^(logs|test-results|playwright-report|docs\/release-evidence)\//.test(file) || /^tests\/e2e\/\.auth\//.test(file)) findings.push(`${file}: generated or operational artifact`);
  const data = readFileSync(file);
  if (data.includes(0)) continue;
  const text = data.toString("utf8");
  if (localSecrets.some(secret => text.includes(secret))) findings.push(`${file}: matches a local credential value`);
  for (const [label, pattern] of patterns) if (pattern.test(text)) findings.push(`${file}: possible ${label}`);
  if (file !== ".env.example") {
    for (const match of text.matchAll(/(?:postgres(?:ql)?|https?):\/\/[^\s:/]+:[^\s@]+@[^\s"'`]+/g)) {
      if (!fixtureUrls.has(match[0])) findings.push(`${file}: credential-bearing URL`);
    }
  }
}
if (findings.length) {
  console.error([...new Set(findings)].join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Publication scan passed for ${files.length} files: no recognized secrets, local credential copies, or private artifacts. Review remains necessary for unknown formats.`);
}
