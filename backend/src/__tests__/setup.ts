import { jest } from "@jest/globals";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env.test") });

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is required for backend tests.");
}

process.env.DATABASE_URL = testDatabaseUrl;

jest.setTimeout(30000);
