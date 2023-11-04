require('dotenv').config()
require('dotenv').config({path:"./.env"})
require('dotenv').config({path:"./../.env"})
require('dotenv').config({path:"./../../.env"})
require('dotenv').config({path:"../../../.env"})
require('dotenv').config({path:"../../../../.env"})
require('dotenv').config({path:"./../../../../.env"})

const pjson = require('../package.json');
const TAG = " | "+ pjson.name +" | "
const log = require('@pioneer-platform/loggerdog')()
const {subscriber, publisher, redis} = require('@pioneer-platform/default-redis')
const cors = require('cors')
import bodyParser from 'body-parser';
import express from 'express';
import methodOverride from 'method-override';
import { serialize, parse } from 'cookie';
import { RegisterRoutes } from './routes/routes';  // here
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('../api/dist/swagger.json')
const { createProxyMiddleware } = require('http-proxy-middleware');

//Rate limiter options
//https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#create-simple-rate-limiter-and-consume-points-on-entry-point
const { RateLimiterRedis } = require('rate-limiter-flexible');

const app = express();
const server = require('http').Server(app);
let API_PORT = parseInt(process.env["API_PORT_PIONEER"]) || 80
let RATE_LIMIT_RPM = parseInt(process.env["RATE_LIMIT_TPS"]) || 5
const COOKIE_NAME = 'example';

//limiter
const rateLimiterRedis = new RateLimiterRedis({
    storeClient: redis,
    points: RATE_LIMIT_RPM, // Number of points
    duration: 1, // Per second
});

const WHITELIST_CACHE = []
const rateLimiterMiddleware = async (req, res, next) => {
    try{
        if(req.headers.authorization){
            let auth = req.headers.authorization
            log.info('path: ',req.url)
            let path = req.path
            if(auth.indexOf('Bearer ')) auth.replace('Bearer ','')

            //if in cache
            if(WHITELIST_CACHE.indexOf(auth)){
                next();
            } else {
                let isWhitelisted = await redis.sismember("PIONEER_WHITELIST_KEYS",auth)
                if(isWhitelisted){
                    WHITELIST_CACHE.push(auth)
                    next();
                } else {
                    rateLimiterRedis.consume(req.ip)
                        .then(() => {
                            next();
                        })
                        .catch(_ => {
                            res.status(429).send('Too Many Requests');
                        });
                }
            }
        } else {
            rateLimiterRedis.consume(req.ip)
                .then(() => {
                    next();
                })
                .catch(_ => {
                    res.status(429).send('Too Many Requests');
                });
        }
    }catch(e){
        console.error(e)
    }
};

var corsOptions = {
    origin: function (origin, callback) {
        if (true) {
            callback(null, true)
        } else {
            callback(new Error('Not allowed by CORS'))
        }
    }
}


app.use(cors(corsOptions))
//@TODO too strict
// app.use(rateLimiterMiddleware);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride());

//socket
let SOCKET_MAX_CONNECTIONS = parseInt(process.env["SOCKET_MAX_CONNECTIONS"]) || 20

const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

//socket-io
let io = require('socket.io')(server,{
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

const pubClient = createClient(process.env['REDIS_CONNECTION'] || 'redis://127.0.0.1:6379');
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));

io.sockets.setMaxListeners(SOCKET_MAX_CONNECTIONS);

//web
// app.use('/',express.static('dist/spa'));
// app.get('/', (req, res) => {
//     res.redirect('https://pioneer-frontend-v3.vercel.app' + req.path);
// });


//docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

//swagger.json
app.use('/spec', express.static('api/dist'));

//REST API v1
RegisterRoutes(app);  // and here

//host static spaces assets
// Add a catch-all route for any other routes, serving the 'web' directory
app.use('/', express.static('web'));

//@TODO this keeps domain if you care
app.use(['/','/assets','/coins','/docs'], createProxyMiddleware({
    target: 'https://swaps-pro-v7.vercel.app',
    changeOrigin: true,
    onProxyRes: function (proxyRes, req, res) {
        // Remove potential security headers
        delete proxyRes.headers['strict-transport-security'];
        delete proxyRes.headers['content-security-policy'];
        delete proxyRes.headers['x-content-security-policy'];
        delete proxyRes.headers['x-webkit-csp'];
        delete proxyRes.headers['public-key-pins'];
    }
}));

//redis-bridge
subscriber.subscribe('pioneer-events');
subscriber.subscribe('payments');
subscriber.subscribe('pioneer:transactions:all');

subscriber.on('message', async function (channel, payloadS) {
    let tag = TAG + ' | publishToFront | ';
    try {
        log.debug(tag,"event: ",payloadS)
        //Push event over socket
        if(channel === 'payments'){
            let payload = JSON.parse(payloadS)
            payload.event = 'transaction'
            payloadS = JSON.stringify(payload)
        }

        //legacy hack
        if(channel === 'payments') channel = 'events'

        //
        io.emit(channel, payloadS);

    } catch (e) {
        log.error(tag, e);
        throw e
    }
});


//Error handeling
function errorHandler (err, req, res, next) {
    if (res.headersSent) {
        return next(err)
    }
    log.error("ERROR: ",err)
    res.status(400).send({
        message: err.message,
        error: err
    });
}
app.use(errorHandler)

server.listen(API_PORT, () => console.log(`Server started listening to port ${API_PORT}`));


io.on('connection', (socket) => {
    // Get the raw request object from the socket handshake
    const rawRequest = socket.request;

    function parseYourCookie(cookieHeader) {
        //log.info("cookieHeader: ",cookieHeader)
        const cookies = parse(cookieHeader || '');
        return cookies['example']; // Replace with the actual cookie name
    }

    // Parse and get your desired cookie value from the request
    const cookieValue = parseYourCookie(rawRequest.headers.cookie); // Implement this function

    // Serialize the cookie for the socket connection
    const serializedCookie = serialize(COOKIE_NAME, cookieValue, {
        sameSite: 'strict',
    });

    // Set the serialized cookie in the socket handshake headers
    socket.handshake.headers.cookie = serializedCookie;

    // Now you can use the cookie in your WebSocket connection
});
