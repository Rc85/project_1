// modules
const express = require('express');
require('dotenv').config();
const bodyParser = require('body-parser');
const session = require('cookie-session');
const db = require('./routers/db');
const fn = require('./routers/utils/functions');

// server configurations
const port = process.env.PORT;
const app = express();
const server = require('http').createServer(app);

// body parser initialization
app.use(bodyParser.urlencoded({
    extended: true
}));

// cookie-session configurations
app.use(session({
    secret: process.env.SESSION_SECRET,
    maxAge: 1.8e+6
}));

app.use(function (req, res, next) {
    req.session.nowInMinutes = Math.floor(Date.now() / 60e3)
    next();
});

// static routes
app.use(require('./routers/static'));
    
app.get('*', (req, resp, next) => {
    if (req.session.user) {
        db.connect(async(err, client, done) => {
            if (err) { console.log(err); }
    
            let messageCount = await client.query(`SELECT * FROM messages WHERE recipient = $1 AND message_status = 'Unread'`, [req.session.user.username])
            .then(result => {
                if (result !== undefined) {
                    return result.rowCount;
                }
            })
            .catch(err => { console.log(err); });

            let notifications = await client.query(`SELECT * FROM notifications WHERE notification_owner = $1 AND notification_status = 'New'`, [req.session.user.username])
            .then(result => {
                if (result !== undefined) {
                    return result.rowCount;
                }
            })
            .catch(err => { console.log(err); });

            let friends = [], blockedUsers = [];

            // Vote tracking ensures user cannot vote twice on a post
            let votes = await client.query('SELECT * FROM vote_tracking WHERE voting_user_id = $1', [req.session.user.user_id])
            .then((result) => {
                if (result !== undefined) {
                    return result.rows;
                }
            })
            .catch((err) => { console.log(err); });

            let followedPosts = await client.query('SELECT * FROM followed_posts WHERE user_following = $1', [req.session.user.username])
            .then((result) => {
                if (result !== undefined) {
                    return result.rows;
                }
            })
            .catch((err) => { console.log(err); });

            await client.query('SELECT befriend_with FROM friends WHERE friendly_user = $1 AND friend_confirmed IS TRUE', [req.session.user.username])
            .then((result) => {
                if (result !== undefined) {
                    for (let i in result.rows) {
                        friends.push(result.rows[i].befriend_with);
                    }
                }
            })
            .catch((err) => { console.log(err); });

            await client.query('SELECT blocked_user FROM blocked_users WHERE blocking_user = $1', [req.session.user.username])
            .then((result) => {
                if (result !== undefined) {
                    for (let i in result.rows) {
                        blockedUsers.push(result.rows[i].blocked_user);
                    }
                }
            })
            .catch((err) => { console.log(err); });

            done();

            req.session.user.messageCount = messageCount;
            req.session.user.notifications = notifications;
            req.session.user.votes = votes;
            req.session.user.followed_posts = followedPosts;
            req.session.user.friends = friends;
            req.session.user.blocked_users = blockedUsers;

            next();
        });
    } else {
        next();
    }
});

// routes
app.use(require('./routers/routes/index'));
app.use(require('./routers/routes/admins'));
app.use(require('./routers/routes/auths'));
app.use(require('./routers/routes/forums'));
app.use(require('./routers/routes/messages'));
app.use(require('./routers/routes/users'));

// authentication
app.use(require('./routers/auth'));

// get data
app.use(require('./routers/fetch'));

// posts handler
app.use(require('./routers/posts'));

// users profile
app.use(require('./routers/users'));

// admin configurations
app.use(require('./routers/admin'));

// message controller
app.use(require('./routers/messages'));

// setting view engine to use pug
app.set('view engine', 'pug');
app.set('views', ['templates', 'templates/inc', 'templates/blocks']);

