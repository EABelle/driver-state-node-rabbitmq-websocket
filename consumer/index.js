const amqp = require('amqplib/callback_api');

const WebSocketServer = require('websocket').server;

const http = require('http');

const server = http.createServer(function(request, response) {
    // process HTTP request. Since we're writing just WebSockets
    // server we don't have to implement anything.
});
server.listen(1337, function() { });

const wsServer = new WebSocketServer({
    httpServer: server
});

wsServer.on('request', function(request) {

    const connection = request.accept();

    connection.send(JSON.stringify(cache));

    connection.on('close', function(reasonCode, description) {
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    });
});

const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@localhost:5672';


function buildCache (onSave = function() {}) {

    const c = {};

    c.onSave = onSave.bind(c);

    c.save = function(car) {
        this[car.id] = car;
        onSave();
    }.bind(c);

    c.get = function(id) {
        return this[id];
    }.bind(c);

    return c;
}

cache = buildCache();

amqp.connect(AMQP_URL, (err, connection) => {
    if(err) {
        throw err;
    }
    console.log("amqp connected");
    connection.createChannel((error, channel) => {
        if(error) {
            throw error;
        }
        const queue = 'dev';
        channel.assertQueue(queue, {
            durable: false
        });

        channel.consume(queue, (msg) => {
            const message = JSON.parse(msg.content.toString());
            cache.save(message);
            wsServer.broadcast(JSON.stringify(message));
            connection.ack(message);
        });
    });
});
