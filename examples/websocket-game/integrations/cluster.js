'use strict';

const createPeerNetwork = require('cagey-peer-network').create;

const zmq = require('zeromq');
const consul = require('consul');

function serialize(eventName, message) {
	return JSON.stringify([eventName || 'message', message]);
}

function deserialize(message) {
	return JSON.parse(message);
}


module.exports = function ({ cagey, sessionManager, log }, options = {}) {
	// interface or address is required, but not both
	// port may be '*' to assign a random available port

	const peerNetwork = createPeerNetwork({
		protocol: 'tcp',
		interface: options.interface,
		address: options.address,
		port: options.port,
		serialize,
		deserialize
	});

	const sub = zmq.socket('sub');
	const pub = zmq.socket('pub');

	pub.bindSync(peerNetwork.getMyUri());

	sub.unref();
	pub.unref();

	// update the URI with the actual endpoint

	peerNetwork.setMyUri(pub.getsockopt(zmq.ZMQ_LAST_ENDPOINT));

	// set up message passing

	sub.on('message', (address, message) => {
		log.debug({ message }, 'Received message on subscriber');

		peerNetwork.receiveMessage(address, message);
	});

	peerNetwork.setMessageSender((toUserId, message) => {
		log.debug({ toUserId, message }, 'Sending message on publisher');

		pub.send([toUserId, message]);
	});

	peerNetwork.on('subscribe', (address) => {
		log.debug({ address }, 'Subscribing');

		sub.subscribe(address);
	});

	peerNetwork.on('unsubscribe', (address) => {
		log.debug({ address }, 'Unsubscribing');

		sub.unsubscribe(address);
	});

	// set up discovery

	consul.unref();

	consul.on('up', (uri) => {
		sub.connect(uri);
	});

	consul.on('down', (uri) => {
		sub.disconnect(uri);
	});

	consul.announce(peerNetwork.getMyUri());

	// once a session has started, we can subscribe this user on the cluster
	// and provide it a "peers" API

	sessionManager.on('identified', async (session, userId) => {
		const messenger = await peerNetwork.createMessenger(userId);

		session.set('peers', messenger);

		session.on('beforeDestroy', async () => {
			await messenger.destroy();
		});
	});

	cagey.on('beforeShutdown', () => {
		// consul.stop();
	});
};
