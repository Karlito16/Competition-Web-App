import express from 'express';
import { requiresAuth } from 'express-openid-connect';
import { pool } from '../db/db';
import { PoolClient, QueryResult } from 'pg';
import { Round, Match, generateSchedule } from '../utils';

export const router: express.Router = express.Router(); 

router.get('/create', requiresAuth(), (req, res) => {
    res.render('competitions/create', {});
});

router.post('/create', requiresAuth(), async (req, res) => {
    const body: Request = req.body;
    const client: PoolClient = await pool.connect();

    try {
        // Begin transaction
        await client.query('BEGIN');

        // Find or create points system
        let query: string;
        query = 'SELECT id FROM points_systems WHERE win = $1 AND lost = $2 AND draw = $3;'
        let queryArgs: string[];
        queryArgs = [req.body.winPoints, req.body.lostPoints, req.body.drawPoints];

        let results: QueryResult = await client.query(query, queryArgs);
        let pointsSystemId: string;
        if (results.rowCount > 0) {
            console.debug("Points system exists: " + JSON.stringify(results.rows));
            pointsSystemId = results.rows[0]["id"];
        } else {
            console.debug("Points system does not exist. Creating...");
            query = 'INSERT INTO points_systems (win, lost, draw) VALUES ($1, $2, $3) RETURNING id;';
            results = await client.query(query, queryArgs)
            pointsSystemId = results.rows[0]["id"];
        }
        console.debug("Points system id: " + pointsSystemId);

        // Find or create user
        query = 'SELECT id FROM users WHERE token = $1;'
        queryArgs = [req.oidc.user?.sub || ''];

        results = await client.query(query, queryArgs);
        let userId: string;
        if (results.rowCount > 0) {
            console.debug("User exists: " + JSON.stringify(results.rows));
            userId = results.rows[0]["id"];
        } else {
            console.debug("User does not exist. Creating...");
            query = 'INSERT INTO users (token) VALUES ($1) RETURNING id;';
            results = await client.query(query, queryArgs)
            userId = results.rows[0]["id"];
        }
        console.debug("User id: " + userId);

        // Create competition
        query = 'INSERT INTO competitions (name, user_id, points_system_id) VALUES ($1, $2, $3) RETURNING id;';
        queryArgs = [req.body.competitionName, userId, pointsSystemId];
        results = await client.query(query, queryArgs);
        const competitionId: string = results.rows[0]["id"];
        console.debug("Competition created, with id: " + competitionId);

        // Create competitors
        const competitorsIds: string[] = [];
        for (const [key, competitorName] of Object.entries(req.body)) {
            const unwantedList = ["competitionName", "winPoints", "lostPoints", "drawPoints"];
            if (!unwantedList.includes(key) && typeof competitorName === 'string') {
                query = 'INSERT INTO competitors (name) VALUES ($1) RETURNING id;';
                queryArgs = [competitorName];
                results = await client.query(query, queryArgs);
                let competitorId: string = results.rows[0]["id"];
                competitorsIds.push(competitorId);
                console.debug("Created competitor: " + competitorName + " with ID: " + competitorId);
            }
        }

        // Generate schedule
        const schedule: Round[] = generateSchedule(competitorsIds);
        console.debug("Schedule created: " + JSON.stringify(schedule));

        // Create rounds, matches and scores        
        for(const round of schedule) {
            // Create round
            query = 'INSERT INTO rounds (round_number, competition_id) VALUES ($1, $2) RETURNING id;';
            queryArgs = [round.roundNumber.toString(), competitionId];
            results = await client.query(query, queryArgs);
            const roundId: string = results.rows[0]["id"];
            console.debug("Created round with id: " + roundId);

            // Create matches
            for(const match of round.matches) {
                // Create score for competitor 1
                query = 'INSERT INTO scores (score, competitor_id) VALUES (NULL, $1) RETURNING id;';
                queryArgs = [match.competitor1Id];
                results = await client.query(query, queryArgs);
                const score1Id: string = results.rows[0]["id"];
                console.debug("Created score with id: " + score1Id);

                // Create score for competitor 2
                query = 'INSERT INTO scores (score, competitor_id) VALUES (NULL, $1) RETURNING id;';
                queryArgs = [match.competitor2Id];
                results = await client.query(query, queryArgs);
                const score2Id: string = results.rows[0]["id"];
                console.debug("Created score with id: " + score2Id);

                // Create match
                query = 'INSERT INTO matches (round_id, score_1_id, score_2_id) VALUES ($1, $2, $3);';
                queryArgs = [roundId, score1Id, score2Id];
                results = await client.query(query, queryArgs);
                console.debug("Created match with args: " + JSON.stringify(queryArgs));
            }
        }

        client.query('COMMIT');
        console.debug("Changes are commited!");
    } catch (error) {
        await client.query('ROLLBACK');
        console.debug("Transaction failed: ", error);
    } finally {
        client.release();
        console.debug("Connection released!");
        res.render('home', {username: req.oidc.user?.username});
    }
});
