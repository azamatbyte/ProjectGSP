const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
dotenv.config();

// Initialize Prisma Client as a singleton
const prisma = new PrismaClient();

// Connect on startup with retry (PostgreSQL may still be starting)
(async () => {
  const maxRetries = 15;
  const retryDelay = 2000;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Connecting to PostgreSQL (attempt ${attempt}/${maxRetries})...`);
      await prisma.$connect();
      console.log('PostgreSQL Connection Succeeded.');
      return;
    } catch (error) {
      console.error(`Connection attempt ${attempt} failed: ${error.message}`);
      if (attempt === maxRetries) {
        console.error('Could not connect to PostgreSQL after all retries. Exiting.');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, retryDelay));
    }
  }
})();

// Graceful shutdown - only disconnect when the process is terminating
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = prisma;
