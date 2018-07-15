const app = require('express').Router();
const db = require('./db');
const fs = require('fs');
const moment = require('moment');
const fn = require('./utils/functions');

app.post('/change-user-privilege', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 1) {
            db.connect(async function(err, client, done) {
                if (err) { console.log(err); }

                await client.query('UPDATE users SET privilege = $1 WHERE user_id = $2', [req.body.privilege, req.body.user_id])
                .then((result) => {
                    done();
                    if (result !== undefined && result.rowCount === 1) {
                        resp.send({status: 'success'});
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                });
            });
        } else {
            fn.error(req, resp, 401);
        }
    } else {
        fn.error(req, resp, 401);
    }
});

app.post('/change-user-status', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 0) {
            db.connect(async function(err, client, done) {
                if (err) { console.log(err); }

                await client.query('UPDATE users SET user_status = $1 WHERE user_id = $2 RETURNING user_id, user_status', [req.body.option, req.body.user_id])
                .then((result) => {
                    done();
                    if (result !== undefined && result.rowCount === 1) {
                        resp.send({status: 'success', user_id: result.rows[0].user_id, user_status: result.rows[0].user_status});
                    } else {
                        resp.send({status: 'not found'});
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                });
            });
        } else {
            resp.send({status: 'unauthorized'});
        }
    } else {
        resp.send({status: 'unauthorized'});
    }
});

app.post('/change-post-status', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 0) {
            db.connect(async function(err, client, done) {
                if (err) { console.log(err); }

                await client.query('UPDATE posts SET post_status = $1 WHERE post_id = $2 RETURNING post_status', [req.body.status, req.body.post_id])
                .then((result) => {
                    done();
                    if (result !== undefined && result.rowCount === 1) {
                        resp.send({status: 'success', post_status: result.rows[0].post_status});
                    } else {
                        resp.send({status: 'not found'});
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                });
            });
        } else {
            resp.send({status: 'unauthorized'});
        }
    } else {
        resp.send({status: 'unauthorized'});
    }
});

app.post('/delete-user-profile-pic', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 1) {
            db.connect(async function(err, client, done) {
                if (err) { console.log(err); }

                let updateAvatarURL = await client.query("UPDATE users SET avatar_url = $2 WHERE user_id = $1 RETURNING user_id, username, avatar_url", [req.body.user_id, '/files/' + req.body.user_id + '/profile_pic/' + req.body.username + '_profile_pic.png'])
                .then((result) => {
                    if (result !== undefined && result.rowCount === 1) {
                        return result.rows;
                    } else {
                        resp.send({status: 'error'});
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                });

                await client.query('INSERT INTO violations (v_user_id, violation, v_issued_by) VALUES ($1, $2, $3)', [updateAvatarURL[0].user_id, req.body.reason, req.session.user.user_id])
                .then((result) => {
                    done();
                    if (result !== undefined && result.rowCount === 1) {
                        fs.copyFile('images/profile_default.png', 'user_files/' + updateAvatarURL[0].user_id + '/profile_pic/' + updateAvatarURL[0].username + '_profile_pic.png', function(err) {
                            if (err) {
                                console.log(err);
                                resp.send({status: 'error'})
                            } else {
                                resp.send({status: 'success', avatar_url: updateAvatarURL[0].avatar_url});
                            }
                        });
                    } else {
                        resp.send({status: 'error'});
                    }
                })
                .catch((err) => {
                    done();
                    console.log(err);
                });
            });
        } else {
            fn.error(req, resp, 401);
        }
    } else {
        fn.error(req, resp, 401);
    }
});

app.post('/create-subtopic', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 1) {
            db.connect(async function(err, client, done) {
                if (err) { console.log(err); }

                let createSubtopic = await client.query('INSERT INTO subtopics (subtopic_title, belongs_to_topic, subtopic_created_by) VALUES ($1, $2, $3) RETURNING *', [req.body.title, req.body.parent, req.session.user.username])
                .then((result) => {
                    if (result !== undefined) {
                        return result.rows;
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                });

                await client.query('SELECT subtopic_id AS id, subtopic_title AS title, belongs_to_topic AS belongs_to, subtopic_created_on AS created_on, subtopic_created_by AS created_by, subtopic_status AS status FROM subtopics WHERE subtopic_id = $1', [createSubtopic[0].subtopic_id])
                .then((result) => {
                    done();
                    if (result !== undefined && result.rows.length === 1) {
                        result.rows[0].created_on = moment(result.rows[0].created_on).format('MM/DD/YYYY @ hh:mm:ss A');

                        resp.send({status: 'success', result: result.rows[0]});
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'fail'});
                });
            });
        } else {
            resp.send({status: 'error'});
        }
    } else {
        resp.send({status: 'error'});
    }
});

app.post('/rename-subtopic', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 1) {
            db.connect(async function(err, client, done) {
                if (err) { console.log(err); }

                await client.query('UPDATE subtopics SET subtopic_title = $1 WHERE subtopic_id = $2 RETURNING subtopic_title', [req.body.new_title, req.body.id])
                .then((result) => {
                    done();
                    if (result !== undefined && result.rowCount === 1) {
                        resp.send({status: 'success', new_title: result.rows[0].subtopic_title});
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                });
            });
        } else {
            fn.error(req, resp, 401);
        }
    } else {
        fn.error(req, resp, 401);
    }
});

