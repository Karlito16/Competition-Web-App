import express from 'express';
import { pool } from '../db/db';

export const router: express.Router = express.Router(); 

router.get('/', async (req, res) => {
    let username: string | undefined;
    let competitions;
    if (req.oidc.isAuthenticated()) {
        username = req.oidc.user?.name ?? req.oidc.user?.sub;

        // Get competition list
        const token: string = req.oidc.user?.sub;
        const query: string = 'SELECT competitions.id, competitions.name, points_systems.win, points_systems.lost, points_systems.draw, COUNT(*) + 1 AS num_competitors ' +
                                'FROM competitions JOIN rounds ON competitions.id = rounds.competition_id JOIN users ON users.token = $1 JOIN points_systems ON competitions.points_system_id = points_systems.id ' +
                                'GROUP BY competitions.id, competitions.name, points_systems.win, points_systems.lost, points_systems.draw;';
        const queryArgs: string[] = [token];                                
        const results = await pool.query(query, queryArgs);
        competitions = results.rows;
    }
    res.render('home', {
        username: username,
        competitions: competitions
    });
});