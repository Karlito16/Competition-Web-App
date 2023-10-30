import express from 'express';
import { requiresAuth } from 'express-openid-connect';
import { pool } from '../db/db';
import { PoolClient, QueryResult } from 'pg';
import { Round, Match, generateSchedule } from '../utils';
import { ParsedUrlQuery } from 'querystring';

export const router: express.Router = express.Router(); 

router.get('/create', requiresAuth(), (req, res) => {
    res.render('competitions/create', {username: req.oidc.user?.name});
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

router.get('/:id', requiresAuth(), async (req, res) => {
    const competitionId: string = req.params.id;
    let query: string = 'SELECT rounds.round_number, competitors1.name AS competitor1, competitors2.name AS competitor2, scores1.score AS score1, scores2.score AS score2, scores1.id AS score1id, scores2.id AS score2id ' +
	                    'FROM rounds JOIN competitions ON rounds.competition_id = competitions.id AND competitions.id = $1 JOIN matches ON matches.round_id = rounds.id ' +
	                    'JOIN scores AS scores1 ON matches.score_1_id = scores1.id JOIN scores AS scores2 ON matches.score_2_id = scores2.id JOIN competitors AS competitors1 ' +
	                    'ON scores1.competitor_id = competitors1.id JOIN competitors AS competitors2 ON scores2.competitor_id = competitors2.id ' +
	                    'ORDER BY rounds.round_number, matches.id;';
    let queryArgs: string[] = [competitionId];
    let results: QueryResult = await pool.query(query, queryArgs);

    const rounds: {round: number, matches: {competitor1: string, competitor2: string, score1: string, score2: string, score1Id: string, score2Id: string}[]}[] = [];
    for (const row of results.rows) {
        const roundNumber: number = Number.parseInt(row["round_number"]);
        if (!rounds[roundNumber - 1]) rounds[roundNumber - 1] = {round: roundNumber, matches: []};
        rounds[roundNumber - 1].matches.push({
            competitor1: row["competitor1"],
            competitor2: row["competitor2"],
            score1: row["score1"],
            score2: row["score2"],
            score1Id: row["score1id"],
            score2Id: row["score2id"],
        });
    }

    // Get Leaderboard
    query = 'SELECT competitors.name, SUM(scores.score) AS total_score FROM competitors JOIN scores ON competitors.id = scores.competitor_id ' +
	        'WHERE competitors.id IN (SELECT DISTINCT scores.competitor_id FROM competitions JOIN users ON competitions.user_id = (SELECT id FROM users WHERE TOKEN = $1) JOIN rounds ON rounds.competition_id = competitions.id JOIN matches ' +
			'ON matches.round_id = rounds.id JOIN scores ON matches.score_1_id = scores.id WHERE competitions.id = $2) AND scores.score IS NOT NULL GROUP BY competitors.name ORDER BY total_score DESC;'
    queryArgs = [req.oidc.user?.sub, competitionId];
    results = await pool.query(query, queryArgs);

    res.render('competitions/get', {
        competitionId: competitionId,
        username: req.oidc.user?.name,
        rounds: rounds,
        leaderboard: results.rows
    });
});

router.get('/:id/edit', requiresAuth(), async (req, res) => {
    const competitionId = req.params.id;
    const round = req.query.round;
    const competitor1 = req.query.competitor1;
    const competitor2 = req.query.competitor2;
    const score1 = req.query.score1;
    const score2 = req.query.score2;
    const score1Id = req.query.score1Id;
    const score2Id = req.query.score2Id;

    res.render('competitions/edit', {
        competitionId: competitionId,
        username: req.oidc.user?.name,
        round: round,
        competitor1: competitor1, 
        competitor2: competitor2,
        score1: score1,
        score2: score2,
        score1Id: score1Id,
        score2Id: score2Id,
        warning: undefined
    });
});

router.post('/:id/edit', requiresAuth(), async (req, res) => {
    const competitionId = req.params.id;
    const round = req.body.round;
    const competitor1 = req.body.competitor1;
    const competitor2 = req.body.competitor2;
    const score1 = req.body.score1;
    const score2 = req.body.score2;
    const score1Id = req.body.score1Id;
    const score2Id = req.body.score2Id;

    const score1Defined = score1 !== "";
    const score2Defined = score2 !== "";
    if ((!score1Defined && !score2Defined) || (score1Defined && score2Defined)) {
        // Insert score 1
        let query: string = 'UPDATE scores SET score = $1 WHERE id = $2;';
        let queryArgs: string[] = [score1Defined ? score1 : null, score1Id];
        let results: QueryResult = await pool.query(query, queryArgs);
        console.debug("Updated score with id: " + score1Id);

        // Insert score 2
        queryArgs = [score2Defined ? score2 : null, score2Id];
        results = await pool.query(query, queryArgs);
        console.debug("Updated score with id: " + score2Id);

        res.redirect('/competitions/' + competitionId);
    } else {
        res.render('competitions/edit', {
            competitionId: competitionId,
            username: req.oidc.user?.name,
            round: round,
            competitor1: competitor1, 
            competitor2: competitor2,
            score1: score1,
            score2: score2,
            score1Id: score1Id,
            score2Id: score2Id,
            warning: "You can either set both values to be a valid number or leave both empty."
        });
    }
});