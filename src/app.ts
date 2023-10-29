// @ts-nocheck

import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import https from 'https';
import path from 'path';
import { auth } from 'express-openid-connect';
import {router as homeRouter } from './routes/home.router';
import {router as authRouter } from './routes/auth.router';
import {router as competitionRouter } from './routes/competition.router';

dotenv.config()

// Configure port, host and url
const externalUrl = process.env.RENDER_EXTERNAL_URL;
const port = externalUrl && process.env.PORT ? parseInt(process.env.PORT) : parseInt(process.env.CWA_PORT);
const host = process.env.CWA_HOST;
const baseUrl = externalUrl || `${host}:${port}`;

const config = {
    authRequired: false,
    idpLogout: true,
    secret: process.env.CWA_SECRET,
    clientSecret: process.env.CWA_CLIENT_SECRET,
    baseURL: baseUrl,
    clientID: process.env.CWA_CLIENT_ID,
    issuerBaseURL: process.env.CWA_ISSUER_BASE_URL,
    authorizationParams: {
        response_type: 'code',
    },
};

const app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// auth router attaches /login, /logout, and /callback routes to the baseURL
app.use(auth(config));

// body parser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// configure routers
app.use('/', homeRouter);
app.use('/auth', authRouter);
app.use('/competitions', competitionRouter);

// Code from: https://dop3ch3f.medium.com/working-with-ssl-as-env-variables-in-node-js-bonus-connecting-mysql-with-ssl-2bd49508fe14
// Added @ts-nocheck because of this part of the code
if (externalUrl) {
    const hostname = '0.0.0.0';
    app.listen(port, hostname, () => {
        console.log(`Server locally running at http://${hostname}:${port}/ and from
        outside on ${externalUrl}`);
    });
}
else {
    https.createServer({
        key: Buffer.from(process.env.CWA_SERVER_KEY, "base64").toString("ascii"),
        cert: Buffer.from(process.env.CWA_SERVER_CERT, "base64").toString("ascii")
    }, app).listen(port, function () {
        console.log(`Server running at ${baseUrl}/`);
    });
}
