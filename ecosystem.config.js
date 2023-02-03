module.exports = {
    apps : [{
        name: 'poh-tg',
        script: 'yarn',
        args: 'start',
        interpreter: '/bin/bash',
        log_date_format : 'YYYY-MM-DD HH:mm Z',
        autorestart: false,
        cron_restart: '*/15 * * * *',
        env: {
            NODE_ENV: 'development'
          }
    }],
};