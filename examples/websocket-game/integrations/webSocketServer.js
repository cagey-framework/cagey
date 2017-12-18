'use strict';

const createClientMessenger = require('cagey-client-messenger').create;
const WebSocketServer = require('uws').Server;


function serialize(eventName, message) {
	return JSON.stringify([eventName || 'message', message]);
}

function deserialize(message) {
	return JSON.parse(message);
}


module.exports = function (cagey, sessionManager, options) {
	const wss = new WebSocketServer(options);

	cagey.on('beforeShutdown', () => {
		wss.close();
	});

	wss.on('connection', async (ws) => {
		const key = ws.upgradeReq.cookies.STICKY;

		let client, session;

		session = sessionManager.findByKey(key); // we trust the key because of HTTPS

		if (session) {
			client = session.get('client');
		} else {
			session = await sessionManager.create(key);
			client = createClientMessenger({ serialize, deserialize });

			session.set('client', client);

			session.on('beforeDestroy', () => {
				client.disconnect();
			});

			await session.start();  // emits "started" on session manager
		}

		// receive messages from websocket and emit on the client messenger

		ws.on('message', (message) => {
			client.receiveMessage(message);
		});

		// send messages from client messenger to websocket

		client.setMessageSender((message) => {
			ws.send(message);
		});

		// handle requests to close the session

		client.setDisconnect(() => {
			ws.close();
		});

		// handle the connection disappearing

		ws.on('close', () => {
			client.disconnected();
		});

		const { address, port } = ws._socket;

		client.connected({
			protocol: 'WebSocket',
			address: `${address}:${port}`
		});
	});
};
