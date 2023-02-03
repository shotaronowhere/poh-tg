const Database = require('better-sqlite3');

(async () => {
    const db = new Database('database.db');

    /**
     *
     **/
     await db.exec(
        `CREATE TABLE cron (
            bot_index INTEGER,
            last_timestamp INTEGER,
            PRIMARY KEY (bot_index))`
        );

    db.close();
})();