'use strict';

const EventEmitter = require('eventemitter2').EventEmitter2;


class Cagey extends EventEmitter {
	constructor({ log }) {
		super();
		this.log = log;
	}

	async shutdown() {
		this.log.info('Shutting down...');

		await this.emitAsync('beforeShutdown');
		this.removeAllListeners('beforeShutdown');
		await this.emitAsync('shutdown');
		this.removeAllListeners('shutdown');
	}
}

exports.create = function (apis) {
	return new Cagey(apis);
};
