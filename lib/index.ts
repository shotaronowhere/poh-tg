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
  const history = getCron(db)?? {last_timestamp: Math.floor(Date.now()/1000)}
  history.last_timestamp = 1675703123
  var maxSyncTime = 0
    const queryAllSubmissions = `{
      submissions(first: 1000, where: {creationTime_gt: ${history.last_timestamp}}) {
        id
        creationTime
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
        queryAllSubmissions
    );
  

    for(const submission of POH.submissions){
      if (submission.creationTime > maxSyncTime)
        maxSyncTime = submission.creationTime
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
    

  const query = "query indexQuery(  $skip: Int = 0  $first: Int = 1000  $where: Submission_filter = {removed: false}  $search: String = \"\"  $address: ID) {  submissions(orderBy: creationTime, orderDirection: desc, skip: $skip, first: $first, where: $where) {    id    ...submissionCardSubmission  }  contains: submissions(where: {name_contains: $search}) {    id     ...submissionCardSubmission}  byAddress: submissions(where: {id: $address}) {    id      }  counter(id: 1) {    vouchingPhase    pendingRemoval    pendingRegistration    challengedRemoval    challengedRegistration    registered    expired    removed    id  }}fragment submissionCardSubmission on Submission {  id  status  registered  creationTime submissionTime  name  disputed  requests(orderBy: creationTime, orderDirection: desc, first: 1, where: {registration: true}) {  creationTime  evidence(orderBy: creationTime, first: 1) {      URI      id    } challenges(orderBy: creationTime, first: 1) {      disputeID      id    creationTime request}    id   lastStatusChange    currentReason}}"
  const challenges = await request(
      process.env.POH_SUBGRAPH ?? "",
      query,
      {
        address: null,
        first: 1000,
        search: "",
        skip: 0,
        where: {
          disputed: true,
          status_in: ["PendingRegistration", "PendingRemoval"],
          requests_: {lastStatusChange_gt: history.last_timestamp}
        }
      }
  );

  
  for(const challenge of challenges.submissions){
    try{
      if (challenge.requests[0].lastStatusChange > maxSyncTime)
        maxSyncTime = challenge.requests[0].lastStatusChange
      const url_poh = `https://app.proofofhumanity.id/profile/${challenge.id}`
      const evidence = await ipfsFetch(challenge.requests[0].evidence[0].URI)
      const registrationJSONIPFS = (await evidence.json()).fileURI;
      const registrationJSON = await ipfsFetch(registrationJSONIPFS)
      const file2 = (await registrationJSON.json());
      const photo_url = `https://ipfs.kleros.io${file2.photo}`
      const video_url = `https://ipfs.kleros.io${file2.video}`
      const msg = `***${escape(file2.name)}'s*** [submission](${url_poh}) is challenged for ***${challenge.requests[0].currentReason}***.\n\n`
      const msgRemoval = `The ***removal*** request for ***${file2.name}'s*** [profile](${url_poh}) is challenged.\n\n`
      queue.add(async () => {try{bot.sendPhoto(process.env.CHAT_ID, photo_url, {caption: challenge.status === "PendingRemoval"? msgRemoval: msg, parse_mode: "Markdown"})}catch{}});
      queue.add(async () => {try{bot.sendVideo(process.env.CHAT_ID, video_url, {caption: `***${challenge.id}***\n\nAddress should match ***${file2.name}'s*** submission [video](${video_url}).`, parse_mode: "Markdown"})}catch{}});
    } catch(e){
      console.log(e)
    }
  }
  
  const appeal_query = `{
    disputes(first: 100,  orderBy: disputeID, orderDirection: desc,  where: {period: appeal, ruled: false, lastPeriodChange_gt: ${history.last_timestamp},arbitrable_: {id: "${process.env.POH_ADDRESS}"}}){
	    currentRulling
      lastPeriodChange
    disputeID
  }
}`

  const appeals = await request(
    process.env.KLEROS_SUBGRAPH ?? "",
    appeal_query
);

  let disputeIDs = appeals.disputes.map(({ disputeID }) => disputeID)
  let currentRulings = appeals.disputes.map(({ currentRulling }) => currentRulling)
  let lastPeriodChanges = appeals.disputes.map(({ lastPeriodChange }) => lastPeriodChange)


    const disputeIdToProfileQuery = `{
      challenges(first: 100, orderBy: disputeID, orderDirection: desc, where: {disputeID_not: null, disputeID_in: [${disputeIDs.toString()}]}) {
        requester
        disputeID
        reason
        appealPeriod
        request{
          evidence(orderBy: creationTime, first: 1) {      URI      id    }
          submission{
            id  status  registered  submissionTime  name  disputed 
          }
        }
      }
    }`

    const appeals_info = await request(
      process.env.POH_SUBGRAPH ?? "",
      disputeIdToProfileQuery
  );

  
  appeals_info.challenges.forEach(async function (appeal, i) {
    try{
      if (lastPeriodChanges[i] > maxSyncTime)
        maxSyncTime = lastPeriodChanges[i]
      const url_poh = `https://app.proofofhumanity.id/profile/${appeal.requester}`
      const appeal_deadline_winner = new Date(appeal.appealPeriod[1]*1000).toDateString()
      const appeal_deadline_loser = new Date((Number(appeal.appealPeriod[0])+(Number(appeal.appealPeriod[1]) - Number(appeal.appealPeriod[0])) / 2)*1000).toUTCString()
      const currentRuling = currentRulings[i]
      const evidence = await ipfsFetch(appeal.request.evidence[0].URI)
      const registrationJSONIPFS = (await evidence.json()).fileURI;
      const registrationJSON = await ipfsFetch(registrationJSONIPFS)
      const file2 = (await registrationJSON.json());
      const photo_url = `https://ipfs.kleros.io${file2.photo}`
      const video_url = `https://ipfs.kleros.io${file2.video}`
      const msg = `***${file2.name}'s*** challenged [submission](${url_poh})\nReason: ***${appeal.reason}***\n\nThe dispute concluded it's current round. The submission is ***${currentRuling == 1? 'accepted' : 'rejected'}***.\n\nIs this outcome correct? If not, you can request an [appeal](${url_poh}) until ***${appeal_deadline_loser.substring(0, appeal_deadline_loser.length-7)} UTC***.`
      queue.add(async () => {try{bot.sendPhoto(process.env.CHAT_ID, photo_url, {caption: msg, parse_mode: "Markdown"})}catch{}});
      queue.add(async () => {try{bot.sendVideo(process.env.CHAT_ID, video_url, {caption: `***${appeal.requester}***\n\nAddress should match ***${file2.name}'s*** [video](${video_url}).`, parse_mode: "Markdown"})}catch{}});
    } catch(e){
      console.log(e)
    }
});

