const Database = require('better-sqlite3');

export function openDb() {
    const db = new Database('database.db');
    db.pragma('journal_mode = WAL');
    return db;
}

const getCron = (db: any)=> {
    try{
        const stmt = db.prepare(`SELECT last_timestamp FROM cron WHERE bot_index = 0`);
        return stmt.get();
    } catch(err){
        console.log("db error: getCron, "+err);
    }
}

const setCron = (db: any, last_timestamp: number) => {
    try{
        const stmt = db.prepare(
            `INSERT INTO cron (bot_index, last_timestamp) 
            VALUES (0, ?) 
            ON CONFLICT(bot_index) DO UPDATE SET 
            last_timestamp=?;`);
        const info = stmt.run(last_timestamp, last_timestamp);
    } catch(err) {
        console.log("db error: setCron, "+err);
    }
}

export {
    getCron,
    setCron
}