// global middleware
app.post('/change-status', function(req, resp) {
    if (req.session.user && req.session.user.privilege > 1) {
        db.connect(async function(err, client, done) {
            if (err) { console.log(err); }

            let queryString,
                status;

            if (req.body.type === 'categories') {
                queryString = `UPDATE categories SET category_status = $1 WHERE category_id = $2`;

                let topic_id = await fn.changeTopicStatus(client, req.body.status, req.body.id, done); // Change status of topics under category
                let subtopic_id = await fn.changeSubtopicStatus(client, req.body.status, topic_id, done); // Change status of subtopics under topics
                await fn.changePostStatus(client, req.body.status, subtopic_id, done); // Change status of posts that belongs to subtopics
            } else {
                if (req.body.status === 'Closed' || req.body.status === 'Removed') {
                    if (req.body.type === 'topic') {
                        queryString = `UPDATE topics SET topic_status = $1 WHERE topic_id = $2`;
    
                        let id = await fn.changeSubtopicStatus(client, req.body.status, [req.body.id], done); // Change status of subtopics under topics
                        await fn.changePostStatus(client, req.body.status, id, done); // Change status of posts that belongs to subtopics
                    } else if (req.body.type === 'subtopic') {
                        queryString = `UPDATE subtopics SET subtopic_status = $1 WHERE subtopic_id = $2`;
    
                        await fn.changePostStatus(client, req.body.status, [req.body.id], done); // Change status of post that belongs to subtopics
                    } else if (req.body.type === 'posts') {
                        queryString = `UPDATE posts SET post_status = $1 WHERE post_id = $2`;
                    }
                } else if (req.body.status === 'Open') {
                    if (req.body.type === 'topic') {
                        // Get the category id of the topic being opened
                        let category_id = await client.query(`SELECT topic_category FROM topics WHERE topic_id = $1`, [req.body.id])
                        .then((result) => {
                            if (result !== undefined) { return result.rows[0].topic_category; }
                        })
                        .catch((err) => {
                            console.log(err);
                            done();
                            resp.send({status: 'error'});
                        });

                        // Check the status of the category
                        status = await client.query(`SELECT category_status FROM categories WHERE category_id = $1`, [category_id])
                        .then((result) => {
                            if (result !== undefined) { return result.rows[0].category_status; }
                        })
                        .catch((err) => {
                            console.log(err);
                            done();
                            resp.send({status: 'error'});
                        });

                        if (status !== 'Closed' && status !== 'Removed') {
                            queryString = `UPDATE topics SET topic_status = $1 WHERE topic_id = $2`;
    
                            let id = await fn.changeSubtopicStatus(client, req.body.status, [req.body.id], done); // Change status of subtopics under topics
                            await fn.changePostStatus(client, req.body.status, id, done); // Change status of posts that belongs to subtopics
                        }
                    } else if (req.body.type === 'subtopic') {
                        let topic_id = await client.query(`SELECT belongs_to_topic FROM subtopics WHERE subtopic_id = $1`, [req.body.id])
                        .then((result) => {
                            if (result !== undefined) { return result.rows[0].belongs_to_topic; }
                        })
                        .catch((err) => {
                            console.log(err);
                            done();
                            resp.send({status: 'error'});
                        });

                        status = await client.query(`SELECT topic_status
                        FROM topics
                        WHERE topic_id = $1`, [topic_id])
                        .then((result) => {
                            if (result !== undefined) { return result.rows[0].topic_status; }
                        })
                        .catch((err) => {
                            console.log(err);
                            done();
                            resp.send({status: 'error'});
                        });

                        if (status !== 'Closed' && status !== 'Removed') {
                            queryString = `UPDATE subtopics SET subtopic_status = $1 WHERE subtopic_id = $2`;
    
                            await fn.changePostStatus(client, req.body.status, [req.body.id], done); // Change status of post that belongs to subtopics
                        }
                    } else if (req.body.type === 'posts') {
                        let subtopic_id = await client.query(`SELECT post_topic FROM posts WHERE post_id = $1`, [req.body.id])
                        .then((result) => {
                            if (result !== undefined) { return result.rows[0].post_topic; }
                        })
                        .catch((err) => {
                            console.log(err);
                            done();
                            resp.status({status: 'error'});
                        });

                        status = await client.query(`SELECT subtopic_status FROM subtopics WHERE subtopic_id = $1`, [subtopic_id])
                        .then((result) => {
                            if (result !== undefined) {
                                return result.rows[0].subtopic_status;
                            }
                        })
                        .catch((err) => {
                            console.log(err);
                            done();
                            resp.send({status: 'error'});
                        });

                        if (status !== 'Closed' && status !== 'Removed') {
                            queryString = `UPDATE posts SET post_status = $1 WHERE post_id = $2`;
                        }
                    }
                } else if (req.body.type === 'users') {
                    queryString = `UPDATE users SET user_status = $1 WHERE user_id = $2`;
                }
            }

            if (status !== 'Closed' && status !== 'Removed') {
                await client.query(queryString, [req.body.status, req.body.id])
                .then((result) => {
                    done();
                    if (result !== undefined && result.rowCount === 1) {
                        resp.send({status: 'success'});
                    } else {
                        resp.send({status: 'not found'});
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                });
            } else {
                done();
                resp.send({status: 'fail'});
            }
        });
    } else {
        resp.send({status: 'unauthorized'});
    }
});

app.post('/delete-all', function(req, resp) {
    db.connect(async function(err, client, done) {
        if (err) { console.log(err); }

        if (req.body.type === 'categories') {
            if (req.session.user && req.session.user.privilege > 1) {
                let catIds = req.body.ids.join(',');

                await client.query(`DELETE FROM categories WHERE category_id IN (${catIds})`)
                .then((result) => {
                    done();
                    if (result !== undefined && result.rowCount > 0) {
                        resp.send({status: 'success'});
                    } else { 
                        esp.send({status: 'failed'});
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                })
            }
        } else if (req.body.type === 'messages') {
            let messageIds;
            
            if (req.body.ids.length > 1) {
                messageIds = req.body.ids.join(',');
            } else if (req.body.ids.length === 1) {
                messageIds = req.body.ids[0];
            }

            let authorizedUser = true;

            if (req.body.ids.length > 0) {
                let recipients = await client.query(`SELECT recipient FROM messages WHERE message_id IN (${messageIds})`)
                .then((result) => {
                    if (result !== undefined) { return result.rows; }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                });

                for (let row of recipients) {
                    if (req.session.user.username !== row.recipient) {
                        authorizedUser = false;
                        break;
                    }
                }

                if (authorizedUser) {
                    try {
                        await client.query('BEGIN');
                        await client.query('DELETE FROM saved_messages WHERE saved_msg IN (' + messageIds + ')');

                        for (let i in req.body.ids) {
                            await client.query('INSERT INTO deleted_messages (msg_deleted_by, deleted_msg) VALUES ($1, $2)', [req.session.user.username, req.body.ids[i]]);
                        }

                        await client.query('COMMIT');
                        done();

                        resp.send({status: 'success'});
                    } catch (err) {
                        await client.query('ROLLBACK');
                        console.log(err);
                        done();
                        resp.send({status: 'error'});
                    }
                }
            } else {
                resp.send({status: 'nothing'});
            }
        }
    })
})

// server initialization
server.listen(port, function(err) {
    if (err) {
        console.log(err);
        return false;
    }

    console.log('Server running on port ' + port);
    console.log(process.env.NODE_ENV);
});