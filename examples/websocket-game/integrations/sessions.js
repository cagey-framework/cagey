'use strict';

const createSessionManager = require('cagey-sessions').create;


module.exports = function (cagey, options) {
	const sessions = createSessionManager(options);

	cagey.on('beforeShutdown', async () => {
		const persist = sessions.willPersistUserDataOn('shutdown');

		await sessions.destroy(persist);
	});

	return sessions;
};
