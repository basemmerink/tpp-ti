import 'dotenv/config'

import * as fs from 'fs';

import express from 'express';
import crypto from 'crypto';
import {Server, Socket} from 'socket.io';
import {createServer} from 'https';
import {twitchModule} from "./api/TwitchModule";
import {TMIMessage, twitchChatModule} from "./api/TwitchChatModule";


const TWITCH_MESSAGE_ID = 'Twitch-Eventsub-Message-Id'.toLowerCase();
const TWITCH_MESSAGE_TIMESTAMP = 'Twitch-Eventsub-Message-Timestamp'.toLowerCase();
const TWITCH_MESSAGE_SIGNATURE = 'Twitch-Eventsub-Message-Signature'.toLowerCase();
const TWITCH_MESSAGE_TYPE = 'Twitch-Eventsub-Message-Type'.toLowerCase();

const MESSAGE_TYPE_VERIFICATION = 'webhook_callback_verification';
const MESSAGE_TYPE_NOTIFICATION = 'notification';
const MESSAGE_TYPE_REVOCATION = 'revocation';

const HMAC_PREFIX = 'sha256=';

const sockets = new Map<string, Socket>();

if (!fs.existsSync(process.env.PRIVKEY_PEM_PATH) ||
    !fs.existsSync(process.env.CHAIN_PEM_PATH) ||
    !fs.existsSync(process.env.CERT_PEM_PATH)) {
    console.log('Please install an SSL certificate first and point to the proper files in .env');
    process.exit(-1);
}


const app = express();

const server = createServer({
    key: fs.readFileSync(process.env.PRIVKEY_PEM_PATH),
    ca: fs.readFileSync(process.env.CHAIN_PEM_PATH),
    cert: fs.readFileSync(process.env.CERT_PEM_PATH)
}, app);

const io = new Server(server);

server.listen(process.env.SSL_PORT, () => console.log(`Running https server on port ${process.env.SSL_PORT}`));

io.on('connect', socket => {
    const id = socket.id;
    console.log(`socket ${id} connected`);

    sockets.set(id, socket);

    socket.on('disconnect', () => {
        console.log(`socket ${id} disconnected`);
        sockets.delete(id);
    });
});

twitchModule.subscribeTwitchEvent('channel.channel_points_custom_reward_redemption.add', event => {
    console.log('Channel points redeemed', event);
    broadcastSocketMessage('CHANNEL_POINTS', {user: event.user_name, id: event.id, message: event.user_input});
});

twitchChatModule.onMessage().subscribe((message: TMIMessage) => {
    var keymap = ['right', 'left', 'up', 'down', 'a', 'b', 'select', 'start'];
    var words = message.message.toLowerCase().split(' ');
    var broadcaster = (message.userState['badges-raw'] || '').indexOf('broadcaster') > -1;
    if (broadcaster && words[0] === '!save')
    {
        broadcastSocketMessage('SAVE', {});
    }
    else if (broadcaster && words[0] === '!delete')
    {
        broadcastSocketMessage('DELETE', {});
    }
    const commands = words.filter(word => keymap.indexOf(word) > -1);
    if (commands.length > 0 && keymap.indexOf(words[0]) > -1)
    {
        broadcastSocketMessage('COMMAND', {user: message.userState['display-name'], commands: commands})
    }
});

app.use(express.static(__dirname + '/../node_modules'));
app.use(express.static(__dirname + '/../assets'));
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

app.post('/eventsub', (req, res) => {
    const secret = process.env.TWITCH_WEBHOOK_SECRET;
    const message = getHmacMessage(req);
    const hmac = HMAC_PREFIX + getHmac(secret, message);

    if (true === verifyMessage(hmac, req.headers[TWITCH_MESSAGE_SIGNATURE])) {
        const notification = JSON.parse(req.rawBody);

        if (MESSAGE_TYPE_NOTIFICATION === req.headers[TWITCH_MESSAGE_TYPE]) {
            twitchModule.onEventSubNotification(notification.subscription.type, notification.event);
            res.sendStatus(204);
        }
        else if (MESSAGE_TYPE_VERIFICATION === req.headers[TWITCH_MESSAGE_TYPE]) {
            res.status(200).send(notification.challenge);
        }
        else if (MESSAGE_TYPE_REVOCATION === req.headers[TWITCH_MESSAGE_TYPE]) {
            res.sendStatus(204);

            console.log(`${notification.subscription.type} notifications revoked!`);
            console.log(`reason: ${notification.subscription.status}`);
            console.log(`condition: ${JSON.stringify(notification.subscription.condition, null, 4)}`);
        }
        else {
            res.sendStatus(204);
            console.log(`Unknown message type: ${req.headers[TWITCH_MESSAGE_TYPE]}`);
        }
    }
    else {
        console.log('Error, twitch signature didn\'t match');
        res.sendStatus(403);
    }
});

app.all('/*', (req, res, next) =>
{
    const pathTokens = req.path.split('/');
    switch (pathTokens[1])
    {
        case 'twitch':
            twitchModule.setCode(req.query.code);
            res.redirect('/');
            break;
        default:
            res.sendFile('index.html', {root: __dirname + '/..'});
            break;
    }
});

function getHmacMessage(request) {
    return (request.headers[TWITCH_MESSAGE_ID] +
        request.headers[TWITCH_MESSAGE_TIMESTAMP] +
        request.rawBody);
}

function getHmac(secret, message) {
    return crypto.createHmac('sha256', secret)
        .update(message)
        .digest('hex');
}

function verifyMessage(hmac, verifySignature) {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(verifySignature));
}

function broadcastSocketMessage(key: string, message: any) {
    sockets.forEach(socket => socket.emit(key, message));
}
