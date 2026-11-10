#!/usr/bin/env node
// Reports which integration env vars are set. Always exits 0.
import { integrationReport } from "./site-meta.mjs";

console.log(integrationReport());
process.exit(0);
