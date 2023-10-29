import express from 'express';

export const router: express.Router = express.Router(); 

router.get("/sign-up", (req, res) => {
    res.oidc.login({
        returnTo: '/',
        authorizationParams: {      
            screen_hint: "signup",
        },
    });
});