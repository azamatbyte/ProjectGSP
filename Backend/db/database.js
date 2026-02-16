const { PrismaClient } = require('@prisma/client');
const { exitProcess } = require('../core/processLifecycle');

const prisma = new PrismaClient();

async function connectDatabase() {
  const maxRetries = 15;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Connecting to PostgreSQL (attempt ${attempt}/${maxRetries})...`);
      await prisma.$connect();
      console.log('PostgreSQL Connection Succeeded.');
      return true;
    } catch (error) {
      console.error(`Connection attempt ${attempt} failed: ${error.message}`);
      if (attempt === maxRetries) {
        console.error('Could not connect to PostgreSQL after all retries. Exiting.');
        exitProcess(1);
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  return false;
}

async function disconnectDatabase() {
  await prisma.$disconnect();
}

module.exports = prisma;
module.exports.connectDatabase = connectDatabase;
module.exports.disconnectDatabase = disconnectDatabase;
