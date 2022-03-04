# tpp-ti

tpp-ti is a template for creating a Twitch Integration version of Twitch Plays Pokemon, which can be imported into OBS as a single browser source.  
It has support for custom events like follows, subscriptions, channel points and more.

## Prerequisites

- Navigate to [https://dev.twitch.tv/console](your twitch developer dashboard) and create a new Application. You will need the client id and client secret
- Download a rom and save it to the assets folder
- Set up an SSL certificate, you will need `privkey.pem chain.pem cert.pem`

## Installation

- Edit .env, this file contains the project configuration
  - Change the value for the webhook secret
  - You can get an oauth token from [https://twitchapps.com/tmi/](Twitch TMI)
- Open *index.html* and edit the variables at the top, especially the rom name
- Run `npm install` from bash/cmd

## Running the server

- Run `npm run start` from bash/cmd

## Adding custom events

### Receiving a Twitch event

Use `twitchModule.subscribeTwitchEvent` to subscribe to Twitch events.

Valid keys are `channel.update channel.follow channel.subscribe channel.subscribe.gift channel.subscription.message channel.cheer channel.raid channel.channel_points_custom_reward_redemption.add stream.online stream.offline`

### Sending to the browser source
Data is sent over websockets.  
You can use `broadcastSocketMessage('KEY', {data: 5});`

For more examples look at `app.ts#63`