app.post('/change-subtopic-belong-to', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 1) {
            db.connect(async function(err, client, done) {
                if (err) { console.log(err); }

                await client.query('UPDATE subtopics SET belongs_to_topic = $1 WHERE subtopic_id = $2 RETURNING belongs_to_topic', [req.body.topic_id, req.body.id])
                .then((result) => {
                    done();
                    if (result !== undefined && result.rowCount === 1) {
                        resp.send({status: 'success', topic_id: result.rows[0].belongs_to_topic});
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                });
            });
        } else {
            fn.error(req, resp, 401);;
        }
    } else {
        fn.error(req, resp, 401);;
    }
});

app.post('/change-subtopic-status', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 0) {
            db.connect(async function(err, client, done) {
                if (req.body.status !== 'Deleted') {
                    if (err) { console.log(err); }

                    await client.query('UPDATE subtopics SET subtopic_status = $1 WHERE subtopic_id = $2 RETURNING subtopic_status AS status', [req.body.status, req.body.id])
                    .then((result) => {
                        done();
                        if (result !== undefined && result.rowCount === 1) {
                            resp.send({status: 'success', subtopic_status: result.rows[0].status});
                        }
                    })
                    .catch((err) => {
                        console.log(err);
                        done();
                        resp.send({status: 'error'});
                    });
                } else if (req.body.status === 'Deleted') {
                    if (err) { console.log(err); }

                    if (req.session.user.privilege > 1) {
                        await client.query('DELETE FROM subtopics WHERE subtopic_id = $1', [req.body.id])
                        .then((result) => {
                            done();
                            if (result !== undefined && result.rowCount === 1) {
                                resp.send({status: 'deleted'});
                            }
                        })
                        .catch((err) => {
                            console.log(err);
                            done();
                            resp.send({status: 'error'});
                        });
                    } else {
                        done();
                        resp.send({status: 'unauthorized'});
                    }
                }
            });
        } else {
            resp.send({status: 'unauthorized'});
        }
    } else {
        resp.send({status: 'unauthorized'})
    }
});

app.post('/change-topic-status', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 0) {
            db.connect(async function(err, client, done) {
                if (req.body.status !== 'Deleted') {
                    if (err) { console.log(err); }
    
                    await client.query('UPDATE topics SET topic_status = $1 WHERE topic_id = $2 RETURNING topic_status AS status', [req.body.status, req.body.id])
                    .then((result) => {
                        done();
                        if (result !== undefined && result.rowCount === 1) {
                            resp.send({status: 'success', subtopic_status: result.rows[0].status});
                        }
                    })
                    .catch((err) => {
                        console.log(err);
                        done();
                        resp.send({status: 'error'});
                    });
                } else if (req.body.status === 'Deleted') {
                    if (err) { console.log(err); }
    
                    if (req.session.user.privilege > 1) {
                        await client.query('DELETE FROM topics WHERE topic_id = $1', [req.body.id])
                        .then((result) => {
                            done();
                            if (result !== undefined && result.rowCount === 1) {
                                resp.send({status: 'deleted'});
                            }
                        })
                        .catch((err) => {
                            console.log(err);
                            done();
                            resp.send({status: 'error'});
                        });
                    }
                }
            });
        } else {
            resp.send({status: 'unauthorized'});
        }
    } else {
        resp.send({status: 'unauthorized'});
    }
});

app.post('/remove-post', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 0) {
            db.connect(async function(err, client, done) {
                if (err) { console.log(err); }

                await client.query("UPDATE posts SET post_status = 'Removed' WHERE post_id = $1 RETURNING post_id", [req.body.post_id])
                .then((result) => {
                    done();
                    if (result !== undefined && result.rowCount === 1) {
                        resp.send({status: 'success', post_id: result.rows[0].post_id});
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                });
            });
        } else {
            fn.error(req, resp, 401);
        }
    } else {
        fn.error(req, resp, 401);
    }
});

app.post('/archive-post', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 0) {
            db.connect(async function(err, client, done) {
                if (err) { console.log(err); }

                if (req.body.type === 'archive') {
                    var status = 'Archived'
                } else {
                    var status = 'Active'
                }

                await client.query('UPDATE posts SET post_status = $1 WHERE post_id = $2 RETURNING post_id', [status, req.body.post_id])
                .then((result) => {
                    done();
                    if (result !== undefined && result.rowCount === 1) {
                        resp.send({status: 'success', post_id: result.rows[0].post_id, type: status});
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                });
            });
        } else {
            fn.error(req, resp, 401);
        }
    } else {
        fn.error(req, resp, 401);
    }
});

app.post('/change-config', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 1) {
            db.connect(async function(err, client, done) {
                if (err) { console.log(err); }
                
                await client.query('UPDATE config SET status = $1 WHERE config_id = $2 RETURNING *', [req.body.status, req.body.config_id])
                .then((result) => {
                    done();
                    if (result !== undefined && result.rowCount === 1) {
                        resp.send({status: 'success', config: result.rows[0].config_name, config_status: result.rows[0].status});
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                });
            });
        } else {
            fn.error(req, resp, 401);
        }
    } else {
        fn.error(req, resp, 401);
    }
});

