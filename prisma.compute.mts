import { defineComputeConfig } from "@prisma/compute-sdk/config";

export default defineComputeConfig({
  apps: {
    backend: {
      root: "apps/backend",
      framework: "nestjs",
      env: "apps/backend/.env",
      httpPort: 4000,
    },
  },
});
