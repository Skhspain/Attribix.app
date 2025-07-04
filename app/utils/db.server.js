// app/utils/db.server.js
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

export default db;