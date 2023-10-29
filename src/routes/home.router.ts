import express from 'express';

export const router: express.Router = express.Router(); 

router.get('/',  function (req, res) {
    let username : string | undefined;
    if (req.oidc.isAuthenticated()) {
        username = req.oidc.user?.name ?? req.oidc.user?.sub;
    }
    res.render('home', {username});
});