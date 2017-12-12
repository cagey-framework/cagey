'use strict';

const mysql = require('mysql');
const EventEmitter = require('eventemitter2').EventEmitter2;


class Db extends EventEmitter {
	constructor(options) {
		super();

		this._pool = mysql.createPool(options);
	}

	close() {
		this.emit('beforeClose');

		const pool = this._pool;
		this._pool = null;

		return new Promise((resolve, reject) => {
			pool.end((error) => {
				if (error) {
					reject(error);
				} else {
					resolve();

					this.emitAsync('closed');
				}
			});
		});
	}

	query(query, ...args) {
		this.emit('beforeQuery', query);

		return new Promise((resolve, reject) => {
			this._pool.query(query, ...args, (error, results) => {
				if (error) {
					reject(error);
				} else {
					resolve(results);
				}
			});
		});
	}

	async getUserData(userId) {
		const query = 'SELECT `data` FROM `users` WHERE `id` = ?';
		const params = [userId];

		const rows = await this.query(query, params);

		if (!rows || rows.length === 0) {
			throw new Error(`User not found: "${userId}"`);
		}

		return rows[0].data;
	}

	async setUserData(userId, data) {
		const query = 'INSERT INTO `users` VALUES (?, ?) ON DUPLICATE KEY UPDATE `data` = VALUES(`data`)';
		const params = [userId, JSON.stringify(data)];

		await this.query(query, params);
	}
}


module.exports = function (cagey, sessionManager, options) {
	const db = new Db(options);

	sessionManager.on('persistUserData', async (userId, data) => {
		await db.setUserData(userId, data);
	});

	cagey.on('shutdown', async () => {
		await db.close();
	});

	return db;
};
