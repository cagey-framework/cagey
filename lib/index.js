'use strict';

const EventEmitter = require('eventemitter2').EventEmitter2;


class Cagey extends EventEmitter {
	async shutdown() {
		await this.emitAsync('beforeShutdown');
		this.removeAllListeners('beforeShutdown');
		await this.emitAsync('shutdown');
		this.removeAllListeners('shutdown');
	}
}

exports.create = function () {
	return new Cagey();
};
