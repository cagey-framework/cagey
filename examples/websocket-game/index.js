'use strict';

const { getInterface } = require('network-interfaces');

const createCagey = require('cagey').create;

const createHttpServer = require('http').createServer;
const setupSessions = require('./integrations/sessions');
const setupDb = require('./integrations/db');
const setupWebSocketServer = require('./integrations/webSocketServer');
const setupCluster = require('./integrations/cluster');

const hashPassword = require('./hashPassword'); // not in this example

// set up cagey

const cagey = createCagey();

function shutdown() {
	cagey.shutdown();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// set up sessions

const sessionManager = setupSessions(cagey, {
	userData: {
		persistence: {
			interval: '30s',
			events: ['disconnect', 'shutdown']
		}
	}
});

// set up database client

const db = setupDb(cagey, sessionManager, {
	connectionLimit: 10,
	host: 'example.org',
	user: 'bob',
	password: 'secret',
	database: 'my_db'
});

// set up HTTP server

const httpServer = createHttpServer({
	port: 8080
});

// set up WebSocket server

setupWebSocketServer(cagey, sessionManager, {
	server: httpServer
});

// set up the peer discovery and messenging system

setupCluster(cagey, sessionManager, {
	interface: getInterface({ internal: false }),
	port: 12345
});


// set up the stateful session cagey

sessionManager.on('start', (session) => {
	const client = session.get('client'); // the client messenger that wraps around our incoming WebSocket

	client.on('authenticate', async ({ username, password }) => {
		const { userId, hash, salt } = await db.getCredentials(username);

		if (hash !== await hashPassword(password, salt)) {
			// inform the client of the failure to authenticate

			client.send('error:auth');
			return;
		}

		const userData = await db.getUserData(userId);

		await session.setUser(userId, userData);
	});

	// once authenticated, we are no longer just talking about a session, but about a trusted user with data

	session.on('authenticated', (userId, userData) => {
		// we can now talk to other users using peers.send(userId, eventName, message)

		const peers = session.get('peers');

		// inform the client of successful authentication

		client.send('authenticated');

		client.on('challenge', ({ targetUserId }) => {
			// the client wants to challenge the given user, so send the challenge over to that user

			peers.send(targetUserId, 'challenge', { from: { userId, name: userData.name } });
		});

		peers.on('challenge', ({ fromUserId }) => {
			// a player just challenged me, accept the challenge!

			peers.send(fromUserId, 'challenge-accepted', { from: { userId, name: userData.name } });
		});
	});
});
