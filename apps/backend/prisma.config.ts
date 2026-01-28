import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
    // Schema location
    schema: './prisma/schema.prisma',

    // Migrations configuration
    migrations: {
        path: './prisma/migrations',
    },

    // Database URL for CLI operations
    datasource: {
        url: env('DATABASE_URL'),
    },
});