app.post('/create-category', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 1) {
            db.connect(async function(err, client, done) {
                if (err) { console.log(err); }
                
                await client.query('INSERT INTO categories (category, cat_created_by) VALUES ($1, $2)', [req.body.category, req.session.user.username])
                .then((result) => {
                    done();
                    if (result !== undefined && result.rowCount === 1) {
                        resp.redirect(req.get('referer'));
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    fn.error(req, resp, 500);
                });
            });
        } else {
            fn.error(req, resp, 401);;
        }
    } else {
        fn.error(req, resp, 401);;
    }
});

app.post('/create-topic', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 1) {
            db.connect(async function(err, client, done) {
                if (err) { console.log(err); }
                
                let createTopic = await client.query('INSERT INTO topics (topic_title, topic_category, topic_created_by) VALUES ($1, $2, $3) RETURNING *', [req.body.title, req.body.parent, req.session.user.username])
                .then((result) => {
                    if (result !== undefined && result.rowCount === 1) {
                        return result.rows;
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                });

                await client.query('SELECT topic_id AS id, topic_title AS title, topic_category AS belongs_to, topic_created_on AS created_on, topic_created_by AS created_by, topic_status AS status FROM topics WHERE topic_id = $1', [createTopic[0].topic_id])
                .then((result) => {
                    done();
                    if (result !== undefined && result.rows.length === 1) {
                        result.rows[0].created_on = moment(result.rows[0].created_on).format('MM/DD/YYYY @ hh:mm:ss A');

                        resp.send({status: 'success', result: result.rows[0]});
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'fail'});
                });
            });
        } else {
            fn.error(req, resp, 401);;
        }
    } else {
        fn.error(req, resp, 401);;
    }
});

app.post('/rename-topic', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 1) {
            db.connect(async function(err, client, done) {
                if (err) { console.log(err); }
                
                await client.query('UPDATE topics SET topic_title = $1 WHERE topic_id = $2 RETURNING topic_title', [req.body.new_title, req.body.id])
                .then((result) => {
                    done();
                    if (result !== undefined && result.rowCount === 1) {
                        resp.send({status: 'success', new_title: result.rows[0].topic_title});
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                });
            });
        } else {
            fn.error(req, resp, 401);;
        }
    } else {
        fn.error(req, resp, 401);;
    }
});

app.post('/issue-violation', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 0) {
            db.connect(async function(err, client, done) {
                if (err) { console.log(err); }
                
                // check to see if the user is giving violation to a moderator or an administrator
                let checkPrivilege = await client.query('SELECT privilege FROM users WHERE user_id = $1', [req.body.user_id])
                .then((result) => {
                    if (result !== undefined) {
                        return result.rows;
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                });

                if (checkPrivilege[0].privilege > 0) {
                    resp.send({status: 'forbidden'});
                } else {
                    await client.query('INSERT INTO violations (v_user_id, violation, v_issued_by) VALUES ($1, $2, $3)', [req.body.user_id, req.body.reason, req.session.user.user_id])
                    .then((result) => {
                        done();
                        if (result !== undefined && result.rowCount === 1) {
                            resp.send({status: 'success'});
                        }
                    })
                    .catch((err) => {
                        console.log(err);
                        done();
                        resp.send({status: 'error'});
                    });
                }
            });
        }
    }
});

app.post('/rename-category', function(req, resp) {
    if (req.session.user) {
        if (req.session.user.privilege > 1) {
            db.connect(async function(err, client, done) {
                if (err) { console.log(err); }
                
                await client.query('UPDATE categories SET category = $1 WHERE cat_id = $2 RETURNING category', [req.body.category, req.body.cat_id])
                .then((result) => {
                    done();
                    if (result !== undefined && result.rowCount === 1) {
                        resp.send({status: 'success', new_title: result.rows[0].category});
                    } else {
                        resp.send({status: 'not found'});
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                });
            });
        } else {
            resp.send({status: 'unauthorized'});
        }
    } else {
        resp.send({status: 'unauthorized'});
    }
});

app.post('/change-category-status', function(req, resp) {
    console.log(req.body);
    if (req.session.user) {
        if (req.session.user.privilege > 1) {
            db.connect(async function(err, client, done) {
                if (err) { console.log(err); }

                await client.query('UPDATE categories SET cat_status = $1 WHERE cat_id = $2 RETURNING cat_status', [req.body.status, req.body.cat_id])
                .then((result) => {
                    done();
                    if (result !== undefined && result.rowCount === 1) {
                        resp.send({status: 'success', cat_status: result.rows[0].cat_status});
                    } else {
                        resp.send({status: 'failed'});
                    }
                })
                .catch((err) => {
                    console.log(err);
                    done();
                    resp.send({status: 'error'});
                });
            });
        } else {
            fn.error(req, resp, 401);
        }
    } else {
        fn.error(req, resp, 403);
    }
});

module.exports = app;