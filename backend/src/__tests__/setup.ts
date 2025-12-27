import { jest } from "@jest/globals";
import path from "path";
import dotenv from "dotenv";
import { execSync } from "child_process";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is required for backend tests.");
}

process.env.DATABASE_URL = testDatabaseUrl;

execSync("npx prisma migrate deploy --schema prisma/schema.prisma", {
  stdio: "inherit",
  cwd: path.resolve(__dirname, "../../"),
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    DOTENV_CONFIG_PATH: path.resolve(__dirname, "../../.env.test")
  }
});

jest.setTimeout(30000);
