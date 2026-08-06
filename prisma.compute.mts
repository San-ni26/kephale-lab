import { defineComputeConfig } from "@prisma/compute-sdk/config";

export default defineComputeConfig({
  apps: {
    backend: {
      root: "apps/backend",
      framework: "custom",
      build: {
        command: "echo 'Already built locally'",
        outputDirectory: ".",
        entrypoint: "dist/main.js"
      },
      env: "apps/backend/.env",
      httpPort: 4000,
    },
  },
});
