// @ts-nocheck

import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { auth, requiresAuth } from 'express-openid-connect';

dotenv.config()

const app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

const port = process.env.CWA_PORT;
const host = process.env.CWA_HOST;
const baseUrl = `${process.env.CWA_HOST}:${port}`;

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

// auth router attaches /login, /logout, and /callback routes to the baseURL
app.use(auth(config));

app.get('/',  function (req, res) {
    let username : string | undefined;
    if (req.oidc.isAuthenticated()) {
        username = req.oidc.user?.name ?? req.oidc.user?.sub;
    }
    res.render('index', {username});
});
  
app.get('/private', requiresAuth(), function (req, res) {       
    const user = JSON.stringify(req.oidc.user);      
    res.render('private', {user}); 
});

app.get("/sign-up", (req, res) => {
    res.oidc.login({
        returnTo: '/',
        authorizationParams: {      
            screen_hint: "signup",
        },
    });
});

// Code from: https://dop3ch3f.medium.com/working-with-ssl-as-env-variables-in-node-js-bonus-connecting-mysql-with-ssl-2bd49508fe14
// Added @ts-nocheck because of this part of the code
https.createServer({
    key: Buffer.from(process.env.CWA_SERVER_KEY, "base64").toString("ascii"),
    cert: Buffer.from(process.env.CWA_SERVER_CERT, "base64").toString("ascii")
}, app).listen(port, function () {
    console.log(`Server running at ${baseUrl}/`);
});
