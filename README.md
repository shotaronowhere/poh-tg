# poh-tg

Telegram notification bot for [Proof of Humanity](app.proofofhumanity.id/).

Subscribe to @[ProofOfHumanityNotifications](https://t.me/ProofOfHumanityNotifications). Updated every 15 min.

## Installation

Copy `.env.dist` to `.env` and configure the telegram API key and channel id.

## Create sqlite database

`yarn create-db`

## Start bot

`yarn start`

## pm2

### Installation

`yarn global add pm2`

### Commands

```
yarn pm2 start
yarn pm2 delete all
```
