require('dotenv').config()
const {default: PQueue} = require('p-queue');
import {openDb, getCron, setCron} from "./db";
import TelegramBot from "node-telegram-bot-api";
import fetch from 'node-fetch';
import request from "graphql-request";
// max 20 msgs / min -> 1 msg/3 seconds, adding some margin
const queue = new PQueue({intervalCap: 1, interval: 3500,carryoverConcurrencyCount: true});
const escape = require('markdown-escape')
// option video conversion
//const webmToMp4 = require("./convert.js");
const Bot = require('node-telegram-bot-api');
const bot: TelegramBot = new Bot(process.env.BOT_TOKEN, {polling: false, testEnvironment: false});  
const db = openDb();

const exit = async () => {   
    await db.close()
    await bot.stopPolling({ cancel: true })
}

['SIGINT', 'SIGTERM', 'SIGQUIT','EXIT']
  .forEach(signal => process.on(signal, async () => {
    await exit()
    process.exit();
  }));

  
(async ()=> {
  const currentTime = Math.floor(Date.now()/1000)
  const history =  {
        last_timestamp: currentTime,
    }
  const query = `{
    submissions(first: 1000, where: {creationTime_gt: ${history.last_timestamp}}) {
      id
      status
      name
      requests{
        currentReason
        evidence(orderBy: creationTime){
          URI
        }
      }
    }
  }`
  const POH = await request(
      process.env.POH_SUBGRAPH ?? "",
      query
  );

  
  for(const submission of POH.submissions){
    const url_poh = `https://app.proofofhumanity.id/profile/${submission.id}`
    try{
      const evidence = await ipfsFetch(submission.requests[0].evidence[0].URI)
      const registrationJSONIPFS = (await evidence.json()).fileURI;
      const registrationJSON = await ipfsFetch(registrationJSONIPFS)
      const file2 = (await registrationJSON.json());
      const photo_url = `https://ipfs.kleros.io${file2.photo}`
      const video_url = `https://ipfs.kleros.io${file2.video}`
      const msg = `A new [submission](${url_poh}) is made for ***${escape(file2.name)}***.`
      queue.add(async () => {try{bot.sendPhoto(process.env.CHAT_ID_VERBOSE, photo_url, {caption: msg, parse_mode: "Markdown"})}catch{}});
      queue.add(async () => {try{bot.sendVideo(process.env.CHAT_ID_VERBOSE, video_url, {caption: `***${submission.id}***\n\nAddress should match ***${file2.name}'s*** submission [video](${video_url}).`, parse_mode: "Markdown"})}catch{}});
    } catch(e){
      console.log(submission)
      console.log(submission.requests[0].evidence[0])
    }
  }
  
  await queue.onEmpty()
  setCron(db, currentTime)

})()

/**
 * Send file to IPFS network via the Kleros IPFS node
 * @param {string} fileName - The name that will be used to store the file. This is useful to preserve extension type.
 * @param {ArrayBuffer} data - The raw data from the file to upload.
 * @return {string} URL of the stored item.
 */
 const ipfsFetch = async (fileName): Promise<any> => {
    return fetch(`https://ipfs.kleros.io${fileName}`, {
        method: 'GET',
        headers: {
            'content-type': 'application/json'
        }
    });
}
