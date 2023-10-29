import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
    user: process.env.CWA_DB_USER,
    host: process.env.CWA_DB_HOST,
    database: process.env.CWA_DB_DATABASE,
    password: process.env.CWA_DB_PASSWORD,
    port: Number.parseInt(process.env.CWA_DB_PORT ?? '5432'),
    ssl : true
});