const query_contrib = `{
  contributions(first: 5, where: {roundIndex_gt: 0, creationTime_gt: ${history.last_timestamp}}, orderBy: creationTime, orderDirection: desc) {
    creationTime
    values
    roundIndex
    round{
      id
      hasPaid
      challenge{
        reason
        request{
          currentReason
          evidence(first: 1, orderBy: creationTime){
            URI
          }
          submission{
            id
            status
            disputed
          }
        }
      }
    }
  }
}`

const contrib_info = await request(
  process.env.POH_SUBGRAPH ?? "",
  query_contrib
);

  for(const contribution of contrib_info.contributions){
    if (contribution.values[0] === 0 && contribution.values[1] == 0)
      continue
    if (!contribution.round.hasPaid[0] && !contribution.round.hasPaid[1])
      continue
    if (contribution.creationTime > maxSyncTime)
      maxSyncTime = contribution.creationTime
    try{
      const url_poh = `https://app.proofofhumanity.id/profile/${contribution.round.challenge.request.submission.id}`
      const evidence = await ipfsFetch(contribution.round.challenge.request.evidence[0].URI)
      const registrationJSONIPFS = (await evidence.json()).fileURI;
      const registrationJSON = await ipfsFetch(registrationJSONIPFS)
      const file2 = (await registrationJSON.json());
      const photo_url = `https://ipfs.kleros.io${file2.photo}`
      const video_url = `https://ipfs.kleros.io${file2.video}`
      const msg_contrib = contribution.round.hasPaid[0]&&contribution.round.hasPaid[0]? 'The dispute is fully funded and the case is appealed.' : contribution.round.hasPaid[0]? 'The submitter\'s side is fully funded' :  'The challenger\'s side is fully funded'
      const msg = `An ***appeal*** is funded for the dispute over ***${escape(file2.name)}'s*** [submission](${url_poh}) which is challenged for ***${contribution.round.challenge.request.currentReason}***.\n\n${msg_contrib}`
      const msgRemoval = `An ***appeal*** is funded for the dispute over the ***removal*** request for ***${file2.name}'s*** [profile](${url_poh}) is challenged.\n\n${msg_contrib}`
      queue.add(async () => {try{bot.sendPhoto(process.env.CHAT_ID, photo_url, {caption: contribution.round.challenge.request.submission.status === "PendingRemoval"? msgRemoval: msg, parse_mode: "Markdown"})}catch{}});
      queue.add(async () => {try{bot.sendVideo(process.env.CHAT_ID, video_url, {caption: `***${contribution.round.challenge.request.submission.id}***\n\nAddress should match ***${file2.name}'s*** submission [video](${video_url}).`, parse_mode: "Markdown"})}catch{}});
      } catch(e){
        console.log(e)
      }
  }

  await queue.onEmpty()
  if (maxSyncTime > 0)
    setCron(db, maxSyncTime)

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
